import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('React, React DOM dan renderer pengujian memakai versi yang sama', () => {
  const react = require('react/package.json').version;
  assert.equal(require('react-dom/package.json').version, react);
  assert.equal(require('react-test-renderer/package.json').version, react);
});
