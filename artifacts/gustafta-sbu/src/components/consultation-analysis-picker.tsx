import { useEffect, useState } from 'react';
import {
  useListCaseDocuments, useListDocumentAnalyses, useGetConsultationAnalysisPreview,
  getListDocumentAnalysesQueryKey, getGetConsultationAnalysisPreviewQueryKey,
  type ConsultationAnalysisSelection,
} from '@workspace/api-client-react';
import { useAccountReadOptions } from './account-queries';

export type AnalysisChoice = { selection?: ConsultationAnalysisSelection; ready: boolean };

export function ConsultationAnalysisPicker({ caseId, onChange, destination = 'consultation', disabled = false }: {
  caseId: number; onChange: (choice: AnalysisChoice) => void; destination?: 'consultation' | 'assistant'; disabled?: boolean;
}) {
  const assistant = destination === 'assistant';
  const read = useAccountReadOptions();
  const [documentId, setDocumentId] = useState('');
  const [analysisId, setAnalysisId] = useState('');
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const [approved, setApproved] = useState('');
  const docs = useListCaseDocuments(caseId, read);
  const analyses = useListDocumentAnalyses(caseId, documentId, { ...read, query: {
    enabled: !!documentId, queryKey: getListDocumentAnalysesQueryKey(caseId, documentId),
  } });
  const preview = useGetConsultationAnalysisPreview(caseId, documentId, analysisId, {
    ...read, query: { enabled: !!documentId && !!analysisId, staleTime: 0, retry: false,
      queryKey: getGetConsultationAnalysisPreviewQueryKey(caseId, documentId, analysisId) },
  });
  const p = preview.data;
  const text = excerpt ?? p?.text.slice(0, 4000) ?? '';
  const signature = JSON.stringify([documentId, analysisId, p?.revision, text]);
  const valid = !!p && !preview.isError && text.trim().length > 0 && text.length <= 4000 && p.text.includes(text);
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
    <label className="block text-xs font-bold">Hasil Bedah Dokumen (opsional)
      <select className="field mt-2" data-testid="select-consult-document" disabled={disabled} value={documentId} onChange={e => {
        setDocumentId(e.target.value); setAnalysisId(''); reset();
      }}><option value="">Tanpa hasil analisis</option>{usable.map(d => <option key={d.id} value={d.id}>{d.name} — versi {d.version}</option>)}</select>
    </label>
    {docs.isLoading && <p className="text-xs">Memuat dokumen…</p>}
    {docs.isSuccess && !usable.length && <p className="text-xs">Belum ada dokumen bersih yang tersedia untuk dipilih.</p>}
    {docs.isError && <p role="alert" className="text-xs text-[#8e2f2e]">Dokumen belum dapat dimuat. <button type="button" className="underline" onClick={() => void docs.refetch()}>Coba lagi</button></p>}
    {documentId && <label className="block text-xs font-bold">Pilih satu hasil privat
      <select className="field mt-2" data-testid="select-consult-analysis" disabled={disabled} value={analysisId} onChange={e => {
        setAnalysisId(e.target.value); reset();
      }}><option value="">Tanpa hasil analisis</option>{analyses.data?.map(a => <option key={a.id} value={a.id}>{a.focus} — {new Date(a.createdAt).toLocaleString('id-ID')} — versi {a.sourceVersion ?? 'belum tercatat'}</option>)}</select>
    </label>}
    {documentId && analyses.isLoading && <p className="text-xs">Memuat riwayat analisis…</p>}
    {documentId && analyses.isSuccess && !analyses.data.length && <p className="text-xs">Dokumen ini belum memiliki hasil Bedah Dokumen.</p>}
    {documentId && analyses.isError && <p role="alert" className="text-xs text-[#8e2f2e]">Riwayat belum dapat dimuat. <button type="button" className="underline" onClick={() => void analyses.refetch()}>Coba lagi</button></p>}
    {analysisId && preview.isLoading && <p className="text-xs">Memeriksa sumber dan versi…</p>}
    {analysisId && preview.isError && <p role="alert" className="text-xs text-[#8e2f2e]">Sumber tidak tersedia atau versinya tidak dapat dipastikan. Pilih hasil baru. <button type="button" className="underline" onClick={() => { reset(); void preview.refetch(); }}>Periksa ulang</button></p>}
    {analysisId && p && !preview.isError && <>
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
