import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMobileReleaseVersion } from '../../scripts/mobile-release-version.mjs';

const input = {
  sha: '49d24f6089f791a2aebddc365249a13e6e7c91dc',
  commitTimestamp: Date.parse('2026-10-18T23:59:59Z') / 1000,
  runNumber: 42,
};

test('derives date/SHA release identity and distinct native versions from CI inputs', () => {
  assert.deepEqual(deriveMobileReleaseVersion(input), {
    version: '26.10.18-49d24f6',
    tag: 'mobile-26.10.18-49d24f6',
    nativeVersion: '26.10.18',
    buildNumber: 1042,
    iosBuildNumber: '1042',
  });
  assert.deepEqual(
    deriveMobileReleaseVersion({
      ...input,
      commitTimestamp: String(input.commitTimestamp),
      runNumber: String(input.runNumber),
    }),
    deriveMobileReleaseVersion(input),
  );
});

test('date follows UTC across a midnight boundary and pads only the public month/day', () => {
  const before = deriveMobileReleaseVersion({
    ...input,
    commitTimestamp: Date.parse('2026-01-01T05:29:59+05:30') / 1000,
  });
  const after = deriveMobileReleaseVersion({
    ...input,
    commitTimestamp: Date.parse('2026-01-01T05:30:00+05:30') / 1000,
  });
  assert.equal(before.version, '25.12.31-49d24f6');
  assert.equal(after.version, '26.01.01-49d24f6');
  assert.equal(after.nativeVersion, '26.1.1');
});

test('same-day commits have distinct labels while a rerun retains all version values', () => {
  const original = deriveMobileReleaseVersion(input);
  assert.deepEqual(deriveMobileReleaseVersion({ ...input }), original);
  const other = deriveMobileReleaseVersion({
    ...input,
    sha: 'a9d24f6089f791a2aebddc365249a13e6e7c91dc',
  });
  assert.notEqual(other.version, original.version);
  assert.notEqual(other.tag, original.tag);
  assert.equal(other.nativeVersion, original.nativeVersion);
});

test('a new workflow run changes native build values without changing commit identity', () => {
  const original = deriveMobileReleaseVersion(input);
  const next = deriveMobileReleaseVersion({ ...input, runNumber: input.runNumber + 1 });
  assert.equal(next.version, original.version);
  assert.equal(next.tag, original.tag);
  assert.equal(next.buildNumber, original.buildNumber + 1);
  assert.equal(Number(next.iosBuildNumber), Number(original.iosBuildNumber) + 1);
});

test('accepts the supported date and Android version-code boundaries', () => {
  assert.equal(
    deriveMobileReleaseVersion({
      ...input,
      commitTimestamp: Date.parse('2000-01-01T00:00:00Z') / 1000,
      runNumber: 1,
    }).version,
    '00.01.01-49d24f6',
  );
  const last = deriveMobileReleaseVersion({
    ...input,
    commitTimestamp: Date.parse('2099-12-31T23:59:59Z') / 1000,
    runNumber: 2099999000,
  });
  assert.equal(last.version, '99.12.31-49d24f6');
  assert.equal(last.buildNumber, 2100000000);
  assert.equal(last.iosBuildNumber, '2100000000');
});

test('rejects ambiguous or malformed commit identifiers', () => {
  for (const sha of [
    '',
    undefined,
    null,
    123,
    input.sha.slice(0, 7),
    input.sha.toUpperCase(),
    `${input.sha}0`,
    'g'.repeat(40),
  ]) {
    assert.throws(() => deriveMobileReleaseVersion({ ...input, sha }), /commit SHA/);
  }
});

test('rejects invalid timestamps and dates outside the supported century', () => {
  for (const commitTimestamp of [
    undefined,
    null,
    '',
    '1e9',
    '2026-10-18',
    '1.5',
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_SAFE_INTEGER,
    Date.parse('1999-12-31T23:59:59Z') / 1000,
    Date.parse('2100-01-01T00:00:00Z') / 1000,
  ]) {
    assert.throws(
      () => deriveMobileReleaseVersion({ ...input, commitTimestamp }),
      /commitTimestamp/,
    );
  }
});

test('rejects invalid or overflowing workflow run numbers', () => {
  for (const runNumber of [
    undefined,
    null,
    '',
    '01',
    '1e3',
    '1.5',
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    2099999001,
    Number.MAX_SAFE_INTEGER,
  ]) {
    assert.throws(() => deriveMobileReleaseVersion({ ...input, runNumber }), /runNumber/);
  }
});
