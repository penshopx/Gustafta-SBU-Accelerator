import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Layers, Pencil, ScanSearch, Trash2, Upload, X } from 'lucide-react';
import {
  useListCaseDocuments, useDeleteCaseDocument, getListCaseDocumentsQueryKey, getListDocumentVaultQueryKey,
  requestCaseDocumentUpload, completeCaseDocumentUpload, deleteCaseDocument, downloadCaseDocument,
  type CaseDocument, type DocumentUploadInput,
} from '@workspace/api-client-react';
import { useFormMutationOptions, useAccountReadOptions } from './account-queries';
import { Empty } from './dashboard-overview';
import { ErrorState, Loading } from './request-states';
import { DocumentMetadataDialog, categoryKeys, categoryLabels } from './document-metadata-dialog';
import { DocumentAnalysisPanel } from './document-analysis-panel';

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_DOCS = 20;
export const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
const UPLOAD_TIMEOUT = 120000;
const API_TIMEOUT = 30000;

export function validateFile(file: { size: number; type: string }): string | null {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) return 'Hanya PDF, PNG, atau JPEG yang dapat diunggah.';
  if (file.size < 1) return 'Berkas kosong.';
  if (file.size > MAX_BYTES) return 'Ukuran berkas maksimal 20 MiB.';
  return null;
}
export function documentError(error: unknown, fallback: string): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return 'Sesi Anda berakhir. Masuk kembali lalu coba lagi.';
  if (status === 409) return 'Permintaan dokumen ditolak. Pastikan akun masih sesuai dan batas penyimpanan belum tercapai.';
  if (status === 413 || status === 415) return 'Berkas ditolak: gunakan PDF, PNG, atau JPEG maksimal 20 MiB.';
  if (status === 422) return 'Berkas tidak sesuai format atau PDF rusak/terproteksi. Pilih berkas yang dapat dibuka, lalu coba lagi.';
  return fallback;
}
export const sizeLabel = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`;
const withTimeout = (ms: number, parent?: AbortSignal) => {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  if (parent?.aborted) ctl.abort();
  const onAbort = () => ctl.abort(); parent?.addEventListener('abort', onAbort);
  return { signal: ctl.signal, done: () => { clearTimeout(t); parent?.removeEventListener('abort', onAbort); } };
};

export async function saveDocumentBlob(caseId: number, d: { id: string; name: string }, request: RequestInit) {
  const blob = await downloadCaseDocument(caseId, d.id, { ...request, responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = d.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CaseDocuments({ id, expectedUserId, versionRequest }: { id: number; expectedUserId: string; versionRequest?: { docId: string; nonce: number } }) {
  const qc = useQueryClient();
  const options = useFormMutationOptions();
  const readOptions = useAccountReadOptions();
  const del = useDeleteCaseDocument(options);
  const list = useListCaseDocuments(id, { ...readOptions, query: { queryKey: getListCaseDocumentsQueryKey(id), retry: false } });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<File | null>(null);
  const [confirm, setConfirm] = useState<CaseDocument | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<NonNullable<DocumentUploadInput['category']>>('lainnya');
  const [uploadNote, setUploadNote] = useState('');
  const [versionOf, setVersionOf] = useState<CaseDocument | null>(null);
  const [editing, setEditing] = useState<CaseDocument | null>(null);
  const [analyzing, setAnalyzing] = useState<CaseDocument | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const appliedVersionRequest = useRef<number | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ctl.current?.abort(); }; }, []);
  const invalidate = () => { void qc.invalidateQueries({ queryKey: getListDocumentVaultQueryKey() }); return qc.invalidateQueries({ queryKey: getListCaseDocumentsQueryKey(id) }); };
  useEffect(() => {
    if (!versionRequest || appliedVersionRequest.current === versionRequest.nonce) return;
    const src = list.data?.find(x => x.id === versionRequest.docId && x.status === 'ready' && x.ownerId === expectedUserId && x.caseId === id);
    if (src) {
      appliedVersionRequest.current = versionRequest.nonce;
      setVersionOf(src); setUploadCategory(src.category ?? 'lainnya');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionRequest?.nonce, list.data]);

  const upload = async (file: File) => {
    const invalid = validateFile(file);
    if (invalid) { setMessage(invalid); return; }
    setBusy(true); setMessage(null); setFailed(null);
    const owner = options.request; // captured once; reused for request, complete and cleanup
    const run = new AbortController(); ctl.current = run;
    let pendingId: string | null = null;
    try {
      const body: DocumentUploadInput = { name: file.name.slice(0, 180), size: file.size, contentType: file.type as DocumentUploadInput['contentType'], category: uploadCategory, ...(uploadNote.trim() ? { description: uploadNote.trim() } : {}), ...(versionOf ? { versionOf: versionOf.id } : {}) };
      const a = withTimeout(API_TIMEOUT, run.signal);
      let created; try { created = await requestCaseDocumentUpload(id, body, { ...owner, signal: a.signal }); } finally { a.done(); }
      pendingId = created.document.id;
      if (created.document.ownerId !== expectedUserId || created.document.caseId !== id) throw new Error('owner');
      const b = withTimeout(UPLOAD_TIMEOUT, run.signal);
      try {
        const res = await fetch(created.uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type }, signal: b.signal });
        if (!res.ok) throw new Error('put');
      } finally { b.done(); }
      const c = withTimeout(API_TIMEOUT, run.signal);
      try {
        const completed = await completeCaseDocumentUpload(id, pendingId, { ...owner, signal: c.signal });
        if (completed.ownerId !== expectedUserId || completed.caseId !== id) throw new Error('owner');
      } finally { c.done(); }
      pendingId = null;
      if (alive.current) { setVersionOf(null); setUploadNote(''); }
      if (alive.current) setMessage('Dokumen asli tersimpan. Ini bukan bukti terverifikasi dan tidak mengubah catatan bukti atau status persiapan.');
    } catch (e) {
      if (pendingId) { try { await deleteCaseDocument(id, pendingId, { ...owner }); } catch { /* pending record can be removed manually */ } }
      if (alive.current) { setFailed(file); setMessage(documentError(e, 'Unggahan belum dapat dikonfirmasi. Periksa daftar dokumen sebelum mencoba kembali.')); }
    } finally {
      if (alive.current) setBusy(false);
      void invalidate();
    }
  };

  const download = async (d: CaseDocument) => {
    setMessage(null);
    try {
      await saveDocumentBlob(id, d, readOptions.request);
    } catch (e) { if (alive.current) setMessage(documentError(e, 'Dokumen belum dapat diunduh. Silakan coba lagi.')); }
  };

  const remove = () => {
    if (!confirm) return;
    setDelError(null);
    del.mutate({ id, documentId: confirm.id }, {
      onSuccess: () => { setConfirm(null); setMessage('Dokumen telah dihapus.'); setFailed(null); void invalidate(); },
      onError: e => setDelError(documentError(e, 'Dokumen belum terhapus. Daftar tidak berubah; silakan coba lagi.')),
    });
  };

  const docs = list.data;
  const foreign = !!docs && docs.some(d => d.ownerId !== expectedUserId || d.caseId !== id);
  const full = !!docs && docs.length >= MAX_DOCS;
  return <section className="mt-10" data-testid="section-case-documents">
    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="display text-xl font-extrabold">Dokumen asli</h2><p className="mt-1 text-xs text-[#617a90]">PDF, PNG, atau JPEG maksimal 20 MiB; hingga 20 versi per kasus dan 200 MiB per akun. Disimpan privat di akun ini. Unggahan bukan verifikasi dan tidak otomatis menjadi bukti.</p></div>
      <label className={`btn btn-primary ${busy || full || foreign ? 'opacity-60' : ''}`}><Upload size={16}/>{busy ? 'Mengunggah...' : 'Unggah dokumen'}<input data-testid="input-upload-document" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy || full || foreign} className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} /></label></div>
    <div className="mb-4 grid gap-3 sm:grid-cols-[200px_1fr]"><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#2b4159]">Kategori unggahan</span><select data-testid="select-upload-category" className="field" value={uploadCategory} disabled={busy} onChange={e => setUploadCategory(e.target.value as NonNullable<DocumentUploadInput['category']>)}>{categoryKeys.map(k => <option key={k} value={k}>{categoryLabels[k]}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#2b4159]">Catatan (opsional)</span><input data-testid="input-upload-note" className="field" maxLength={2000} value={uploadNote} disabled={busy} onChange={e => setUploadNote(e.target.value)} placeholder="Mis. akta perubahan terakhir" /></label></div>
    {versionOf && <div data-testid="banner-new-version" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#b9d5e9] bg-[#eaf4ff] p-3 text-xs text-[#173d5d]"><span className="min-w-0 flex-1 break-words">Unggahan berikutnya menjadi versi baru dari <b>{versionOf.name}</b> (v{versionOf.version ?? 1}). Versi lama tetap tersimpan.</span><button className="btn btn-outline !min-h-[34px]" onClick={() => setVersionOf(null)}>Batal versi baru</button></div>}
    {message && <p role="status" data-testid="text-document-message" className="mb-3 rounded-lg border border-[#c7deef] bg-[#eff7fd] p-3 text-sm text-[#365a76]">{message}{failed && !busy && <button data-testid="button-retry-upload" className="ml-3 font-bold underline" onClick={() => void upload(failed)}>Coba lagi</button>}</p>}
    {busy && <button data-testid="button-cancel-upload" className="btn btn-outline mb-3" onClick={() => ctl.current?.abort()}><X size={14}/> Batalkan unggahan</button>}
    {list.isLoading ? <Loading rows={2}/> : list.isError || foreign ? <ErrorState retry={() => { void list.refetch(); }} message="Daftar dokumen belum dapat dimuat." /> : docs?.length ? <div className="space-y-3">{docs.map(d => <div key={d.id} data-testid={`card-document-${d.id}`} className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><FileText size={20} className="shrink-0 text-[#1769d1]"/><div className="min-w-0 flex-1"><div className="truncate font-bold">{d.name}</div><div className="mt-0.5 flex flex-wrap gap-1.5"><span className="rounded-full bg-[#e6f1fc] px-2 py-0.5 text-[10px] font-bold text-[#1769d1]">{categoryLabels[d.category ?? 'lainnya']}</span><span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-[10px] font-bold text-[#445d74]">v{d.version ?? 1}</span></div>{d.description && <div className="mt-1 break-words text-xs text-[#58708a]">{d.description}</div>}<div className="text-[11px] text-[#8195a5]">{sizeLabel(d.size)} · {d.contentType} · {d.status === 'ready' ? 'Tersimpan, belum diverifikasi' : 'Unggahan belum selesai'}</div></div><div className="flex flex-wrap gap-1">{d.status === 'ready' && <><button data-testid={`button-bedah-${d.id}`} aria-label={`Bedah Dokumen ${d.name}`} onClick={() => setAnalyzing(d)} className="rounded-lg p-2 text-[#1769d1] hover:bg-[#eaf4fc]"><ScanSearch size={16}/></button><button data-testid={`button-edit-document-${d.id}`} aria-label={`Ubah keterangan ${d.name}`} onClick={() => setEditing(d)} className="rounded-lg p-2 text-[#456986] hover:bg-[#eaf4fc]"><Pencil size={16}/></button><button data-testid={`button-new-version-${d.id}`} aria-label={`Unggah versi baru ${d.name}`} onClick={() => { setVersionOf(d); setUploadCategory(d.category ?? 'lainnya'); }} className="rounded-lg p-2 text-[#456986] hover:bg-[#eaf4fc]"><Layers size={16}/></button></>}{d.status === 'ready' && <button data-testid={`button-download-document-${d.id}`} aria-label={`Unduh ${d.name}`} onClick={() => void download(d)} className="rounded-lg p-2 text-[#456986] hover:bg-[#eaf4fc]"><Download size={16}/></button>}<button data-testid={`button-delete-document-${d.id}`} aria-label={d.status === 'ready' ? `Hapus ${d.name}` : `Batalkan ${d.name}`} onClick={() => { setDelError(null); setConfirm(d); }} className="rounded-lg p-2 text-[#ad4a48] hover:bg-[#fff0ef]"><Trash2 size={16}/></button></div></div>)}</div> : <Empty title="Belum ada dokumen asli" detail="Unggah salinan dokumen untuk disimpan bersama kasus ini. Dokumen tidak dibaca atau diverifikasi." />}
    {confirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1b2ad9] p-4"><section role="dialog" aria-modal="true" aria-label="Hapus dokumen" className="surface w-full max-w-[480px] p-6"><h2 className="display text-xl font-extrabold">{confirm.status === 'ready' ? 'Hapus dokumen?' : 'Batalkan unggahan?'}</h2><p className="mt-3 text-sm leading-7 text-[#567088]">Berkas akan dihapus permanen dari penyimpanan dan tidak dapat dipulihkan. Analisis tersimpan untuk versi ini juga ikut terhapus.</p>{delError && <p role="alert" className="mt-3 text-sm text-[#b34442]">{delError}</p>}<div className="mt-6 flex justify-end gap-2"><button data-testid="button-cancel-delete-document" className="btn btn-outline" onClick={() => setConfirm(null)}>Batal</button><button data-testid="button-confirm-delete-document" disabled={del.isPending} className="btn btn-danger" onClick={remove}>{del.isPending ? 'Menghapus...' : 'Ya, hapus permanen'}</button></div></section></div>}
    {editing && <DocumentMetadataDialog key={editing.id} doc={editing} expectedUserId={expectedUserId} close={() => setEditing(null)} />}
    {analyzing && <DocumentAnalysisPanel key={analyzing.id} doc={analyzing} expectedUserId={expectedUserId} close={() => setAnalyzing(null)} />}
  </section>;
}
