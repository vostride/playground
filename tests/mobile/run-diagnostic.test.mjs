import assert from 'node:assert/strict';
import test from 'node:test';
import { runDiagnostics } from './run-diagnostic.mjs';

function exercise(results, platform = 'android') {
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
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[0].command, 'maestro');
  assert.equal(result.calls[1].args[0], 'tests/mobile/android-drag.mjs');
  assert.deepEqual(
    result.final.commands.map(({ name, status }) => [name, status]),
    [
      ['maestro', 7],
      ['drag', 0],
    ],
  );
  assert(
    result.reports.some(
      (report) =>
        !report.completed && report.commands.length === 1 && report.commands[0].status === 7,
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
    assert.equal(result.calls.length, 2);
    assert.match(result.final.commands[0].error, /Maestro could not start/);
    assert.equal(result.final.commands[0].status, null);
    assert.deepEqual(
      result.final.commands.map(({ passed }) => passed),
      [false, true],
    );
    assert.equal(result.exitCode, 1);
  }
});

test('a process killed by a signal cannot pass', () => {
  const result = exercise([{ status: 0 }, { status: null, signal: 'SIGTERM' }]);
  assert.equal(result.final.commands[1].signal, 'SIGTERM');
  assert.equal(result.final.commands[1].passed, false);
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
  for (const failedCommand of [-1, 0, 3]) {
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
      ['offline-start', 'maestro', 'drag', 'offline-end'],
    );
    assert.equal(calls[0].args.at(-1), 'configure');
    assert.equal(calls[3].args.at(-1), 'verify');
    assert.equal(exitCode, failedCommand === -1 ? 0 : 1);
    assert.equal(final.passed, failedCommand === -1);
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
