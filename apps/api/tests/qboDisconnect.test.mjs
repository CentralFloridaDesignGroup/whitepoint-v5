import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { revokeQboConnection } from '../src/services/qboSync.ts';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

function connectionDb(token = 'refresh-token') {
  let deleted = false;
  const db = {
    prepare(sql) {
      if (sql === 'SELECT refresh_token FROM qbo_connection WHERE id=1')
        return { first: async () => deleted ? null : { refresh_token: token } };
      assert.equal(sql, 'DELETE FROM qbo_connection WHERE id=1 AND refresh_token=?');
      return { bind(value) {
        assert.equal(value, token);
        return { run: async () => { deleted = true; return { meta: { changes: 1 } }; } };
      } };
    },
  };
  return { db, wasDeleted: () => deleted };
}

const environment = { QBO_CLIENT_ID: 'client-id', QBO_CLIENT_SECRET: 'client-secret' };

test('disconnect revokes the refresh token before deleting the local connection', async () => {
  const { db, wasDeleted } = connectionDb();
  globalThis.fetch = async (url, request) => {
    assert.equal(wasDeleted(), false);
    assert.equal(url, 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, `Basic ${btoa('client-id:client-secret')}`);
    assert.deepEqual(JSON.parse(request.body), { token: 'refresh-token' });
    return new Response(null, { status: 200 });
  };
  await revokeQboConnection(db, environment);
  assert.equal(wasDeleted(), true);
});

test('failed remote revocation preserves the local connection', async () => {
  const { db, wasDeleted } = connectionDb();
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(revokeQboConnection(db, environment), /revocation failed \(503\)/);
  assert.equal(wasDeleted(), false);
});
