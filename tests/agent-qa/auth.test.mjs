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
test('unknown reports remain rejected with location, coarse classification and byte count only', () => {
  const fixtures = [
    { bytes: Buffer.from([0xff, 0xfe, 0xfd]), format: 'invalid-utf8', name: 'unknown.bin' },
    {
      bytes: Buffer.from('private-log-content\0'),
      format: 'utf8-with-nul',
      name: 'appium/wda-build.log',
    },
    // A .png extension cannot make an unrecognized/truncated signature eligible.
    { bytes: Buffer.from([137, 80, 78, 71]), format: 'invalid-utf8', name: 'broken.png' },
  ];
  for (const { bytes, format, name } of fixtures) {
    const path = `tests/agent-qa/reports/${name}`;
    assert.throws(
      () => sanitizeReportBytes(bytes, [], path),
      (error) => {
        assert.equal(
          error.message,
          `Unexpected binary report format; refusing upload (path=${JSON.stringify(path)}; format=${format}; bytes=${bytes.length}).`,
        );
        assert.ok(!error.message.includes('private-log-content'));
        return true;
      },
    );
  }
});
test('diagnostics scrub credential filenames and escape display controls without leaking bytes', () => {
  const values = ['initial-token-fixture', 'refreshed-token-fixture'];
  const jwt = 'eyJ' + 'x'.repeat(16) + '.' + 'y'.repeat(16) + '.' + 'z'.repeat(16);
  const path = `tests/agent-qa/reports/${values.join('/')}/${jwt}/bad\n\r\t\x1b\x7f\u0085\u2028\u202e.png`;
  const secretPayload = Buffer.concat([Buffer.from([0xff]), Buffer.from(values[0])]);
  for (const bytes of [Buffer.from([0xff]), secretPayload]) {
    assert.throws(
      () => sanitizeReportBytes(bytes, values, path),
      (error) => {
        assert.ok(error.message.includes('refusing upload'));
        assert.ok(
          error.message.includes('tests/agent-qa/reports/[REDACTED]/[REDACTED]/[REDACTED JWT]/'),
        );
        for (const secret of [...values, jwt]) assert.ok(!error.message.includes(secret));
        assert.ok(!/[^\u0020-\u007e]/.test(error.message));
        for (const escape of [
          '\\n',
          '\\r',
          '\\t',
          '\\u001b',
          '\\u007f',
          '\\u0085',
          '\\u2028',
          '\\u202e',
        ]) {
          assert.ok(error.message.includes(escape));
        }
        return true;
      },
    );
  }
});
test('known report formats still sanitize without changing binary evidence', () => {
  const signatures = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from([255, 216, 255]),
    Buffer.from('RIFF\0\0\0\0WEBP'),
    Buffer.from('\0\0\0\x18ftypisom'),
    Buffer.from([26, 69, 223, 163]),
  ];
  for (const signature of signatures) {
    const bytes = Buffer.concat([signature, Buffer.from([0, 255, 128])]);
    assert.deepEqual(sanitizeReportBytes(bytes, ['fixture-token'], 'reports/image'), bytes);
  }
  const text = '<failure>é\nfixture-token</failure>';
  assert.equal(
    sanitizeReportBytes(Buffer.from(text), ['fixture-token'], 'reports/junit.xml').toString(),
    '<failure>é\n[REDACTED]</failure>',
  );
});
