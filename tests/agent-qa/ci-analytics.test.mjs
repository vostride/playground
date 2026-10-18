import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  AGENT_QA_POSTHOG_KEY,
  buildAnalyticsEvent,
  captureAnalytics,
  createAnalyticsRunReporter,
  flushAnalytics,
  resetAnalyticsServiceForTests,
  resolveAnalyticsStandardProperties,
} from '@vostride/agent-qa-core';
import {
  installCiAnalytics,
  loadPinnedPostHog,
  validateCiAnalyticsEnvironment,
  wrapCiAnalyticsCapture,
} from './ci-analytics.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modulePath = fileURLToPath(new URL('./ci-analytics.mjs', import.meta.url));
const identity = 'u_alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel-india-juliet';
const otherIdentity = 'u_alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel-india-kilo';

function environment(runnerTemp = '/tmp/synthetic-runner') {
  return {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    RUNNER_TEMP: runnerTemp,
    XDG_DATA_HOME: join(runnerTemp, 'playground-agent-qa-auth'),
    AGENT_QA_ANALYTICS_ID: identity,
  };
}

function interceptSdkBelowCapture(t, PostHog) {
  const events = [];
  let networkAttempts = 0;
  const prototype = PostHog.prototype;
  const enqueueDescriptor = Object.getOwnPropertyDescriptor(prototype, 'enqueue');
  const fetchDescriptor = Object.getOwnPropertyDescriptor(prototype, 'fetch');
  const originalFetch = globalThis.fetch;
  const forbidNetwork = () => {
    networkAttempts += 1;
    throw new Error('Network is forbidden in CI analytics tests.');
  };
  globalThis.fetch = forbidNetwork;
  Object.defineProperty(prototype, 'enqueue', {
    configurable: true,
    value(type, message) { events.push({ type, ...structuredClone(message) }); },
  });
  Object.defineProperty(prototype, 'fetch', {
    configurable: true,
    value: forbidNetwork,
  });
  t.after(() => {
    if (enqueueDescriptor) Object.defineProperty(prototype, 'enqueue', enqueueDescriptor);
    else delete prototype.enqueue;
    if (fetchDescriptor) Object.defineProperty(prototype, 'fetch', fetchDescriptor);
    else delete prototype.fetch;
    globalThis.fetch = originalFetch;
    assert.equal(networkAttempts, 0);
  });
  return events;
}

async function fixture(t, stored = { distinctId: identity, is_internal: true }) {
  const directory = join(root, 'test-results');
  await mkdir(directory, { recursive: true });
  const runnerTemp = await mkdtemp(join(directory, 'ci-analytics-'));
  t.after(() => rm(runnerTemp, { recursive: true, force: true }));
  const env = environment(runnerTemp);
  const identityPath = join(env.XDG_DATA_HOME, 'agent-qa', 'analytics.json');
  await mkdir(join(env.XDG_DATA_HOME, 'agent-qa'), { recursive: true });
  await writeFile(identityPath, JSON.stringify(stored));
  return { env, identityPath };
}

test('CI analytics requires GitHub CI, an explicit runtime directory, and a persistent ID', () => {
  const env = environment();
  const before = { ...env };
  assert.deepEqual(validateCiAnalyticsEnvironment(env), {
    runnerTemp: env.RUNNER_TEMP,
    dataDirectory: env.XDG_DATA_HOME,
    identityPath: join(env.XDG_DATA_HOME, 'agent-qa', 'analytics.json'),
    distinctId: identity,
  });
  assert.deepEqual(env, before);
  for (const override of [
    { CI: undefined }, { CI: 'false' }, { GITHUB_ACTIONS: undefined },
    { GITHUB_ACTIONS: 'false' }, { RUNNER_TEMP: undefined }, { RUNNER_TEMP: 'relative' },
    { RUNNER_TEMP: '/', XDG_DATA_HOME: '/playground-agent-qa-auth' },
    { XDG_DATA_HOME: undefined }, { XDG_DATA_HOME: '/tmp/local-identity' },
    { AGENT_QA_ANALYTICS_ID: undefined }, { AGENT_QA_ANALYTICS_ID: 'u_CI' },
    { AGENT_QA_ANALYTICS_ID: `${identity}\n` },
  ]) {
    assert.throws(() => validateCiAnalyticsEnvironment({ ...env, ...override }));
  }
});

test('capture shim preserves allowlisted CI properties and leaves other projects and events untouched', () => {
  class FakePostHog {
    constructor(apiKey) { this.apiKey = apiKey; this.events = []; }
    capture(event) { this.events.push(event); return 'forwarded'; }
  }
  const original = FakePostHog.prototype.capture;
  const uninstall = wrapCiAnalyticsCapture({ distinctId: identity, PostHog: FakePostHog });
  const client = new FakePostHog(AGENT_QA_POSTHOG_KEY);
  const event = buildAnalyticsEvent({
    name: 'agent-qa.test_run.completed',
    properties: { runtime_context: 'ci', surface: 'cli', platform: 'android', run_id: 'synthetic-run' },
  });
  event.properties.unexpected_private_value = 'must not be forwarded';
  const message = { distinctId: 'u_CI', event: event.name, properties: event.properties };
  const before = structuredClone(message);
  assert.equal(client.capture(message), 'forwarded');
  assert.equal(client.events.length, 1);
  const sent = client.events[0];
  assert.equal(sent.distinctId, identity);
  assert.equal(sent.event, event.name);
  assert.equal(sent.properties.runtime_context, 'ci');
  assert.equal(sent.properties.platform, 'android');
  assert.equal(sent.properties.run_id, 'synthetic-run');
  assert.deepEqual(sent.properties.$set, { is_internal: true });
  assert.equal(Object.hasOwn(sent.properties, '$process_person_profile'), false);
  assert.equal(Object.hasOwn(sent.properties, 'unexpected_private_value'), false);
  assert.deepEqual(message, before);
  const otherProject = new FakePostHog('synthetic-unrelated-project');
  otherProject.capture(message);
  assert.equal(otherProject.events[0], message);
  const unknownEvent = { ...message, event: 'unrelated.event' };
  client.capture(unknownEvent);
  assert.equal(client.events[1], unknownEvent);
  assert.throws(() => wrapCiAnalyticsCapture({ distinctId: identity, PostHog: FakePostHog }), /already installed/);
  uninstall();
  uninstall();
  assert.equal(FakePostHog.prototype.capture, original);
});

test('actual fresh run reporters and the singleton use the verified CI identity without network', async (t) => {
  const { env, identityPath } = await fixture(t);
  const before = { ...env };
  const { PostHog, version, esmEntry } = await loadPinnedPostHog();
  assert.equal(version, '5.33.2');
  assert.ok(esmEntry.endsWith('/dist/entrypoints/index.node.mjs'));
  const events = interceptSdkBelowCapture(t, PostHog);
  const original = PostHog.prototype.capture;
  resetAnalyticsServiceForTests();
  t.after(resetAnalyticsServiceForTests);
  const installed = await installCiAnalytics({ env });
  t.after(installed.uninstall);
  assert.equal(installed.identityPath, identityPath);
  // This is the CLI's fresh-service path, which the old singleton hook missed.
  const result = {
    runId: 'synthetic-run', name: 'Synthetic test', filePath: 'synthetic.yaml',
    status: 'passed', duration: 1, steps: [], metadata: { platform: 'android' },
  };
  const summary = { results: [result], duration: 1, passed: 1, failed: 0, skipped: 0 };
  const reporter = createAnalyticsRunReporter({ config: {}, surface: 'cli', env });
  await reporter.onRunEnd(summary);
  await reporter.onSuiteEnd({
    runId: 'synthetic-suite', status: 'passed', duration: 1,
    tests: [], passed: 0, failed: 0, skipped: 0,
  });
  await reporter.flush();
  assert.deepEqual(events.map((event) => event.event), [
    'agent-qa.test_run.completed', 'agent-qa.suite_run.completed',
  ]);
  assert.equal(events[0].properties.platform, 'android');
  const properties = await resolveAnalyticsStandardProperties({ env, surface: 'cli' });
  assert.equal(properties.runtime_context, 'ci');
  const event = buildAnalyticsEvent({ name: 'agent-qa.analytics.test_event', properties });
  await captureAnalytics(event, { env });
  await flushAnalytics();
  assert.equal(events.length, 3);
  for (const sent of events) {
    assert.equal(sent.distinct_id, identity);
    assert.equal(sent.properties.runtime_context, 'ci');
    assert.deepEqual(sent.properties.$set, { is_internal: true });
    assert.equal(Object.hasOwn(sent.properties, '$process_person_profile'), false);
  }
  // Both official opt-outs still win before any SDK capture can occur.
  const privateReporter = createAnalyticsRunReporter({ config: { analytics: { privacy: true } }, env });
  await privateReporter.onRunEnd(summary);
  await privateReporter.flush();
  await captureAnalytics(event, { config: { analytics: { privacy: true } } });
  assert.equal(events.length, 3);
  assert.deepEqual(env, before);
  installed.uninstall();
  assert.equal(PostHog.prototype.capture, original);
});

test('installation rejects mismatched, external, malformed, or missing runtime identity', async (t) => {
  for (const stored of [
    { distinctId: otherIdentity, is_internal: true },
    { distinctId: identity, is_internal: false },
    { distinctId: identity },
    { distinctId: 'u_CI', is_internal: true },
    {},
  ]) {
    const { env } = await fixture(t, stored);
    await assert.rejects(installCiAnalytics({ env }));
  }
  const { env, identityPath } = await fixture(t);
  await writeFile(identityPath, '{invalid');
  await assert.rejects(installCiAnalytics({ env }), /invalid/);
  await rm(identityPath);
  await assert.rejects(installCiAnalytics({ env }));
});

test('runtime file and directory symlinks cannot redirect identity reads outside their scope', async (t) => {
  const { env, identityPath } = await fixture(t);
  const elsewhere = join(env.RUNNER_TEMP, 'elsewhere.json');
  await writeFile(elsewhere, JSON.stringify({ distinctId: identity, is_internal: true }));
  await rm(identityPath);
  await symlink(elsewhere, identityPath);
  await assert.rejects(installCiAnalytics({ env }), /identity path escapes/);
  await rm(env.XDG_DATA_HOME, { recursive: true });
  const otherDirectory = join(env.RUNNER_TEMP, 'other-data');
  await mkdir(otherDirectory);
  await symlink(otherDirectory, env.XDG_DATA_HOME);
  await assert.rejects(installCiAnalytics({ env }), /data directory escapes/);
});

test('ordinary module imports do not bootstrap or read local identity files', () => {
  const result = spawnSync(process.execPath, ['--import', modulePath, '--eval', 'console.log("entry-ran")'], {
    cwd: root,
    env: {
      ...process.env,
      CI: 'false',
      GITHUB_ACTIONS: 'false',
      PLAYGROUND_AGENT_QA_ANALYTICS_PRELOAD: '',
      XDG_DATA_HOME: '/nonexistent/local-identity-must-not-be-read',
      AGENT_QA_ANALYTICS_ID: 'invalid',
    },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /entry-ran/);
});

test('explicit preload on a non-CI process fails before its entry point', () => {
  const result = spawnSync(process.execPath, ['--import', modulePath, '--eval', 'console.log("entry-ran")'], {
    cwd: root,
    env: { ...process.env, CI: 'false', GITHUB_ACTIONS: 'false', PLAYGROUND_AGENT_QA_ANALYTICS_PRELOAD: '1' },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires CI=true/);
  assert.equal(result.stdout.includes('entry-ran'), false);
});
