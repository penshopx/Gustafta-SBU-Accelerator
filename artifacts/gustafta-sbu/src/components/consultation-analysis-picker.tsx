import { useEffect, useState, type ReactNode } from 'react';
import {
  useListCaseDocuments, useListDocumentAnalyses, useGetConsultationAnalysisPreview,
  getListDocumentAnalysesQueryKey, getListCaseDocumentsQueryKey, getGetConsultationAnalysisPreviewQueryKey,
  type ConsultationAnalysisSelection,
} from '@workspace/api-client-react';
import { useAccountReadOptions } from './account-queries';

export type AnalysisChoice = { selection?: ConsultationAnalysisSelection; ready: boolean };

export type DocumentScope = { documentId: string; ownerId: string; version: number; name: string };

export function ConsultationAnalysisPicker({ caseId, onChange, destination = 'consultation', disabled = false, documentScope, emptyAction }: {
  caseId: number; onChange: (choice: AnalysisChoice) => void; destination?: 'consultation' | 'assistant'; disabled?: boolean;
  documentScope?: DocumentScope; emptyAction?: ReactNode;
}) {
  const assistant = destination === 'assistant';
  const read = useAccountReadOptions();
  const [pickedDocumentId, setDocumentId] = useState('');
  const [analysisId, setAnalysisId] = useState('');
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const [approved, setApproved] = useState('');
  const docs = useListCaseDocuments(caseId, documentScope
    ? { ...read, query: { queryKey: getListCaseDocumentsQueryKey(caseId), staleTime: 0, refetchOnMount: 'always' as const } } : read);
  // Fixed scope: the document must still be owned, clean, ready and at the same version per the current API response.
  const scoped = documentScope ? docs.data?.find(d => d.id === documentScope.documentId) : undefined;
  const scopeOk = !documentScope || (docs.isSuccess && docs.isFetchedAfterMount && !!scoped && scoped.ownerId === documentScope.ownerId && scoped.caseId === caseId &&
    scoped.status === 'ready' && scoped.scanStatus === 'clean' && (scoped.version ?? 1) === documentScope.version);
  const documentId = documentScope ? (scopeOk ? documentScope.documentId : '') : pickedDocumentId;
  const analyses = useListDocumentAnalyses(caseId, documentId, { ...read, query: {
    enabled: !!documentId, queryKey: getListDocumentAnalysesQueryKey(caseId, documentId),
    ...(documentScope ? { staleTime: 0, refetchOnMount: 'always' as const } : {}),
  } });
  const listed = documentScope ? analyses.data?.filter(a => a.documentId === documentId && a.caseId === caseId &&
    a.ownerId === documentScope.ownerId && a.sourceVersion === documentScope.version) : analyses.data;
  const preview = useGetConsultationAnalysisPreview(caseId, documentId, analysisId, {
    ...read, query: { enabled: !!documentId && !!analysisId, staleTime: 0, retry: false,
      queryKey: getGetConsultationAnalysisPreviewQueryKey(caseId, documentId, analysisId) },
  });
  const p = preview.data;
  const text = excerpt ?? p?.text.slice(0, 4000) ?? '';
  const signature = JSON.stringify([documentId, analysisId, p?.revision, text]);
  const previewMatchesScope = !documentScope || (!!p && p.caseId === caseId && p.documentId === documentId &&
    p.analysisId === analysisId && p.sourceVersion === documentScope.version);
  const valid = !!p && !preview.isError && text.trim().length > 0 && text.length <= 4000 && p.text.includes(text) && previewMatchesScope;
  const confirmed = valid && approved === signature;
  useEffect(() => { setApproved(''); }, [p?.revision, preview.isError]);
  useEffect(() => {
    onChange({
      ready: !analysisId || confirmed,
      selection: confirmed && p ? { documentId, analysisId, revision: p.revision, excerpt: text, consent: true } : undefined,
    });
  }, [documentId, analysisId, p?.revision, text, confirmed, onChange]);
  const reset = () => { setApproved(''); setExcerpt(null); };
  const usable = docs.data?.filter(d => d.status === 'ready' && d.scanStatus === 'clean') ?? [];
  return <section className="mt-4 space-y-3 border-t border-[#d8e4ec] pt-4" aria-label="Bahan Bedah Dokumen">
    {documentScope && <div data-testid="text-scoped-document" className="rounded-lg border border-[#b9d5e9] bg-white p-3 text-xs leading-5">
      <div className="font-bold">Dokumen terkunci: {documentScope.name} <span className="font-normal">(versi {documentScope.version})</span></div>
      <p>Hanya dokumen ini dan hasil analisisnya yang dapat dipilih. Dokumen lain tidak dapat dipilih di percakapan ini.</p>
    </div>}
    {documentScope && docs.isSuccess && docs.isFetchedAfterMount && !scopeOk && <p role="alert" data-testid="error-scoped-document" className="text-xs text-[#8e2f2e]">Dokumen ini tidak lagi tersedia, bersih, siap, atau berubah versi. Tutup percakapan dan buka kembali dari Ruang Simpan.</p>}
    {!documentScope && <label className="block text-xs font-bold">Hasil Bedah Dokumen (opsional)
      <select className="field mt-2" data-testid="select-consult-document" disabled={disabled} value={documentId} onChange={e => {
        setDocumentId(e.target.value); setAnalysisId(''); reset();
      }}><option value="">Tanpa hasil analisis</option>{usable.map(d => <option key={d.id} value={d.id}>{d.name} — versi {d.version}</option>)}</select>
    </label>}
    {docs.isLoading && <p className="text-xs">Memuat dokumen…</p>}
    {!documentScope && docs.isSuccess && !usable.length && <p className="text-xs">Belum ada dokumen bersih yang tersedia untuk dipilih.</p>}
    {docs.isError && <p role="alert" className="text-xs text-[#8e2f2e]">Dokumen belum dapat dimuat. <button type="button" className="underline" onClick={() => void docs.refetch()}>Coba lagi</button></p>}
    {documentId && <label className="block text-xs font-bold">Pilih satu hasil privat
      <select className="field mt-2" data-testid="select-consult-analysis" disabled={disabled} value={analysisId} onChange={e => {
        setAnalysisId(e.target.value); reset();
      }}><option value="">{documentScope ? 'Pilih satu hasil' : 'Tanpa hasil analisis'}</option>{listed?.map(a => <option key={a.id} value={a.id}>{a.focus} — {new Date(a.createdAt).toLocaleString('id-ID')} — versi {a.sourceVersion ?? 'belum tercatat'}</option>)}</select>
    </label>}
    {documentId && analyses.isLoading && <p className="text-xs">Memuat riwayat analisis…</p>}
    {documentId && analyses.isSuccess && !listed?.length && <div className="text-xs" data-testid="text-no-analysis"><p>{documentScope ? 'Belum ada hasil Bedah Dokumen untuk versi dokumen ini.' : 'Dokumen ini belum memiliki hasil Bedah Dokumen.'}</p>{documentScope && emptyAction}</div>}
    {documentId && analyses.isError && <p role="alert" className="text-xs text-[#8e2f2e]">Riwayat belum dapat dimuat. <button type="button" className="underline" onClick={() => void analyses.refetch()}>Coba lagi</button></p>}
    {analysisId && preview.isLoading && <p className="text-xs">Memeriksa sumber dan versi…</p>}
    {analysisId && preview.isError && <p role="alert" className="text-xs text-[#8e2f2e]">Sumber tidak tersedia atau versinya tidak dapat dipastikan. Pilih hasil baru. <button type="button" className="underline" onClick={() => { reset(); void preview.refetch(); }}>Periksa ulang</button></p>}
    {analysisId && p && !preview.isError && !previewMatchesScope && <p role="alert" data-testid="error-scoped-preview" className="text-xs text-[#8e2f2e]">Pratinjau tidak cocok dengan kasus, dokumen, analisis, atau versi terkunci, sehingga tidak dapat dipakai. Pilih hasil lain.</p>}
    {analysisId && p && !preview.isError && previewMatchesScope && <>
      <p className="text-xs">Versi {p.sourceVersion} · halaman {p.sourcePages.join(', ')} · {p.model}. Hasil ini tetap draf AI, bukan bukti terverifikasi.</p>
      {assistant && <details data-testid="preview-chat-analysis-reference">
        <summary className="cursor-pointer text-xs underline">Lihat referensi persis yang ikut dikirim</summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify({
          caseId: p.caseId, documentId: p.documentId, analysisId: p.analysisId,
          sourceVersion: p.sourceVersion, sourcePages: p.sourcePages, model: p.model,
          focus: p.focus, createdAt: p.createdAt, revision: p.revision,
        }, null, 2)}</pre>
      </details>}
      <details><summary className="cursor-pointer text-xs underline">Lihat hasil lengkap untuk memilih cuplikan</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{p.text}</pre></details>
      <label className="block text-xs font-bold">{assistant ? 'Cuplikan persis yang akan dikirim' : 'Cuplikan persis yang akan disimpan dan dikirim'}
        <textarea data-testid="input-analysis-excerpt" disabled={disabled} className="field mt-2 min-h-40" value={text} onChange={e => { setExcerpt(e.target.value); setApproved(''); }} />
      </label>
      <p className="text-xs">{text.length}/4.000 karakter. Pilih satu bagian teks berurutan dari hasil di atas; cuplikan awal dibatasi 4.000 karakter.</p>
      {!valid && <p role="alert" className="text-xs text-[#8e2f2e]">Cuplikan harus sama persis dengan bagian hasil, tidak kosong, dan maksimal 4.000 karakter.</p>}
      <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" data-testid="checkbox-approve-analysis" disabled={!valid || disabled} checked={confirmed} onChange={e => setApproved(e.target.checked ? signature : '')} /><span>{assistant ? 'Saya menyetujui cuplikan persis ini dan referensi kasus, dokumen, analisis, versi/revisi, halaman, fokus, model, dan waktu yang ditampilkan dikirim ke Claude Sonnet 5.5 melalui Replit AI Integrations pada setiap pesan percakapan ini. Hanya cuplikan dan referensi yang dikirim; tidak disimpan sebagai konsultasi, dan dokumen asli, profil, serta hasil analisis lain tidak ikut. Perubahan cuplikan membatalkan persetujuan.' : 'Saya menyetujui cuplikan persis ini beserta referensi kasus, dokumen, analisis, versi, halaman, fokus, model, dan waktu sebagai snapshot konsultasi. Dokumen asli, profil, dan hasil lain tidak ikut dikirim. Perubahan cuplikan membatalkan persetujuan.'}</span></label>
    </>}
  </section>;
}
