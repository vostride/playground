import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AGENT_QA_POSTHOG_KEY,
  AGENT_QA_VERSION,
  ANALYTICS_EVENT_NAMES,
  buildAnalyticsEvent,
  getAnalyticsIdentityPath,
  readAnalyticsIdentity,
} from '@vostride/agent-qa-core';

const identityPattern = /^u_([a-z]+-){9}[a-z]+$/;
const runtimeDirectory = 'playground-agent-qa-auth';
const supportedEvents = new Set(ANALYTICS_EVENT_NAMES);
const installedShims = new WeakMap();

export function validateCiAnalyticsEnvironment(env) {
  assert.equal(env.CI, 'true', 'CI analytics requires CI=true.');
  assert.equal(env.GITHUB_ACTIONS, 'true', 'CI analytics requires GitHub Actions.');
  assert.ok(
    typeof env.RUNNER_TEMP === 'string' && isAbsolute(env.RUNNER_TEMP),
    'CI analytics requires an absolute RUNNER_TEMP.',
  );
  const runnerTemp = resolve(env.RUNNER_TEMP);
  assert.notEqual(runnerTemp, '/', 'CI analytics requires a dedicated RUNNER_TEMP.');
  assert.equal(
    env.XDG_DATA_HOME,
    join(runnerTemp, runtimeDirectory),
    'CI analytics requires the dedicated XDG_DATA_HOME under RUNNER_TEMP.',
  );
  assert.ok(
    typeof env.AGENT_QA_ANALYTICS_ID === 'string' && identityPattern.test(env.AGENT_QA_ANALYTICS_ID),
    'CI analytics requires a valid persistent AGENT_QA_ANALYTICS_ID.',
  );
  return {
    runnerTemp,
    dataDirectory: env.XDG_DATA_HOME,
    identityPath: getAnalyticsIdentityPath(env),
    distinctId: env.AGENT_QA_ANALYTICS_ID,
  };
}

// v0.1.21 run reporters create fresh services and bypass the analytics singleton.
// Resolve the exact ESM SDK class they import; require() would return another class.
export async function loadPinnedPostHog() {
  assert.equal(AGENT_QA_VERSION, '0.1.21', 'Review the CI analytics shim before changing agent-qa.');
  const coreEntry = import.meta.resolve('@vostride/agent-qa-core');
  const coreRequire = createRequire(coreEntry);
  const cliRequire = createRequire(import.meta.resolve('agent-qa'));
  assert.equal(
    cliRequire.resolve('@vostride/agent-qa-core'),
    coreRequire.resolve('@vostride/agent-qa-core'),
    'The CLI and CI analytics shim must resolve the same core package.',
  );
  const requireEntry = coreRequire.resolve('posthog-node');
  const packageDirectory = resolve(dirname(requireEntry), '../..');
  const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'posthog-node', 'Unexpected analytics SDK package.');
  assert.equal(manifest.version, '5.33.2', 'Review the CI analytics shim before changing the analytics SDK.');
  assert.equal(requireEntry, join(packageDirectory, 'dist/entrypoints/index.node.js'));
  assert.equal(manifest.exports?.['.']?.node?.import, './dist/entrypoints/index.node.mjs');
  const esmEntry = pathToFileURL(join(packageDirectory, manifest.exports['.'].node.import)).href;
  const { PostHog } = await import(esmEntry);
  assert.equal(typeof PostHog?.prototype?.capture, 'function', 'Analytics SDK capture API is unavailable.');
  return { PostHog, version: manifest.version, esmEntry };
}

// This process-only compatibility shim leaves official event generation and
// privacy opt-outs in place. No package files or environment flags are changed.
export function wrapCiAnalyticsCapture({ distinctId, PostHog }) {
  assert.ok(typeof distinctId === 'string' && identityPattern.test(distinctId), 'Invalid CI analytics identity.');
  const prototype = PostHog?.prototype;
  assert.equal(typeof prototype?.capture, 'function', 'Analytics SDK capture API is unavailable.');
  assert.ok(!installedShims.has(prototype), 'The CI analytics capture shim is already installed.');
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'capture');
  const originalCapture = prototype.capture;
  function capture(message) {
    if (this?.apiKey !== AGENT_QA_POSTHOG_KEY || !supportedEvents.has(message?.event)) {
      return Reflect.apply(originalCapture, this, [message]);
    }
    const event = buildAnalyticsEvent({ name: message.event, properties: message.properties });
    const { $process_person_profile: _personProfile, ...properties } = event.properties;
    return Reflect.apply(originalCapture, this, [{
      ...message,
      distinctId,
      properties: { ...properties, $set: { is_internal: true } },
    }]);
  }
  Object.defineProperty(prototype, 'capture', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? false,
    writable: true,
    value: capture,
  });
  let active = true;
  function uninstall() {
    if (!active) return;
    assert.equal(prototype.capture, capture, 'Analytics capture changed after CI shim installation.');
    if (descriptor) Object.defineProperty(prototype, 'capture', descriptor);
    else delete prototype.capture;
    installedShims.delete(prototype);
    active = false;
  }
  installedShims.set(prototype, uninstall);
  return uninstall;
}

export async function installCiAnalytics({ env = process.env } = {}) {
  const expected = validateCiAnalyticsEnvironment(env);
  // Reject symlinks that could redirect this explicitly named CI file to local state.
  const runnerTemp = await realpath(expected.runnerTemp);
  const dataDirectory = await realpath(expected.dataDirectory);
  assert.equal(dataDirectory, join(runnerTemp, runtimeDirectory), 'CI analytics data directory escapes RUNNER_TEMP.');
  assert.equal(
    await realpath(expected.identityPath),
    join(dataDirectory, 'agent-qa', 'analytics.json'),
    'CI analytics identity path escapes its runtime directory.',
  );
  const identity = await readAnalyticsIdentity(expected.identityPath);
  assert.ok(identity, 'CI analytics identity file is missing or invalid.');
  assert.equal(identity.distinctId, expected.distinctId, 'CI analytics identity differs from AGENT_QA_ANALYTICS_ID.');
  assert.equal(identity.is_internal, true, 'CI analytics identity must have is_internal:true.');
  const { PostHog, version } = await loadPinnedPostHog();
  const uninstall = wrapCiAnalyticsCapture({ distinctId: identity.distinctId, PostHog });
  return { uninstall, identityPath: expected.identityPath, distinctId: identity.distinctId, sdkVersion: version };
}

// Ordinary imports, unit tests, and the local dashboard never read an identity file.
if (process.env.PLAYGROUND_AGENT_QA_ANALYTICS_PRELOAD === '1') {
  await installCiAnalytics();
}
