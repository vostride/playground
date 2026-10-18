import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { resolveTarget } from 'agent-qa';
import {
  AgentQaConfigSchema,
  createMemoryProvider,
  generateObservationId,
  resolveMemoryRoot,
} from '@vostride/agent-qa-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const products = ['komazon', 'looking', 'brello', 'pepapog'];
const platforms = ['android', 'ios', 'web'];
const config = AgentQaConfigSchema.parse(
  YAML.parse(await readFile(join(root, 'agent-qa.config.yaml'), 'utf8')),
);
const targets = Object.keys(config.registry.targets).map((name) => resolveTarget(config, name));

function observation(product, sourceTest) {
  return {
    id: generateObservationId(),
    title: `Synthetic ${product} memory`,
    content: `Synthetic ${product} memory describes a fixture workflow available on every target.`,
    trust: 0.8,
    created: '2026-01-01T00:00:00.000Z',
    last_confirmed: '2026-01-01T00:00:00.000Z',
    confirmed_count: 1,
    contradicted_count: 0,
    source_test: sourceTest,
  };
}

async function temporaryMemory(t) {
  const memoryRoot = await mkdtemp(join(tmpdir(), 'playground-agent-qa-memory-'));
  t.after(() => rm(memoryRoot, { recursive: true, force: true }));
  return memoryRoot;
}

test('four products each have web, Android and iOS targets sharing the configured memory root', () => {
  assert.equal(config.services.memory.enabled, true);
  assert.equal(config.services.memory.provider, 'local');
  assert.equal(config.services.memory.curatorEnabled, true);
  assert.equal(resolveMemoryRoot(config, root), join(root, '.agent-qa', 'memory'));
  assert.equal(targets.length, products.length * platforms.length);
  for (const product of products) {
    const matching = targets.filter((target) => target.product === product);
    assert.deepEqual(matching.map((target) => target.platform).sort(), platforms, product);
    for (const target of matching) {
      assert.ok(target.name.startsWith(`${target.platform}-`), target.name);
    }
  }
});

test('installed local provider shares product observations across targets and isolates other products', async (t) => {
  const memoryRoot = await temporaryMemory(t);
  const writer = await createMemoryProvider({ provider: 'local', memoryRoot });
  const observations = new Map();
  try {
    for (const product of products) {
      const data = observation(product, `synthetic-source-${product}`);
      observations.set(product, data);
      await writer.writeObservation('products', product, data);
    }
  } finally {
    writer.destroy();
  }

  for (const target of targets) {
    const reader = await createMemoryProvider({ provider: 'local', memoryRoot });
    try {
      await reader.init({
        memoryRoot,
        product: target.product,
        testId: `synthetic-reader-${target.name}`,
      });
      const result = reader.queryForStep(`synthetic ${target.product} memory`, 0);
      assert.deepEqual(
        result?.observations.map((entry) => entry.id),
        [observations.get(target.product).id],
        `${target.name} must load the persisted product observation with a different test ID`,
      );
      for (const other of products.filter((product) => product !== target.product)) {
        assert.equal(
          reader.queryForStep(`synthetic ${other} memory`, 1),
          null,
          `${target.name} must not retrieve ${other} product observations`,
        );
      }
    } finally {
      reader.destroy();
    }
  }
});

test('test observations follow the stable test ID rather than the target platform', async (t) => {
  const memoryRoot = await temporaryMemory(t);
  const testId = 'synthetic-shared-native-journey';
  const data = observation('shared journey', testId);
  const writer = await createMemoryProvider({ provider: 'local', memoryRoot });
  try {
    await writer.writeObservation('tests', testId, data);
  } finally {
    writer.destroy();
  }
  for (const target of targets.filter((entry) => entry.product === 'komazon')) {
    for (const selectedTestId of [testId, `synthetic-unrelated-${target.name}`]) {
      const reader = await createMemoryProvider({ provider: 'local', memoryRoot });
      try {
        await reader.init({ memoryRoot, product: target.product, testId: selectedTestId });
        const result = reader.queryForStep('synthetic shared journey memory', 0);
        if (selectedTestId === testId) {
          assert.deepEqual(result?.observations.map((entry) => entry.id), [data.id], target.name);
        } else {
          assert.equal(result, null, `${target.name} must not inherit another test's observations`);
        }
      } finally {
        reader.destroy();
      }
    }
  }
});
