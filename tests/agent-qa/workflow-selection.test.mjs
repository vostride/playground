import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

const workflow = YAML.parse(
  readFileSync(new URL('../../.github/workflows/agent-qa.yml', import.meta.url), 'utf8'),
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const select = new AsyncFunction(
  'github',
  'context',
  'core',
  'process',
  workflow.jobs.select.steps.find((step) => step.id === 'select').with.script,
);
const currentSha = 'b'.repeat(40);
const historicalSha = 'a'.repeat(40);
const definitions = {
  web: { id: 11, path: '.github/workflows/web.yml' },
  mobile: { id: 22, path: '.github/workflows/mobile-release.yml' },
};

function run(kind, id, head_sha = currentSha, conclusion = 'success') {
  return {
    id,
    head_sha,
    conclusion,
    path: definitions[kind].path,
    workflow_id: definitions[kind].id,
    repository: { id: 7 },
    head_repository: { id: 7 },
    event: 'push',
    head_branch: 'main',
    status: 'completed',
  };
}

function artifacts(source) {
  const names =
    source.workflow_id === definitions.web.id
      ? ['web-dist']
      : ['diagnostic-android-apk-unverified', 'diagnostic-ios-simulator-unverified'];
  return names.map((name, index) => ({
    id: source.id * 10 + index,
    name,
    expired: false,
    size_in_bytes: 100,
    workflow_run: { head_sha: source.head_sha },
  }));
}

async function selection({ source, tipSha = currentSha, manual = false, counterparts = [] }) {
  const calls = { refs: [], counterpartQueries: [], artifactRuns: [] };
  const outputs = {};
  const summary = [];
  const actions = {
    async getWorkflow({ workflow_id }) {
      const definition = Object.values(definitions).find((item) =>
        item.path.endsWith(`/${workflow_id}`),
      );
      assert.ok(definition, 'Only registered producer workflows may be queried');
      return { data: definition };
    },
    async getWorkflowRun({ run_id }) {
      assert.equal(String(run_id), String(source.id));
      return { data: source };
    },
    listWorkflowRuns() {
      assert.fail('Workflow lists must use pagination');
    },
    listWorkflowRunArtifacts() {
      assert.fail('Artifact lists must use pagination');
    },
  };
  const github = {
    rest: {
      actions,
      git: {
        async getRef(query) {
          calls.refs.push(query.ref);
          return { data: { object: { sha: tipSha } } };
        },
      },
    },
    async paginate(method, query) {
      if (method === actions.listWorkflowRuns) {
        calls.counterpartQueries.push(query);
        return counterparts;
      }
      assert.equal(method, actions.listWorkflowRunArtifacts);
      calls.artifactRuns.push(query.run_id);
      const selected = [source, ...counterparts].find((item) => item.id === query.run_id);
      assert.ok(selected, 'Artifacts must belong to an explicit producer');
      return artifacts(selected);
    },
  };
  const core = {
    setOutput(name, value) {
      outputs[name] = value;
    },
    summary: {
      addHeading() {
        return this;
      },
      addRaw(text) {
        summary.push(text);
        return this;
      },
      async write() {},
    },
  };
  // A synthetic process argument avoids reading or changing real environment
  // variables. Every GitHub operation is mocked; no auth or model is loaded.
  await select(
    github,
    {
      repo: { owner: 'fixture', repo: 'playground' },
      eventName: manual ? 'workflow_dispatch' : 'workflow_run',
      payload: { repository: { id: 7 }, workflow_run: source },
    },
    core,
    {
      env: {
        SOURCE_RUN_ID: String(source.id),
        REQUESTED_PLATFORM: manual ? 'all' : 'automatic',
        AUTH_CONFIGURED: 'true',
      },
    },
  );
  return {
    calls,
    ready: outputs.ready,
    entries: JSON.parse(outputs.matrix).include,
    summary: summary.join(''),
  };
}

test('superseded automatic web and mobile producers cannot schedule journeys or list artifacts', async () => {
  for (const kind of ['web', 'mobile']) {
    const result = await selection({ source: run(kind, 100, historicalSha) });
    assert.equal(result.ready, 'false');
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.calls.artifactRuns, []);
    assert.deepEqual(result.calls.counterpartQueries, []);
    assert.match(result.summary, /cancelled or superseded/);
  }
});

test('cancelled automatic producers are skipped even when their commit is current', async () => {
  for (const kind of ['web', 'mobile']) {
    const result = await selection({ source: run(kind, 100, currentSha, 'cancelled') });
    assert.equal(result.ready, 'false');
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.calls.artifactRuns, []);
    assert.deepEqual(result.calls.counterpartQueries, []);
  }
});

test('a current automatic web producer selects its exact static artifact only', async () => {
  const result = await selection({ source: run('web', 100) });
  assert.equal(result.ready, 'true');
  assert.deepEqual(
    result.entries.map(({ platform, runId, sourceSha, artifactId }) => ({
      platform,
      runId,
      sourceSha,
      artifactId,
    })),
    [{ platform: 'web', runId: '100', sourceSha: currentSha, artifactId: '1000' }],
  );
  assert.deepEqual(result.calls.refs, ['heads/main']);
  assert.deepEqual(result.calls.artifactRuns, [100]);
  assert.deepEqual(result.calls.counterpartQueries, []);
});

test('a current automatic mobile producer selects both native artifacts from that run', async () => {
  const result = await selection({ source: run('mobile', 200) });
  assert.equal(result.ready, 'true');
  assert.deepEqual(
    result.entries.map(({ platform, runId, sourceSha, artifactId }) => ({
      platform,
      runId,
      sourceSha,
      artifactId,
    })),
    [
      { platform: 'android', runId: '200', sourceSha: currentSha, artifactId: '2000' },
      { platform: 'ios', runId: '200', sourceSha: currentSha, artifactId: '2001' },
    ],
  );
  assert.deepEqual(result.calls.refs, ['heads/main']);
  assert.deepEqual(result.calls.counterpartQueries, []);
});

test('manual all-platform selection preserves the explicit historical commit across producers', async () => {
  const result = await selection({
    source: run('web', 100, historicalSha),
    manual: true,
    counterparts: [run('mobile', 999, currentSha), run('mobile', 200, historicalSha)],
  });
  assert.equal(result.ready, 'true');
  assert.deepEqual(
    result.entries.map(({ platform, runId, sourceSha }) => ({ platform, runId, sourceSha })),
    [
      { platform: 'web', runId: '100', sourceSha: historicalSha },
      { platform: 'android', runId: '200', sourceSha: historicalSha },
      { platform: 'ios', runId: '200', sourceSha: historicalSha },
    ],
  );
  assert.deepEqual(result.calls.refs, []);
  assert.equal(result.calls.counterpartQueries.length, 1);
  assert.equal(result.calls.counterpartQueries[0].head_sha, historicalSha);
  assert.deepEqual(result.calls.artifactRuns, [100, 200, 200]);
});
