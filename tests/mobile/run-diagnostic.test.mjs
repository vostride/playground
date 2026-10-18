import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnosticCommands, runDiagnostics } from './run-diagnostic.mjs';

function exercise(results, platform = 'android') {
  if (platform === 'android') results = [{ status: 0 }, ...results];
  const calls = [];
  const reports = [];
  const exitCode = runDiagnostics(
    { platform, device: 'test-device', scenario: 'tasks' },
    {
      execute(command, args) {
        calls.push({ command, args });
        const result = results[calls.length - 1];
        if (result instanceof Error) throw result;
        return result;
      },
      save: (report) => reports.push(structuredClone(report)),
    },
  );
  return { exitCode, calls, reports, final: reports.at(-1) };
}

test('Maestro failure still runs drag and retains both results', () => {
  const result = exercise([{ status: 7 }, { status: 0 }]);
  assert.equal(result.calls.length, 3);
  assert.equal(result.calls[0].args[0], 'tests/mobile/android-emulator.mjs');
  assert.equal(result.calls[1].command, 'maestro');
  assert.equal(result.calls[2].args[0], 'tests/mobile/android-drag.mjs');
  assert.deepEqual(
    result.final.commands.map(({ name, status }) => [name, status]),
    [
      ['emulator-prepare', 0],
      ['maestro', 7],
      ['drag', 0],
    ],
  );
  assert(
    result.reports.some(
      (report) =>
        !report.completed && report.commands.length === 2 && report.commands[1].status === 7,
    ),
  );
  assert.equal(result.final.completed, true);
  assert.equal(result.final.passed, false);
  assert.equal(result.exitCode, 1);
});

test('drag failure prevents success even when Maestro passes', () => {
  const passed = exercise([{ status: 0 }, { status: 0 }], 'ios');
  assert.equal(passed.exitCode, 0);
  assert.equal(passed.final.passed, true);
  const failed = exercise([{ status: 0 }, { status: 9 }], 'ios');
  assert.equal(failed.calls[1].command, 'xcodebuild');
  assert.deepEqual(
    failed.final.commands.map(({ passed }) => passed),
    [true, false],
  );
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.final.passed, false);
});

test('spawn failures are recorded without losing drag evidence', () => {
  const error = new Error('Maestro could not start');
  for (const failure of [error, { status: null, error }]) {
    const result = exercise([failure, { status: 0 }]);
    assert.equal(result.calls.length, 3);
    assert.match(result.final.commands[1].error, /Maestro could not start/);
    assert.equal(result.final.commands[1].status, null);
    assert.deepEqual(
      result.final.commands.map(({ passed }) => passed),
      [true, false, true],
    );
    assert.equal(result.exitCode, 1);
  }
});

test('a process killed by a signal cannot pass', () => {
  const result = exercise([{ status: 0 }, { status: null, signal: 'SIGTERM' }]);
  assert.equal(result.final.commands[2].signal, 'SIGTERM');
  assert.equal(result.final.commands[2].passed, false);
  assert.equal(result.final.passed, false);
  assert.equal(result.exitCode, 1);
});

test('an invalid scenario cannot execute commands or create a passing report', () => {
  for (const scenario of ['../flows/other.yaml', '__proto__']) {
    let executions = 0;
    let reports = 0;
    assert.throws(
      () =>
        runDiagnostics(
          { platform: 'android', device: 'test-device', scenario },
          {
            execute: () => {
              executions++;
              return { status: 0 };
            },
            save: () => {
              reports++;
            },
          },
        ),
      /supported diagnostic scenario/,
    );
    assert.equal(executions, 0);
    assert.equal(reports, 0);
  }
});

test('full Android acceptance requires offline evidence before and after product checks', () => {
  for (const failedCommand of [-1, 1, 4]) {
    const calls = [];
    let final;
    const exitCode = runDiagnostics(
      { platform: 'android', device: 'emulator-5554', scenario: 'all' },
      {
        execute(command, args) {
          const index = calls.length;
          calls.push({ command, args });
          return { status: index === failedCommand ? 1 : 0 };
        },
        save(report) {
          final = structuredClone(report);
        },
      },
    );
    assert.deepEqual(
      final.commands.map(({ name }) => name),
      ['emulator-prepare', 'offline-start', 'maestro', 'drag', 'offline-end'],
    );
    assert.equal(calls[0].args[0], 'tests/mobile/android-emulator.mjs');
    assert.equal(calls[1].args.at(-1), 'configure');
    assert.equal(calls[4].args.at(-1), 'verify');
    assert.equal(exitCode, failedCommand === -1 ? 0 : 1);
    assert.equal(final.passed, failedCommand === -1);
  }
});

test('every Android scenario prepares the CI emulator before other device operations', () => {
  for (const scenario of ['all', 'shop', 'flights', 'tasks', 'observability', 'controls', 'drag']) {
    const commands = diagnosticCommands({ platform: 'android', device: 'emulator-5554', scenario });
    assert.deepEqual(commands[0], {
      name: 'emulator-prepare',
      command: process.execPath,
      args: ['tests/mobile/android-emulator.mjs', 'emulator-5554'],
    });
  }
});

test('a failed preparation blocks later device operations and cannot create a passing report', () => {
  for (const failure of [
    { status: 1 },
    { status: null, signal: 'SIGTERM' },
    new Error('Cannot prepare'),
  ]) {
    let final;
    let calls = 0;
    const exitCode = runDiagnostics(
      { platform: 'android', device: 'emulator-5554', scenario: 'all' },
      {
        execute() {
          calls++;
          if (failure instanceof Error) throw failure;
          return failure;
        },
        save(report) {
          final = structuredClone(report);
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(final.blockedBy, 'emulator-prepare');
    assert.deepEqual(final.notRun, ['offline-start', 'maestro', 'drag', 'offline-end']);
    assert.equal(final.completed, true);
    assert.equal(final.passed, false);
    assert.equal(exitCode, 1);
  }
});

test('iOS full acceptance retains offline evidence and cannot pass a failed offline check', () => {
  for (const scenario of ['all', 'offline']) {
    let final;
    const calls = [];
    const exitCode = runDiagnostics(
      { platform: 'ios', device: 'test-simulator', scenario },
      {
        execute(command, args) {
          calls.push({ command, args });
          return { status: args[0] === 'tests/mobile/ios/offline-run.mjs' ? 1 : 0 };
        },
        save(report) {
          final = structuredClone(report);
        },
      },
    );
    assert.deepEqual(
      final.commands.map(({ name }) => name),
      scenario === 'all' ? ['maestro', 'drag', 'offline'] : ['offline'],
    );
    assert.equal(calls.at(-1).args[0], 'tests/mobile/ios/offline-run.mjs');
    assert.equal(final.passed, false);
    assert.equal(exitCode, 1);
  }
  assert.throws(
    () => runDiagnostics({ platform: 'android', device: 'emulator-5554', scenario: 'offline' }),
    /iOS-only/,
  );
});
