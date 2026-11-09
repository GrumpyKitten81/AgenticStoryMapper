import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { portClosed, until } from './fixtures/checkout.mjs';

test('port closure waits for a silent TCP listener to stop accepting connections', async () => {
  let connections = 0;
  const server = createServer(() => { connections++; });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let closed = false;
  const closure = portClosed(`http://127.0.0.1:${server.address().port}`).then(() => { closed = true; });
  try {
    await until(() => connections >= 2);
    assert.equal(closed, false);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closure;
    assert.equal(closed, true);
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closure;
  }
});

test('port closure propagates invalid connection origins', async () => {
  await assert.rejects(portClosed('http://127.0.0.1:65536'), { code: 'ERR_INVALID_URL' });
});
