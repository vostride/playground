import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deriveMobileReleaseVersion } from './mobile-release-version.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function releaseContext(mode, env, execute = execFileSync) {
  assert.ok(['prepare', 'publish'].includes(mode), 'Select prepare or publish.');
  assert.equal(env.CI, 'true', 'Mobile releases only run in CI.');
  assert.equal(env.GITHUB_ACTIONS, 'true', 'GitHub Actions is required.');
  const automatic = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main';
  assert.ok(
    automatic || (mode === 'prepare' && env.GITHUB_EVENT_NAME === 'workflow_dispatch'),
    'Publication requires a push to main; manual dispatch only prepares candidates.',
  );
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/, 'A full source commit SHA is required.');
  assert.match(
    env.GITHUB_REPOSITORY || '',
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    'A repository is required.',
  );
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9]\d*$/, 'A GitHub run ID is required.');
  assert.equal(env.GITHUB_API_URL, 'https://api.github.com', 'Use the GitHub API origin.');
  assert.equal(env.GITHUB_SERVER_URL, 'https://github.com', 'Use the GitHub server origin.');
  assert.ok(env.GH_TOKEN, 'An authenticated repository token is required.');
  const git = (...args) => execute('git', args, { encoding: 'utf8', timeout: 15000 }).trim();
  assert.equal(
    git('rev-parse', '--verify', 'HEAD^{commit}'),
    env.GITHUB_SHA,
    'Checkout does not match GITHUB_SHA.',
  );
  const version = deriveMobileReleaseVersion({
    sha: env.GITHUB_SHA,
    commitTimestamp: git('show', '-s', '--format=%ct', 'HEAD'),
    runNumber: env.GITHUB_RUN_NUMBER,
  });
  if (mode === 'publish') {
    for (const [name, expected] of Object.entries({
      MOBILE_TAG: version.tag,
      PLAYGROUND_VERSION: version.version,
      PLAYGROUND_NATIVE_VERSION: version.nativeVersion,
      PLAYGROUND_BUILD_NUMBER: version.buildNumber,
      PLAYGROUND_IOS_BUILD_NUMBER: version.iosBuildNumber,
    }))
      assert.equal(
        env[name],
        String(expected),
        `${name} differs from the prepared commit version.`,
      );
  }
  return {
    ...version,
    sourceCommit: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    automatic,
    url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/releases/tag/${version.tag}`,
    runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
  };
}

export function releaseFiles(version) {
  const android = `playground-android-${version}.apk`;
  const ios = `playground-ios-simulator-${version}.zip`;
  return {
    android,
    ios,
    names: [android, `${android}.sha256`, ios, `${ios}.sha256`, 'manifest.json'],
  };
}

function githubClient(env, fetchImpl) {
  return async (path, { absent = false, binary = false } = {}) => {
    const response = await fetchImpl(
      `${env.GITHUB_API_URL}/repos/${env.GITHUB_REPOSITORY}/${path}`,
      {
        headers: {
          Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
          Authorization: `Bearer ${env.GH_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (absent && response.status === 404) return null;
    assert.equal(response.status, 200, `GitHub ${path} failed: HTTP ${response.status}.`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
}

export async function inspectRelease(context, request) {
  const [release, ref] = await Promise.all([
    request(`releases/tags/${context.tag}`, { absent: true }),
    request(`git/ref/tags/${context.tag}`, { absent: true }),
  ]);
  if (ref) {
    assert.equal(ref.ref, `refs/tags/${context.tag}`, 'GitHub returned a different tag.');
    assert.equal(ref.object?.type, 'commit', 'Only a lightweight release tag is accepted.');
    assert.equal(
      ref.object.sha,
      context.sourceCommit,
      'Release tag points to a different full source SHA.',
    );
  }
  if (release) {
    assert.ok(ref, 'An existing release is missing its source tag.');
    assert.equal(release.tag_name, context.tag, 'GitHub returned a different release.');
    assert.equal(
      release.target_commitish,
      context.sourceCommit,
      'Release target is not the exact source SHA.',
    );
    assert.equal(release.draft, false, 'An existing draft cannot be replaced.');
    assert.equal(release.prerelease, false, 'An existing prerelease cannot be replaced.');
    assert.ok(release.published_at, 'The existing release is not published.');
    return release;
  }
  // The tag endpoint documents published releases only. A partial gh upload
  // can leave a draft without a tag; list with a token that has push access.
  // https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name
  for (let page = 1; page <= 100; page++) {
    const releases = await request(`releases?per_page=100&page=${page}`);
    assert.ok(Array.isArray(releases), 'Invalid release list response.');
    assert.ok(
      !releases.some((entry) => entry.tag_name === context.tag),
      'A matching draft or inconsistent release already exists.',
    );
    if (releases.length < 100) return null;
  }
  throw new Error('Could not finish checking existing draft releases within 100 pages.');
}

export function parseChecksum(bytes, filename) {
  const match = /^([a-f0-9]{64}) [ *]([^\r\n]+)\r?\n?$/.exec(bytes.toString('utf8'));
  assert.ok(match && match[2] === filename, `Invalid SHA-256 sidecar for ${filename}.`);
  return match[1];
}

export async function verifyPublishedRelease(context, release, request) {
  const files = releaseFiles(context.version);
  assert.ok(Array.isArray(release.assets), 'The existing release has no asset list.');
  assert.deepEqual(
    release.assets.map((asset) => asset.name).sort(),
    [...files.names].sort(),
    'The existing release has missing, duplicate, or unexpected assets.',
  );
  const assets = new Map(release.assets.map((asset) => [asset.name, asset]));
  for (const asset of assets.values()) {
    assert.equal(asset.state, 'uploaded', `Incomplete release asset ${asset.name}.`);
    assert.ok(
      Number.isSafeInteger(asset.id) &&
        asset.id > 0 &&
        Number.isSafeInteger(asset.size) &&
        asset.size > 0,
      `Invalid release asset metadata for ${asset.name}.`,
    );
    assert.match(
      asset.digest || '',
      /^sha256:[a-f0-9]{64}$/,
      `GitHub SHA-256 metadata is unavailable for ${asset.name}; cannot verify an existing release without downloading its binary.`,
    );
  }
  const smallAsset = async (name) => {
    const asset = assets.get(name);
    assert.ok(asset.size <= 65536, `Unexpectedly large metadata asset ${name}.`);
    const bytes = await request(`releases/assets/${asset.id}`, { binary: true });
    assert.equal(bytes.length, asset.size, `Asset size differs for ${name}.`);
    assert.equal(`sha256:${digest(bytes)}`, asset.digest, `Asset digest differs for ${name}.`);
    return bytes;
  };
  const manifest = JSON.parse((await smallAsset('manifest.json')).toString('utf8'));
  for (const field of ['version', 'tag', 'sourceCommit', 'nativeVersion', 'url']) {
    assert.equal(
      manifest[field],
      context[field],
      `Published manifest ${field} differs from this source.`,
    );
  }
  assert.ok(
    typeof manifest.runUrl === 'string' &&
      manifest.runUrl.startsWith(`https://github.com/${context.repository}/actions/runs/`) &&
      /^\d+$/.test(manifest.runUrl.split('/').at(-1)),
    'Published manifest has an invalid run URL.',
  );
  for (const platform of ['android', 'ios']) {
    const filename = files[platform];
    const expected = parseChecksum(await smallAsset(`${filename}.sha256`), filename);
    assert.equal(manifest[platform]?.file, filename, `Published ${platform} filename differs.`);
    assert.equal(
      manifest[platform]?.sha256,
      expected,
      `Published ${platform} manifest checksum differs.`,
    );
    assert.equal(
      assets.get(filename).digest,
      `sha256:${expected}`,
      `Published ${platform} artifact checksum differs.`,
    );
  }
}

export async function verifyLocalArtifacts(context, read = readFile) {
  const files = releaseFiles(context.version);
  const artifacts = {};
  for (const platform of ['android', 'ios']) {
    const filename = files[platform];
    const bytes = await read(`release/${filename}`);
    assert.ok(bytes.length > 0, `Release artifact ${filename} is empty.`);
    const actual = digest(bytes);
    assert.equal(
      parseChecksum(await read(`release/${filename}.sha256`), filename),
      actual,
      `Release artifact ${filename} does not match its checksum.`,
    );
    artifacts[platform] = { file: filename, sha256: actual };
  }
  return artifacts;
}

function releaseNotes(context, artifacts) {
  return `# Playground ${context.version}\n\nKomazon, Looking, Brello, and PepaPog in one app. Both artifacts were built and tested in GitHub Actions from commit ${context.sourceCommit}.\n\n- Android: download ${artifacts.android.file} and install it with adb install -r ${artifacts.android.file}, or open the APK on an Android device.\n- iOS: unzip ${artifacts.ios.file}, then install Playground.app with xcrun simctl install booted Playground.app. This unsigned build supports arm64 and x86_64 iOS simulators only; it is not an IPA for a physical iPhone.\n\nEach artifact includes a SHA-256 sidecar and GitHub build provenance attestation. Verify provenance with gh attestation verify <artifact> --repo ${context.repository}; verify downloaded bytes with shasum -a 256 -c <artifact>.sha256.\n\nBuild and acceptance evidence: ${context.runUrl}\n\nThe manifest records the exact source commit and both checksums. Published assets are never overwritten; corrections receive a new commit release.\n`;
}

export async function runMobileRelease(
  mode,
  env = process.env,
  {
    execute = execFileSync,
    fetchImpl = fetch,
    read = readFile,
    write = writeFile,
    append = appendFile,
  } = {},
) {
  const context = releaseContext(mode, env, execute);
  const request = githubClient(env, fetchImpl);
  const existing = await inspectRelease(context, request);
  if (mode === 'prepare') {
    assert.ok(
      env.GITHUB_OUTPUT && env.GITHUB_STEP_SUMMARY,
      'GitHub output and summary paths are required.',
    );
    if (existing) await verifyPublishedRelease(context, existing, request);
    const build = !context.automatic || !existing;
    const publish = context.automatic && !existing;
    const outputs = {
      version: context.version,
      'native-version': context.nativeVersion,
      'build-number': context.buildNumber,
      'ios-build-number': context.iosBuildNumber,
      tag: context.tag,
      build,
      publish,
    };
    await append(
      env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
    await append(
      env.GITHUB_STEP_SUMMARY,
      `Mobile ${context.version}: ${existing && context.automatic ? 'existing published release verified; no rebuild or publication' : publish ? 'build both platforms and publish after every required gate passes' : 'candidate build only; no publication'}. Source: ${context.sourceCommit}.\n`,
    );
    return outputs;
  }
  assert.equal(existing, null, 'Release already exists. Refusing to replace published assets.');
  const artifacts = await verifyLocalArtifacts(context, read);
  const manifest = {
    schemaVersion: 1,
    version: context.version,
    nativeVersion: context.nativeVersion,
    buildNumber: context.buildNumber,
    iosBuildNumber: context.iosBuildNumber,
    sourceCommit: context.sourceCommit,
    tag: context.tag,
    url: context.url,
    runUrl: context.runUrl,
    ...artifacts,
  };
  await write('release/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  await write('release-notes.md', releaseNotes(context, artifacts));
  // gh stages a draft, uploads all five assets, then publishes. No release edit,
  // tag replacement, or upload --clobber is allowed, including on retries.
  execute(
    'gh',
    [
      'release',
      'create',
      context.tag,
      ...releaseFiles(context.version).names.map((name) => `release/${name}`),
      '--repo',
      context.repository,
      '--target',
      context.sourceCommit,
      '--title',
      `Playground ${context.version}`,
      '--notes-file',
      'release-notes.md',
    ],
    { encoding: 'utf8', timeout: 180000, env },
  );
  if (env.GITHUB_STEP_SUMMARY) {
    await append(
      env.GITHUB_STEP_SUMMARY,
      `Published [Playground ${context.version}](${context.url}) from ${context.sourceCommit}, with both binaries, SHA-256 sidecars, and manifest.\n`,
    );
  }
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runMobileRelease(process.argv[2]);
}
