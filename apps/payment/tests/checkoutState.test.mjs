import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutIdentity, confirmCheckout } from '../src/checkoutState.ts';

test('a session belongs only to the token, invoice, and balance that created it', () => {
  const current = checkoutIdentity('token-a', { id: 'invoice-a', balanceCents: 1000 });
  assert.notEqual(current, checkoutIdentity('token-b', { id: 'invoice-a', balanceCents: 1000 }));
  assert.notEqual(current, checkoutIdentity('token-a', { id: 'invoice-b', balanceCents: 1000 }));
  assert.notEqual(current, checkoutIdentity('token-a', { id: 'invoice-a', balanceCents: 500 }));
});

test('failed confirmations leave completion untouched and expose a retryable error', async () => {
  let completed = 0;
  const complete = () => { completed += 1; };
  assert.equal(await confirmCheckout(async () => ({ type: 'error', error: { message: 'Card declined' } }), complete), 'Card declined');
  assert.equal(await confirmCheckout(async () => { throw new Error('Network failed'); }, complete), 'Network failed');
  assert.equal(completed, 0);
  assert.match(await confirmCheckout(async () => ({ type: 'success' }), complete), /Payment submitted/);
  assert.equal(completed, 1);
});
