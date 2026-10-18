import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import YAML from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = YAML.parse(await readFile(resolve(root, 'agent-qa.ci.generated.yaml'), 'utf8'));
const platform = Object.values(config.registry.targets)[0].platform;
const reportDir = resolve(root, 'tests/agent-qa/reports');
await mkdir(reportDir, { recursive: true });
const args = [
  resolve(root, 'node_modules/agent-qa/dist/cli.js'),
  '--config',
  'agent-qa.ci.generated.yaml',
  'run',
  '--no-cache',
  '--junit-output',
  'tests/agent-qa/reports/junit.xml',
  '--screenshot-dir',
  'tests/agent-qa/reports/screenshots',
  ...(platform === 'web' ? [] : ['--device', 'playground-ci']),
];
const start = new Date().toISOString();
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
const result = await new Promise((resolveResult) => {
  child.on('error', () => resolveResult({ exitCode: 1, signal: null, launchError: true }));
  child.on('exit', (code, signal) => resolveResult({ exitCode: code ?? 1, signal }));
});
await writeFile(
  resolve(reportDir, 'status.json'),
  JSON.stringify(
    {
      advisory: true,
      agentQaVersion: '0.1.21',
      model: 'gpt-6.1-sol',
      platform,
      sourceCommit: process.env.PLAYGROUND_SOURCE_SHA || null,
      startedAt: start,
      completedAt: new Date().toISOString(),
      ...result,
    },
    null,
    2,
  ) + '\n',
);
// Keep the actual result. Only the separate CI workflow makes it non-blocking.
process.exitCode = result.exitCode;
