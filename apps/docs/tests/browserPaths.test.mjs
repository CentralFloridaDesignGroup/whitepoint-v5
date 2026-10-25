import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStoredPaths, rememberRecentPath } from '../src/browserPaths.ts';

test('recent pages recover from malformed storage and keep distinct valid paths', () => {
  const values = new Map([['recent', '{invalid']]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  try {
    assert.deepEqual(readStoredPaths('recent'), []);
    rememberRecentPath('recent', '/checklists/plat');
    rememberRecentPath('recent', '/tools/cxl-editor');
    rememberRecentPath('recent', '/checklists/plat');
    assert.deepEqual(readStoredPaths('recent'), ['/checklists/plat', '/tools/cxl-editor']);
    rememberRecentPath('recent', 'https://elsewhere.example');
    assert.deepEqual(readStoredPaths('recent'), ['/checklists/plat', '/tools/cxl-editor']);
  } finally {
    delete globalThis.localStorage;
  }
});
