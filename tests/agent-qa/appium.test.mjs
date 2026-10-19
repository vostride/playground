import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdirSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { assertAppiumStopped, runCiMobileAgent, validateCiAppiumEnvironment } from './appium.mjs';
import { sanitizeReportBytes } from './auth.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  signals = [];
  finished = false;
  ignoreTerm = false;
  ignoreKill = false;
  unreferenced = false;
  unref() {
    this.unreferenced = true;
  }
  finish(code, signal = null) {
    if (this.finished) return;
    this.finished = true;
    this.stdout.end();
    this.stderr.end();
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
  const driverDir = join(appiumHome, 'node_modules/appium-xcuitest-driver');
  const wdaDir = join(driverDir, 'node_modules/appium-webdriveragent');
  if (options.platform === 'ios') {
    await mkdir(join(wdaDir, 'WebDriverAgent.xcodeproj'), { recursive: true });
    await writeFile(
      join(driverDir, 'package.json'),
      JSON.stringify({ name: 'appium-xcuitest-driver', version: '12.12.4' }),
    );
    await writeFile(
      join(wdaDir, 'package.json'),
      JSON.stringify({ name: 'appium-webdriveragent', version: '16.12.8' }),
    );
  }
  const env = {
    CI: 'true',
    GITHUB_ACTIONS: 'true',
    RUNNER_TEMP: runnerTemp,
    APPIUM_HOME: appiumHome,
    AGENT_QA_AUTH_JSON: 'synthetic-private-token',
    AGENT_QA_APPIUM_URL: 'http://unrelated.invalid',
    PLAYGROUND_AGENT_QA_ANALYTICS_PRELOAD: '1',
    PLAYGROUND_PLATFORM: options.platform ?? 'android',
    PLAYGROUND_DEVICE_ID: '01234567-89AB-CDEF-0123-456789ABCDEF',
  };
  const build = new FakeChild();
  const server = new FakeChild();
  const agent = new FakeChild();
  const signalSource = new EventEmitter();
  const calls = [];
  let statusProbes = 0;
  let processFd;
  function writeBuildOutputs(args) {
    const derived = args[args.indexOf('-derivedDataPath') + 1];
    const products = join(derived, 'Build/Products');
    const runnerApp = join(products, 'Debug-iphonesimulator/WebDriverAgentRunner-Runner.app');
    mkdirSync(runnerApp, { recursive: true });
    writeFileSync(join(runnerApp, 'Info.plist'), 'synthetic WDA metadata');
    writeFileSync(join(runnerApp, 'WebDriverAgentRunner-Runner'), 'synthetic runner executable', {
      mode: 0o755,
    });
    const testBundle = join(runnerApp, 'PlugIns/WebDriverAgentRunner.xctest');
    mkdirSync(testBundle, { recursive: true });
    writeFileSync(join(testBundle, 'WebDriverAgentRunner'), 'synthetic test executable', {
      mode: 0o755,
    });
    writeFileSync(
      join(products, 'WebDriverAgentRunner_iphonesimulator18.5-arm64.xctestrun'),
      'synthetic WDA xctestrun',
    );
  }
  const dependencies = {
    signalSource,
    // Successful/output-validation fixtures must allow shared-runner scheduling;
    // timeout scenarios below keep their explicit short deadline overrides.
    startupTimeoutMs: 10000,
    pollIntervalMs: 1,
    stopTimeoutMs: 5,
    killTimeoutMs: 5,
    wdaBuildTimeoutMs: 10000,
    signalOwnedBuildGroup(child, signal) {
      assert.equal(child, build, 'Only the spawned build group is signaled.');
      child.kill(signal);
    },
    openLog: async (...args) => {
      const handle = await open(...args);
      if (args[0].endsWith('/process.log')) processFd = handle.fd;
      return handle;
    },
    assertPortAvailable: async () => {},
    probeStatus: async () => {
      statusProbes += 1;
      return true;
    },
    spawn(executable, args, spawnOptions) {
      calls.push({ executable, args, options: spawnOptions });
      if (executable === 'xcodebuild') {
        if (options.onBuild) options.onBuild({ build, args, signalSource, writeBuildOutputs });
        else
          queueMicrotask(() => {
            build.stdout.write('Synthetic WDA build output\n');
            writeBuildOutputs(args);
            build.finish(0);
          });
        return build;
      }
      if (args.includes('--address')) {
        server.stdout.write('Synthetic startup output\n');
        if (options.listening !== false) {
          server.stdout.write(
            'Appium REST http interface listener started on http://127.0.0.1:4723\n',
          );
        }
        options.onServer?.({ server, agent, signalSource });
        return server;
      }
      assert.equal(
        calls.filter((call) => call.args.includes('--address')).length,
        1,
        'One server serves all four targets in one CLI invocation.',
      );
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
    build,
    driverDir,
    wdaDir,
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

test('ready owned server spans the CLI run, preserves its failure code, and closes its bounded log before sanitation', async (t) => {
  const f = await fixture(t, {
    onServer({ server }) {
      server.stderr.write('Synthetic private value: synthetic-private-token\n');
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
  const log = await readFile(join(f.reportDir, 'appium/process.log'));
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

test('iOS builds the pinned WDA before the CLI and uses those exact outputs; Android has no native preparation', async (t) => {
  for (const platform of ['ios', 'android']) {
    const f = await fixture(t, { agentExitCode: 0, platform });
    const result = await runCiMobileAgent(f.options, f.dependencies);
    const serverCall = f.calls.find((call) => call.args.includes('--address'));
    const args = serverCall.args;
    const defaultsIndex = args.indexOf('--default-capabilities');
    if (platform === 'ios') {
      assert.ok(defaultsIndex > 0);
      const derived = join(f.env.RUNNER_TEMP, 'playground-agent-qa-wda');
      assert.deepEqual(JSON.parse(args[defaultsIndex + 1]), {
        'appium:isHeadless': true,
        'appium:usePrebuiltWDA': true,
        'appium:derivedDataPath': derived,
        'appium:showXcodeLog': true,
      });
      assert.equal(f.calls[0].executable, 'xcodebuild');
      assert.deepEqual(f.calls[0].args, [
        'build-for-testing',
        '-project',
        join(f.wdaDir, 'WebDriverAgent.xcodeproj'),
        '-scheme',
        'WebDriverAgentRunner',
        '-derivedDataPath',
        derived,
        '-destination',
        `id=${f.env.PLAYGROUND_DEVICE_ID}`,
        'IPHONEOS_DEPLOYMENT_TARGET=18.5',
        'GCC_TREAT_WARNINGS_AS_ERRORS=0',
        'COMPILER_INDEX_STORE_ENABLE=NO',
        'CODE_SIGNING_ALLOWED=NO',
      ]);
      assert.equal(f.calls[0].options.detached, true);
      assert.equal(f.calls[0].options.env.AGENT_QA_AUTH_JSON, undefined);
      assert.equal(result.appium.wda.ready, true);
      assert.equal(result.appium.wda.version, '16.12.8');
      assert.equal(result.appium.wda.driverVersion, '12.12.4');
      assert.equal(result.appium.wda.deviceId, f.env.PLAYGROUND_DEVICE_ID);
      assert.equal(result.appium.wda.process.exitCode, 0);
      assert.equal(result.appium.wda.derivedDataPath, derived);
      assert.equal(
        result.appium.wda.runnerExecutable,
        join(
          derived,
          'Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app/WebDriverAgentRunner-Runner',
        ),
      );
      assert.equal(
        result.appium.wda.testExecutable,
        join(
          derived,
          'Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app/PlugIns/WebDriverAgentRunner.xctest/WebDriverAgentRunner',
        ),
      );
      assert.match(result.appium.wda.xctestrunSha256, /^[a-f0-9]{64}$/);
      assert.equal((await stat(derived)).mode & 0o777, 0o700);
      assert.equal(
        await readFile(join(f.reportDir, 'appium/wda-build.log'), 'utf8'),
        'Synthetic WDA build output\n',
      );
      assert.deepEqual(f.build.signals, []);
    } else {
      assert.equal(defaultsIndex, -1);
      assert.equal(
        args.some((arg) => arg.includes('isHeadless')),
        false,
      );
      assert.equal(f.calls.length, 2);
      assert.equal(result.appium.wda, undefined);
    }
    assert.deepEqual(f.calls.at(-1).args, f.options.args, 'Agent arguments stay unchanged.');
    assert.equal(result.exitCode, 0);
    await assertAppiumStopped(f.reportDir);
  }
});

test('WDA preparation rejects unknown devices, dependency versions, escaped dependencies, and reused outputs before spawning', async (t) => {
  for (const scenario of [
    'device',
    'driver-version',
    'wda-version',
    'escaped-wda',
    'stale-output',
  ]) {
    const f = await fixture(t, { platform: 'ios' });
    if (scenario === 'device') f.env.PLAYGROUND_DEVICE_ID = 'booted';
    if (scenario === 'driver-version')
      await writeFile(
        join(f.driverDir, 'package.json'),
        '{"name":"appium-xcuitest-driver","version":"12.12.5"}',
      );
    if (scenario === 'wda-version')
      await writeFile(
        join(f.wdaDir, 'package.json'),
        '{"name":"appium-webdriveragent","version":"16.12.9"}',
      );
    if (scenario === 'escaped-wda') {
      const external = join(f.directory, 'external-wda');
      await mkdir(external);
      await writeFile(join(external, 'package.json'), '{"version":"16.12.8"}');
      await rm(f.wdaDir, { recursive: true });
      await symlink(external, f.wdaDir);
    }
    if (scenario === 'stale-output')
      await mkdir(join(f.env.RUNNER_TEMP, 'playground-agent-qa-wda'));
    const result = await runCiMobileAgent(f.options, f.dependencies);
    assert.equal(result.exitCode, 1, scenario);
    assert.equal(f.calls.length, 0, scenario);
    assert.equal(result.appium.ready, false, scenario);
    await assertAppiumStopped(f.reportDir);
  }
});

test('a failed WDA compiler keeps its status and private logs without starting Appium or journeys', async (t) => {
  const f = await fixture(t, {
    platform: 'ios',
    onBuild({ build }) {
      queueMicrotask(() => {
        build.stderr.write('Synthetic compiler error: synthetic-private-token\n');
        build.finish(65);
      });
    },
  });
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_WDA_BUILD_FAILED');
  assert.equal(result.appium.wda.process.exitCode, 65);
  assert.equal(result.exitCode, 1);
  assert.equal(result.agentExitCode, undefined);
  assert.equal(f.calls.length, 1);
  const log = await readFile(join(f.reportDir, 'appium/wda-build.log'));
  assert.match(log.toString(), /Synthetic compiler error/);
  assert.equal(
    sanitizeReportBytes(log, ['synthetic-private-token']).includes(
      Buffer.from('synthetic-private-token'),
    ),
    false,
  );
  await assertAppiumStopped(f.reportDir);
});

test('WDA build success requires complete, unique outputs contained in the fresh build directory', async (t) => {
  for (const scenario of ['missing', 'empty', 'ambiguous', 'escaped']) {
    const f = await fixture(t, {
      platform: 'ios',
      onBuild({ build, args, writeBuildOutputs }) {
        queueMicrotask(() => {
          if (scenario !== 'missing') {
            writeBuildOutputs(args);
            const products = join(args[args.indexOf('-derivedDataPath') + 1], 'Build/Products');
            const xctestrun = join(
              products,
              'WebDriverAgentRunner_iphonesimulator18.5-arm64.xctestrun',
            );
            if (scenario === 'empty') writeFileSync(xctestrun, '');
            if (scenario === 'ambiguous')
              writeFileSync(
                join(products, 'WebDriverAgentRunner_iphonesimulator18.5-x86_64.xctestrun'),
                'other',
              );
            if (scenario === 'escaped') {
              unlinkSync(xctestrun);
              // The asynchronous operation finishes before the fake build closes.
              symlink(join(f.wdaDir, 'package.json'), xctestrun).then(() => build.finish(0));
              return;
            }
          }
          build.finish(0);
        });
      },
    });
    const result = await runCiMobileAgent(f.options, f.dependencies);
    assert.equal(result.appiumError, 'APPIUM_WDA_BUILD_OUTPUT_INVALID', scenario);
    assert.equal(result.appium.wda.ready, false, scenario);
    assert.equal(f.calls.length, 1, scenario);
    await assertAppiumStopped(f.reportDir);
  }
});

test('WDA setup timeout stops the owned build group before allowing sanitation and never starts journeys', async (t) => {
  const f = await fixture(t, { platform: 'ios', onBuild() {} });
  f.dependencies.wdaBuildTimeoutMs = 5;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_WDA_BUILD_TIMED_OUT');
  assert.equal(result.exitCode, 1);
  assert.deepEqual(f.build.signals, ['SIGTERM']);
  assert.equal(f.build.unreferenced, false, 'Confirmed cleanup does not abandon ownership.');
  assert.equal(f.calls.length, 1);
  await assertAppiumStopped(f.reportDir);
});

test('SIGINT and SIGTERM during WDA preparation preserve signal status and close the owned build', async (t) => {
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    const f = await fixture(t, {
      platform: 'ios',
      onBuild({ signalSource }) {
        queueMicrotask(() => signalSource.emit(signal));
      },
    });
    const result = await runCiMobileAgent(f.options, f.dependencies);
    assert.equal(result.exitCode, code);
    assert.equal(result.signal, signal);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.build.signals, ['SIGTERM']);
    assert.equal(f.signalSource.listenerCount(signal), 0);
    await assertAppiumStopped(f.reportDir);
  }
});

test('an exited build with open output pipes still requires owned-group cleanup', async (t) => {
  const f = await fixture(t, {
    platform: 'ios',
    onBuild({ build }) {
      queueMicrotask(() => {
        build.emit('exit', 0, null);
        build.stdout.write('Synthetic descendant still writing\n');
      });
    },
  });
  f.dependencies.wdaBuildTimeoutMs = 5;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_WDA_BUILD_TIMED_OUT');
  assert.deepEqual(f.build.signals, ['SIGTERM']);
  assert.equal(f.calls.length, 1);
  assert.match(
    await readFile(join(f.reportDir, 'appium/wda-build.log'), 'utf8'),
    /descendant still writing/,
  );
  await assertAppiumStopped(f.reportDir);
});

test('unconfirmed WDA writers leave a sanitation blocker even after late process closure', async (t) => {
  const f = await fixture(t, { platform: 'ios', onBuild() {} });
  f.dependencies.wdaBuildTimeoutMs = 5;
  f.build.ignoreTerm = true;
  f.build.ignoreKill = true;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
  assert.equal(result.appium.wda.shutdownUnconfirmed, true);
  assert.deepEqual(f.build.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(
    f.build.unreferenced,
    true,
    'An unconfirmed child cannot hold the parent event loop open.',
  );
  assert.equal(f.build.stdout.destroyed, true);
  assert.equal(f.build.stderr.destroyed, true);
  assert.equal(f.calls.length, 1);
  await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
  await assert.rejects(runCiMobileAgent(f.options, f.dependencies), /NOT_CONFIRMED_STOPPED/);
  f.build.finish(null, 'SIGKILL');
  await delay(0);
  await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
});

test('WDA output validation rejects missing, empty, nonexecutable, or escaping runner and XCTest payloads', async (t) => {
  for (const payload of ['runner', 'test']) {
    for (const damage of ['missing', 'empty', 'nonexecutable', 'escaped']) {
      const f = await fixture(t, {
        platform: 'ios',
        onBuild({ build, args, writeBuildOutputs }) {
          queueMicrotask(async () => {
            writeBuildOutputs(args);
            const derived = args[args.indexOf('-derivedDataPath') + 1];
            const app = join(
              derived,
              'Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app',
            );
            const executable =
              payload === 'runner'
                ? join(app, 'WebDriverAgentRunner-Runner')
                : join(app, 'PlugIns/WebDriverAgentRunner.xctest/WebDriverAgentRunner');
            if (damage === 'missing') unlinkSync(executable);
            if (damage === 'empty') writeFileSync(executable, '');
            if (damage === 'nonexecutable') chmodSync(executable, 0o644);
            if (damage === 'escaped') {
              unlinkSync(executable);
              await symlink(join(f.wdaDir, 'package.json'), executable);
            }
            build.finish(0);
          });
        },
      });
      const result = await runCiMobileAgent(f.options, f.dependencies);
      assert.equal(result.appiumError, 'APPIUM_WDA_BUILD_OUTPUT_INVALID', `${payload}: ${damage}`);
      assert.equal(result.appium.wda.ready, false);
      assert.equal(f.calls.length, 1, 'Incomplete payloads must never reach Appium or the CLI.');
      await assertAppiumStopped(f.reportDir);
    }
  }
});

test('failed build-group signaling abandons parent handles without clearing the blocker', async (t) => {
  const f = await fixture(t, { platform: 'ios', onBuild() {} });
  f.dependencies.wdaBuildTimeoutMs = 5;
  f.dependencies.signalOwnedBuildGroup = () => {
    throw new Error('synthetic signal failure');
  };
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
  assert.equal(result.appium.wda.shutdownUnconfirmed, true);
  assert.equal(f.build.unreferenced, true);
  assert.equal(f.build.stdout.destroyed, true);
  assert.equal(f.build.stderr.destroyed, true);
  assert.equal(f.calls.length, 1);
  await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
  f.build.finish(0);
  await delay(0);
  await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
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

test('one private parent-owned log captures the server without a duplicate file transport', async (t) => {
  const f = await fixture(t);
  const logDir = join(f.reportDir, 'appium');
  await mkdir(logDir, { recursive: true });
  await chmod(logDir, 0o755);
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 2);
  assert.equal(result.appium.ready, true);
  assert.equal((await stat(logDir)).mode & 0o777, 0o700);
  const server = f.calls[0];
  assert.equal(server.args.includes('--log'), false);
  assert.equal(server.args[server.args.indexOf('--log-level') + 1], 'info');
  assert.deepEqual(server.options.stdio, ['ignore', 'pipe', 'pipe']);
  await assert.rejects(access(join(logDir, 'server.log')), { code: 'ENOENT' });
  await assertAppiumStopped(f.reportDir);
  f.assertLogClosed();
});

test('independent stream decoders preserve split Unicode and normalize invalid bytes and NUL for sanitation', async (t) => {
  function fragmented(child) {
    child.stdout.write(Buffer.from('stdout: '));
    child.stdout.write(Buffer.from([0xe2]));
    child.stderr.write(Buffer.from('stderr: '));
    child.stderr.write(Buffer.from([0xf0, 0x9f]));
    child.stdout.write(Buffer.from([0x82, 0xac]));
    child.stdout.write(' synthetic-private-');
    child.stderr.write(Buffer.from([0x98, 0x80, 0xff, 0]));
    child.stderr.write('\n');
    child.stdout.write('token\n');
    child.stderr.write(Buffer.from([0xe2])); // Incomplete at EOF, independently flushed.
  }
  const f = await fixture(t, {
    platform: 'ios',
    onBuild({ build, args, writeBuildOutputs }) {
      queueMicrotask(() => {
        fragmented(build);
        writeBuildOutputs(args);
        build.finish(0);
      });
    },
    onServer({ server }) {
      fragmented(server);
    },
  });
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 2);
  for (const [file, metadata] of [
    ['process.log', result.appium.logs.process],
    ['wda-build.log', result.appium.logs.wdaBuild],
  ]) {
    const bytes = await readFile(join(f.reportDir, 'appium', file));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.match(text, /stderr: 😀�\\u0000\n/);
    assert.match(text, /stdout: € synthetic-private-token\n/);
    assert.ok(text.endsWith('�\n'));
    assert.equal(bytes.includes(0), false);
    assert.equal(metadata.replacementCharacters, 2);
    assert.equal(metadata.nulEscapes, 1);
    assert.equal(metadata.truncated, false);
    assert.equal(metadata.writtenBytes, bytes.length);
    const clean = sanitizeReportBytes(bytes, ['synthetic-private-token']).toString();
    assert.ok(!clean.includes('synthetic-private-token'));
    assert.match(clean, /stdout: € \[REDACTED\]/);
  }
  await assertAppiumStopped(f.reportDir);
  f.assertLogClosed();
});

test('both logs stay capped on complete UTF-8 lines, keep draining, and observe readiness after the cap', async (t) => {
  const limit = 512;
  const line = 'Complete line €😀 synthetic-private-token\n';
  const chunks = 100;
  let serverBytes = 0;
  let buildBytes = 0;
  function flood(child) {
    let total = 0;
    for (let index = 0; index < chunks; index += 1) {
      const bytes = Buffer.from(line);
      (index % 2 ? child.stderr : child.stdout).write(bytes);
      total += bytes.length;
    }
    return total;
  }
  const f = await fixture(t, {
    platform: 'ios',
    listening: false,
    onBuild({ build, args, writeBuildOutputs }) {
      queueMicrotask(() => {
        buildBytes = flood(build);
        writeBuildOutputs(args);
        build.finish(0);
      });
    },
    onServer({ server }) {
      serverBytes = flood(server);
      // This exact owned message is deliberately absent from the capped file.
      server.stdout.write('Appium REST http interface listener started on ');
      server.stderr.write('other stream must not interrupt listener matching\n');
      server.stdout.write('http://127.0.0.1:4723\n');
    },
  });
  f.dependencies.logLimitBytes = limit;
  f.dependencies.logLineLimitBytes = 128;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appium.ready, true);
  assert.equal(result.exitCode, 2);
  assert.ok(result.appium.logs.process.receivedBytes > serverBytes);
  assert.equal(result.appium.logs.wdaBuild.receivedBytes, buildBytes);
  for (const [file, metadata, child] of [
    ['process.log', result.appium.logs.process, f.server],
    ['wda-build.log', result.appium.logs.wdaBuild, f.build],
  ]) {
    const bytes = await readFile(join(f.reportDir, 'appium', file));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(bytes.length <= limit, 'The notice also fits inside the hard byte cap.');
    assert.equal(metadata.limitBytes, limit);
    assert.equal(metadata.writtenBytes, bytes.length);
    assert.equal(metadata.capped, true);
    assert.equal(metadata.truncated, true);
    assert.equal(metadata.droppedLongLines, 0);
    assert.equal(text.includes('Appium REST http interface listener started'), false);
    assert.match(text, /Appium diagnostics truncated/);
    assert.ok(!text.includes('�'), 'The cap must not split a UTF-8 sequence.');
    const clean = sanitizeReportBytes(bytes, ['synthetic-private-token']).toString();
    assert.ok(
      !clean.includes('synthetic-private-'),
      'No partial credential line survives the cap.',
    );
    assert.equal(child.stdout.readableLength, 0);
    assert.equal(child.stderr.readableLength, 0);
    assert.equal(child.stdout.listenerCount('data'), 0);
    assert.equal(child.stderr.listenerCount('data'), 0);
  }
  await assertAppiumStopped(f.reportDir);
  f.assertLogClosed();
});

test('oversized lines are dropped whole with bounded pending state and later complete lines retained', async (t) => {
  const f = await fixture(t, {
    onServer({ server }) {
      server.stdout.write('sensitive-line-prefix ');
      for (let index = 0; index < 100; index += 1) server.stdout.write('x'.repeat(256));
      server.stdout.write(' sensitive-line-suffix\n');
      server.stdout.write('retained after oversized line\n');
      server.stderr.write('second complete stream\n');
    },
  });
  f.dependencies.logLineLimitBytes = 128;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  const bytes = await readFile(join(f.reportDir, 'appium/process.log'));
  const text = sanitizeReportBytes(bytes, []).toString();
  assert.equal(result.appium.ready, true);
  assert.equal(result.appium.logs.process.droppedLongLines, 1);
  assert.equal(result.appium.logs.process.truncated, true);
  assert.equal(result.appium.logs.process.capped, false);
  assert.ok(result.appium.logs.process.receivedBytes > 25000);
  assert.ok(bytes.length < 512);
  assert.ok(!text.includes('sensitive-line-'));
  assert.match(text, /retained after oversized line/);
  assert.match(text, /second complete stream/);
  assert.match(text, /Appium diagnostics truncated/);
  await assertAppiumStopped(f.reportDir);
});

test('listener fragments from different streams cannot manufacture owned-server readiness', async (t) => {
  const f = await fixture(t, {
    listening: false,
    onServer({ server }) {
      server.stdout.write('Appium REST http interface listener started on ');
      server.stderr.write('http://127.0.0.1:4723\n');
    },
  });
  f.dependencies.startupTimeoutMs = 10;
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.appiumError, 'APPIUM_STARTUP_TIMED_OUT');
  assert.equal(f.statusProbes, 0);
  assert.equal(f.calls.length, 1);
  await assertAppiumStopped(f.reportDir);
});

test('unexpected capture write failures stop startup instead of permitting journeys', async (t) => {
  for (const mode of ['throw', 'zero']) {
    const f = await fixture(t);
    f.dependencies.writeLog = () => {
      if (mode === 'throw') throw new Error('synthetic write failure');
      return 0;
    };
    const result = await runCiMobileAgent(f.options, f.dependencies);
    assert.equal(result.appiumError, 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
    assert.equal(result.appium.ready, false);
    assert.equal(result.appium.logs.process.writeFailed, true);
    assert.equal(f.calls.length, 1);
    assert.equal(f.statusProbes, 0);
    assert.deepEqual(f.server.signals, ['SIGTERM']);
    await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
    f.assertLogClosed();
  }
});

test('short writes are completed without corrupting captured UTF-8 or exceeding the cap', async (t) => {
  const f = await fixture(t, {
    onServer({ server }) {
      server.stderr.write('short write €😀\n');
    },
  });
  f.dependencies.writeLog = (fd, bytes, offset) =>
    writeSync(fd, bytes, offset, Math.min(2, bytes.length - offset));
  const result = await runCiMobileAgent(f.options, f.dependencies);
  assert.equal(result.exitCode, 2);
  const bytes = await readFile(join(f.reportDir, 'appium/process.log'));
  assert.equal(bytes.length, result.appium.logs.process.writtenBytes);
  assert.match(sanitizeReportBytes(bytes, []).toString(), /short write €😀/);
  await assertAppiumStopped(f.reportDir);
});

test('final line or truncation-notice write failure blocks sanitation after successful child exits', async (t) => {
  for (const stage of ['build', 'server']) {
    for (const finalWrite of ['pending-line', 'notice']) {
      const output = (child) => {
        if (finalWrite === 'pending-line') child.stdout.write('final pending secret fragment');
        else for (let index = 0; index < 30; index += 1) child.stdout.write('complete line €😀\n');
      };
      const f = await fixture(t, {
        platform: stage === 'build' ? 'ios' : 'android',
        agentExitCode: 0,
        ...(stage === 'build'
          ? {
              onBuild({ build, args, writeBuildOutputs }) {
                queueMicrotask(() => {
                  output(build);
                  writeBuildOutputs(args);
                  build.finish(0);
                });
              },
            }
          : {
              onServer({ server }) {
                output(server);
              },
            }),
      });
      f.dependencies.logLimitBytes = 512;
      f.dependencies.writeLog = (fd, bytes, offset) => {
        if (
          bytes
            .toString()
            .includes(
              finalWrite === 'notice'
                ? 'Appium diagnostics truncated'
                : 'final pending secret fragment',
            )
        )
          throw new Error('synthetic final write failure');
        return writeSync(fd, bytes, offset);
      };
      const result = await runCiMobileAgent(f.options, f.dependencies);
      assert.equal(result.exitCode, 1, `${stage}/${finalWrite}`);
      assert.equal(result.appiumError, 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
      assert.equal(
        result.appium.logs[stage === 'build' ? 'wdaBuild' : 'process'].writeFailed,
        true,
      );
      assert.equal(f.calls.length, stage === 'build' ? 1 : 2);
      if (stage === 'build') assert.equal(result.appium.wda.process.exitCode, 0);
      else assert.equal(result.agentExitCode, 0);
      await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
      f.assertLogClosed();
    }
  }
});

test('capture close failures retain the publication blocker for either owned log', async (t) => {
  for (const filename of ['wda-build.log', 'process.log']) {
    const f = await fixture(t, { platform: 'ios', agentExitCode: 0 });
    const openLog = f.dependencies.openLog;
    f.dependencies.openLog = async (...args) => {
      const handle = await openLog(...args);
      if (!args[0].endsWith(filename)) return handle;
      return {
        fd: handle.fd,
        async close() {
          await handle.close();
          throw new Error('synthetic close failure');
        },
      };
    };
    const result = await runCiMobileAgent(f.options, f.dependencies);
    assert.equal(result.exitCode, 1);
    assert.equal(result.appiumError, 'APPIUM_WRITER_NOT_CONFIRMED_STOPPED');
    await assert.rejects(assertAppiumStopped(f.reportDir), /NOT_CONFIRMED_STOPPED/);
    f.assertLogClosed();
  }
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
  assert.equal(f.server.unreferenced, false);
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
  assert.equal(f.server.unreferenced, true);
  assert.equal(f.server.stdout.destroyed, true);
  assert.equal(f.server.stderr.destroyed, true);
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
