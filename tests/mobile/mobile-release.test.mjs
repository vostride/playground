import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deriveMobileReleaseVersion } from '../../scripts/mobile-release-version.mjs';
import { releaseFiles, runMobileRelease } from '../../scripts/mobile-release.mjs';

const sha = 'a73919f'.padEnd(40, '0');
const timestamp = String(Date.UTC(2026, 9, 19, 1, 2, 3) / 1000);
const version = deriveMobileReleaseVersion({ sha, commitTimestamp: timestamp, runNumber: '73' });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const baseEnv = {
  CI: 'true',
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: sha,
  GITHUB_REPOSITORY: 'vostride/playground',
  GITHUB_RUN_ID: '123456',
  GITHUB_RUN_NUMBER: '73',
  GITHUB_API_URL: 'https://api.github.com',
  GITHUB_SERVER_URL: 'https://github.com',
  GH_TOKEN: 'test-token',
  GITHUB_OUTPUT: 'test-output',
  GITHUB_STEP_SUMMARY: 'test-summary',
  MOBILE_TAG: version.tag,
  PLAYGROUND_VERSION: version.version,
  PLAYGROUND_NATIVE_VERSION: version.nativeVersion,
  PLAYGROUND_BUILD_NUMBER: String(version.buildNumber),
  PLAYGROUND_IOS_BUILD_NUMBER: version.iosBuildNumber,
};

function fixture({ published = false, tag = false } = {}) {
  const names = releaseFiles(version.version);
  const binaries = { android: Buffer.from('fixture APK'), ios: Buffer.from('fixture iOS ZIP') };
  const manifest = {
    schemaVersion: 1,
    ...version,
    sourceCommit: sha,
    url: `https://github.com/vostride/playground/releases/tag/${version.tag}`,
    runUrl: 'https://github.com/vostride/playground/actions/runs/123456',
    android: { file: names.android, sha256: hash(binaries.android) },
    ios: { file: names.ios, sha256: hash(binaries.ios) },
  };
  const files = new Map();
  for (const platform of ['android', 'ios']) {
    const filename = names[platform];
    files.set(`release/${filename}`, binaries[platform]);
    files.set(
      `release/${filename}.sha256`,
      Buffer.from(`${hash(binaries[platform])}  ${filename}\n`),
    );
  }
  files.set('release/manifest.json', Buffer.from(JSON.stringify(manifest)));
  const assets = names.names.map((name, index) => {
    const bytes = files.get(`release/${name}`);
    return {
      id: index + 1,
      name,
      state: 'uploaded',
      size: bytes.length,
      digest: `sha256:${hash(bytes)}`,
    };
  });
  const release = {
    tag_name: version.tag,
    target_commitish: sha,
    draft: false,
    prerelease: false,
    published_at: '2026-10-19T02:00:00Z',
    assets,
  };
  const ref = { ref: `refs/tags/${version.tag}`, object: { type: 'commit', sha } };
  const responses = new Map([
    [`releases/tags/${version.tag}`, published ? release : null],
    [`git/ref/tags/${version.tag}`, published || tag ? ref : null],
    ['releases?per_page=100&page=1', []],
    ...assets.map((asset) => [`releases/assets/${asset.id}`, files.get(`release/${asset.name}`)]),
  ]);
  const calls = [],
    requests = [],
    writes = new Map(),
    appends = new Map();
  const state = {
    env: { ...baseEnv },
    head: sha,
    timestamp,
    files,
    responses,
    calls,
    requests,
    writes,
    appends,
    manifest,
    release,
    ref,
  };
  state.dependencies = {
    execute(command, args) {
      calls.push({ command, args });
      if (command === 'git') {
        if (args[0] === 'rev-parse') return `${state.head}\n`;
        assert.deepEqual(args, ['show', '-s', '--format=%ct', 'HEAD']);
        return `${state.timestamp}\n`;
      }
      assert.equal(command, 'gh');
      if (state.publishError) throw state.publishError;
      return `${manifest.url}\n`;
    },
    async fetchImpl(url, options) {
      const path = url.replace('https://api.github.com/repos/vostride/playground/', '');
      requests.push({ path, options });
      assert.ok(responses.has(path), `Unexpected GitHub request ${path}`);
      const value = responses.get(path);
      if (value instanceof Error) throw value;
      if (value instanceof Response) return value;
      if (value === null) return new Response('{}', { status: 404 });
      if (Buffer.isBuffer(value)) {
        assert.equal(options.headers.Accept, 'application/octet-stream');
        return new Response(value);
      }
      return Response.json(value);
    },
    async read(path) {
      assert.ok(files.has(path), `Missing fixture artifact ${path}`);
      return files.get(path);
    },
    async write(path, value) {
      writes.set(path, value);
    },
    async append(path, value) {
      appends.set(path, (appends.get(path) || '') + value);
    },
  };
  return state;
}

const run = (mode, state) => runMobileRelease(mode, state.env, state.dependencies);
const ghCalls = (state) => state.calls.filter(({ command }) => command === 'gh');

test('guards reject local execution, wrong events and checkout before network or publication', async () => {
  for (const overrides of [
    { CI: 'false' },
    { GITHUB_ACTIONS: undefined },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/other' },
    { GITHUB_REF: 'refs/tags/mobile-v1.0.0' },
    { GITHUB_SHA: 'a73919f' },
    { GITHUB_API_URL: 'https://example.com' },
    { GH_TOKEN: '' },
  ]) {
    const state = fixture();
    Object.assign(state.env, overrides);
    await assert.rejects(run('prepare', state));
    assert.equal(state.requests.length, 0);
    assert.equal(state.writes.size, 0);
    assert.equal(ghCalls(state).length, 0);
  }
  const mismatch = fixture();
  mismatch.head = 'b'.repeat(40);
  await assert.rejects(run('prepare', mismatch), /Checkout does not match/);
  assert.equal(mismatch.requests.length, 0);
});

test('new main pushes request both build and publication; dispatches are candidate-only', async () => {
  for (const event of ['push', 'workflow_dispatch']) {
    const state = fixture();
    state.env.GITHUB_EVENT_NAME = event;
    const result = await run('prepare', state);
    assert.equal(result.version, version.version);
    assert.equal(result['native-version'], version.nativeVersion);
    assert.equal(result['build-number'], version.buildNumber);
    assert.equal(result['ios-build-number'], version.iosBuildNumber);
    assert.equal(result.build, true);
    assert.equal(result.publish, event === 'push');
    assert.match(state.appends.get('test-output'), new RegExp(`publish=${event === 'push'}`));
    assert.equal(ghCalls(state).length, 0);
    assert.equal(state.writes.size, 0);
    if (event === 'workflow_dispatch')
      await assert.rejects(run('publish', state), /Publication requires a push to main/);
  }
});

test('an identical published release skips automatic builds without mutation, but permits manual candidates', async () => {
  const state = fixture({ published: true });
  // A new workflow invocation may have a different build number; immutable
  // published identity is the source SHA, version, tag and verified assets.
  state.env.GITHUB_RUN_NUMBER = '74';
  const result = await run('prepare', state);
  assert.equal(result.build, false);
  assert.equal(result.publish, false);
  assert.equal(state.requests.filter(({ path }) => /^releases\/assets\//.test(path)).length, 3);
  assert.equal(ghCalls(state).length, 0);
  assert.equal(state.writes.size, 0);
  const candidate = fixture({ published: true });
  candidate.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
  const output = await run('prepare', candidate);
  assert.equal(output.build, true);
  assert.equal(output.publish, false);
});

test('tag collisions, annotated tags, missing refs and draft or inconsistent releases fail closed', async () => {
  const mutations = [
    (state) => {
      state.ref.object.sha = 'b'.repeat(40);
    },
    (state) => {
      state.ref.object.type = 'tag';
    },
    (state) => {
      state.responses.set(`git/ref/tags/${version.tag}`, null);
    },
    (state) => {
      state.release.target_commitish = 'main';
    },
    (state) => {
      state.release.draft = true;
    },
    (state) => {
      state.release.prerelease = true;
    },
  ];
  for (const mutate of mutations) {
    const state = fixture({ published: true });
    mutate(state);
    await assert.rejects(run('prepare', state));
    assert.equal(state.appends.size, 0);
    assert.equal(ghCalls(state).length, 0);
  }
  const draft = fixture();
  draft.responses.set('releases?per_page=100&page=1', [draft.release]);
  await assert.rejects(run('prepare', draft), /matching draft or inconsistent release/);
});

test('draft discovery follows pagination and every non-404 API failure aborts', async () => {
  const paged = fixture();
  paged.responses.set(
    'releases?per_page=100&page=1',
    Array.from({ length: 100 }, (_, index) => ({ tag_name: `other-${index}` })),
  );
  paged.responses.set('releases?per_page=100&page=2', [{ tag_name: version.tag, draft: true }]);
  await assert.rejects(run('prepare', paged), /matching draft/);
  for (const path of [
    `releases/tags/${version.tag}`,
    `git/ref/tags/${version.tag}`,
    'releases?per_page=100&page=1',
  ]) {
    for (const status of [401, 403, 429, 500]) {
      const state = fixture();
      state.responses.set(path, new Response('{}', { status }));
      await assert.rejects(run('prepare', state), new RegExp(`HTTP ${status}`));
      assert.equal(state.appends.size, 0);
      assert.equal(ghCalls(state).length, 0);
    }
  }
});

test('existing releases require all uploaded assets and independently consistent checksum metadata', async () => {
  const corruptions = [
    (state) => {
      state.release.assets.pop();
    },
    (state) => {
      state.release.assets[0].state = 'new';
    },
    (state) => {
      state.release.assets[0].digest = null;
    },
    (state) => {
      state.release.assets[0].digest = `sha256:${'c'.repeat(64)}`;
    },
    (state) => {
      state.responses.set('releases/assets/2', Buffer.from('wrong sidecar'));
    },
    (state) => {
      const bytes = Buffer.from(
        JSON.stringify({ ...state.manifest, sourceCommit: 'b'.repeat(40) }),
      );
      state.responses.set('releases/assets/5', bytes);
      Object.assign(state.release.assets[4], {
        size: bytes.length,
        digest: `sha256:${hash(bytes)}`,
      });
    },
  ];
  for (const corrupt of corruptions) {
    const state = fixture({ published: true });
    corrupt(state);
    await assert.rejects(run('prepare', state));
    assert.equal(state.appends.size, 0);
    assert.equal(ghCalls(state).length, 0);
  }
});

test('publish validates every prepared version field and rechecks remote absence', async () => {
  for (const name of [
    'MOBILE_TAG',
    'PLAYGROUND_VERSION',
    'PLAYGROUND_NATIVE_VERSION',
    'PLAYGROUND_BUILD_NUMBER',
    'PLAYGROUND_IOS_BUILD_NUMBER',
  ]) {
    const state = fixture();
    state.env[name] = 'incorrect';
    await assert.rejects(run('publish', state), new RegExp(name));
    assert.equal(state.requests.length, 0);
    assert.equal(ghCalls(state).length, 0);
  }
  const existing = fixture({ published: true });
  await assert.rejects(run('publish', existing), /Refusing to replace/);
  assert.equal(existing.writes.size, 0);
  assert.equal(ghCalls(existing).length, 0);
});

test('publication checks both binary hashes and exact sidecar filenames before writing or uploading', async () => {
  for (const platform of ['android', 'ios']) {
    const filename = releaseFiles(version.version)[platform];
    for (const mutation of ['missing', 'empty', 'changed', 'wrong-filename', 'extra-checksum']) {
      const state = fixture();
      if (mutation === 'missing') state.files.delete(`release/${filename}`);
      if (mutation === 'empty') state.files.set(`release/${filename}`, Buffer.alloc(0));
      if (mutation === 'changed')
        state.files.set(`release/${filename}`, Buffer.from('changed artifact'));
      if (mutation === 'wrong-filename')
        state.files.set(
          `release/${filename}.sha256`,
          Buffer.from(`${'a'.repeat(64)}  other.apk\n`),
        );
      if (mutation === 'extra-checksum')
        state.files.set(
          `release/${filename}.sha256`,
          Buffer.concat([state.files.get(`release/${filename}.sha256`), Buffer.from('extra\n')]),
        );
      await assert.rejects(run('publish', state));
      assert.equal(state.writes.size, 0);
      assert.equal(ghCalls(state).length, 0);
    }
  }
});

test('publish creates the exact full-SHA release with five assets and no overwrite operations', async () => {
  for (const tag of [false, true]) {
    const state = fixture({ tag });
    const manifest = await run('publish', state);
    assert.equal(manifest.sourceCommit, sha);
    assert.equal(manifest.tag, version.tag);
    assert.deepEqual(manifest.android, state.manifest.android);
    assert.deepEqual(manifest.ios, state.manifest.ios);
    assert.deepEqual(JSON.parse(state.writes.get('release/manifest.json')), manifest);
    assert.ok(state.appends.get('test-summary').includes(manifest.url));
    const notes = state.writes.get('release-notes.md');
    for (const text of [
      'Komazon',
      'Looking',
      'Brello',
      'PepaPog',
      'adb install',
      'simulators only',
      'gh attestation verify',
    ])
      assert.ok(notes.includes(text));
    assert.deepEqual(ghCalls(state), [
      {
        command: 'gh',
        args: [
          'release',
          'create',
          version.tag,
          ...releaseFiles(version.version).names.map((name) => `release/${name}`),
          '--repo',
          'vostride/playground',
          '--target',
          sha,
          '--title',
          `Playground ${version.version}`,
          '--notes-file',
          'release-notes.md',
        ],
      },
    ]);
  }
});

test('a failed gh upload is surfaced and never retried with edit or clobber', async () => {
  const state = fixture();
  state.publishError = new Error('upload failed');
  await assert.rejects(run('publish', state), /upload failed/);
  assert.equal(ghCalls(state).length, 1);
  assert.equal(state.appends.size, 0);
});
