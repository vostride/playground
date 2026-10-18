import { spawn } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export const APP_ID = 'dev.vostride.playground';
export const MAX_OUTAGE_MS = 45_000;
// Reserve five seconds for watchdog scheduling and PF restoration. Never extend this.
export const RESTORE_AT_MS = 40_000;
export const monoMs = () => Number(process.hrtime.bigint() / 1_000_000n);
export const RULES = 'pass quick on lo0 all no state\nblock drop out quick on ! lo0 all\n';

export function assertCI({ platform = process.platform, env = process.env, device } = {}) {
  if (platform !== 'darwin' || env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true')
    throw new Error('Offline smoke is restricted to GitHub Actions on macOS.');
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(device || ''))
    throw new Error('An explicit simulator UUID is required; booted aliases are forbidden.');
}

export function assertAnchor(anchor) {
  if (!/^com\.apple\/000\.playground-offline-[0-9a-f-]{36}$/.test(anchor || ''))
    throw new Error('Refusing to operate on any anchor except this harness’s unique child.');
}

export function assertMainRules(text) {
  const rules = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // Stock macOS also prints its normalization hook in `-s rules`. Fragment reassembly
  // runs before packet filtering; it cannot pass around the sole filter hook below.
  // Accept only the exact observed stock prefix, never arbitrary scrub/filter rules.
  if (rules[0] === 'scrub-anchor "com.apple/*" all fragment reassemble') rules.shift();
  // Be conservative: do not replace the host ruleset or guess around an earlier pass quick.
  if (rules.length !== 1 || !/^anchor "com\.apple\/\*"(?: all)?$/.test(rules[0]))
    throw new Error(
      'Active main PF rules must contain only the optional stock scrub hook and sole com.apple/* filter hook.',
    );
}

export function assertBlockRules(text) {
  const rules = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    rules.length !== 2 ||
    !/^pass quick on lo0 all no state$/.test(rules[0]) ||
    !/^block drop out quick on ! lo0 all$/.test(rules[1])
  )
    throw new Error('PF did not retain the exact loopback exemption and both-family block.');
}

export function assertAnchorOrder(text, anchor, requireAttached = true) {
  assertAnchor(anchor);
  const own = anchor.split('/')[1];
  const children = text
    .split('\n')
    .map((line) => line.trim().replace(/^com\.apple\//, ''))
    .filter(Boolean);
  if (
    children.some((name) => !/^[a-zA-Z0-9_.-]+$/.test(name)) ||
    children.some((name) => name < own) ||
    (requireAttached && !children.includes(own))
  )
    throw new Error('Owned PF anchor is not the first attached com.apple child.');
  return children.sort();
}

// One root daemon owns activation AND restoration; interruptions are checked between operations.
export async function activateBlock(config, { run, shouldStop }) {
  const check = () => {
    if (shouldStop()) throw new Error('Activation cancelled or deadline expired.');
  };
  check();
  const main = await run(['-s', 'rules']);
  assertMainRules(main.stdout);
  check();
  assertAnchorOrder((await run(['-a', 'com.apple', '-s', 'Anchors'])).stdout, config.anchor, false);
  check();
  await run(['-a', config.anchor, '-f', '-'], { input: RULES });
  check();
  const rules = (await run(['-a', config.anchor, '-s', 'rules'])).stdout;
  assertBlockRules(rules);
  check();
  const ordering = assertAnchorOrder(
    (await run(['-a', 'com.apple', '-s', 'Anchors'])).stdout,
    config.anchor,
  );
  check();
  const stateFlush = await run(['-F', 'states']);
  check();
  return { mainRules: main.stdout, loadedRules: rules, ordering, stateFlush, atMs: monoMs() };
}

export function atomicJSON(path, value, mode = 0o600) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  renameSync(temporary, path);
}

export function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function execute(
  command,
  args,
  { timeout = 10_000, input, env = process.env, onOutput, signal, onSpawn } = {},
) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, signal, stdio: ['pipe', 'pipe', 'pipe'] });
    onSpawn?.(child);
    let stdout = '',
      stderr = '',
      timedOut = false,
      error;
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      onOutput?.(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      onOutput?.(chunk);
    });
    child.on('error', (value) => {
      error = String(value);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, error, stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function pf(args, options) {
  const result = await execute('/usr/bin/sudo', ['-n', '/sbin/pfctl', ...args], options);
  if (result.code !== 0 || result.timedOut || result.error)
    throw new Error(`pfctl ${args.join(' ')} failed: ${JSON.stringify(result)}`);
  return result;
}

// Only this anchor and this enable reference are ever restored. No pfctl -d/-F all/-f main.
export async function restore(config, root = false, executeCommand = execute) {
  assertAnchor(config.anchor);
  if (!/^\d+$/.test(config.token || '')) throw new Error('Invalid PF reference token.');
  const run = async (args) =>
    root
      ? executeCommand('/sbin/pfctl', args, { timeout: 2_000 })
      : executeCommand('/usr/bin/sudo', ['-n', '/sbin/pfctl', ...args], { timeout: 2_000 });
  let flush = await run(['-a', config.anchor, '-F', 'rules']);
  if (flush.code !== 0) flush = await run(['-a', config.anchor, '-F', 'rules']);
  const flushedAtMs = monoMs();
  const inspect = await run(['-a', config.anchor, '-s', 'rules']);
  const release = await run(['-X', config.token]);
  const references = release.code === 0 ? null : await run(['-s', 'References']);
  const absent =
    references?.code === 0 && !new RegExp(`\\b${config.token}\\b`).test(references.stdout);
  return {
    atMs: monoMs(),
    flushedAtMs,
    flush,
    inspect,
    release,
    references,
    empty: flush.code === 0 && inspect.code === 0 && !inspect.stdout.trim(),
    released: release.code === 0 || absent,
  };
}

export function evidenceFailures(report) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };
  need(report.online?.ipv4?.code === 0, 'No successful external IPv4 baseline.');
  need(report.anchorVerified && report.statesFlushed, 'PF block or state flush was not verified.');
  for (const phase of ['during', 'afterTest']) {
    need(report[phase]?.loopback === true, `${phase}: loopback was not reachable.`);
    for (const family of ['ipv4', 'ipv6'])
      need([7, 28].includes(report[phase]?.[family]?.code), `${phase}: ${family} was not blocked.`);
  }
  need(
    report.test?.code === 0 && !report.test?.signal && !report.test?.timedOut,
    'XCTest did not finish successfully.',
  );
  need(report.journeyCompleted === true, 'Offline XCTest did not complete its guarded journey.');
  need(
    report.watchdogFired === false,
    'Independent recovery watchdog fired or its status is unknown.',
  );
  need(
    report.watchdogFailure === null && report.cleanup?.failed === false,
    'Independent recovery daemon failed or its final status is unknown.',
  );
  need(
    Number.isFinite(report.blockedAtMs) &&
      Number.isFinite(report.provedAtMs) &&
      report.provedAtMs >= report.blockedAtMs &&
      report.provedAtMs - report.blockedAtMs < RESTORE_AT_MS,
    'Assertions and the final blocked-network probes did not finish before recovery.',
  );
  need(report.cleanup?.empty && report.cleanup?.released, 'Own PF anchor/token were not restored.');
  need(
    report.cleanup?.flushedAtMs >= report.provedAtMs &&
      report.cleanup.flushedAtMs - report.blockedAtMs < MAX_OUTAGE_MS,
    'Outage exceeded 45 seconds.',
  );
  need(report.restored?.ipv4?.code === 0, 'External Internet did not recover.');
  if (report.online?.ipv6?.code === 0)
    need(report.restored?.ipv6?.code === 0, 'Previously reachable external IPv6 did not recover.');
  need(
    report.candidateBefore && report.candidateBefore === report.candidateAfter,
    'Installed release candidate hash changed or was not verified.',
  );
  return failures;
}
