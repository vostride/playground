import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function isMobileReleaseTag(tag) {
  if (typeof tag !== 'string' || tag.trim() !== tag) return false;
  // Existing published versions retain their original contract.
  if (/^mobile-v\d+\.\d+\.\d+$/.test(tag)) return true;
  const match = /^mobile-(\d{2})\.(\d{2})\.(\d{2})-[a-f0-9]{7}$/.exec(tag);
  if (!match) return false;
  const year = 2000 + Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export async function validateReleaseRegistry(current, { previous, readTestFile = readFile } = {}) {
  if (current.schemaVersion !== 1 || !Array.isArray(current.web) || !Array.isArray(current.mobile))
    throw new Error('Invalid release registry schema.');
  if (previous) {
    for (const kind of ['web', 'mobile'])
      for (const entry of previous[kind] || []) {
        if (kind === 'web' && entry.status !== 'released') continue;
        const next = current[kind].find((e) => e.id === entry.id);
        if (!next || JSON.stringify(next) !== JSON.stringify(entry))
          throw new Error(
            `Released ${kind} entry ${entry.id} is immutable. Add a new path/version.`,
          );
      }
  }
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
    const source = await readTestFile(entry.testFile);
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
      !isMobileReleaseTag(entry.tag) ||
      !entry.url ||
      !entry.android?.file ||
      !entry.ios?.file ||
      ![entry.android.sha256, entry.ios.sha256].every((v) => /^[a-f0-9]{64}$/.test(v))
    )
      throw new Error(`Invalid mobile release ${entry.id}`);
    ids.add(entry.id);
  }
}

export async function checkReleaseRegistry(base) {
  const current = JSON.parse(await readFile('releases.json', 'utf8'));
  let previous;
  if (!base) console.log('Registry schema check only (no base revision supplied).');
  else {
    execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { stdio: 'ignore' });
    const exists = execFileSync('git', ['ls-tree', '--name-only', base, '--', 'releases.json'], {
      encoding: 'utf8',
    }).trim();
    if (exists) {
      previous = JSON.parse(
        execFileSync('git', ['show', `${base}:releases.json`], { encoding: 'utf8' }),
      );
    } else console.log('First registry on this branch.');
  }
  await validateReleaseRegistry(current, { previous });
  console.log('Release registry valid.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await checkReleaseRegistry(process.argv[2]);
}
