import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appId = 'dev.vostride.playground';
const receiverPermission = `${appId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;

// Read aapt's decoded binary manifest, keeping attributes on their owning element.
// A permission protecting a component is not a permission requested by the app.
function manifestElements(xmltree) {
  const elements = [];
  const stack = [];
  for (const line of xmltree.split(/\r?\n/)) {
    const element = /^(\s*)E: ([\w.-]+)(?:\s|$)/.exec(line);
    if (element) {
      const indent = element[1].length;
      while (stack.length && stack.at(-1).indent >= indent) stack.pop();
      const entry = { name: element[2], indent, parent: stack.at(-1), attributes: new Map() };
      elements.push(entry);
      stack.push(entry);
      continue;
    }
    const attribute = /^(\s*)A: ([\w:.-]+)(?:\(0x[\da-f]+\))?=(.*)$/i.exec(line);
    if (attribute) {
      const owner = stack.at(-1);
      assert.ok(owner && attribute[1].length > owner.indent, 'Unowned manifest attribute.');
      assert.ok(!owner.attributes.has(attribute[2]), `Duplicate ${attribute[2]} attribute.`);
      owner.attributes.set(attribute[2], attribute[3]);
    }
  }
  const roots = elements.filter((element) => !element.parent);
  assert.ok(
    roots.length === 1 && roots[0].name === 'manifest',
    'Missing or ambiguous manifest root.',
  );
  return elements;
}

function stringAttribute(element, name) {
  const value = element.attributes.get(name) || '';
  const match = /^"([^"\\]*)"(?: \(Raw: "[^"\\]*"\))?$/.exec(value);
  assert.ok(match, `Cannot read ${name} on ${element.name}.`);
  return match[1];
}

export function validateApkMetadata({ permissions, badging, xmltree }) {
  const elements = manifestElements(xmltree);
  assert.equal(stringAttribute(elements[0], 'package'), appId, 'Unexpected manifest app ID.');
  assert.equal(badging.match(/^package: name='([^']+)'/m)?.[1], appId, 'Unexpected APK app ID.');
  assert.equal(permissions.match(/^package: (\S+)$/m)?.[1], appId, 'Unexpected permission app ID.');

  const declarations = elements.filter((element) => element.name === 'permission');
  const requests = elements.filter((element) => element.name.startsWith('uses-permission'));
  assert.ok(declarations.length <= 1, 'Unexpected permission declarations.');
  assert.ok(requests.length <= 1, 'Unexpected permission requests.');
  for (const declaration of declarations) {
    assert.equal(declaration.parent?.name, 'manifest', 'Permission declaration outside manifest.');
    assert.equal(
      stringAttribute(declaration, 'android:name'),
      receiverPermission,
      'Unexpected permission declaration.',
    );
    const level = declaration.attributes.get('android:protectionLevel') || '';
    assert.match(
      level,
      /^\(type 0x1[01]\)0x0*2$/i,
      'AndroidX receiver permission must be exactly signature (0x2).',
    );
    assert.deepEqual(
      [...declaration.attributes.keys()].sort(),
      ['android:name', 'android:protectionLevel'],
      'Unexpected receiver permission attributes.',
    );
  }
  for (const request of requests) {
    assert.equal(request.parent?.name, 'manifest', 'Permission request outside manifest.');
    assert.equal(
      request.name,
      'uses-permission',
      'SDK-specific permission aliases are not allowed.',
    );
    assert.equal(
      stringAttribute(request, 'android:name'),
      receiverPermission,
      'Unexpected permission request.',
    );
    assert.deepEqual(
      [...request.attributes.keys()],
      ['android:name'],
      'Unexpected receiver permission request attributes.',
    );
    assert.equal(
      declarations.length,
      1,
      'Receiver permission request has no app-owned signature declaration.',
    );
  }
  assert.equal(
    declarations.length,
    requests.length,
    'Receiver permission declaration and request must match.',
  );

  // Cross-check aapt's summary so an unfamiliar permission spelling fails closed.
  const summaryDeclarations = permissions.split(/\r?\n/).filter((line) => /^permission/.test(line));
  const summaryRequests = permissions
    .split(/\r?\n/)
    .filter((line) => /^uses-permission/.test(line));
  assert.deepEqual(
    summaryDeclarations,
    declarations.length ? [`permission: ${receiverPermission}`] : [],
    'Permission declaration summary differs from the manifest.',
  );
  assert.deepEqual(
    summaryRequests,
    requests.length ? [`uses-permission: name='${receiverPermission}'`] : [],
    'Permission request summary differs from the manifest.',
  );

  const nativeLines = badging.split(/\r?\n/).filter((line) => line.startsWith('native-code:'));
  assert.equal(nativeLines.length, 1, 'Missing or ambiguous native architecture metadata.');
  const architectures = [...nativeLines[0].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  for (const required of ['arm64-v8a', 'x86_64']) {
    assert.ok(
      architectures.includes(required),
      `APK is missing required native architecture ${required}.`,
    );
  }
  return {
    appId,
    architectures,
    requestedPermissions: requests.length ? [receiverPermission] : [],
    receiverPermissionProtection: requests.length ? 'signature (0x2)' : null,
    systemPermissions: [],
  };
}

export function inspectApk(apk, output = 'maestro-reports/android') {
  mkdirSync(output, { recursive: true });
  const report = { apk: resolve(apk), passed: false };
  try {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    assert.ok(process.env.AAPT || sdk, 'Android SDK location is unavailable.');
    const aapt = process.env.AAPT || join(sdk, 'build-tools/36.0.0/aapt');
    const dump = (kind, name, extra = []) => {
      const result = execFileSync(aapt, ['dump', kind, apk, ...extra], {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
      });
      writeFileSync(join(output, name), result);
      return result;
    };
    const permissions = dump('permissions', 'apk-permissions.txt');
    const badging = dump('badging', 'apk-metadata.txt');
    const xmltree = dump('xmltree', 'apk-manifest.txt', ['AndroidManifest.xml']);
    Object.assign(report, validateApkMetadata({ permissions, badging, xmltree }), { passed: true });
    console.log(`APK identity: ${report.appId}`);
    console.log(`APK native architectures: ${report.architectures.join(', ')}`);
    console.log(
      `APK system permissions: none; AndroidX receiver protection: ${report.receiverPermissionProtection || 'absent'}`,
    );
    return report;
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    writeFileSync(join(output, 'apk-inspection.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv[2], 'Usage: node tests/mobile/inspect-apk.mjs APK [report-directory]');
  inspectApk(process.argv[2], process.argv[3]);
}
