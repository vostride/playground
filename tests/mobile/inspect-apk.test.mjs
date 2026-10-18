import assert from 'node:assert/strict';
import test from 'node:test';
import { validateApkMetadata } from './inspect-apk.mjs';

const app = 'dev.vostride.playground';
const permission = `${app}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
const declaration = `    E: permission (line=23)
      A: android:name(0x01010003)="${permission}" (Raw: "${permission}")
      A: android:protectionLevel(0x01010009)=(type 0x11)0x2`;
const request = `    E: uses-permission (line=27)
      A: android:name(0x01010003)="${permission}" (Raw: "${permission}")`;

// Reduced from the aapt 36.0.0 dumps of GitHub candidate 39134005393.
const fixture = () => ({
  permissions: `package: ${app}\npermission: ${permission}\nuses-permission: name='${permission}'\n`,
  badging: `package: name='${app}' versionCode='1001' versionName='0.1.0'\nsdkVersion:'24'\ntargetSdkVersion:'36'\nnative-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'\n`,
  xmltree: `N: android=http://schemas.android.com/apk/res/android
  E: manifest (line=2)
    A: package="${app}" (Raw: "${app}")
${declaration}
${request}
    E: application (line=29)
      E: receiver (line=86)
        A: android:permission(0x01010006)="android.permission.DUMP" (Raw: "android.permission.DUMP")
`,
});

test('allows only the app-owned AndroidX signature protection and preserves both required ABIs', () => {
  const result = validateApkMetadata(fixture());
  assert.deepEqual(result.requestedPermissions, [permission]);
  assert.equal(result.receiverPermissionProtection, 'signature (0x2)');
  assert.deepEqual(result.systemPermissions, []);
  assert.deepEqual(result.architectures, ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);
});

test('allows an APK without any permission declarations or requests', () => {
  const data = fixture();
  data.xmltree = data.xmltree.replace(declaration, '').replace(request, '');
  data.permissions = `package: ${app}\n`;
  assert.equal(validateApkMetadata(data).receiverPermissionProtection, null);
});

test('rejects normal, dangerous, signatureOrSystem, privileged, absent and unresolved protection levels', () => {
  for (const level of [
    '(type 0x11)0x0',
    '(type 0x11)0x1',
    '(type 0x11)0x3',
    '(type 0x11)0x12',
    '@0x7f010001',
    '"signature"',
  ]) {
    const data = fixture();
    data.xmltree = data.xmltree.replace('(type 0x11)0x2', level);
    assert.throws(() => validateApkMetadata(data), /exactly signature/);
  }
  const data = fixture();
  data.xmltree = data.xmltree.replace(/^.*android:protectionLevel.*\n/m, '');
  assert.throws(() => validateApkMetadata(data), /exactly signature/);
});

test('rejects a missing declaration, an unused declaration and duplicate declarations or requests', () => {
  for (const [remove, duplicate] of [
    [declaration, ''],
    [request, ''],
    ['', declaration],
    ['', request],
  ]) {
    const data = fixture();
    data.xmltree = data.xmltree.replace(remove, '') + duplicate;
    assert.throws(() => validateApkMetadata(data));
  }
});

test('rejects every system or foreign permission, including SDK-specific aliases', () => {
  for (const name of [
    'android.permission.INTERNET',
    'android.permission.CAMERA',
    'other.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  ]) {
    const data = fixture();
    data.xmltree = data.xmltree.replaceAll(permission, name);
    data.permissions = data.permissions.replaceAll(permission, name);
    assert.throws(() => validateApkMetadata(data), /Unexpected permission/);
  }
  for (const tag of [
    'uses-permission',
    'uses-permission-sdk-23',
    'uses-permission-sdk-m',
    'uses-permission-unknown',
  ]) {
    const data = fixture();
    data.xmltree += `    E: ${tag} (line=105)\n      A: android:name(0x01010003)="android.permission.INTERNET"\n`;
    assert.throws(() => validateApkMetadata(data), /Unexpected permission requests/);
  }
  const data = fixture();
  data.xmltree = data.xmltree.replace('E: uses-permission ', 'E: uses-permission-sdk-23 ');
  assert.throws(() => validateApkMetadata(data), /aliases/);
});

test('rejects permission summaries that do not match the manifest', () => {
  for (const extra of [
    "uses-permission: name='android.permission.INTERNET'",
    "uses-permission-sdk-23: name='android.permission.CAMERA'",
    'permission: other.permission',
  ]) {
    const data = fixture();
    data.permissions += `${extra}\n`;
    assert.throws(() => validateApkMetadata(data), /summary differs/);
  }
});

test('rejects a wrong app ID in any of the three APK metadata views', () => {
  for (const key of ['permissions', 'badging', 'xmltree']) {
    const data = fixture();
    data[key] = data[key].replaceAll(app, 'other.app');
    assert.throws(() => validateApkMetadata(data), /app ID/);
  }
});

test('rejects missing required ABIs and substring lookalikes', () => {
  for (const abi of ['arm64-v8a', 'x86_64']) {
    for (const replacement of ['', `'${abi}-fake'`]) {
      const data = fixture();
      data.badging = data.badging.replace(`'${abi}'`, replacement);
      assert.throws(() => validateApkMetadata(data), /missing required native architecture/);
    }
  }
});

test('rejects malformed manifest structure and duplicate security attributes', () => {
  const data = fixture();
  data.xmltree = 'not a manifest';
  assert.throws(() => validateApkMetadata(data), /manifest root/);
  const duplicate = fixture();
  duplicate.xmltree = duplicate.xmltree.replace(
    declaration,
    `${declaration}\n      A: android:protectionLevel(0x01010009)=(type 0x11)0x1`,
  );
  assert.throws(() => validateApkMetadata(duplicate), /Duplicate/);
});
