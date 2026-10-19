import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, chmod, mkdir, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const url = 'http://127.0.0.1:4723';
const listenerMessage = `Appium REST http interface listener started on ${url}`;
const markerName = 'appium-writer-active.json';

function failure(code) {
  return Object.assign(new Error(code), { code });
}

export function validateCiAppiumEnvironment(env) {
  assert.equal(env.CI, 'true', 'Owned Appium requires CI=true.');
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Owned Appium requires GitHub Actions.');
  assert.ok(env.RUNNER_TEMP && isAbsolute(env.RUNNER_TEMP), 'RUNNER_TEMP must be absolute.');
  const runnerTemp = resolve(env.RUNNER_TEMP);
  assert.notEqual(runnerTemp, parse(runnerTemp).root, 'RUNNER_TEMP must be isolated.');
  const appiumHome = join(runnerTemp, 'playground-agent-qa-appium');
  assert.equal(env.APPIUM_HOME, appiumHome, 'Use the dedicated runner Appium directory.');
  return { runnerTemp, appiumHome };
}

// A leftover marker fails closed: neither this check nor startup adopts or kills
// a PID from a previous invocation. The workflow checks this before sanitation.
export async function assertAppiumStopped(reportDir) {
  try {
    await access(join(reportDir, markerName));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw failure('APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
}

async function assertPortAvailable() {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(failure('APPIUM_PORT_UNAVAILABLE')));
    probe.listen({ host: '127.0.0.1', port: 4723, exclusive: true }, () => {
      probe.close((error) => (error ? reject(failure('APPIUM_PORT_UNAVAILABLE')) : resolvePort()));
    });
  });
}

async function probeStatus(signal, timeoutMs) {
  try {
    const response = await fetch(`${url}/status`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    return response.ok && (await response.json())?.value?.ready === true;
  } catch {
    return false;
  }
}

function ownChild(child, { stopTimeoutMs, killTimeoutMs }) {
  let closed = false;
  let exited = false;
  let launchError = false;
  let stopping;
  const completion = new Promise((resolveChild) => {
    child.once('error', () => {
      launchError = true;
    });
    child.once('exit', () => {
      exited = true;
    });
    child.once('close', (code, signal) => {
      closed = true;
      resolveChild({
        exitCode: code ?? 1,
        signal: signal ?? null,
        ...(launchError ? { launchError } : {}),
      });
    });
  });
  async function closedWithin(milliseconds) {
    if (closed) return true;
    const timer = new AbortController();
    try {
      return await Promise.race([
        completion.then(() => true),
        delay(milliseconds, false, { signal: timer.signal }),
      ]);
    } finally {
      timer.abort();
    }
  }
  return {
    completion,
    get closed() {
      return closed;
    },
    get exited() {
      return exited;
    },
    stop() {
      stopping ??= (async () => {
        if (!closed && !exited) child.kill('SIGTERM');
        if (await closedWithin(stopTimeoutMs)) return;
        if (!closed && !exited) child.kill('SIGKILL');
        if (!(await closedWithin(killTimeoutMs))) throw failure('APPIUM_CHILD_DID_NOT_CLOSE');
      })();
      return stopping;
    },
  };
}

/** Own one pinned server for the entire mobile CLI invocation, including its four targets. */
export async function runCiMobileAgent(
  { root, reportDir, args, env = process.env },
  dependencies = {},
) {
  const { runnerTemp, appiumHome } = validateCiAppiumEnvironment(env);
  const runtime = {
    spawn,
    assertPortAvailable,
    probeStatus,
    signalSource: process,
    startupTimeoutMs: 30000,
    pollIntervalMs: 250,
    stopTimeoutMs: 5000,
    killTimeoutMs: 5000,
    ...dependencies,
  };
  assert.equal(
    await realpath(appiumHome),
    join(await realpath(runnerTemp), 'playground-agent-qa-appium'),
    'Appium home must not escape the dedicated runner directory.',
  );
  const appiumEntry = resolve(root, 'node_modules/appium/index.js');
  const pkg = JSON.parse(await readFile(resolve(root, 'node_modules/appium/package.json'), 'utf8'));
  assert.equal(
    pkg.version,
    '3.8.0',
    'Recheck diagnostics when upgrading the pinned Appium server.',
  );
  await mkdir(reportDir, { recursive: true });
  await assertAppiumStopped(reportDir);
  const logDir = join(reportDir, 'appium');
  const serverLog = join(logDir, 'server.log');
  const marker = join(reportDir, markerName);
  const controller = new AbortController();
  let interrupted;
  let interruptResolve;
  const interruption = new Promise((resolveSignal) => {
    interruptResolve = resolveSignal;
  });
  function interrupt(signal) {
    interrupted ??= signal;
    controller.abort();
    interruptResolve({ type: 'signal' });
  }
  const onInt = () => interrupt('SIGINT');
  const onTerm = () => interrupt('SIGTERM');
  runtime.signalSource.on('SIGINT', onInt);
  runtime.signalSource.on('SIGTERM', onTerm);
  let server;
  let agent;
  let processLog;
  let serverLogsClosed;
  let logCloseFailed = false;
  let marked = false;
  let result = { exitCode: 1, signal: null, launchError: true };
  const diagnostics = { version: pkg.version, url, ready: false };
  try {
    await runtime.assertPortAvailable();
    if (interrupted) throw failure('APPIUM_INTERRUPTED');
    await mkdir(logDir, { recursive: true, mode: 0o700 });
    await chmod(logDir, 0o700);
    await writeFile(
      marker,
      JSON.stringify({ owner: 'agent-qa CI Appium', startedAt: new Date().toISOString() }),
      { flag: 'wx', mode: 0o600 },
    );
    marked = true;
    processLog = await open(join(logDir, 'process.log'), 'wx', 0o600);
    // Reject stale logs. Appium unlinks/recreates this file; the private parent
    // directory protects both the initial file and the replacement.
    await writeFile(serverLog, '', { flag: 'wx', mode: 0o600 });
    const serverEnv = { ...env };
    delete serverEnv.AGENT_QA_AUTH_JSON;
    delete serverEnv.AGENT_QA_APPIUM_URL;
    delete serverEnv.PLAYGROUND_AGENT_QA_ANALYTICS_PRELOAD;
    if (interrupted) throw failure('APPIUM_INTERRUPTED');
    server = ownChild(
      runtime.spawn(
        process.execPath,
        [
          appiumEntry,
          '--address',
          '127.0.0.1',
          '--port',
          '4723',
          // The workflow boots via simctl. Match that headless state instead
          // of restarting the simulator merely to attach a GUI during POST /session.
          ...(env.PLAYGROUND_PLATFORM === 'ios'
            ? ['--default-capabilities', JSON.stringify({ 'appium:isHeadless': true })]
            : []),
          '--relaxed-security',
          '--log',
          serverLog,
          '--log-level',
          'info:debug',
          '--log-timestamp',
          '--log-no-colors',
        ],
        { cwd: root, env: serverEnv, stdio: ['ignore', processLog.fd, processLog.fd] },
      ),
      runtime,
    );
    // Even a close arriving after the bounded cleanup deadline releases our fd.
    // The active marker remains until the normal cleanup path confirms all writers.
    serverLogsClosed = server.completion
      .then(() => processLog.close())
      .catch(() => {
        logCloseFailed = true;
      });
    const deadline = Date.now() + runtime.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (interrupted) throw failure('APPIUM_INTERRUPTED');
      if (server.closed || server.exited) throw failure('APPIUM_EXITED_BEFORE_READY');
      // The owned server's listener message closes the preflight bind-check race:
      // readiness from an unrelated listener is insufficient to proceed.
      const log = await readFile(serverLog, 'utf8').catch((error) => {
        // Pinned Appium 3.8.0 deletes --log before attaching its file transport.
        if (error.code === 'ENOENT') return '';
        throw error;
      });
      const listening = log.includes(listenerMessage);
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      if (
        listening &&
        (await runtime.probeStatus(controller.signal, Math.min(2000, remainingMs)))
      ) {
        if (server.closed || server.exited) throw failure('APPIUM_EXITED_BEFORE_READY');
        if (Date.now() >= deadline) break;
        diagnostics.ready = true;
        diagnostics.readyAt = new Date().toISOString();
        break;
      }
      await delay(runtime.pollIntervalMs, undefined, { signal: controller.signal });
    }
    if (!diagnostics.ready) throw failure('APPIUM_STARTUP_TIMED_OUT');
    if (interrupted) throw failure('APPIUM_INTERRUPTED');
    agent = ownChild(
      runtime.spawn(process.execPath, args, {
        cwd: root,
        env: { ...env, AGENT_QA_APPIUM_URL: url },
        stdio: 'inherit',
      }),
      runtime,
    );
    const completed = await Promise.race([
      agent.completion.then((outcome) => ({ type: 'agent', outcome })),
      server.completion.then(() => ({ type: 'server' })),
      interruption,
    ]);
    if (completed.type === 'agent') result = completed.outcome;
    else {
      await agent.stop();
      result = await agent.completion;
      if (completed.type === 'server') {
        result.appiumError = 'APPIUM_EXITED_DURING_JOURNEYS';
        if (result.exitCode === 0) result.exitCode = 1;
      }
    }
  } catch (error) {
    // Raw server output stays in private report files until the sanitizer runs.
    result.appiumError =
      typeof error.code === 'string' && error.code.startsWith('APPIUM_')
        ? error.code
        : 'APPIUM_DIAGNOSTICS_FAILED';
  } finally {
    try {
      await agent?.stop();
      if (agent?.closed) result.agentExitCode = (await agent.completion).exitCode;
    } catch {
      result.appiumError = 'APPIUM_AGENT_DID_NOT_CLOSE';
      if (result.exitCode === 0) result.exitCode = 1;
    }
    try {
      await server?.stop();
      if (server?.closed) diagnostics.process = await server.completion;
      // Close every writer before clearing the marker. A cleanup failure keeps
      // the marker, so even always() workflow steps cannot upload unsanitized logs.
      if (!server || server.closed) {
        if (server) await serverLogsClosed;
        else await processLog?.close();
        if (logCloseFailed) throw failure('APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
        if (marked && (!agent || agent.closed)) await rm(marker);
      }
    } catch {
      result.appiumError = 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED';
      if (result.exitCode === 0) result.exitCode = 1;
    }
    runtime.signalSource.off('SIGINT', onInt);
    runtime.signalSource.off('SIGTERM', onTerm);
  }
  if (interrupted)
    result = { ...result, exitCode: interrupted === 'SIGINT' ? 130 : 143, signal: interrupted };
  return { ...result, appium: diagnostics };
}
