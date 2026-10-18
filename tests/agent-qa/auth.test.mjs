import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCredential, sanitizeReportBytes } from './auth.mjs';

const credential = {
  type: 'oauth',
  provider: 'openai-subscription-oauth',
  tokens: {
    access: 'synthetic-access-fixture',
    refresh: 'synthetic-refresh-fixture',
    expires: 123456789,
    accountId: 'synthetic-account',
  },
};
test('exports only the requested subscription profile and known fields', () => {
  const result = selectCredential(
    JSON.stringify({
      'playground-codex': {
        ...credential,
        extra: 'discard',
        tokens: { ...credential.tokens, unknown: 'discard' },
      },
      unrelated: { secret: 'discard' },
    }),
  );
  assert.deepEqual(result, { 'playground-codex': credential });
});
test('invalid credentials fail without exposing supplied values', () => {
  for (const field of ['type', 'provider']) {
    assert.throws(
      () =>
        selectCredential(
          JSON.stringify({
            'playground-codex': { ...credential, [field]: 'sensitive-input-must-not-appear' },
          }),
        ),
      (error) => {
        assert.ok(!error.message.includes('sensitive-input-must-not-appear'));
        return true;
      },
    );
  }
  assert.throws(() => selectCredential('invalid-json-fixture'), /valid JSON/);
  assert.throws(() => selectCredential('{}'), /Authenticate/);
});
test('text evidence removes initial and refreshed credential values', () => {
  const values = ['initial-token-fixture', 'refreshed-token-fixture'];
  const report = sanitizeReportBytes(Buffer.from(values.join('\n')), values).toString();
  assert.equal(report, '[REDACTED]\n[REDACTED]');
});
test('binary evidence is preserved and rejects embedded credential bytes', () => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const screenshot = Buffer.concat([signature, Buffer.from([0, 255, 128, 254])]);
  assert.deepEqual(sanitizeReportBytes(screenshot, ['token-fixture']), screenshot);
  assert.throws(
    () =>
      sanitizeReportBytes(Buffer.concat([screenshot, Buffer.from('token-fixture')]), [
        'token-fixture',
      ]),
    /refusing upload/,
  );
  assert.throws(() => sanitizeReportBytes(Buffer.from([0, 255, 255]), []), /Unexpected binary/);
});
test('JWT-shaped values are redacted even if no longer in the active auth file', () => {
  const token = 'eyJ' + 'a'.repeat(16) + '.' + 'b'.repeat(16) + '.' + 'c'.repeat(16);
  assert.equal(sanitizeReportBytes(Buffer.from(token), []).toString(), '[REDACTED JWT]');
});
