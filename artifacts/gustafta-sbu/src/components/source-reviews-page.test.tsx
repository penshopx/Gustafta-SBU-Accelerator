import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SbuChatCitation, SbuChatSourceReviewInput, SbuChatSourceReviews } from '@workspace/api-client-react';
import { SourceReviewsPage } from './source-reviews-page';

const citation = (id: string, verificationStatus: 'verified' | 'unverified'): SbuChatCitation => ({
  id,
  document: 'Permen PUPR 7 Tahun 2024',
  version: '2024',
  locator: 'Pasal 17 ayat (3)',
  excerpt: 'Ringkasan sintetis untuk pengujian.',
  sourceUrl: 'https://example.org/regulasi',
  verificationStatus,
  verificationScope: verificationStatus === 'verified' ? 'Metadata katalog saja.' : 'Belum ditelaah.',
  documentStatus: 'berlaku pada metadata sumber',
  checkedOn: '2026-11-04',
  limitation: 'Bukan verifikasi hukum menyeluruh.',
});

const fixture: SbuChatSourceReviews = {
  versions: [
    { sourceKey: 'pupr7-example', versionId: 'pupr7-r1', baseline: true, citations: [citation('p7-r1@pupr7-r1', 'unverified')] },
    { sourceKey: 'pupr7-example', versionId: 'pupr7-r2', baseline: false, citations: [citation('p7-r2@pupr7-r2', 'verified')] },
  ],
  decisions: [{
    sourceKey: 'pupr7-example',
    versionId: 'pupr7-r1',
    expectedRevision: 0,
    status: 'approved',
    reason: 'Keputusan fixture sintetis.',
    reviewReference: 'fixture://review/1',
    revision: 1,
    reviewedBy: 'fixture-reviewer',
    decidedAt: '2026-11-05T00:00:00.000Z',
    citations: [citation('p7-r1@pupr7-r1', 'unverified')],
  }],
};

async function mount(
  load: () => Promise<SbuChatSourceReviews>,
  record: (input: SbuChatSourceReviewInput) => Promise<unknown>,
) {
  const { Window } = await import('happy-dom');
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = { window: globals.window, document: globals.document, act: globals.IS_REACT_ACT_ENVIRONMENT };
  const window = new Window({ url: 'http://localhost/source-reviews' });
  globals.window = window as unknown as typeof globals.window;
  globals.document = window.document as unknown as Document;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const container = window.document.createElement('div');
  window.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(SourceReviewsPage, {
    expectedUserId: 'synthetic-reviewer',
    load,
    record,
  }))));
  await act(async () => { await Promise.resolve(); });
  const close = async () => {
    await act(async () => root.unmount());
    await client.cancelQueries();
    client.clear();
    await window.happyDOM.close();
    globals.window = previous.window;
    globals.document = previous.document;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.act;
  };
  return { container, window, close };
}

test('menampilkan snapshot aktif dan kandidat tanpa mengaktifkan kandidat otomatis', async () => {
  const app = await mount(async () => fixture, async () => assert.fail('belum boleh mengirim keputusan'));
  try {
    const text = app.container.textContent ?? '';
    assert.match(text, /Versi retrieval aktif: pupr7-r1/);
    assert.match(text, /pupr7-r2/);
    assert.match(text, /Belum aktif/);
    assert.match(text, /Terverifikasi terbatas/);
    assert.match(text, /Bukan verifikasi hukum menyeluruh/);
    assert.equal(app.container.querySelector('[data-testid="form-source-review"]'), null);
  } finally {
    await app.close();
  }
});

test('keputusan kandidat memerlukan alasan, rujukan, attestasi dan aksi eksplisit', async () => {
  let submitted: unknown;
  let reads = 0;
  const app = await mount(async () => { reads++; return fixture; }, async input => { submitted = input; return {}; });
  try {
    const button = app.container.querySelector('[data-testid="button-review-pupr7-r2"]') as HTMLButtonElement | null;
    assert.ok(button);
    await act(async () => button.click());
    const submit = app.container.querySelector('[data-testid="button-submit-source-review"]') as HTMLButtonElement | null;
    assert.ok(submit);
    assert.equal(submit.disabled, true);
    assert.equal(submitted, undefined, 'membuka formulir tidak boleh menyimpan keputusan');

    const setValue = async (testId: string, value: string) => {
      const field = app.container.querySelector(`[data-testid="${testId}"]`) as HTMLTextAreaElement | null;
      assert.ok(field, testId);
      await act(async () => {
        Object.getOwnPropertyDescriptor(app.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
        field.dispatchEvent(new app.window.Event('input', { bubbles: true }) as unknown as Event);
      });
    };
    await setValue('input-review-reason', 'Telaah fixture sintetis.');
    await setValue('input-review-reference', 'fixture://review/candidate');
    assert.equal(submit.disabled, true, 'attestasi tetap diwajibkan');

    const attestation = app.container.querySelector('[data-testid="checkbox-review-attestation"]') as HTMLInputElement | null;
    assert.ok(attestation);
    await act(async () => attestation.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }) as unknown as Event));
    assert.equal(submit.disabled, false);
    await act(async () => submit.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.deepEqual(submitted, {
      sourceKey: 'pupr7-example',
      versionId: 'pupr7-r2',
      expectedRevision: 1,
      status: 'approved',
      reason: 'Telaah fixture sintetis.',
      reviewReference: 'fixture://review/candidate',
    });
    assert.ok(reads >= 2, 'ledger harus dimuat ulang setelah keputusan tersimpan');
    assert.match(app.container.textContent ?? '', /Keputusan tersimpan/);
  } finally {
    await app.close();
  }
});

test('gagal membaca ledger tidak menampilkan snapshot lama atau kandidat', async () => {
  const app = await mount(async () => { throw new Error('forbidden'); }, async () => assert.fail('tidak ada keputusan saat ledger gagal'));
  try {
    assert.match(app.container.textContent ?? '', /Riwayat sumber tidak dapat dibaca/);
    assert.doesNotMatch(app.container.textContent ?? '', /pupr7-r1|pupr7-r2|Ringkasan sintetis/);
  } finally {
    await app.close();
  }
});
