import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeAnalyticsIdentity } from '@vostride/agent-qa-core';

export const profileName = 'playground-codex';
const root = fileURLToPath(new URL('../../', import.meta.url));

export function selectCredential(raw) {
  let store;
  try {
    store = JSON.parse(raw);
  } catch {
    throw new Error('The agent-qa auth file must be valid JSON.');
  }
  const credential = store?.[profileName];
  assert.ok(credential?.type === 'oauth', `Authenticate the ${profileName} profile first.`);
  assert.ok(
    credential.provider === 'openai-subscription-oauth',
    'Use the OpenAI subscription provider.',
  );
  const { access, refresh, expires, accountId } = credential.tokens || {};
  assert.ok(typeof access === 'string' && access.length > 0, 'Missing OAuth access token.');
  assert.ok(typeof refresh === 'string' && refresh.length > 0, 'Missing OAuth refresh token.');
  assert.ok(Number.isFinite(expires) && expires > 0, 'Missing OAuth expiry.');
  assert.ok(
    accountId === undefined || typeof accountId === 'string',
    'Invalid account identifier.',
  );
  return {
    [profileName]: {
      type: 'oauth',
      provider: credential.provider,
      tokens: {
        access,
        refresh,
        expires,
        ...(accountId ? { accountId } : {}),
      },
    },
  };
}

function ciDirectory() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'CI auth preparation requires GitHub Actions.');
  assert.ok(process.env.RUNNER_TEMP, 'RUNNER_TEMP is required.');
  const directory = resolve(process.env.RUNNER_TEMP, 'playground-agent-qa-auth');
  assert.equal(
    resolve(process.env.XDG_DATA_HOME || '.'),
    directory,
    'Use the dedicated runner auth directory.',
  );
  return directory;
}

async function save(directory, store) {
  await mkdir(join(directory, 'agent-qa'), { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await chmod(join(directory, 'agent-qa'), 0o700);
  const file = join(directory, 'agent-qa/auth.json');
  await writeFile(file, JSON.stringify(store), { mode: 0o600 });
  await chmod(file, 0o600);
}

function mask(store) {
  for (const value of Object.values(store[profileName].tokens)) {
    if (typeof value === 'string') {
      const escaped = value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
      console.log(`::add-mask::${escaped}`);
    }
  }
}

function redactText(text, values) {
  for (const value of values) text = text.replaceAll(value, '[REDACTED]');
  return text.replace(
    /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
    '[REDACTED JWT]',
  );
}

export function sanitizeReportBytes(bytes, values, relativePath = '(unspecified)') {
  let text;
  let format = 'invalid-utf8';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.includes(0)) {
      text = undefined;
      format = 'utf8-with-nul';
    }
  } catch {
    /* Binary evidence must remain byte-for-byte unchanged. */
  }
  if (text === undefined) {
    // Report location and classification only, never a byte/header preview. A
    // filename can itself contain secrets or terminal controls, so scrub it
    // exactly like text evidence before formatting it as a single safe line.
    const path = JSON.stringify(redactText(relativePath, values)).replace(
      /[^\u0020-\u007e]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    const context = `path=${path}; format=${format}; bytes=${bytes.length}`;
    for (const value of values) {
      assert.ok(
        !bytes.includes(Buffer.from(value)),
        `Credential bytes found in binary evidence; refusing upload (${context}).`,
      );
    }
    const supported =
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
      (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') ||
      bytes.toString('ascii', 4, 8) === 'ftyp' ||
      bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
    assert.ok(supported, `Unexpected binary report format; refusing upload (${context}).`);
    return bytes;
  }
  return Buffer.from(redactText(text, values));
}

async function sanitizeReports(directory) {
  const values = new Set();
  for (const raw of [
    process.env.AGENT_QA_AUTH_JSON,
    await readFile(join(directory, 'agent-qa/auth.json'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }),
  ]) {
    if (!raw) continue;
    const store = selectCredential(raw);
    mask(store);
    for (const value of Object.values(store[profileName].tokens)) {
      if (typeof value === 'string' && value.length > 3) values.add(value);
    }
  }
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      const file = join(path, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'Reports must not contain symlinks.');
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        assert.ok(!/^auth\.json$/i.test(entry.name), 'An auth file must never be uploaded.');
        const bytes = await readFile(file);
        await writeFile(file, sanitizeReportBytes(bytes, values, relative(root, file)));
      }
    }
  }
  await visit(resolve(root, 'tests/agent-qa/reports'));
  // The CI cache contains observations only; scrub it before persistence as well.
  await visit(resolve(root, '.agent-qa/memory'));
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'export') {
    const source = process.env.XDG_DATA_HOME
      ? join(process.env.XDG_DATA_HOME, 'agent-qa/auth.json')
      : join(homedir(), '.agent-qa/auth.json');
    const store = selectCredential(await readFile(source, 'utf8'));
    await save(resolve(root, 'tests/agent-qa/.auth-data'), store);
    console.log(
      'Exported only playground-codex to tests/agent-qa/.auth-data/agent-qa/auth.json (mode 0600).',
    );
    return;
  }
  const directory = ciDirectory();
  if (mode === 'prepare') {
    assert.ok(
      /^u_([a-z]+-){9}[a-z]+$/.test(process.env.AGENT_QA_ANALYTICS_ID || ''),
      'Configure the persistent AGENT_QA_ANALYTICS_ID repository variable.',
    );
    assert.ok(process.env.AGENT_QA_AUTH_JSON, 'Configure the AGENT_QA_AUTH_JSON Actions secret.');
    const store = selectCredential(process.env.AGENT_QA_AUTH_JSON);
    mask(store);
    await save(directory, store);
    await writeAnalyticsIdentity(
      process.env.AGENT_QA_ANALYTICS_ID,
      join(directory, 'agent-qa/analytics.json'),
      true,
    );
    console.log('Prepared the isolated agent-qa subscription credential.');
    console.log('Prepared the persistent internal CI analytics identity.');
  } else if (mode === 'sanitize-reports') {
    await sanitizeReports(directory);
  } else if (mode === 'cleanup') {
    await rm(directory, { recursive: true, force: true });
    console.log('Removed the runner auth directory.');
  } else {
    throw new Error('Choose export, prepare, sanitize-reports, or cleanup.');
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
