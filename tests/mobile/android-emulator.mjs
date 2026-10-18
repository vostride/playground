import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateTarget } from './android-offline.mjs';

export const SDK_SETUP_PACKAGE = 'com.google.android.googlesdksetup';

export function validatePreparationTarget(device, environment, hostPlatform) {
  validateTarget(device, 'configure', environment);
  assert.equal(
    environment.RUNNER_ENVIRONMENT,
    'github-hosted',
    'A disposable GitHub-hosted runner is required.',
  );
  assert.equal(environment.RUNNER_OS, 'Linux', 'Android preparation requires the Linux CI runner.');
  assert.equal(hostPlatform, 'linux', 'Android preparation cannot run on this host platform.');
}

function containsSetupPackage(output) {
  const packages = output.trim() ? output.trim().split(/\r?\n/) : [];
  for (const entry of packages) {
    assert.match(entry, /^package:[a-zA-Z0-9_.]+$/, 'Unexpected package-manager response.');
  }
  return packages.includes(`package:${SDK_SETUP_PACKAGE}`);
}

export function prepareEmulator(
  { device, environment = process.env, hostPlatform = process.platform },
  { execute = execFileSync, save = saveReport } = {},
) {
  // These checks precede all adb calls, report writes, and device mutations.
  validatePreparationTarget(device, environment, hostPlatform);
  const report = {
    device,
    package: SDK_SETUP_PACKAGE,
    user: 0,
    passed: false,
    startedAt: new Date().toISOString(),
    actions: [],
  };
  const shell = (...args) => {
    const action = { args, startedAt: new Date().toISOString() };
    report.actions.push(action);
    try {
      action.output = execute('adb', ['-s', device, 'shell', ...args], {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      return action.output;
    } catch (error) {
      action.error = String(error);
      throw error;
    } finally {
      action.finishedAt = new Date().toISOString();
      save(report);
    }
  };
  const listed = (...options) =>
    containsSetupPackage(
      shell('pm', 'list', 'packages', ...options, '--user', '0', SDK_SETUP_PACKAGE),
    );
  save(report);
  try {
    report.qemu = shell('getprop', 'ro.kernel.qemu').trim();
    if (report.qemu !== '1') report.qemu = shell('getprop', 'ro.boot.qemu').trim();
    assert.equal(report.qemu, '1', 'The selected device did not identify itself as an emulator.');
    report.present = listed();
    if (!report.present) {
      report.result = 'package-not-installed';
    } else {
      report.disabledBefore = listed('-d');
      if (!report.disabledBefore) {
        // CI image setup is unrelated to Playground. Never disable another
        // package or dismiss a product/system ANR through a broad UI selector.
        // https://developer.android.com/tools/adb#pm
        const output = shell('pm', 'disable-user', '--user', '0', SDK_SETUP_PACKAGE);
        assert.equal(
          output.trim(),
          `Package ${SDK_SETUP_PACKAGE} new state: disabled-user`,
          'SDK setup package was not disabled.',
        );
      }
      report.disabledAfter = listed('-d');
      report.enabledAfter = listed('-e');
      assert.equal(report.disabledAfter, true, 'SDK setup package is not listed as disabled.');
      assert.equal(report.enabledAfter, false, 'SDK setup package is still enabled.');
      report.result = report.disabledBefore ? 'already-disabled' : 'disabled-for-ci';
    }
    report.passed = true;
  } catch (error) {
    report.error = String(error);
  } finally {
    report.finishedAt = new Date().toISOString();
    save(report);
  }
  return report;
}

function saveReport(report) {
  mkdirSync('maestro-reports/android', { recursive: true });
  writeFileSync(
    'maestro-reports/android/emulator-preparation.json',
    JSON.stringify(report, null, 2),
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const report = prepareEmulator({ device: process.argv[2] });
    console.log(`Android CI emulator preparation: ${report.result || report.error}`);
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
