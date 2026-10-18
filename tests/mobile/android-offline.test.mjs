import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOffline, validateTarget } from './android-offline.mjs';

const offline = {
  airplane: 'enabled\n',
  wifi: '0\n',
  connectivity: 'Networks:\nActive default network: none\n\nRequests:\n',
};

test('accepts observed offline state and rejects a remaining default network', () => {
  assert.doesNotThrow(() => assertOffline(offline));
  assert.throws(
    () => assertOffline({ ...offline, connectivity: 'Active default network: 101\n' }),
    /still has an active/,
  );
});

test('airplane or Wi-Fi settings alone cannot establish offline connectivity', () => {
  for (const connectivity of [
    '',
    'Active default network: unknown\n',
    'Active default network: none\nActive default network: 101\n',
  ]) {
    assert.throws(() => assertOffline({ ...offline, connectivity }));
  }
  assert.throws(() => assertOffline({ ...offline, airplane: 'disabled\n' }), /not enabled/);
  assert.throws(() => assertOffline({ ...offline, wifi: '1\n' }), /not disabled/);
});

test('cannot change networking on a local device or an unspecified target', () => {
  assert.doesNotThrow(() =>
    validateTarget('emulator-5554', 'configure', { GITHUB_ACTIONS: 'true' }),
  );
  assert.throws(
    () => validateTarget('emulator-5554', 'configure', {}),
    /only runs on a CI emulator/,
  );
  for (const device of ['', 'phone-1234', 'emulator-5554 shell']) {
    assert.throws(
      () => validateTarget(device, 'configure', { GITHUB_ACTIONS: 'true' }),
      /explicit Android emulator/,
    );
  }
  assert.throws(
    () => validateTarget('emulator-5554', 'enable', { GITHUB_ACTIONS: 'true' }),
    /configure or verify/,
  );
});
