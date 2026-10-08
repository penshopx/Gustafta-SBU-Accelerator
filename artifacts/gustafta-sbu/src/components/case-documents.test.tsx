import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, documentError, MAX_BYTES } from './case-documents';

test('validateFile enforces type and size', () => {
  assert.equal(validateFile({ size: 10, type: 'application/pdf' }), null);
  assert.ok(validateFile({ size: 10, type: 'text/html' }));
  assert.ok(validateFile({ size: MAX_BYTES + 1, type: 'image/png' }));
  assert.ok(validateFile({ size: 0, type: 'image/png' }));
});
test('documentError never leaks raw message', () => {
  const msg = documentError({ status: 500, message: 'https://signed.example/?sig=1' }, 'Aman');
  assert.equal(msg, 'Aman');
  assert.match(documentError({ status: 409 }, 'x'), /dokumen/);
});
