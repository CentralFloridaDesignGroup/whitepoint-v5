import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centsToDollars, dollarsToCents } from '../src/pages/common/currency.ts';

test('dollar entry converts exactly to integer cents', () => {
  assert.equal(dollarsToCents('0.01'), 1);
  assert.equal(dollarsToCents('1234.5'), 123450);
  assert.equal(dollarsToCents('1234.56'), 123456);
  assert.equal(dollarsToCents('1.234'), null);
  assert.equal(dollarsToCents('-1.00'), null);
  assert.equal(centsToDollars(123456), '1234.56');
  assert.equal(centsToDollars(null), '');
});
