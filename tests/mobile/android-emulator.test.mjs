import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareEmulator, SDK_SETUP_PACKAGE } from './android-emulator.mjs';

const target = {
  device: 'emulator-5554',
  environment: {
    GITHUB_ACTIONS: 'true',
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'Linux',
  },
  hostPlatform: 'linux',
};
const installed = `package:${SDK_SETUP_PACKAGE}\n`;
const disabled = `Package ${SDK_SETUP_PACKAGE} new state: disabled-user\n`;

function exercise(outputs, options = target) {
  const calls = [];
  const reports = [];
  const report = prepareEmulator(options, {
    execute(command, args, config) {
      calls.push({ command, args, config });
      const output = outputs[calls.length - 1];
      if (output instanceof Error) throw output;
      assert.equal(typeof output, 'string', 'Unexpected additional command');
      return output;
    },
    save: (value) => reports.push(structuredClone(value)),
  });
  return { report, calls, reports };
}

test('preparation refuses local, self-hosted, non-Linux, or unspecified targets before any action', () => {
  const invalid = [
    { ...target, environment: {} },
    { ...target, environment: { ...target.environment, GITHUB_ACTIONS: 'false' } },
    { ...target, environment: { ...target.environment, RUNNER_ENVIRONMENT: 'self-hosted' } },
    { ...target, environment: { ...target.environment, RUNNER_OS: 'macOS' } },
    { ...target, hostPlatform: 'darwin' },
    ...['', 'phone-1234', 'emulator-5554 shell', undefined].map((device) => ({
      ...target,
      device,
    })),
  ];
  for (const options of invalid) {
    let calls = 0;
    let writes = 0;
    assert.throws(() =>
      prepareEmulator(options, {
        execute: () => {
          calls++;
        },
        save: () => {
          writes++;
        },
      }),
    );
    assert.equal(calls, 0);
    assert.equal(writes, 0);
  }
});

test('device must independently identify itself as an emulator before package access', () => {
  const result = exercise(['0\n', '\n']);
  assert.equal(result.report.passed, false);
  assert.match(result.report.error, /identify itself as an emulator/);
  assert.deepEqual(
    result.calls.map(({ args }) => args.slice(3)),
    [
      ['getprop', 'ro.kernel.qemu'],
      ['getprop', 'ro.boot.qemu'],
    ],
  );
  const fallback = exercise(['\n', '1\n', '']);
  assert.equal(fallback.report.passed, true);
  assert.equal(fallback.report.qemu, '1');
});

test('an absent package or a similarly named package is never mutated', () => {
  for (const output of [
    '',
    `package:${SDK_SETUP_PACKAGE}.other\n`,
    'package:dev.vostride.playground\n',
  ]) {
    const result = exercise(['1\n', output]);
    assert.equal(result.report.passed, true);
    assert.equal(result.report.result, 'package-not-installed');
    assert.equal(result.calls.length, 2);
    assert.equal(
      result.calls.some(({ args }) => args.includes('disable-user')),
      false,
    );
  }
});

test('disables only the exact setup package for user 0 and verifies disabled plus not enabled', () => {
  const result = exercise(['1\n', installed, '', disabled, installed, '']);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.result, 'disabled-for-ci');
  assert.equal(result.report.disabledBefore, false);
  assert.equal(result.report.disabledAfter, true);
  assert.equal(result.report.enabledAfter, false);
  assert.deepEqual(
    result.calls.map(({ args }) => args.slice(3)),
    [
      ['getprop', 'ro.kernel.qemu'],
      ['pm', 'list', 'packages', '--user', '0', SDK_SETUP_PACKAGE],
      ['pm', 'list', 'packages', '-d', '--user', '0', SDK_SETUP_PACKAGE],
      ['pm', 'disable-user', '--user', '0', SDK_SETUP_PACKAGE],
      ['pm', 'list', 'packages', '-d', '--user', '0', SDK_SETUP_PACKAGE],
      ['pm', 'list', 'packages', '-e', '--user', '0', SDK_SETUP_PACKAGE],
    ],
  );
  for (const { command, args, config } of result.calls) {
    assert.equal(command, 'adb');
    assert.deepEqual(args.slice(0, 3), ['-s', target.device, 'shell']);
    assert.equal(config.timeout, 15000);
  }
  assert.deepEqual(result.reports.at(-1), result.report);
  assert.equal(result.report.actions.length, result.calls.length);
});

test('an already disabled setup package is verified without repeating the mutation', () => {
  const result = exercise(['1\n', installed, installed, installed, '']);
  assert.equal(result.report.passed, true);
  assert.equal(result.report.result, 'already-disabled');
  assert.equal(
    result.calls.some(({ args }) => args.includes('disable-user')),
    false,
  );
  assert.equal(result.report.enabledAfter, false);
});

test('command failure, unexpected output, and unverified disable state fail with retained evidence', () => {
  const cases = [
    { outputs: ['1\n', new Error('adb disconnected')], error: /adb disconnected/ },
    { outputs: ['1\n', 'Error: unknown user\n'], error: /Unexpected package-manager response/ },
    { outputs: ['1\n', installed, '', new Error('SecurityException')], error: /SecurityException/ },
    {
      outputs: ['1\n', installed, '', 'Package wrong.package new state: disabled-user\n'],
      error: /was not disabled/,
    },
    { outputs: ['1\n', installed, '', disabled, '', ''], error: /not listed as disabled/ },
    { outputs: ['1\n', installed, '', disabled, installed, installed], error: /still enabled/ },
  ];
  for (const { outputs, error } of cases) {
    const result = exercise(outputs);
    assert.equal(result.report.passed, false);
    assert.match(result.report.error, error);
    assert.ok(result.report.finishedAt);
    assert.deepEqual(result.reports.at(-1), result.report);
    assert.equal(result.calls.length, outputs.length);
  }
});
