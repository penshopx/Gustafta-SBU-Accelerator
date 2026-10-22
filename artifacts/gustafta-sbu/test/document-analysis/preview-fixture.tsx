// Dev-only browser fixture. This is not an application entrypoint and never
// bypasses server auth: all fixture API responses are explicitly synthetic.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient } from '@tanstack/react-query';
import { getGetDocumentAnalysisSourceQueryKey, type CaseDocument } from '@workspace/api-client-react';
import { AccountQueries } from '../../src/components/account-queries';
import { DocumentAnalysisPanel } from '../../src/components/document-analysis-panel';
import '../../src/index.css';

const id = '11111111-1111-4111-8111-111111111111';
let version = 1;
let analysisCalls = 0;
let previewCalls = 0;
const revision = () => (version === 1 ? 'a' : 'b').repeat(64);
const source = () => ({ documentId: id, version, pageCount: 12, sourceRevision: revision(), model: 'fixture-no-AI' });
function image(page: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 1250;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#14253a'; ctx.font = 'bold 48px sans-serif';
  ctx.fillText(`HALAMAN ASLI ${page}`, 70, 130);
  ctx.font = '28px sans-serif'; ctx.fillText('Dokumen sintetis untuk uji keterbacaan', 70, 210);
  ctx.font = '16px sans-serif'; ctx.fillText('Detail kecil: periksa pada ukuran penuh sebelum menyetujui.', 70, 285);
  return canvas.toDataURL('image/png');
}
window.fetch = async (url, init) => {
  const path = String(url);
  if (new Headers(init?.headers).get('X-SBU-Form-Owner') !== 'fixture-owner') throw Error('unexpected fixture owner');
  if (path.endsWith('/analysis-source')) return Response.json(source());
  if (path.endsWith('/analysis-preview')) {
    previewCalls++;
    const input = JSON.parse(String(init?.body));
    await new Promise(resolve => setTimeout(resolve, 250));
    return Response.json({ documentId: id, caseId: 1, version, sourceRevision: input.sourceRevision,
      payloadBytes: 120000, images: input.pages.map((sourcePage: number) => ({ sourcePage, dataUrl: image(sourcePage) })) });
  }
  if (path.endsWith('/analyses') && init?.method !== 'POST') return Response.json([]);
  if (path.endsWith('/analyses')) { analysisCalls++; return Response.json({ error: 'fixture: paid AI disabled' }, { status: 503 }); }
  throw Error('Unexpected request in isolated fixture');
};
function Fixture() {
  const qc = useQueryClient();
  const [doc, setDoc] = useState<CaseDocument>({ id, caseId: 1, ownerId: 'fixture-owner', version,
    name: 'Dokumen sintetis — pratinjau halaman', contentType: 'application/pdf', size: 8000000,
    status: 'ready', scanStatus: 'clean', scannedAt: null, createdAt: '2026-10-22T00:00:00Z',
    category: 'keuangan', description: '' });
  return <>
    <div style={{ position: 'fixed', zIndex: 100, bottom: 8, right: 8, background: 'white', padding: 8 }}>
      <button data-testid="fixture-version-change" onClick={() => {
        version++; setDoc(old => ({ ...old, version }));
        qc.setQueryData(getGetDocumentAnalysisSourceQueryKey(1, id), source());
      }}>Fixture: ganti versi</button>
      <button data-testid="fixture-counters" onClick={event => {
        event.currentTarget.textContent = `Preview: ${previewCalls}; AI: ${analysisCalls}`;
      }}>Fixture: jumlah permintaan</button>
    </div>
    <DocumentAnalysisPanel doc={doc} expectedUserId="fixture-owner" close={() => {}} />
  </>;
}
createRoot(document.getElementById('root')!).render(
  <AccountQueries userId="fixture-owner"><Fixture /></AccountQueries>,
);
