import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const registry = JSON.parse(await readFile(new URL('../releases.json', import.meta.url), 'utf8'));
const entries = registry.web;
if (!entries.length) throw new Error('The release registry must contain at least one sample flow.');
const paths = new Set();
const files = new Set(['tests/e2e/shell.spec.ts']);
for (const entry of entries) {
  if (
    !entry.id ||
    !entry.name ||
    !entry.path ||
    !entry.flows?.length ||
    !['candidate', 'released'].includes(entry.status)
  )
    throw new Error(`Invalid registry entry ${entry.id}`);
  if (paths.has(entry.path)) throw new Error(`Duplicate released path ${entry.path}`);
  paths.add(entry.path);
  await access(entry.testFile);
  files.add(entry.testFile);
}
const url = process.env.PLAYGROUND_URL || process.env.PLAYGROUND_BASE_URL;
console.log(
  `Checking ${entries.length} registered apps (${entries.filter((e) => e.status === 'released').length} released) at ${url || 'local preview'}.`,
);
const result = spawnSync(
  'npx',
  ['--no-install', 'playwright', 'test', ...files, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, ...(url ? { PLAYGROUND_URL: url } : {}), PLAYWRIGHT_HTML_OPEN: 'never' },
    shell: process.platform === 'win32',
  },
);
await mkdir('test-results', { recursive: true });
await writeFile(
  'test-results/site-check.json',
  JSON.stringify(
    {
      baseURL: url || 'http://127.0.0.1:4173',
      passed: result.status === 0,
      apps: entries.map(({ id, path, status, flows }) => ({ id, path, status, flows })),
    },
    null,
    2,
  ),
);
process.exit(result.status ?? 1);
