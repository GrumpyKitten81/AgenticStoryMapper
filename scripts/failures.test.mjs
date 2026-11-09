import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redact } from '../apps/server/src/config/failures.mjs';

test('redacts raw and serialized environment secrets with quotes and backslashes', () => {
  const secret = 'synthetic-"quote\\slash-value';
  const env = { DIAGNOSTIC_SECRET: secret };
  assert.equal(redact(`Diagnostic: ${secret}`, env), 'Diagnostic: [redacted]');
  assert.equal(redact(JSON.stringify({ diagnostic: secret }), env), '{"diagnostic":"[redacted]"}');
});

test('redacts full multiline environment secrets and nonempty raw and serialized line fragments', () => {
  const fragments = ['synthetic-"first\\value', 'synthetic-"second\\value', 'synthetic-third-value'];
  const secret = `${fragments[0]}\r\n\r\n${fragments[1]}\n${fragments[2]}`;
  const env = { DIAGNOSTIC_SECRET: secret };
  for (const value of [secret, ...fragments]) {
    assert.equal(redact(`Diagnostic: ${value}`, env), 'Diagnostic: [redacted]');
    assert.equal(redact(JSON.stringify({ diagnostic: value }), env), '{"diagnostic":"[redacted]"}');
  }
  assert.equal(redact('Unrelated output', env), 'Unrelated output');
  for (const value of ['x', 'y']) assert.equal(redact(value, { DIAGNOSTIC_SECRET: 'x\ny' }), '[redacted]');
});

test('redacts URL userinfo and Basic or Bearer authorization tokens', () => {
  assert.equal(redact('Fetch https://user:pw@host/x failed', {}), 'Fetch https://[redacted]@host/x failed');
  assert.equal(redact('Basic abc123== and Bearer def456', {}), 'Basic [redacted] and Bearer [redacted]');
});

test('redacts entire escaped quoted credential values without an environment match', () => {
  const secret = 'synthetic-"quote\\slash-value';
  assert.equal(redact(JSON.stringify({ password: secret, visible: 'kept' }), {}), '{"password":[redacted],"visible":"kept"}');
  assert.equal(redact("password='synthetic-\\'quote\\\\slash-value' visible=kept", {}), 'password=[redacted] visible=kept');
});
