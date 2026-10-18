import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activateBlock,
  assertAnchor,
  assertAnchorOrder,
  assertBlockRules,
  assertCI,
  assertMainRules,
  evidenceFailures,
  makeAnchor,
  restore,
  RULES,
} from './offline-support.mjs';

const device = '11111111-2222-3333-4444-555555555555';
const anchor = makeAnchor(device);
const success = (stdout = '') => ({ code: 0, stdout, stderr: '', timedOut: false });
const stockScrub = 'scrub-anchor "com.apple/*" all fragment reassemble';
const filterHook = 'anchor "com.apple/*" all';
const stockMainRules = `${stockScrub}\n${filterHook}\n`;

test('mutation guard requires macOS GitHub CI and a concrete UUID', () => {
  const valid = { platform: 'darwin', env: { CI: 'true', GITHUB_ACTIONS: 'true' }, device };
  assert.doesNotThrow(() => assertCI(valid));
  for (const invalid of [
    { ...valid, platform: 'linux' },
    { ...valid, env: {} },
    { ...valid, device: 'booted' },
    { ...valid, env: { CI: 'true' } },
    { ...valid, device: '' },
  ])
    assert.throws(() => assertCI(invalid));
  for (const value of ['com.apple', 'com.apple/*', 'playground/test', `${anchor}/child`])
    assert.throws(() => assertAnchor(value));
});

test('unique full-UUID anchor fits Darwin’s 64-byte name field including its terminator', () => {
  assert.equal(anchor, `com.apple/000.pg-offline-${device}`);
  assert.equal(Buffer.byteLength(anchor, 'utf8'), 61);
  assert.doesNotThrow(() => assertAnchor(anchor));
  const previous = `com.apple/000.playground-offline-${device}`;
  assert.equal(Buffer.byteLength(previous, 'utf8'), 69);
  assert.throws(() => assertAnchor(previous), /64-byte/);
  assert.throws(() => assertAnchor(`${anchor}abc`), /64-byte/);
  for (const id of [
    '',
    '-'.repeat(36),
    device.replace('-', ''),
    device.replace('11111111', 'gggggggg'),
  ])
    assert.throws(() => makeAnchor(id));
  for (const value of [
    anchor.replace('000.', '001.'),
    anchor.replace('com.apple', 'com.other'),
    `${anchor}/x`,
  ])
    assert.throws(() => assertAnchor(value));
});

test('invalid anchor names fail before activation or restoration can invoke PF', async () => {
  let calls = 0;
  const run = async () => {
    calls++;
    return success();
  };
  for (const invalid of [
    `com.apple/000.playground-offline-${device}`,
    `${anchor}abc`,
    'com.apple/*',
  ]) {
    await assert.rejects(activateBlock({ anchor: invalid }, { run, shouldStop: () => false }));
    await assert.rejects(restore({ anchor: invalid, token: '1234' }, true, run));
  }
  assert.equal(calls, 0);
});

test('rejects inert, bypassable, or single-family PF rules', () => {
  assert.doesNotThrow(() => assertMainRules('anchor "com.apple/*" all\n'));
  assert.throws(() => assertMainRules(''));
  assert.throws(() => assertMainRules('pass quick all\nanchor "com.apple/*" all'));
  assert.throws(() => assertMainRules('anchor "playground/*" all'));
  assert.doesNotThrow(() => assertBlockRules(RULES));
  assert.throws(() => assertBlockRules(RULES.replace('out quick', 'out quick inet')));
  assert.throws(() => assertBlockRules(RULES.replace('drop', 'return')));
  assert.throws(() => assertBlockRules(RULES.replace('! lo0', 'en0')));
  const own = anchor.split('/')[1];
  assert.deepEqual(assertAnchorOrder(`${own}\n250.ApplicationFirewall\n`, anchor), [
    own,
    '250.ApplicationFirewall',
  ]);
  assert.throws(() => assertAnchorOrder('250.ApplicationFirewall', anchor));
  assert.throws(() => assertAnchorOrder(`000.allow-first\n${own}`, anchor));
});

test('accepts the observed stock normalization prefix without allowing other main rules', () => {
  assert.doesNotThrow(() => assertMainRules(stockMainRules));
  assert.doesNotThrow(() => assertMainRules(`${filterHook}\n`));
  for (const invalid of [
    stockScrub,
    `${filterHook}\n${stockScrub}`,
    `${stockScrub}\n${stockScrub}\n${filterHook}`,
    `${stockMainRules}${filterHook}`,
    `${stockMainRules}pass quick all`,
    `pass quick all\n${stockMainRules}`,
    `${stockMainRules}block all`,
    `${stockMainRules}anchor "another/*" all`,
    stockMainRules.replace('scrub-anchor "com.apple/*"', 'scrub-anchor "another/*"'),
    stockMainRules.replace('fragment reassemble', 'fragment crop'),
    stockMainRules.replace('all fragment', 'inet all fragment'),
    stockMainRules.replace('all fragment', 'on en0 all fragment'),
    `${stockScrub}\nanchor "com.apple/*" out inet all`,
  ])
    assert.throws(() => assertMainRules(invalid), invalid);
});

test('activation loads attached first anchor before clearing established states', async () => {
  const calls = [];
  let loaded = false;
  const run = async (args, options) => {
    calls.push(args.join(' '));
    if (args.join(' ') === '-s rules') return success(stockMainRules);
    if (args.includes('Anchors'))
      return success(
        loaded
          ? `${anchor}\ncom.apple/250.ApplicationFirewall`
          : 'com.apple/250.ApplicationFirewall',
      );
    if (args.includes('-f')) {
      assert.equal(options.input, RULES);
      loaded = true;
      return success();
    }
    if (args.includes('rules')) return success(RULES);
    return success();
  };
  const result = await activateBlock({ anchor }, { run, shouldStop: () => false });
  assert.equal(result.mainRules, stockMainRules);
  assert.equal(result.loadedRules, RULES);
  assert.equal(calls.at(-1), '-F states');
  assert.ok(calls.indexOf(`-a ${anchor} -f -`) < calls.indexOf('-F states'));
});

test('interruption during rule load cannot allow late activation after cleanup', async () => {
  const events = [];
  let cancelled = false,
    resolveLoad;
  const loaded = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  let loadEntered;
  const entered = new Promise((resolve) => {
    loadEntered = resolve;
  });
  const activation = activateBlock(
    { anchor },
    {
      shouldStop: () => cancelled,
      run: async (args) => {
        if (args.join(' ') === '-s rules') return success('anchor "com.apple/*" all');
        if (args.includes('Anchors')) return success();
        if (args.includes('-f')) {
          events.push('load-start');
          loadEntered();
          await loaded;
          events.push('load-end');
          return success();
        }
        events.push('unexpected-operation');
        return success();
      },
    },
  );
  // This is the daemon's try/finally ordering: restoration cannot run concurrently with load.
  const serialized = activation
    .catch(() => events.push('cancelled'))
    .finally(() => events.push('cleanup'));
  await entered;
  cancelled = true;
  assert.deepEqual(events, ['load-start']);
  resolveLoad();
  await serialized;
  assert.deepEqual(events, ['load-start', 'load-end', 'cancelled', 'cleanup']);
});

test('restoration touches only owned rules/reference and retries a failed flush', async () => {
  const calls = [];
  let failures = 1;
  const result = await restore({ anchor, token: '1234' }, true, async (_command, args) => {
    calls.push(args);
    if (args.includes('-F') && failures--) return { ...success(), code: 1 };
    return success();
  });
  assert.equal(result.empty, true);
  assert.equal(result.released, true);
  assert.deepEqual(calls, [
    ['-a', anchor, '-F', 'rules'],
    ['-a', anchor, '-F', 'rules'],
    ['-a', anchor, '-s', 'rules'],
    ['-X', '1234'],
  ]);
});

const validEvidence = () => ({
  online: { ipv4: success(), ipv6: { code: 7 } },
  anchorVerified: true,
  statesFlushed: true,
  during: { ipv4: { code: 28 }, ipv6: { code: 7 }, loopback: true },
  afterTest: { ipv4: { code: 28 }, ipv6: { code: 7 }, loopback: true },
  test: success(),
  journeyCompleted: true,
  watchdogFired: false,
  watchdogFailure: null,
  blockedAtMs: 1_000,
  provedAtMs: 25_000,
  cleanup: { empty: true, released: true, failed: false, flushedAtMs: 25_100 },
  restored: { ipv4: success() },
  candidateBefore: 'same-hash',
  candidateAfter: 'same-hash',
});

test('a watchdog-restored successful XCTest can never count as an offline pass', () => {
  assert.deepEqual(evidenceFailures(validEvidence()), []);
  for (const patch of [
    { watchdogFired: true },
    { watchdogFired: undefined },
    { provedAtMs: 41_000 },
    { cleanup: { empty: true, released: true, flushedAtMs: 20_000 } },
    { cleanup: { empty: true, released: true, flushedAtMs: 46_000 } },
    { test: { code: 0, timedOut: true } },
    { journeyCompleted: false },
    { candidateAfter: 'changed' },
    { afterTest: { ipv4: success(), ipv6: { code: 28 }, loopback: true } },
    { during: { ipv4: { code: 28 }, ipv6: { code: 28 }, loopback: false } },
  ])
    assert.ok(evidenceFailures({ ...validEvidence(), ...patch }).length > 0, JSON.stringify(patch));
});

test('working IPv6 must recover; missing baseline is explicitly distinct from a successful route', () => {
  const report = validEvidence();
  report.online.ipv6 = success();
  assert.ok(evidenceFailures(report).some((failure) => failure.includes('IPv6 did not recover')));
  report.restored.ipv6 = success();
  assert.deepEqual(evidenceFailures(report), []);
});

test('successful XCTest and restoration cannot hide a daemon failure or missing status', () => {
  for (const patch of [
    { watchdogFailure: { error: 'Watchdog marker write failed.' } },
    { watchdogFailure: undefined },
    { cleanup: { ...validEvidence().cleanup, failed: true } },
    { cleanup: { ...validEvidence().cleanup, failed: undefined } },
  ])
    assert.ok(
      evidenceFailures({ ...validEvidence(), ...patch }).some((failure) =>
        failure.includes('recovery daemon failed'),
      ),
      JSON.stringify(patch),
    );
});
