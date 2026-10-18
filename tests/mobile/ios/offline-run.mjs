import { createHash, randomUUID } from 'node:crypto';
import { createServer, get } from 'node:http';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  APP_ID,
  MAX_OUTAGE_MS,
  RESTORE_AT_MS,
  assertCI,
  assertMainRules,
  atomicJSON,
  evidenceFailures,
  execute,
  monoMs,
  pf,
  readJSON,
} from './offline-support.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '../../..');
const xml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function bundleHash(directory) {
  const hash = createHash('sha256');
  function visit(path, name) {
    const stat = lstatSync(path);
    hash.update(`${name}\0`);
    if (stat.isSymbolicLink()) hash.update(`link:${readlinkSync(path)}`);
    else if (stat.isDirectory())
      for (const child of readdirSync(path).sort()) visit(join(path, child), `${name}/${child}`);
    else if (stat.isFile()) hash.update(readFileSync(path));
  }
  visit(directory, '.');
  return hash.digest('hex');
}

async function required(command, args, options) {
  const result = await execute(command, args, options);
  if (result.code !== 0 || result.timedOut || result.error)
    throw new Error(`${command} ${args.join(' ')} failed: ${JSON.stringify(result)}`);
  return result;
}

// Fixed addresses bypass DNS and proxy configuration: failures cannot be DNS-only failures.
async function externalProbe(family) {
  const address = family === 'ipv4' ? '1.1.1.1' : '[2606:4700:4700::1111]';
  const result = await execute(
    '/usr/bin/curl',
    [
      family === 'ipv4' ? '-4' : '-6',
      '--noproxy',
      '*',
      '--proto',
      '=https',
      '--resolve',
      `one.one.one.one:443:${address}`,
      '--connect-timeout',
      '2',
      '--max-time',
      '3',
      '--silent',
      '--show-error',
      '--fail',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      'https://one.one.one.one/cdn-cgi/trace',
    ],
    { timeout: 4_000 },
  );
  return { ...result, atMs: monoMs(), address };
}

async function externalProbes() {
  const [ipv4, ipv6] = await Promise.all([externalProbe('ipv4'), externalProbe('ipv6')]);
  return { ipv4, ipv6 };
}

function localProbe(url) {
  return new Promise((done) => {
    const request = get(url, (response) => {
      response.resume();
      response.on('end', () => done(response.statusCode === 200));
    });
    request.setTimeout(1_000, () => {
      request.destroy();
      done(false);
    });
    request.on('error', () => done(false));
  });
}

function patchTestEnvironment(value, controlURL) {
  let count = 0;
  let testHostPath;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (
      typeof node.TestBundlePath === 'string' &&
      node.TestBundlePath.includes('OfflineLaunch.xctest')
    ) {
      node.EnvironmentVariables = {
        ...node.EnvironmentVariables,
        PLAYGROUND_OFFLINE_CONTROL_URL: controlURL,
      };
      testHostPath = node.TestHostPath;
      count++;
    }
    for (const child of Object.values(node)) visit(child);
  }
  visit(value);
  if (count !== 1) throw new Error(`Expected exactly one offline test target, found ${count}.`);
  return { value, testHostPath };
}

export async function runOffline(device) {
  assertCI({ device }); // No filesystem, compilation, or networking mutation before this guard.
  const reportDir = join(workspace, 'maestro-reports/ios/offline');
  mkdirSync(reportDir, { recursive: true });
  const id = randomUUID();
  const directory = join(reportDir, id);
  mkdirSync(directory);
  const report = {
    id,
    device,
    app: APP_ID,
    harnessCommit: process.env.GITHUB_SHA || null,
    startedAt: new Date().toISOString(),
    maximumOutageMs: MAX_OUTAGE_MS,
    watchdogRestoreAtMs: RESTORE_AT_MS,
    passed: false,
    watchdogFired: false,
  };
  const save = () => {
    atomicJSON(join(directory, 'evidence.json'), report);
    atomicJSON(join(reportDir, 'latest.json'), report);
  };
  save();
  const abort = new AbortController();
  let server,
    config,
    configPath,
    daemonInstalled = false,
    cleanupPromise,
    candidate;
  let active = false,
    beginning = false,
    testChild,
    deadlineTimer;
  const restoreOwn = () => {
    active = false;
    if (!config || !daemonInstalled) return Promise.resolve();
    return (cleanupPromise ||= (async () => {
      atomicJSON(config.cleanupRequest, { atMs: monoMs() });
      const until = monoMs() + 12_000;
      do {
        report.cleanup = readJSON(config.watchdogCleanup);
        if (report.cleanup?.empty && report.cleanup?.released) break;
        await new Promise((done) => setTimeout(done, 50));
      } while (monoMs() < until);
      // The launchd daemon keeps retrying if verification fails; the wrapper never disables it.
      if (!report.cleanup?.empty || !report.cleanup?.released)
        report.cleanupError =
          'Independent watchdog has not verified restoration; it remains active.';
      save();
    })());
  };
  const interrupt = (signal) => {
    report.interrupted = signal;
    abort.abort();
    void restoreOwn().catch((error) => {
      report.cleanupError = String(error);
      save();
    });
  };
  const onTerm = () => interrupt('SIGTERM'),
    onInt = () => interrupt('SIGINT');
  process.once('SIGTERM', onTerm);
  process.once('SIGINT', onInt);
  try {
    const devices = JSON.parse(
      (await required('/usr/bin/xcrun', ['simctl', 'list', 'devices', '--json'])).stdout,
    );
    if (
      !Object.entries(devices.devices).some(
        ([runtime, list]) =>
          runtime.includes('.iOS-') &&
          list.some(
            (item) => item.udid.toLowerCase() === device.toLowerCase() && item.state === 'Booted',
          ),
      )
    )
      throw new Error('Explicit simulator must already be booted with an iOS runtime.');
    candidate = (
      await required('/usr/bin/xcrun', ['simctl', 'get_app_container', device, APP_ID, 'app'])
    ).stdout.trim();
    if (!candidate.endsWith('.app')) throw new Error('Installed release app container not found.');
    const bundleID = (
      await required('/usr/libexec/PlistBuddy', [
        '-c',
        'Print :CFBundleIdentifier',
        join(candidate, 'Info.plist'),
      ])
    ).stdout.trim();
    if (bundleID !== APP_ID) throw new Error('Unexpected installed app identity.');
    report.candidateBefore = bundleHash(candidate);
    report.candidatePath = candidate;
    report.online = await externalProbes();
    if (report.online.ipv4.code !== 0)
      throw new Error('External IPv4 baseline must work before testing offline.');
    report.ipv6BaselineReachable = report.online.ipv6.code === 0;
    report.ipv6Note = report.ipv6BaselineReachable
      ? 'IPv6 connectivity is probed before, during and after the outage.'
      : 'No external IPv6 baseline on this runner; both-family PF enforcement is verified, not IPv6 route availability.';

    const build = join(directory, 'build');
    const buildArguments = [
      'build-for-testing',
      '-project',
      join(here, 'offline-launch.xcodeproj'),
      '-scheme',
      'OfflineLaunch',
      '-configuration',
      'Debug',
      '-sdk',
      'iphonesimulator',
      '-destination',
      `platform=iOS Simulator,id=${device}`,
      '-derivedDataPath',
      build,
      'CODE_SIGNING_ALLOWED=NO',
      'CODE_SIGNING_REQUIRED=NO',
    ];
    await required('/usr/bin/xcodebuild', buildArguments, {
      timeout: 180_000,
      signal: abort.signal,
      onOutput: (chunk) => appendFileSync(join(directory, 'build.log'), chunk),
    });
    const products = join(build, 'Build/Products');
    const runs = readdirSync(products).filter((name) => name.endsWith('.xctestrun'));
    if (runs.length !== 1) throw new Error('Expected one prebuilt xctestrun file.');
    const runFile = join(products, runs[0]);

    report.mainRules = (await pf(['-s', 'rules'])).stdout;
    assertMainRules(report.mainRules);
    const anchor = `com.apple/000.playground-offline-${id}`;
    if ((await pf(['-a', anchor, '-s', 'rules'])).stdout.trim())
      throw new Error('Unique anchor is not empty.');
    config = {
      device,
      anchor,
      ready: join(directory, 'watchdog-ready.json'),
      cutoff: join(directory, 'cutoff.json'),
      fired: join(directory, 'watchdog-fired.json'),
      activation: join(directory, 'activation.json'),
      failure: join(directory, 'watchdog-failure.json'),
      cleanupRequest: join(directory, 'cleanup-request.json'),
      watchdogCleanup: join(directory, 'watchdog-cleanup.json'),
    };
    report.anchor = anchor;
    configPath = join(directory, 'watchdog-config.json');
    atomicJSON(configPath, config);
    const label = `dev.vostride.playground.offline.${id}`;
    report.watchdogLabel = label;
    const plistPath = join(directory, 'watchdog.plist');
    writeFileSync(
      plistPath,
      `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>Label</key><string>${label}</string><key>RunAtLoad</key><true/>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(here, 'offline-watchdog.mjs'))}</string><string>${xml(configPath)}</string></array>
<key>EnvironmentVariables</key><dict><key>CI</key><string>true</string><key>GITHUB_ACTIONS</key><string>true</string><key>PLAYGROUND_OFFLINE_WATCHDOG</key><string>1</string></dict>
<key>StandardOutPath</key><string>${xml(join(directory, 'watchdog.log'))}</string><key>StandardErrorPath</key><string>${xml(join(directory, 'watchdog-error.log'))}</string>
</dict></plist>\n`,
      { mode: 0o644 },
    );
    await required('/usr/bin/sudo', ['-n', '/usr/sbin/chown', 'root:wheel', plistPath]);
    await required('/usr/bin/sudo', ['-n', '/bin/launchctl', 'bootstrap', 'system', plistPath]);
    daemonInstalled = true;
    const readyDeadline = monoMs() + 8_000;
    while (!readJSON(config.ready) && monoMs() < readyDeadline)
      await new Promise((done) => setTimeout(done, 50));
    if (!readJSON(config.ready))
      throw new Error('Independent launchd watchdog did not become ready.');

    const key = randomUUID();
    let controlURL;
    const blockedProbes = async () => ({
      ...(await externalProbes()),
      loopback: await localProbe(`${controlURL}/ping`),
    });
    const stillActive = () =>
      active && !existsSync(config.fired) && monoMs() - report.blockedAtMs < RESTORE_AT_MS;
    server = createServer(async (request, response) => {
      const route = request.url;
      response.setHeader('Content-Type', 'application/json');
      if (route === `/${key}/ping`) {
        response.end('{"loopback":true}');
        return;
      }
      try {
        if (request.method !== 'POST') throw new Error('POST required.');
        if (route === `/${key}/begin`) {
          if (beginning || report.blockedAtMs) throw new Error('The outage can only begin once.');
          beginning = true;
          report.blockedAtMs = monoMs();
          atomicJSON(config.cutoff, { blockedAtMs: report.blockedAtMs });
          // Only the root launchd daemon can mutate PF; cleanup requests are serialized after activation.
          const activationDeadline = monoMs() + 14_000;
          let activation;
          while (!(activation = readJSON(config.activation))) {
            if (
              abort.signal.aborted ||
              existsSync(config.failure) ||
              existsSync(config.cleanupRequest) ||
              monoMs() >= activationDeadline
            )
              throw new Error('Independent PF activation did not succeed.');
            await new Promise((done) => setTimeout(done, 50));
          }
          if (abort.signal.aborted || cleanupPromise || existsSync(config.cleanupRequest))
            throw new Error('Activation finished after cleanup was requested.');
          report.activation = activation;
          report.loadedRules = activation.loadedRules;
          report.anchorVerified = true;
          report.stateFlush = activation.stateFlush;
          report.statesFlushed = true;
          active = true;
          deadlineTimer = setTimeout(
            () => {
              report.deadlineExpired = true;
              testChild?.kill('SIGTERM');
              void restoreOwn().catch((error) => {
                report.cleanupError = String(error);
                save();
              });
            },
            Math.max(0, RESTORE_AT_MS - (monoMs() - report.blockedAtMs)),
          );
          report.during = await blockedProbes();
          save();
          if (
            !stillActive() ||
            !report.during.loopback ||
            ![7, 28].includes(report.during.ipv4.code) ||
            ![7, 28].includes(report.during.ipv6.code)
          )
            throw new Error('Actual outbound block and loopback checks did not pass.');
        } else if (route === `/${key}/complete`) {
          if (!stillActive()) throw new Error('Cannot complete outside the blocked interval.');
          report.journeyCompleted = true;
          report.journeyCompletedAtMs = monoMs();
          save();
        } else throw new Error('Unknown control endpoint.');
        response.end(
          JSON.stringify({
            active: stillActive(),
            remainingMs: RESTORE_AT_MS - (monoMs() - report.blockedAtMs),
          }),
        );
      } catch (error) {
        report.controlError = String(error);
        save();
        response.statusCode = 500;
        response.end(JSON.stringify({ error: String(error), active: false }));
      }
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    controlURL = `http://127.0.0.1:${server.address().port}/${key}`;
    const parameters = JSON.parse(
      (await required('/usr/bin/plutil', ['-convert', 'json', '-o', '-', runFile])).stdout,
    );
    // Apple documents EnvironmentVariables as test-host variables. No target-app launch env/state is injected.
    const prepared = patchTestEnvironment(parameters, controlURL);
    // iOS 17+ explicitly supports literal IP exception keys. Only the independent,
    // unsigned test runner gets this 127.0.0.1 HTTP exception and local-network policy.
    // The installed release app is never re-signed, patched, or given launch environment variables.
    const testHost = resolve(prepared.testHostPath.replace('__TESTROOT__', products));
    if (!testHost.startsWith(`${products}/`) || !testHost.endsWith('/OfflineLaunch-Runner.app'))
      throw new Error('Unexpected independent XCTest host location.');
    const hostInfo = join(testHost, 'Info.plist');
    const hostProperties = JSON.parse(
      (await required('/usr/bin/plutil', ['-convert', 'json', '-o', '-', hostInfo])).stdout,
    );
    hostProperties.NSAppTransportSecurity = {
      ...hostProperties.NSAppTransportSecurity,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: {
        ...hostProperties.NSAppTransportSecurity?.NSExceptionDomains,
        '127.0.0.1': { NSExceptionAllowsInsecureHTTPLoads: true },
      },
    };
    writeFileSync(hostInfo, JSON.stringify(hostProperties));
    await required('/usr/bin/plutil', ['-convert', 'binary1', hostInfo]);
    writeFileSync(runFile, JSON.stringify(prepared.value));
    await required('/usr/bin/plutil', ['-convert', 'xml1', runFile]);
    const result = join(directory, 'offline.xcresult');
    report.resultBundle = result;
    report.test = await execute(
      '/usr/bin/xcodebuild',
      [
        'test-without-building',
        '-xctestrun',
        runFile,
        '-destination',
        `platform=iOS Simulator,id=${device}`,
        '-parallel-testing-enabled',
        'NO',
        '-maximum-concurrent-test-simulator-destinations',
        '1',
        '-resultBundlePath',
        result,
      ],
      {
        timeout: 180_000,
        signal: abort.signal,
        onSpawn: (child) => {
          testChild = child;
        },
        onOutput: (chunk) => appendFileSync(join(directory, 'test.log'), chunk),
      },
    );
    if (!stillActive() || report.test.code !== 0)
      throw new Error('XCTest failed or outlived the blocked interval.');
    report.afterTest = await blockedProbes();
    if (!stillActive())
      throw new Error('Recovery occurred before final blocked-network verification.');
    report.provedAtMs = monoMs();
    report.ruleCounters = (
      await pf(['-a', anchor, '-v', '-s', 'rules'], { timeout: 1_000 })
    ).stdout;
    await restoreOwn();
  } catch (error) {
    report.error = String(error);
  } finally {
    clearTimeout(deadlineTimer);
    try {
      await restoreOwn();
    } catch (error) {
      report.cleanupError = String(error);
    }
    report.watchdogFired = !!config && existsSync(config.fired);
    report.watchdogFailure =
      config && existsSync(config.failure)
        ? readJSON(config.failure) || { error: 'Watchdog failure record could not be read.' }
        : null;
    if (config) report.watchdogCleanup = readJSON(config.watchdogCleanup);
    // Never unload the only recovery process while the PF anchor is unverified.
    if (daemonInstalled && report.cleanup?.empty && report.cleanup?.released)
      report.watchdogUnload = await execute('/usr/bin/sudo', [
        '-n',
        '/bin/launchctl',
        'bootout',
        `system/${report.watchdogLabel}`,
      ]);
    if (server) await new Promise((done) => server.close(done));
    report.restored = await externalProbes();
    if (candidate) report.candidateAfter = bundleHash(candidate);
    report.finishedAt = new Date().toISOString();
    report.failures = evidenceFailures(report);
    if (report.error || report.interrupted || report.deadlineExpired || report.controlError)
      report.failures.push('Harness error, interruption, deadline, or control protocol failure.');
    report.passed = report.failures.length === 0;
    save();
    process.removeListener('SIGTERM', onTerm);
    process.removeListener('SIGINT', onInt);
    console.log(
      JSON.stringify({
        passed: report.passed,
        evidence: join(directory, 'evidence.json'),
        failures: report.failures,
      }),
    );
  }
  return report.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = await runOffline(process.argv[2]);
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
