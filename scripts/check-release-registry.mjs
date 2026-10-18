import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const current = JSON.parse(await readFile('releases.json', 'utf8'));
const base = process.argv[2];
if (!base) console.log('Registry schema check only (no base revision supplied).');
else {
  execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { stdio: 'ignore' });
  const exists = execFileSync('git', ['ls-tree', '--name-only', base, '--', 'releases.json'], {
    encoding: 'utf8',
  }).trim();
  if (exists) {
    const previous = JSON.parse(
      execFileSync('git', ['show', `${base}:releases.json`], { encoding: 'utf8' }),
    );
    for (const kind of ['web', 'mobile'])
      for (const entry of previous[kind] || []) {
        if (kind === 'web' && entry.status !== 'released') continue;
        const next = current[kind].find((e) => e.id === entry.id);
        if (!next || JSON.stringify(next) !== JSON.stringify(entry))
          throw new Error(
            `Released ${kind} entry ${entry.id} is immutable. Add a new path/version.`,
          );
      }
  } else console.log('First registry on this branch.');
}
if (current.schemaVersion !== 1 || !Array.isArray(current.web) || !Array.isArray(current.mobile))
  throw new Error('Invalid release registry schema.');
const ids = new Set(),
  paths = new Set();
for (const entry of current.web) {
  if (
    !entry.id ||
    ids.has(entry.id) ||
    !entry.name ||
    !entry.path?.startsWith('/') ||
    paths.has(entry.path) ||
    !entry.testFile ||
    !entry.flows?.length ||
    !['candidate', 'released'].includes(entry.status)
  )
    throw new Error(`Invalid sample contract ${entry.id}`);
  ids.add(entry.id);
  paths.add(entry.path);
  const source = await readFile(entry.testFile);
  if (
    entry.status === 'released' &&
    createHash('sha256').update(source).digest('hex') !== entry.testSha256
  )
    throw new Error(
      `Released test contract ${entry.id} changed or lacks its SHA-256. Keep released tests intact.`,
    );
}
for (const entry of current.mobile) {
  if (
    !entry.id ||
    ids.has(entry.id) ||
    !/^mobile-v\d+\.\d+\.\d+$/.test(entry.tag) ||
    !entry.url ||
    !entry.android?.file ||
    !entry.ios?.file ||
    ![entry.android.sha256, entry.ios.sha256].every((v) => /^[a-f0-9]{64}$/.test(v))
  )
    throw new Error(`Invalid mobile release ${entry.id}`);
  ids.add(entry.id);
}
console.log('Release registry valid.');
