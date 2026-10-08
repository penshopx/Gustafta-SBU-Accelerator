import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { sessionFailureMessage, SessionVerificationError } from './session-verification-error';

const render = (error: unknown) => renderToStaticMarkup(createElement(SessionVerificationError, {
  error, retry: async () => {}, reload: () => {}, signOut: async () => {},
}));

test('401 explains session recovery without showing API error bodies', () => {
  const html = render({ status: 401, message: 'PRIVATE-CONTENT', data: { token: 'DO-NOT-DISPLAY' } });
  assert.match(html, /HTTP 401/);
  assert.match(html, /Keluar dan masuk kembali/);
  assert.match(html, /Data ruang kerja tidak dihapus/);
  assert.doesNotMatch(html, /PRIVATE-CONTENT|DO-NOT-DISPLAY/);
});

test('server, permission, routing and parse errors are not mistaken for expired sessions', () => {
  for (const [status, text] of [[503, 'Layanan pemeriksaan identitas sedang gagal'], [403, 'ditolak oleh server'], [404, 'tidak ditemukan'], [200, 'tidak dapat dibaca']] as const) {
    const html = render({ status });
    assert.match(html, new RegExp(text));
    assert.match(html, new RegExp(`HTTP ${status}`));
    assert.doesNotMatch(html, /button-relogin-session/);
  }
});

test('only known 401 diagnostic codes are displayed, never arbitrary API content', () => {
  for (const [code, text] of [
    ['session_missing', 'Server belum menerima kredensial sesi'],
    ['session_expired', 'Sesi sudah kedaluwarsa'],
    ['session_issuer_mismatch', 'Penerbit sesi tidak cocok'],
    ['session_not_verified', 'Kredensial sesi belum berhasil diverifikasi'],
  ]) {
    const html = render({ status: 401, data: { code, error: 'PRIVATE-DIAGNOSTIC' } });
    assert.match(html, new RegExp(text));
    assert.match(html, new RegExp(code));
    assert.doesNotMatch(html, /PRIVATE-DIAGNOSTIC/);
  }
  assert.doesNotMatch(render({ status: 401, data: { code: 'PRIVATE-DIAGNOSTIC' } }), /PRIVATE-DIAGNOSTIC/);
  assert.doesNotMatch(render({ status: 503, data: { code: 'session_issuer_mismatch' } }), /session_issuer_mismatch/);
});

test('network failure and invalid statuses never display raw diagnostic content', () => {
  for (const error of [new Error('secret-network-detail'), { status: '<script>' }, { status: Infinity }, { status: 700 }, null]) {
    assert.equal(sessionFailureMessage(error).status, null);
    assert.doesNotMatch(render(error), /secret-network-detail|&lt;script|HTTP /);
  }
});

test('retry, reload and explicit sign-out call only their own action', async () => {
  let retries = 0, reloads = 0, signOuts = 0;
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(createElement(SessionVerificationError, {
      error: { status: 401 },
      retry: async () => { retries++; },
      reload: () => { reloads++; },
      signOut: async () => { signOuts++; },
    }));
  });
  assert.equal(signOuts, 0, 'Showing an auth error must not sign out automatically');
  for (const id of ['button-retry-session', 'button-reload-session', 'button-relogin-session']) {
    await act(async () => { tree.root.findByProps({ 'data-testid': id }).props.onClick(); });
  }
  assert.deepEqual([retries, reloads, signOuts], [1, 1, 1]);
  await act(async () => { tree.unmount(); });
});

test('failed sign-out leaves a retryable error, not an opened private workspace', async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(createElement(SessionVerificationError, {
      error: { status: 401 }, retry: async () => {}, reload: () => {},
      signOut: async () => { throw new Error('secret-signout-detail'); },
    }));
  });
  await act(async () => { tree.root.findByProps({ 'data-testid': 'button-relogin-session' }).props.onClick(); });
  const content = JSON.stringify(tree.toJSON());
  assert.match(content, /Tindakan belum berhasil/);
  assert.doesNotMatch(content, /secret-signout-detail/);
  assert.equal(tree.root.findByProps({ 'data-testid': 'button-relogin-session' }).props.disabled, false);
  await act(async () => { tree.unmount(); });
});
