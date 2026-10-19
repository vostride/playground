import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeSync } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const url = 'http://127.0.0.1:4723';
const listenerMessage = `Appium REST http interface listener started on ${url}`;
const markerName = 'appium-writer-active.json';

function failure(code) {
  return Object.assign(new Error(code), { code });
}

async function requireContained(path, directory) {
  const actual = await realpath(path);
  const local = relative(await realpath(directory), actual);
  assert.ok(
    local && local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local),
    'WDA path must remain inside its isolated directory.',
  );
  return actual;
}

async function prepareCiWda(env, runnerTemp, appiumHome) {
  assert.match(
    env.PLAYGROUND_DEVICE_ID ?? '',
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
    'WDA requires the explicit CI simulator UUID.',
  );
  const driverDir = await requireContained(
    join(appiumHome, 'node_modules/appium-xcuitest-driver'),
    appiumHome,
  );
  const driverPackage = await requireContained(join(driverDir, 'package.json'), driverDir);
  const driver = JSON.parse(await readFile(driverPackage, 'utf8'));
  assert.equal(driver.name, 'appium-xcuitest-driver');
  assert.equal(driver.version, '12.12.4', 'Recheck prebuild support when upgrading XCUITest.');
  const wdaPackage = await requireContained(
    createRequire(driverPackage).resolve('appium-webdriveragent/package.json'),
    appiumHome,
  );
  const wda = JSON.parse(await readFile(wdaPackage, 'utf8'));
  assert.equal(wda.name, 'appium-webdriveragent');
  assert.equal(wda.version, '16.12.8', 'Recheck prebuild support when upgrading WebDriverAgent.');
  const wdaDir = dirname(wdaPackage);
  const project = await requireContained(join(wdaDir, 'WebDriverAgent.xcodeproj'), wdaDir);
  assert.ok((await stat(project)).isDirectory(), 'WDA project must be a directory.');
  const derivedDataPath = join(runnerTemp, 'playground-agent-qa-wda');
  // An exclusive fresh directory prevents reuse of an unrelated or stale build.
  await mkdir(derivedDataPath, { mode: 0o700 });
  await requireContained(derivedDataPath, runnerTemp);
  return {
    driverVersion: driver.version,
    version: wda.version,
    deviceId: env.PLAYGROUND_DEVICE_ID,
    derivedDataPath,
    project,
    cwd: wdaDir,
    args: [
      'build-for-testing',
      '-project',
      project,
      '-scheme',
      'WebDriverAgentRunner',
      '-derivedDataPath',
      derivedDataPath,
      '-destination',
      `id=${env.PLAYGROUND_DEVICE_ID}`,
      'IPHONEOS_DEPLOYMENT_TARGET=18.5',
      'GCC_TREAT_WARNINGS_AS_ERRORS=0',
      'COMPILER_INDEX_STORE_ENABLE=NO',
      'CODE_SIGNING_ALLOWED=NO',
    ],
  };
}

async function validateWdaBuild(plan) {
  const products = await requireContained(
    join(plan.derivedDataPath, 'Build/Products'),
    plan.derivedDataPath,
  );
  const runnerApp = await requireContained(
    join(products, 'Debug-iphonesimulator/WebDriverAgentRunner-Runner.app'),
    products,
  );
  assert.ok((await stat(runnerApp)).isDirectory(), 'WDA runner app was not built.');
  const info = await requireContained(join(runnerApp, 'Info.plist'), runnerApp);
  const infoStat = await stat(info);
  assert.ok(infoStat.isFile() && infoStat.size > 0, 'WDA runner app metadata is missing or empty.');
  // WDA 16.12.8's UI-testing target produces these executable names. Check the
  // runner and its test bundle, not merely the directories and plist wrappers.
  const runnerExecutable = await requireExecutable(
    join(runnerApp, 'WebDriverAgentRunner-Runner'),
    runnerApp,
  );
  const testBundle = await requireContained(
    join(runnerApp, 'PlugIns/WebDriverAgentRunner.xctest'),
    runnerApp,
  );
  const testExecutable = await requireExecutable(
    join(testBundle, 'WebDriverAgentRunner'),
    testBundle,
  );
  const candidates = (await readdir(products)).filter((name) =>
    /^WebDriverAgentRunner_iphonesimulator.*\.xctestrun$/.test(name),
  );
  assert.equal(candidates.length, 1, 'Expected exactly one simulator WDA xctestrun.');
  const xctestrun = await requireContained(join(products, candidates[0]), products);
  assert.ok((await stat(xctestrun)).isFile(), 'WDA xctestrun must be a file.');
  const bytes = await readFile(xctestrun);
  assert.ok(bytes.length > 0, 'WDA xctestrun is empty.');
  return {
    runnerApp,
    runnerExecutable,
    testExecutable,
    xctestrun,
    xctestrunSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function requireExecutable(path, directory) {
  const executable = await requireContained(path, directory);
  const metadata = await stat(executable);
  assert.ok(
    metadata.isFile() && metadata.size > 0 && (metadata.mode & 0o111) !== 0,
    'WDA executable payload is missing, empty, or not executable.',
  );
  return executable;
}

function signalOwnedBuildGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
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

function ownChild(child, { stopTimeoutMs, killTimeoutMs, signalChild }) {
  let closed = false;
  let exited = false;
  let launchError = false;
  let abandoned = false;
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
    get abandoned() {
      return abandoned;
    },
    abandon() {
      // This is irreversible uncertainty, not successful process cleanup. The
      // caller keeps the marker and records the failure before releasing handles.
      abandoned = true;
      for (const stream of [child.stdout, child.stderr]) {
        stream?.removeAllListeners('data');
        stream?.destroy();
        stream?.unref?.();
      }
      child.unref();
    },
    stop() {
      stopping ??= (async () => {
        if (!closed && (!exited || signalChild))
          (signalChild ?? ((signal) => child.kill(signal)))('SIGTERM');
        if (await closedWithin(stopTimeoutMs)) return;
        if (!closed && (!exited || signalChild))
          (signalChild ?? ((signal) => child.kill(signal)))('SIGKILL');
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
    signalOwnedBuildGroup,
    wdaBuildTimeoutMs: 10 * 60 * 1000,
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
  let build;
  let buildLog;
  let buildLogsClosed;
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
    let iosCapabilities;
    if (env.PLAYGROUND_PLATFORM === 'ios') {
      const plan = await prepareCiWda(env, runnerTemp, appiumHome);
      diagnostics.wda = { ...plan, startedAt: new Date().toISOString(), ready: false };
      buildLog = await open(join(logDir, 'wda-build.log'), 'wx', 0o600);
      if (interrupted) throw failure('APPIUM_INTERRUPTED');
      const child = runtime.spawn('xcodebuild', plan.args, {
        cwd: plan.cwd,
        env: serverEnv,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      build = ownChild(child, {
        ...runtime,
        signalChild: (signal) => runtime.signalOwnedBuildGroup(child, signal),
      });
      let logFailure;
      let buildLogFailed = false;
      const logFailed = new Promise((resolveFailure) => {
        logFailure = resolveFailure;
      });
      const failBuildLog = () => {
        buildLogFailed = true;
        logFailure({ type: 'log' });
      };
      const record = (chunk) => {
        try {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          let offset = 0;
          while (offset < bytes.length) offset += writeSync(buildLog.fd, bytes, offset);
        } catch {
          failBuildLog();
        }
      };
      buildLogsClosed = build.completion
        .then(() => buildLog.close())
        .catch(() => {
          logCloseFailed = true;
        });
      for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', record);
        stream.on('error', failBuildLog);
      }
      // 'close' includes the pipe streams, so descendants cannot still write
      // build logs when this fd is closed and the sanitation marker is cleared.
      const timer = new AbortController();
      let completed;
      try {
        completed = await Promise.race([
          build.completion.then((outcome) => ({ type: 'build', outcome })),
          delay(runtime.wdaBuildTimeoutMs, { type: 'timeout' }, { signal: timer.signal }),
          interruption,
          logFailed,
        ]);
      } finally {
        timer.abort();
      }
      if (completed.type === 'signal') throw failure('APPIUM_INTERRUPTED');
      if (completed.type === 'timeout') throw failure('APPIUM_WDA_BUILD_TIMED_OUT');
      if (completed.type === 'log' || buildLogFailed) throw failure('APPIUM_WDA_LOG_FAILED');
      diagnostics.wda.process = completed.outcome;
      diagnostics.wda.completedAt = new Date().toISOString();
      await buildLogsClosed;
      if (
        completed.outcome.exitCode !== 0 ||
        completed.outcome.signal ||
        completed.outcome.launchError
      )
        throw failure('APPIUM_WDA_BUILD_FAILED');
      if (logCloseFailed) throw failure('APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
      try {
        Object.assign(diagnostics.wda, await validateWdaBuild(plan), { ready: true });
      } catch {
        throw failure('APPIUM_WDA_BUILD_OUTPUT_INVALID');
      }
      iosCapabilities = {
        'appium:isHeadless': true,
        'appium:usePrebuiltWDA': true,
        'appium:derivedDataPath': plan.derivedDataPath,
        'appium:showXcodeLog': true,
      };
    }
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
          ...(iosCapabilities ? ['--default-capabilities', JSON.stringify(iosCapabilities)] : []),
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
    let buildClosed = false;
    try {
      await build?.stop();
      if (build?.closed) {
        diagnostics.wda.process = await build.completion;
        diagnostics.wda.completedAt ??= new Date().toISOString();
        await buildLogsClosed;
      } else if (!build) await buildLog?.close();
      buildClosed = !build || (build.closed && !build.abandoned);
    } catch {
      result.appiumError = 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED';
      if (result.exitCode === 0) result.exitCode = 1;
      if (diagnostics.wda) diagnostics.wda.shutdownUnconfirmed = true;
      // Do not let a child or descendant holding pipes keep run.mjs alive after
      // the bounded TERM/KILL attempt. Closing our readers stops local logging;
      // it does not assert that the build group exited, so the marker stays.
      build?.abandon();
      try {
        await buildLog?.close();
      } catch {
        logCloseFailed = true;
      }
    }
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
        if (marked && buildClosed && (!agent || agent.closed)) await rm(marker);
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
