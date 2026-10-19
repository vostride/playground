import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodexAuthFetch } from '@vostride/agent-qa-subscription-auth';
import {
  createModel,
  getProviderOptions,
  LLMPlanner,
  MobileElementResolver,
} from '@vostride/agent-qa-core';
import { ElementResolver } from '@vostride/agent-qa-web';

const endpoint = 'https://chatgpt.com/backend-api/codex/responses';
const screen = {
  tree: '- textbox "Search products" [ref=e15]',
  elements: [{ ref: 'e15', role: 'textbox', name: 'Search products' }],
  metadata: {},
};
const args = {
  reasoning: 'Enter the requested search into the visible field.',
  confidence: 1,
  stepComplete: true,
  stepFailed: false,
  ref: 'e15',
  value: 'Ceramic mug',
};

function callItem(input) {
  return {
    type: 'function_call',
    id: 'fc_synthetic',
    call_id: 'call_synthetic',
    name: 'fill',
    arguments: JSON.stringify(input),
    status: 'completed',
  };
}

function completed(input) {
  return {
    type: 'response.completed',
    response: {
      id: 'resp_synthetic',
      created_at: 1,
      status: 'completed',
      model: 'gpt-6.1-sol',
      output: [callItem(input)],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
  };
}

async function plan(t, events, chunkSize = 1024) {
  // The subscription SSE reader schedules idle timers. Mocking them prevents
  // pending timers from delaying these entirely synchronous synthetic streams.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), endpoint);
    requests.push(JSON.parse(init.body));
    const bytes = Buffer.from(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
    );
    return new Response(
      new ReadableStream({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            controller.enqueue(bytes.subarray(offset, offset + chunkSize));
          }
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  // No credentials are loaded, no browser/device is started, and every outbound
  // fetch is intercepted before the actual SDK and provider are constructed.
  const config = {
    provider: 'openai-subscription',
    model: 'gpt-6.1-sol',
    modelAdapter: 'openai-responses',
    fetch: createCodexAuthFetch(
      async () => ({
        access: 'synthetic-inert-test-token',
        refresh: 'unused',
        expires: Date.now() + 60_000,
      }),
      async () => assert.fail('Synthetic credentials must never refresh'),
    ),
  };
  const planner = new LLMPlanner(await createModel(config), 'web', getProviderOptions(config));
  const result = await planner.plan('Fill Search products with the requested text.', screen, {
    previousSteps: [],
  });
  assert.equal(requests.length, 1);
  return { ...result, request: requests[0] };
}

test('GPT-6.1 Sol uses subscription Responses with developer instructions and valid defaults', async (t) => {
  const result = await plan(t, [completed(args)]);
  assert.equal(result.request.model, 'gpt-6.1-sol');
  assert.deepEqual(
    result.request.input.map((message) => message.role),
    ['developer', 'user'],
  );
  assert.equal(result.request.store, false);
  assert.equal(result.request.stream, true);
  assert.equal(result.request.tool_choice, 'required');
  assert.ok(result.request.tools.some((tool) => tool.type === 'function' && tool.name === 'fill'));
  for (const unsupportedDefault of ['temperature', 'top_p']) {
    assert.equal(result.request[unsupportedDefault], undefined);
  }
  assert.notEqual(result.request.reasoning?.effort, 'none');
  assert.notEqual(result.request.reasoning?.effort, 'minimal');
  assert.deepEqual(result.plan.action, { type: 'fill', ref: args.ref, value: args.value });
});

test('subscription SSE preserves exact Unicode tool arguments across byte boundaries', async (t) => {
  const input = { ...args, reasoning: 'Search for café 🧪.', value: 'café 🧪 東京' };
  const result = await plan(t, [completed(input)], 1);
  assert.equal(result.plan.reasoning, input.reasoning);
  assert.deepEqual(result.plan.action, { type: 'fill', ref: input.ref, value: input.value });
});

test('completed function arguments take precedence over partial stream deltas', async (t) => {
  const result = await plan(t, [
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...callItem(args), arguments: '', status: 'in_progress' },
    },
    {
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: JSON.stringify({ ...args, ref: 'e15 wrong', value: 'partial value' }),
    },
    { type: 'response.output_item.done', output_index: 0, item: callItem(args) },
    completed(args),
  ]);
  assert.deepEqual(result.plan.action, { type: 'fill', ref: args.ref, value: args.value });
});

test('malformed model references remain invalid on web and mobile instead of being repaired', async (t) => {
  const input = { ...args, ref: 'e15 sulphur' };
  const result = await plan(t, [completed(input)]);
  assert.equal(result.plan.action.ref, input.ref);
  const refs = {
    e15: {
      role: 'textbox',
      name: 'Search products',
      bounds: { x: 0, y: 0, width: 100, height: 40 },
    },
  };
  const web = new ElementResolver(
    { getByRole: () => assert.fail('Invalid refs must never target an element') },
    refs,
  );
  const mobile = new MobileElementResolver(refs);
  for (const resolver of [web, mobile]) {
    assert.throws(() => resolver.resolve(result.plan.action.ref), /Unknown ref "e15 sulphur"/);
  }
});
