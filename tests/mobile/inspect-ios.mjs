import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateIosMetadata({ plist, architectures }, expected) {
  assert.equal(plist?.CFBundleIdentifier, 'dev.vostride.playground', 'Unexpected iOS bundle ID.');
  assert.ok(
    typeof plist.CFBundleDisplayName === 'string' && plist.CFBundleDisplayName.length > 0,
    'Missing iOS display name.',
  );
  assert.ok(typeof plist.CFBundleShortVersionString === 'string', 'Missing iOS short version.');
  assert.match(plist.CFBundleShortVersionString, /^\d+\.\d+\.\d+$/, 'Invalid iOS short version.');
  assert.ok(typeof plist.CFBundleVersion === 'string', 'Missing iOS bundle version.');
  assert.match(plist.CFBundleVersion, /^\d+(?:\.\d+){0,2}$/, 'Invalid iOS bundle version.');
  assert.ok(Array.isArray(architectures), 'Missing iOS native architecture metadata.');
  for (const required of ['arm64', 'x86_64']) {
    assert.ok(
      architectures.includes(required),
      `Simulator app is missing required architecture ${required}.`,
    );
  }
  if (expected !== undefined) {
    assert.ok(
      typeof expected?.shortVersion === 'string' && /^\d+\.\d+\.\d+$/.test(expected.shortVersion),
      'Expected iOS short version is required.',
    );
    assert.ok(
      typeof expected?.bundleVersion === 'string' &&
        /^\d+(?:\.\d+){0,2}$/.test(expected.bundleVersion),
      'Expected iOS bundle version is required.',
    );
    assert.equal(plist.CFBundleDisplayName, 'Playground', 'Unexpected iOS display name.');
    assert.equal(
      plist.CFBundleShortVersionString,
      expected.shortVersion,
      'iOS short version differs from the derived release version.',
    );
    assert.equal(
      plist.CFBundleVersion,
      expected.bundleVersion,
      'iOS bundle version differs from the derived release build number.',
    );
  }
  return {
    bundleId: plist.CFBundleIdentifier,
    displayName: plist.CFBundleDisplayName,
    shortVersion: plist.CFBundleShortVersionString,
    bundleVersion: plist.CFBundleVersion,
    architectures,
  };
}

export function inspectIosApp(
  app,
  output = 'maestro-reports/ios',
  expected,
  execute = execFileSync,
) {
  mkdirSync(output, { recursive: true });
  const report = { app: resolve(app), expected, passed: false };
  const options = { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 };
  try {
    // Inspect the processed plist in the compiled .app, never the source template.
    const info = execute(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', join(app, 'Info.plist')],
      options,
    );
    writeFileSync(join(output, 'app-info.json'), info);
    const architectureText = execute('xcrun', ['lipo', '-archs', join(app, 'Playground')], options);
    writeFileSync(join(output, 'app-architectures.txt'), architectureText);
    Object.assign(
      report,
      validateIosMetadata(
        {
          plist: JSON.parse(info),
          architectures: architectureText.trim().split(/\s+/).filter(Boolean),
        },
        expected,
      ),
      { passed: true },
    );
    console.log(`Simulator identity: ${report.bundleId}; label: ${report.displayName}`);
    console.log(
      `Simulator version: ${report.shortVersion} (${report.bundleVersion}); architectures: ${report.architectures.join(', ')}`,
    );
    return report;
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    writeFileSync(join(output, 'ios-inspection.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv[2], 'Usage: node tests/mobile/inspect-ios.mjs APP [report-directory]');
  inspectIosApp(process.argv[2], process.argv[3]);
}
