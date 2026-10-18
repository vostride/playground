import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

// Android 15 ConnectivityService prints "Active default network: none" when
// there is no default NetworkAgent. Settings alone are not evidence of that.
export function assertOffline({ airplane, wifi, connectivity }) {
  assert.equal(airplane.trim(), 'enabled', 'Airplane mode is not enabled.');
  assert.equal(wifi.trim(), '0', 'Wi-Fi is not disabled.');
  const matches = [...connectivity.matchAll(/^\s*Active default network:\s*([^\r\n]+)$/gm)];
  assert.equal(matches.length, 1, 'Cannot determine the active default network.');
  assert.equal(matches[0][1].trim(), 'none', 'The emulator still has an active default network.');
}

export function validateTarget(device, mode, environment) {
  assert.equal(
    environment.GITHUB_ACTIONS,
    'true',
    'Offline verification only runs on a CI emulator.',
  );
  assert.match(device || '', /^emulator-\d+$/, 'An explicit Android emulator ID is required.');
  assert.ok(['configure', 'verify'].includes(mode), 'Select configure or verify.');
}

async function main() {
  const [, , device, mode] = process.argv;
  validateTarget(device, mode, process.env);
  const directory = 'maestro-reports/android';
  mkdirSync(directory, { recursive: true });
  const report = {
    device,
    mode,
    passed: false,
    startedAt: new Date().toISOString(),
    samples: [],
  };
  const save = () =>
    writeFileSync(`${directory}/offline-${mode}.json`, JSON.stringify(report, null, 2));
  const shell = (...args) =>
    execFileSync('adb', ['-s', device, 'shell', ...args], {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
    });
  save();
  try {
    report.androidVersion = shell('getprop', 'ro.build.version.release').trim();
    report.apiLevel = shell('getprop', 'ro.build.version.sdk').trim();
    if (mode === 'configure') {
      shell('cmd', 'connectivity', 'airplane-mode', 'enable');
      shell('svc', 'wifi', 'disable');
      shell('svc', 'data', 'disable');
    }
    const deadline = Date.now() + (mode === 'configure' ? 30000 : 0);
    for (;;) {
      const state = {
        checkedAt: new Date().toISOString(),
        airplane: shell('cmd', 'connectivity', 'airplane-mode'),
        wifi: shell('settings', 'get', 'global', 'wifi_on'),
        connectivity: shell('dumpsys', 'connectivity'),
      };
      report.samples.push(state);
      save();
      try {
        assertOffline(state);
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await setTimeout(500);
      }
    }
    report.passed = true;
  } catch (error) {
    report.error = String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    save();
  }
  console.log(`Android emulator is offline (${mode}); connectivity evidence saved.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
