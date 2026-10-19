import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { appendFileSync, mkdirSync, unlinkSync, writeSync } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { assertAppiumStopped, runCiMobileAgent, validateCiAppiumEnvironment } from './appium.mjs';
import { sanitizeReportBytes } from './auth.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

class FakeChild extends EventEmitter {
  signals = [];
  finished = false;
  ignoreTerm = false;
  ignoreKill = false;
  finish(code, signal = null) {
    if (this.finished) return;
    this.finished = true;
    this.emit('exit', code, signal);
    this.emit('close', code, signal);
  }
  kill(signal) {
    this.signals.push(signal);
    if ((signal === 'SIGTERM' && this.ignoreTerm) || (signal === 'SIGKILL' && this.ignoreKill))
      return true;
    queueMicrotask(() => this.finish(null, signal));
    return true;
  }
}

async function fixture(t, options = {}) {
  await mkdir(join(root, 'test-results'), { recursive: true });
  const directory = await mkdtemp(join(root, 'test-results/appium-lifecycle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runnerTemp = join(directory, 'runner');
  const appiumHome = join(runnerTemp, 'playground-agent-qa-appium');
  await mkdir(appiumHome, { recursive: true });
  await mkdir(join(directory, 'node_modules/appium'), { recursive: true });
  await writeFile(
    join(directory, 'node_modules/appium/package.json'),
    JSON.stringify({ version: '3.8.0' }),
  );
  const reportDir = join(directory, 'reports');
  const env = {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    RUNNER_TEMP: runnerTemp,
    APPIUM_HOME: appiumHome,
    AGENT_QA_AUTH_JSON: 'synthetic-private-token',
    AGENT_QA_APPIUM_URL: 'http://unrelated.invalid',
    PLAYGROUND_AGENT_QA_ANALYTICS_PRELOAD: '1',
  };
  const server = new FakeChild();
  const agent = new FakeChild();
  const signalSource = new EventEmitter();
  const calls = [];
  let statusProbes = 0;
  let processFd;
  const dependencies = {
    signalSource,
    startupTimeoutMs: 100,
    pollIntervalMs: 1,
    stopTimeoutMs: 5,
    killTimeoutMs: 5,
    assertPortAvailable: async () => {},
    probeStatus: async () => {
      statusProbes += 1;
      return true;
    },
    spawn(executable, args, spawnOptions) {
      calls.push({ executable, args, options: spawnOptions });
      if (calls.length === 1) {
        processFd = spawnOptions.stdio[1];
        writeSync(processFd, 'Synthetic startup output\n');
        const serverLog = args[args.indexOf('--log') + 1];
        if (options.listening !== false) {
          appendFileSync(
            serverLog,
            'Appium REST http interface listener started on http://127.0.0.1:4723\n',
          );
        }
        options.onServer?.({ server, agent, serverLog, signalSource });
        return server;
      }
      assert.equal(calls.length, 2, 'One server serves all four targets in one CLI invocation.');
      assert.equal(server.finished, false, 'The owned server must remain alive for the CLI.');
      if (options.onAgent) options.onAgent({ server, agent, signalSource });
      else queueMicrotask(() => agent.finish(options.agentExitCode ?? 2));
      return agent;
    },
  };
  return {
    directory,
    reportDir,
    env,
    server,
    agent,
    calls,
    signalSource,
    dependencies,
    options: { root: directory, reportDir, env, args: ['synthetic-agent-cli.js', 'run'] },
    get statusProbes() {
      return statusProbes;
    },
    assertLogClosed() {
      assert.throws(() => writeSync(processFd, 'late write'), /EBADF/);
    },
  };
}

test('CI guard rejects local execution and Appium homes outside the isolated runner', async (t) => {
  const f = await fixture(t);
  for (const override of [
    { CI: undefined },
    { CI: 'false' },
    { GITHUB_ACTIONS: undefined },
    { RUNNER_TEMP: undefined },
    { RUNNER_TEMP: 'relative' },
    { RUNNER_TEMP: '/', APPIUM_HOME: '/playground-agent-qa-appium' },
    { APPIUM_HOME: '/tmp/unrelated-appium' },
  ]) {
    assert.throws(() => validateCiAppiumEnvironment({ ...f.env, ...override }));
  }
  const external = join(f.directory, 'external');
  await mkdir(external);
  await rm(f.env.APPIUM_HOME, { recursive: true });
  await symlink(external, f.env.APPIUM_HOME);
  await assert.rejects(runCiMobileAgent(f.options, f.dependencies), /must not escape/);
  assert.equal(f.calls.length, 0);
});

test('ready owned server spans the CLI run, preserves its failure code, and closes both logs before sanitation', async (t) => {
  const f = await fixture(t, {
    onServer({ serverLog }) {
      appendFileSync(serverLog, 'Synthetic private value: synthetic-private-token\n');
    },
  });
  const originalEnv = { ...f.env };
  let probes = 0;
  f.dependencies.probeStatus = async () => ++probes > 1;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(probes, 2, 'A not-ready response must delay CLI startup.');
  assert.equal(result.exitCode, 2);
  assert.equal(result.agentExitCode, 2);
  assert.equal(result.signal, null);
  assert.equal(result.appium.ready, true);
  assert.equal(result.launchError, undefined);
  assert.deepEqual(f.server.signals, ['SIGTERM']);
  assert.deepEqual(f.agent.signals, []);
  assert.equal(f.calls[0].options.env.AGENT_QA_APPIUM_URL, undefined);
  assert.equal(f.calls[0].options.env.AGENT_QA_AUTH_JSON, undefined);
  assert.equal(f.calls[1].options.env.AGENT_QA_APPIUM_URL, 'http://127.0.0.1:4723');
  assert.deepEqual(f.env, originalEnv);
  await assertAppiumStopped(f.reportDir);
  f.assertLogClosed();
  const log = await readFile(join(f.reportDir, 'appium/server.log'));
  const clean = sanitizeReportBytes(log, ['synthetic-private-token']);
  assert.match(clean.toString(), /\[REDACTED\]/);
  assert.equal(clean.includes(Buffer.from('synthetic-private-token')), false);
  assert.match(
    await readFile(join(f.reportDir, 'appium/process.log'), 'utf8'),
    /Synthetic startup output/,
  );
  assert.equal(f.signalSource.listenerCount('SIGTERM'), 0);
  assert.equal(f.signalSource.listenerCount('SIGINT'), 0);
});

test('an occupied port is refused without starting, adopting, probing, or killing a server', async (t) => {
  const f = await fixture(t);
  f.dependencies.assertPortAvailable = async () => {
    throw Object.assign(new Error('occupied'), { code: 'APPIUM_PORT_UNAVAILABLE' });
  };
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 1);
  assert.equal(result.appiumError, 'APPIUM_PORT_UNAVAILABLE');
  assert.equal(f.calls.length, 0);
  assert.equal(f.statusProbes, 0);
  assert.deepEqual(f.server.signals, []);
  await assertAppiumStopped(f.reportDir);
});

test('HTTP readiness rejects error responses and ready:false before launching journeys', async (t) => {
  const f = await fixture(t, { agentExitCode: 0 });
  delete f.dependencies.probeStatus;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const responses = [
    { ok: false, json: async () => ({ value: { ready: true } }) },
    { ok: true, json: async () => ({ value: { ready: false } }) },
    { ok: true, json: async () => ({ value: { ready: true } }) },
  ];
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:4723/status');
    assert.equal(f.calls.length, 1, 'CLI startup must wait for an actual ready response.');
    assert.ok(options.signal instanceof AbortSignal);
    requests += 1;
    return responses.shift();
  };
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 0);
  assert.equal(requests, 3);
  await assertAppiumStopped(f.reportDir);
});

test('an unrelated ready response cannot bypass proof that the owned listener started', async (t) => {
  const f = await fixture(t, { listening: false });
  f.dependencies.startupTimeoutMs = 10;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_STARTUP_TIMED_OUT');
  assert.equal(f.calls.length, 1);
  assert.equal(f.statusProbes, 0);
  assert.deepEqual(f.server.signals, ['SIGTERM']);
  f.assertLogClosed();
  await assertAppiumStopped(f.reportDir);
});

test('Appium can unlink and recreate its log during startup while the parent directory stays private', async (t) => {
  let recreated = false;
  let recreateTimer;
  t.after(() => clearTimeout(recreateTimer));
  const f = await fixture(t, {
    listening: false,
    onServer({ serverLog }) {
      unlinkSync(serverLog);
      recreateTimer = setTimeout(() => {
        appendFileSync(
          serverLog,
          'Appium REST http interface listener started on http://127.0.0.1:4723\n',
        );
        recreated = true;
      }, 15);
    },
  });
  // The helper must also tighten a directory that already exists.
  const logDir = join(f.reportDir, 'appium');
  await mkdir(logDir, { recursive: true });
  await chmod(logDir, 0o755);
  f.dependencies.startupTimeoutMs = 1000;
  f.dependencies.probeStatus = async () => {
    assert.equal(
      recreated,
      true,
      'No status probe may adopt another server during log replacement.',
    );
    return true;
  };
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 2);
  assert.equal(result.appium.ready, true);
  assert.equal((await stat(logDir)).mode & 0o777, 0o700);
  await assertAppiumStopped(f.reportDir);
  f.assertLogClosed();
});

test('unexpected log read failures remain fatal instead of being treated as startup delay', async (t) => {
  const f = await fixture(t, {
    onServer({ serverLog }) {
      unlinkSync(serverLog);
      mkdirSync(serverLog);
    },
  });
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_DIAGNOSTICS_FAILED');
  assert.equal(result.appium.ready, false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.statusProbes, 0);
  assert.deepEqual(f.server.signals, ['SIGTERM']);
  await assertAppiumStopped(f.reportDir);
});

test('early server exit keeps startup output and never launches the CLI', async (t) => {
  const f = await fixture(t, {
    onServer({ server }) {
      queueMicrotask(() => server.finish(42));
    },
  });
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_EXITED_BEFORE_READY');
  assert.equal(result.appium.process.exitCode, 42);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.server.signals, []);
  f.assertLogClosed();
  await assertAppiumStopped(f.reportDir);
});

test('CLI spawn errors close the already-ready server and preserve startup diagnostics', async (t) => {
  const f = await fixture(t);
  const spawn = f.dependencies.spawn;
  f.dependencies.spawn = (...args) => {
    if (f.calls.length === 1) throw new Error('synthetic CLI spawn failure');
    return spawn(...args);
  };
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 1);
  assert.equal(result.launchError, true);
  assert.equal(result.appium.ready, true);
  assert.deepEqual(f.server.signals, ['SIGTERM']);
  await assertAppiumStopped(f.reportDir);
  f.assertLogClosed();
});

test('server death during a session terminates only the owned CLI and retains the infrastructure failure', async (t) => {
  const f = await fixture(t, {
    onAgent({ server }) {
      queueMicrotask(() => server.finish(12));
    },
  });
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_EXITED_DURING_JOURNEYS');
  assert.equal(result.appium.process.exitCode, 12);
  assert.deepEqual(f.agent.signals, ['SIGTERM']);
  assert.deepEqual(f.server.signals, []);
  await assertAppiumStopped(f.reportDir);
});

test('SIGINT and SIGTERM stop the CLI and server, preserve signal status, and unregister handlers', async (t) => {
  for (const [signal, expectedCode] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    const f = await fixture(t, {
      onAgent({ signalSource }) {
        queueMicrotask(() => signalSource.emit(signal));
      },
    });
    const result = await runCiMobileAgent(f.options, f.dependencies);
    assert.equal(result.signal, signal);
    assert.equal(result.exitCode, expectedCode);
    assert.deepEqual(f.agent.signals, ['SIGTERM']);
    assert.deepEqual(f.server.signals, ['SIGTERM']);
    assert.equal(f.signalSource.listenerCount(signal), 0);
    await assertAppiumStopped(f.reportDir);
    f.assertLogClosed();
  }
});

test('a signal during readiness stops the owned server without starting journeys', async (t) => {
  const f = await fixture(t, {
    listening: false,
    onServer({ signalSource }) {
      queueMicrotask(() => signalSource.emit('SIGTERM'));
    },
  });
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 143);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.server.signals, ['SIGTERM']);
  await assertAppiumStopped(f.reportDir);
});

test('a server ignoring TERM receives bounded KILL, then closes logs before clearing the marker', async (t) => {
  const f = await fixture(t, { agentExitCode: 0 });
  f.server.ignoreTerm = true;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(f.server.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(result.appium.process.signal, 'SIGKILL');
  f.assertLogClosed();
  await assertAppiumStopped(f.reportDir);
});

test('unconfirmed writer shutdown prevents sanitation and cannot be adopted by another invocation', async (t) => {
  const f = await fixture(t);
  f.server.ignoreTerm = true;
  f.server.ignoreKill = true;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 2, 'Cleanup must not replace the actual failing agent code.');
  assert.equal(result.appiumError, 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
  await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
  await assert.rejects(runCiMobileAgent(f.options, f.dependencies), /NOT_CONFIRMED_STOPPED/);
  assert.equal(f.calls.length, 2, 'A marked prior invocation must not be adopted or killed.');
  assert.deepEqual(f.server.signals, ['SIGTERM', 'SIGKILL']);
  // The fake has no OS process. Late closure releases the fd but cannot erase
  // the failure marker after this invocation already returned an uncertain result.
  f.server.finish(null, 'SIGKILL');
  await delay(0);
  f.assertLogClosed();
  await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
});

test('a stale marker refuses publication checks even when its recorded process is gone', async (t) => {
  const f = await fixture(t);
  await mkdir(f.reportDir);
  await writeFile(
    join(f.reportDir, 'appium-writer-active.json'),
    '{"owner":"previous invocation"}',
  );
  await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
  assert.equal(f.calls.length, 0);
  await access(join(f.reportDir, 'appium-writer-active.json'));
});
