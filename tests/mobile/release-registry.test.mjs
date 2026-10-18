import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  isMobileReleaseTag,
  validateReleaseRegistry,
} from '../../scripts/check-release-registry.mjs';

const source = Buffer.from('immutable released browser contract');
const web = {
  id: 'shop-v1',
  name: 'Shop',
  path: '/shop/',
  status: 'released',
  testFile: 'tests/e2e/shop.spec.ts',
  flows: ['Checkout'],
  testSha256: createHash('sha256').update(source).digest('hex'),
};
const mobile = {
  id: 'mobile-26.10.19-a73919f',
  tag: 'mobile-26.10.19-a73919f',
  url: 'https://github.com/vostride/playground/releases/tag/mobile-26.10.19-a73919f',
  android: { file: 'playground.apk', sha256: 'a'.repeat(64) },
  ios: { file: 'playground-ios.zip', sha256: 'b'.repeat(64) },
};
const registry = { schemaVersion: 1, web: [web], mobile: [mobile] };
const readTestFile = async (path) => {
  assert.equal(path, web.testFile);
  return source;
};

test('accepts legacy semver and calendar tags across the supported century', () => {
  for (const tag of [
    'mobile-v0.1.0',
    'mobile-v12.30.456',
    'mobile-v01.02.003',
    'mobile-00.01.01-0000000',
    'mobile-00.02.29-abcdef0',
    'mobile-24.02.29-1234567',
    'mobile-26.10.19-a73919f',
    'mobile-99.12.31-fffffff',
  ])
    assert.equal(isMobileReleaseTag(tag), true, tag);
});

test('rejects impossible dates, ambiguous formats, and malformed commit suffixes', () => {
  for (const tag of [
    'mobile-26.02.29-a73919f',
    'mobile-01.02.29-a73919f',
    'mobile-26.04.31-a73919f',
    'mobile-26.00.10-a73919f',
    'mobile-26.13.10-a73919f',
    'mobile-26.10.00-a73919f',
    'mobile-26.10.32-a73919f',
    'mobile-2026.10.19-a73919f',
    'mobile-26.1.19-a73919f',
    'mobile-26.10.1-a73919f',
    'mobile-26.10.19-A73919F',
    'mobile-26.10.19-a73919',
    'mobile-26.10.19-a73919ff',
    'mobile-26.10.19-g73919f',
    'mobile-26.10.19-a73919f-extra',
    'mobile-v1.2.3-rc1',
    'mobile-v1.2',
    'mobile-26.10.19-a73919f\n',
    ' mobile-26.10.19-a73919f',
    'mobile-v1.2.3\n',
    '',
    null,
    undefined,
  ])
    assert.equal(isMobileReleaseTag(tag), false, String(tag));
});

test('allows appended date releases while retaining legacy mobile records', async () => {
  const legacy = { ...mobile, id: 'legacy', tag: 'mobile-v0.1.0' };
  const previous = { ...registry, mobile: [legacy] };
  await validateReleaseRegistry(
    { ...registry, mobile: [legacy, mobile] },
    { previous, readTestFile },
  );
});

test('published mobile entries cannot be changed or removed for either tag format', async () => {
  for (const tag of ['mobile-v0.1.0', mobile.tag]) {
    const previous = { ...registry, mobile: [{ ...mobile, tag }] };
    const mutations = [
      [],
      [{ ...mobile, tag, id: 'replacement' }],
      [{ ...mobile, tag: 'mobile-26.10.20-1234567' }],
      [{ ...mobile, tag, url: 'https://example.com/other' }],
      [{ ...mobile, tag, android: { ...mobile.android, sha256: 'c'.repeat(64) } }],
      [{ ...mobile, tag, ios: { ...mobile.ios, file: 'replacement.zip' } }],
    ];
    for (const next of mutations) {
      await assert.rejects(
        validateReleaseRegistry({ ...registry, mobile: next }, { previous, readTestFile }),
        /Released mobile entry .* is immutable/,
      );
    }
  }
});

test('released web entries and their source hashes remain immutable', async () => {
  await validateReleaseRegistry(registry, { previous: registry, readTestFile });
  for (const next of [[], [{ ...web, name: 'Changed name' }], [{ ...web, path: '/new/' }]]) {
    await assert.rejects(
      validateReleaseRegistry({ ...registry, web: next }, { previous: registry, readTestFile }),
      /Released web entry .* is immutable/,
    );
  }
  await assert.rejects(
    validateReleaseRegistry(registry, { readTestFile: async () => Buffer.from('changed test') }),
    /changed or lacks its SHA-256/,
  );
  await assert.rejects(
    validateReleaseRegistry(
      { ...registry, web: [{ ...web, testSha256: undefined }] },
      { readTestFile },
    ),
    /changed or lacks its SHA-256/,
  );
});

test('invalid mobile checksums, missing artifacts, tags, and duplicate IDs still fail schema validation', async () => {
  const invalid = [
    { ...mobile, tag: 'mobile-26.02.30-a73919f' },
    { ...mobile, android: { ...mobile.android, sha256: 'a'.repeat(63) } },
    { ...mobile, ios: { ...mobile.ios, sha256: 'B'.repeat(64) } },
    { ...mobile, ios: { sha256: mobile.ios.sha256 } },
    { ...mobile, url: '' },
    { ...mobile, id: web.id },
  ];
  for (const entry of invalid) {
    await assert.rejects(
      validateReleaseRegistry({ ...registry, mobile: [entry] }, { readTestFile }),
      /Invalid mobile release/,
    );
  }
  await assert.rejects(
    validateReleaseRegistry({ ...registry, mobile: [mobile, mobile] }, { readTestFile }),
    /Invalid mobile release/,
  );
});
