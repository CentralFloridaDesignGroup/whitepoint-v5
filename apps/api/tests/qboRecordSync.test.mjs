import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { syncQboClient, syncQboProject } from '../src/services/qboSync.ts';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

const environment = {
  QBO_CLIENT_ID: 'test-id',
  QBO_CLIENT_SECRET: 'test-secret',
  QBO_REDIRECT_URI: 'http://localhost/callback',
  QBO_ENVIRONMENT: 'sandbox',
};
const db = {
  prepare(sql) {
    if(sql==='SELECT billing_address_json FROM clients WHERE id=?')return {bind:()=>({first:async()=>({billing_address_json:'{"line1":"123 Main St","city":"Orlando","state":"FL","postalCode":"32801"}'})})};
    assert.equal(sql, 'SELECT * FROM qbo_connection WHERE id=1');
    return { first: async () => ({ realm_id: 'test-realm', access_token: 'test-token', token_expires_at: new Date(Date.now() + 3600_000).toISOString() }) };
  },
};

function captureCustomer() {
  let body;
  globalThis.fetch = async (url, request) => {
    assert.match(String(url), /sandbox-quickbooks\.api\.intuit\.com\/v3\/company\/test-realm\/customer/);
    body = JSON.parse(request.body);
    return new Response(JSON.stringify({ Customer: { Id: 'new-child', SyncToken: '1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return () => body;
}

test('clients sync as top-level customers', async () => {
  const customer = captureCustomer();
  const result = await syncQboClient(db, environment, { name: 'Client A', status: 'active', billing_address_json: '{}' });
  assert.equal(result.id, 'new-child');
  assert.equal(customer().DisplayName, 'Client A');
  assert.equal(customer().ParentRef, undefined);
  assert.equal(customer().Job, undefined);
});

test('projects sync as children under the current client', async () => {
  const customer = captureCustomer();
  await syncQboProject(db, environment, { project_number: '26-0001', name: 'Project A', active: 1 }, 'parent-2');
  assert.equal(customer().DisplayName, '26-0001 - Project A');
  assert.deepEqual(customer().ParentRef, { value: 'parent-2' });
  assert.equal(customer().Job, true);
  assert.equal(customer().BillAddr.Line1,'123 Main St');
  assert.equal(customer().Id, undefined);
});

test('a moved project creates a new child and never sends its former ID', async () => {
  const customer = captureCustomer();
  await syncQboProject(db, environment, { project_number: '26-0002', name: 'Moved Project', qbo_customer_id: null, qbo_sync_token: null, active: 1 }, 'new-parent');
  assert.equal(customer().DisplayName, '26-0002 - Moved Project');
  assert.equal(customer().Id, undefined);
  assert.deepEqual(customer().ParentRef, { value: 'new-parent' });
});

test('a project without a synced parent cannot create a child', async () => {
  await assert.rejects(syncQboProject(db, environment, { name: 'Project A' }, ''), /parent client/);
});

test('existing project updates its QBO display name', async () => {
  const customer = captureCustomer();
  await syncQboProject(db, environment, { project_number: '26-0003', name: 'Renamed Project', qbo_customer_id: 'child-3', qbo_sync_token: '2', active: 1 }, 'parent-2');
  assert.equal(customer().DisplayName, '26-0003 - Renamed Project');
  assert.equal(customer().Id, 'child-3');
  assert.equal(customer().SyncToken, '2');
});
