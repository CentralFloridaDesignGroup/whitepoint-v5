import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadBlob } from '../src/browserFiles.ts';
import { formatUsdCents } from '../src/currency.ts';

test('USD formatter treats its input as cents', () => {
  assert.equal(formatUsdCents(123456), '$1,234.56');
  assert.equal(formatUsdCents(-99), '-$0.99');
});

test('download keeps its blob URL until after the browser can read it', () => {
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  let clicked = false;
  let revoked = false;
  let scheduled;
  const link = { href: '', download: '', click: () => { clicked = true; } };
  try {
    URL.createObjectURL = () => 'blob:invoice';
    URL.revokeObjectURL = () => { revoked = true; };
    globalThis.document = { createElement: () => link };
    globalThis.window = { setTimeout: (callback, delay) => { scheduled = { callback, delay }; } };
    downloadBlob(new Blob(['pdf']), 'invoice.pdf');
    assert.equal(clicked, true);
    assert.equal(link.href, 'blob:invoice');
    assert.equal(link.download, 'invoice.pdf');
    assert.equal(revoked, false);
    assert.ok(scheduled.delay > 0);
    scheduled.callback();
    assert.equal(revoked, true);
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  }
});
