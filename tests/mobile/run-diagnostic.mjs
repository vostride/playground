import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scenarios = {
  all: { flow: 'tests/mobile/flows/', drag: true },
  shop: { flow: 'tests/mobile/flows/01-shop-checkout.yaml', drag: false },
  flights: { flow: 'tests/mobile/flows/02-flights-booking.yaml', drag: false },
  tasks: { flow: 'tests/mobile/flows/03-tasks-workflow.yaml', drag: true },
  observability: { flow: 'tests/mobile/flows/04-vigil-monitor.yaml', drag: false },
  controls: { flow: 'tests/mobile/flows/05-controls-deeplinks.yaml', drag: false },
  drag: { flow: '', drag: true },
  offline: { flow: '', drag: false },
};

export function diagnosticSelection(scenario) {
  if (!Object.hasOwn(scenarios, scenario))
    throw new Error('Select a supported diagnostic scenario.');
  return { ...scenarios[scenario] };
}

export function diagnosticCommands({ platform, device, scenario }) {
  if (!['android', 'ios'].includes(platform) || typeof device !== 'string' || !device.trim()) {
    throw new Error('A supported platform and device ID are required.');
  }
  const selection = diagnosticSelection(scenario);
  if (scenario === 'offline' && platform !== 'ios') {
    throw new Error('The focused offline smoke is iOS-only; Android all includes offline checks.');
  }
  const directory = `maestro-reports/${platform}`;
  const commands = [];
  if (platform === 'android' && scenario === 'all') {
    commands.push({
      name: 'offline-start',
      command: process.execPath,
      args: ['tests/mobile/android-offline.mjs', device, 'configure'],
    });
  }
  if (selection.flow) {
    commands.push({
      name: 'maestro',
      command: 'maestro',
      args: [
        '--device',
        device,
        'test',
        '--format',
        'JUNIT',
        '--output',
        `${directory}/results.xml`,
        '--debug-output',
        `${directory}/debug`,
        '--test-output-dir',
        `${directory}/artifacts`,
        selection.flow,
      ],
    });
  }
  if (selection.drag) {
    commands.push(
      platform === 'android'
        ? {
            name: 'drag',
            command: process.execPath,
            args: ['tests/mobile/android-drag.mjs', device],
          }
        : {
            name: 'drag',
            command: 'xcodebuild',
            args: [
              'test',
              '-project',
              'tests/mobile/ios/CorkboardGestures.xcodeproj',
              '-scheme',
              'CorkboardGestures',
              '-configuration',
              'Debug',
              '-sdk',
              'iphonesimulator',
              '-destination',
              `platform=iOS Simulator,id=${device}`,
              '-parallel-testing-enabled',
              'NO',
              '-maximum-concurrent-test-simulator-destinations',
              '1',
              '-derivedDataPath',
              `${directory}/gesture-build`,
              '-resultBundlePath',
              `${directory}/corkboard-gestures.xcresult`,
              'CODE_SIGNING_ALLOWED=NO',
              'CODE_SIGNING_REQUIRED=NO',
            ],
          },
    );
  }
  if (platform === 'android' && scenario === 'all') {
    commands.push({
      name: 'offline-end',
      command: process.execPath,
      args: ['tests/mobile/android-offline.mjs', device, 'verify'],
    });
  }
  if (platform === 'ios' && ['all', 'offline'].includes(scenario)) {
    commands.push({
      name: 'offline',
      command: process.execPath,
      args: ['tests/mobile/ios/offline-run.mjs', device],
    });
  }
  return commands;
}

export function runDiagnostics(options, { execute = spawnSync, save = saveReport } = {}) {
  const commands = diagnosticCommands(options);
  const report = {
    ...options,
    startedAt: new Date().toISOString(),
    completed: false,
    passed: false,
    commands: [],
  };
  save(report);
  for (const command of commands) {
    const startedAt = new Date().toISOString();
    let result;
    try {
      result = execute(command.command, command.args, { stdio: 'inherit' });
    } catch (error) {
      result = { status: null, error };
    }
    report.commands.push({
      ...command,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: result.status ?? null,
      signal: result.signal ?? null,
      error: result.error ? String(result.error) : null,
      passed: result.status === 0 && !result.error && !result.signal,
    });
    save(report);
  }
  report.completed = true;
  report.passed = report.commands.every((command) => command.passed);
  report.finishedAt = new Date().toISOString();
  save(report);
  return report.passed ? 0 : 1;
}

function saveReport(report) {
  const directory = `maestro-reports/${report.platform}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/diagnostic-status.json`, JSON.stringify(report, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [, , platform, device, scenario = 'all'] = process.argv;
    process.exitCode = runDiagnostics({ platform, device, scenario });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
