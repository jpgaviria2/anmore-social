import test from 'node:test';
import assert from 'node:assert/strict';
import { safeURL } from '../src/core.js';

test('trailing-dot hostnames cannot bypass local URL rejection', () => {
  for (const value of [
    'https://localhost./private',
    'https://x.localhost./private',
    'https://printer.local./image.png',
    'https://LOCALHOST./private',
    'https://localhost%2e/private',
    'https://x.localhost../private',
    'https://127.0.0.1./private',
  ]) assert.equal(safeURL(value), null, value);
  assert.equal(safeURL('https://example.org/image.png'), 'https://example.org/image.png');
});
