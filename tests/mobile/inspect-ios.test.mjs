import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectIosApp, validateIosMetadata } from './inspect-ios.mjs';

const expected = { shortVersion: '26.10.19', bundleVersion: '1042' };
const fixture = () => ({
  plist: {
    CFBundleIdentifier: 'dev.vostride.playground',
    CFBundleDisplayName: 'Playground',
    CFBundleShortVersionString: '26.10.19',
    CFBundleVersion: '1042',
  },
  architectures: ['x86_64', 'arm64'],
});

test('release inspection checks the processed bundle identity, label, versions and both ABIs', () => {
  assert.deepEqual(validateIosMetadata(fixture(), expected), {
    bundleId: 'dev.vostride.playground',
    displayName: 'Playground',
    shortVersion: '26.10.19',
    bundleVersion: '1042',
    architectures: ['x86_64', 'arm64'],
  });
  for (const [field, wrong, message] of [
    ['CFBundleIdentifier', 'other.app', /bundle ID/],
    ['CFBundleDisplayName', 'Stale template', /display name/],
    ['CFBundleShortVersionString', '1.0.0', /short version differs/],
    ['CFBundleVersion', '1', /bundle version differs/],
  ]) {
    const data = fixture();
    data.plist[field] = wrong;
    assert.throws(() => validateIosMetadata(data, expected), message);
  }
});

test('missing, mistyped and unresolved plist values cannot pass release inspection', () => {
  for (const field of Object.keys(fixture().plist)) {
    for (const wrong of [undefined, '', 1042, '$(UNRESOLVED_BUILD_SETTING)']) {
      const data = fixture();
      data.plist[field] = wrong;
      assert.throws(() => validateIosMetadata(data, expected));
    }
  }
  for (const value of [
    null,
    {},
    { shortVersion: expected.shortVersion },
    { bundleVersion: expected.bundleVersion },
    { ...expected, shortVersion: '' },
    { ...expected, bundleVersion: 1042 },
  ]) {
    assert.throws(() => validateIosMetadata(fixture(), value));
  }
});

test('missing simulator ABIs and substring lookalikes fail the preserved architecture gate', () => {
  for (const architectures of [
    undefined,
    [],
    ['arm64'],
    ['x86_64'],
    ['arm64-fake', 'x86_64'],
    ['arm64', 'x86_64-fake'],
  ]) {
    assert.throws(
      () => validateIosMetadata({ ...fixture(), architectures }, expected),
      /architecture/,
    );
  }
});

test('explicitly omitting release expectations permits inspection of historical versions', () => {
  const data = fixture();
  data.plist.CFBundleDisplayName = 'Historical label';
  data.plist.CFBundleShortVersionString = '0.1.0';
  data.plist.CFBundleVersion = '1';
  assert.equal(validateIosMetadata(data).bundleVersion, '1');
  assert.throws(() => validateIosMetadata(data, expected), /display name/);
});

test('inspector reads the compiled app plist and executable and persists success and failure evidence', (t) => {
  const directory = fileURLToPath(new URL('../../test-results/', import.meta.url));
  mkdirSync(directory, { recursive: true });
  const output = mkdtempSync(join(directory, 'ios-inspection-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const calls = [];
  const app = 'compiled/Playground.app';
  const execute = (command, args) => {
    calls.push([command, args]);
    return command === '/usr/bin/plutil' ? JSON.stringify(fixture().plist) : 'x86_64 arm64\n';
  };
  assert.equal(inspectIosApp(app, output, expected, execute).passed, true);
  assert.deepEqual(calls, [
    ['/usr/bin/plutil', ['-convert', 'json', '-o', '-', `${app}/Info.plist`]],
    ['xcrun', ['lipo', '-archs', `${app}/Playground`]],
  ]);
  assert.deepEqual(
    JSON.parse(readFileSync(join(output, 'app-info.json'), 'utf8')),
    fixture().plist,
  );
  assert.equal(readFileSync(join(output, 'app-architectures.txt'), 'utf8'), 'x86_64 arm64\n');
  assert.throws(
    () => inspectIosApp(app, output, { ...expected, bundleVersion: '1043' }, execute),
    /bundle version differs/,
  );
  const report = JSON.parse(readFileSync(join(output, 'ios-inspection.json'), 'utf8'));
  assert.equal(report.passed, false);
  assert.match(report.error, /bundle version differs/);
  assert.equal(report.expected.bundleVersion, '1043');
});
