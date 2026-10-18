import { existsSync } from 'node:fs';
import {
  activateBlock,
  assertAnchor,
  assertCI,
  atomicJSON,
  execute,
  monoMs,
  readJSON,
  restore,
  RESTORE_AT_MS,
} from './offline-support.mjs';

// launchd owns this root process. It is the ONLY process that enables/loads/clears PF.
// A parent cancellation cannot race a late rule load against a completed cleanup.
const config = readJSON(process.argv[2]);
assertCI({ device: config?.device });
assertAnchor(config?.anchor);
if (process.getuid() !== 0 || process.env.PLAYGROUND_OFFLINE_WATCHDOG !== '1')
  throw new Error('Invalid watchdog invocation.');
const save = (path, value) => atomicJSON(path, value, 0o644);
const run = async (args, options) => {
  const result = await execute('/sbin/pfctl', args, { ...options, timeout: 2_000 });
  if (result.code !== 0 || result.timedOut || result.error)
    throw new Error(`pfctl ${args.join(' ')} failed: ${JSON.stringify(result)}`);
  return result;
};
const started = monoMs();
let activated = false,
  failed = false,
  cutoff;
const shouldStop = () =>
  existsSync(config.cleanupRequest) || (cutoff && monoMs() - cutoff.blockedAtMs >= RESTORE_AT_MS);
try {
  const enable = await run(['-E']);
  config.token = `${enable.stdout}\n${enable.stderr}`.match(/Token\s*:\s*(\d+)/)?.[1];
  if (!config.token) throw new Error('PF enable did not return its reference token.');
  save(config.ready, { pid: process.pid, atMs: started, token: config.token });
  while (true) {
    if (existsSync(config.cleanupRequest)) break;
    cutoff ||= readJSON(config.cutoff); // Never lose an active deadline if the file disappears.
    if (
      (cutoff && monoMs() - cutoff.blockedAtMs >= RESTORE_AT_MS) ||
      monoMs() - started > 180_000
    ) {
      failed = true;
      save(config.fired, {
        atMs: monoMs(),
        reason: cutoff ? 'outage deadline' : 'arming deadline',
      });
      break;
    }
    if (cutoff && !activated) {
      if (!Number.isFinite(cutoff.blockedAtMs) || cutoff.blockedAtMs > monoMs())
        throw new Error('Invalid monotonic cutoff.');
      const activation = await activateBlock(config, { run, shouldStop });
      activated = true;
      save(config.activation, activation);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
} catch (error) {
  failed = true;
  save(config.failure, { error: String(error), atMs: monoMs() });
} finally {
  if (config.token) {
    // Keep recovery alive after a failed pfctl call; never abandon a known blocking anchor.
    let attempt = 0;
    while (true) {
      let cleanup;
      try {
        cleanup = { ...(await restore(config, true)), attempt: ++attempt, failed };
      } catch (error) {
        cleanup = { attempt: ++attempt, error: String(error), failed: true };
      }
      // A full disk or evidence permission error must never terminate network recovery.
      try {
        save(config.watchdogCleanup, cleanup);
      } catch (error) {
        console.error(error);
      }
      if (cleanup.empty && cleanup.released) break;
      failed = true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
process.exitCode = failed ? 1 : 0;
