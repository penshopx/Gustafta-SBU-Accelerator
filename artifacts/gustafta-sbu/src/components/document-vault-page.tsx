import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Layers, Pencil, ScanSearch, Search, Trash2 } from 'lucide-react';
import {
  useListDocumentVault, useListCases, useDeleteCaseDocument,
  getListDocumentVaultQueryKey, getListCaseDocumentsQueryKey, getListCasesQueryKey,
  type ListDocumentVault200DocumentsItem, type ListDocumentVaultCategory,
} from '@workspace/api-client-react';
import { useFormMutationOptions } from './account-queries';
import { CaseDocuments, documentError, saveDocumentBlob, sizeLabel } from './case-documents';
import { DocumentAnalysisPanel } from './document-analysis-panel';
import { DocumentMetadataDialog, SimpleModal, categoryKeys, categoryLabels } from './document-metadata-dialog';
import { Empty } from './dashboard-overview';
import { ErrorState, Loading } from './request-states';

export function DocumentVaultPage({ expectedUserId, canOwnCases }: { expectedUserId: string; canOwnCases: boolean }) {
  const qc = useQueryClient();
  const options = useFormMutationOptions();
  const del = useDeleteCaseDocument(options);
  const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [category, setCategory] = useState(''); const [caseId, setCaseId] = useState(''); const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false); const [uploadCase, setUploadCase] = useState('');
  const [versionReq, setVersionReq] = useState<{ docId: string; nonce: number } | undefined>();
  const [editing, setEditing] = useState<ListDocumentVault200DocumentsItem | null>(null);
  const [analyzing, setAnalyzing] = useState<ListDocumentVault200DocumentsItem | null>(null);
  const [confirm, setConfirm] = useState<ListDocumentVault200DocumentsItem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const cases = useListCases({ query: { enabled: canOwnCases, queryKey: getListCasesQueryKey() } });
  const params = { ...(dq ? { q: dq } : {}), ...(category ? { category: category as ListDocumentVaultCategory } : {}), ...(caseId ? { caseId: Number(caseId) } : {}), page };
  const vault = useListDocumentVault(params, { query: { queryKey: getListDocumentVaultQueryKey(params), retry: false } });
  const data = vault.data;
  const foreign = !!data && (data.userId !== expectedUserId || !Array.isArray(data.documents) || data.documents.some(d => d.ownerId !== expectedUserId));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.pageSize || 50))) : 1;
  const chosen = cases.data ?? [];
  const caseOptions = chosen.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>);

  const download = async (d: ListDocumentVault200DocumentsItem) => {
    setNote(null);
    try { await saveDocumentBlob(d.caseId, d); } catch (e) { setNote(documentError(e, 'Dokumen belum dapat diunduh. Silakan coba lagi.')); }
  };
  const remove = () => {
    if (!confirm) return; const t = confirm; setDelError(null);
    del.mutate({ id: t.caseId, documentId: t.id }, {
      onSuccess: () => { setConfirm(null); setNote('Dokumen telah dihapus.'); void qc.invalidateQueries({ queryKey: getListDocumentVaultQueryKey() }); void qc.invalidateQueries({ queryKey: getListCaseDocumentsQueryKey(t.caseId) }); },
      onError: e => setDelError(documentError(e, 'Dokumen belum terhapus. Silakan coba lagi.')),
    });
  };
  const newVersion = (d: ListDocumentVault200DocumentsItem) => { setUploadCase(String(d.caseId)); setUploadOpen(true); setVersionReq({ docId: d.id, nonce: Date.now() }); };

  return <div className="min-w-0">
    <div className="mb-7"><div className="eyebrow mb-2 text-[#1769d1]">RUANG KERJA / RUANG SIMPAN</div><h1 className="display text-[30px] font-extrabold leading-tight sm:text-[39px]">Ruang Simpan</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Berkas persiapan sertifikasi konstruksi Anda, tersimpan privat di akun ini. Menyimpan berkas bukan verifikasi, dan Gustafta bukan lembaga sertifikasi resmi.</p></div>

    {canOwnCases && <section className="surface mb-6 min-w-0 p-4 sm:p-5">
      <button data-testid="button-toggle-upload" aria-expanded={uploadOpen} onClick={() => setUploadOpen(o => !o)} className="flex w-full items-center justify-between gap-3 text-left"><span className="font-bold">Dokumen baru <span className="font-normal text-[#617a90]">— pilih kasus</span></span><ChevronDown size={18} className={`shrink-0 transition-transform ${uploadOpen ? 'rotate-180' : ''}`} /></button>
      {uploadOpen && <div className="mt-4">
        <label className="block max-w-md"><span className="mb-1.5 block text-xs font-bold text-[#2b4159]">Kasus tujuan</span><select data-testid="select-upload-case" className="field" value={uploadCase} onChange={e => { setUploadCase(e.target.value); setVersionReq(undefined); }}><option value="">Pilih kasus Anda</option>{caseOptions}</select></label>
        {cases.isError && <p className="mt-2 text-sm text-[#b34442]">Daftar kasus belum dapat dimuat.</p>}
        {!cases.isLoading && !cases.isError && chosen.length === 0 && <p className="mt-2 text-sm text-[#617a90]">Anda belum memiliki kasus. <Link href="/cases" className="font-bold text-[#1769d1]">Buat kasus</Link> terlebih dahulu.</p>}
        {uploadCase && chosen.some(c => String(c.id) === uploadCase) && <CaseDocuments key={uploadCase} id={Number(uploadCase)} expectedUserId={expectedUserId} versionRequest={versionReq} />}
      </div>}
    </section>}

    <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_180px_220px]">
      <div className="relative min-w-0"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8298aa]" /><input data-testid="input-vault-search" aria-label="Cari nama atau catatan" className="field !pl-11" maxLength={100} value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau catatan" /></div>
      <select data-testid="select-vault-category" aria-label="Kategori" className="field" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Semua kategori</option>{categoryKeys.map(k => <option key={k} value={k}>{categoryLabels[k]}</option>)}</select>
      <select data-testid="select-vault-case" aria-label="Kasus" className="field" value={caseId} onChange={e => { setCaseId(e.target.value); setPage(1); }}><option value="">Semua kasus</option>{caseOptions}</select>
    </div>
    {note && <p role="status" data-testid="text-vault-message" className="mb-3 rounded-lg border border-[#c7deef] bg-[#eff7fd] p-3 text-sm text-[#365a76]">{note}</p>}

    {vault.isLoading ? <Loading rows={3} /> : vault.isError || foreign ? <ErrorState retry={() => { void vault.refetch(); }} message="Ruang Simpan belum dapat dimuat." /> : !data || data.documents.length === 0 ? <Empty title={dq || category || caseId ? 'Tidak ada dokumen yang cocok' : 'Ruang Simpan masih kosong'} detail={dq || category || caseId ? 'Ubah kata kunci atau filter untuk melihat dokumen lain.' : 'Unggah dokumen asli dari kasus Anda. Dokumen tersimpan privat dan tidak otomatis menjadi bukti.'} /> : <>
      <div className="space-y-3">{data.documents.map(d => <div key={d.id} data-testid={`card-vault-document-${d.id}`} className="surface flex min-w-0 flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3"><FileText size={20} className="mt-0.5 shrink-0 text-[#1769d1]" /><div className="min-w-0"><div className="break-words font-bold">{d.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5"><span className="rounded-full bg-[#e6f1fc] px-2 py-0.5 text-[10px] font-bold text-[#1769d1]">{categoryLabels[d.category ?? 'lainnya']}</span><span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-[10px] font-bold text-[#445d74]">v{d.version ?? 1}</span>{d.status !== 'ready' && <span className="rounded-full bg-[#fff3d9] px-2 py-0.5 text-[10px] font-bold text-[#7a5200]">Belum selesai</span>}</div>
          {d.description && <div className="mt-1 break-words text-xs text-[#58708a]">{d.description}</div>}
          <div className="mt-1 break-words text-[11px] text-[#8195a5]">{sizeLabel(d.size)} · <Link href={`/cases/${d.caseId}`} data-testid={`link-document-case-${d.id}`} className="font-bold text-[#1769d1]">{d.caseName}</Link></div></div></div>
        <div className="flex flex-wrap gap-1">
          {d.status === 'ready' && <>
            <button data-testid={`button-bedah-${d.id}`} aria-label={`Bedah Dokumen ${d.name}`} onClick={() => setAnalyzing(d)} className="rounded-lg p-2 text-[#1769d1] hover:bg-[#eaf4fc]"><ScanSearch size={16} /></button>
            <button data-testid={`button-edit-document-${d.id}`} aria-label={`Ubah keterangan ${d.name}`} onClick={() => setEditing(d)} className="rounded-lg p-2 text-[#456986] hover:bg-[#eaf4fc]"><Pencil size={16} /></button>
            {canOwnCases && <button data-testid={`button-new-version-${d.id}`} aria-label={`Unggah versi baru ${d.name}`} onClick={() => newVersion(d)} className="rounded-lg p-2 text-[#456986] hover:bg-[#eaf4fc]"><Layers size={16} /></button>}
            <button data-testid={`button-download-document-${d.id}`} aria-label={`Unduh ${d.name}`} onClick={() => void download(d)} className="rounded-lg p-2 text-[#456986] hover:bg-[#eaf4fc]"><Download size={16} /></button></>}
          <button data-testid={`button-delete-document-${d.id}`} aria-label={`Hapus ${d.name}`} onClick={() => { setDelError(null); setConfirm(d); }} className="rounded-lg p-2 text-[#ad4a48] hover:bg-[#fff0ef]"><Trash2 size={16} /></button>
        </div></div>)}</div>
      <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Halaman"><span data-testid="text-vault-page" className="text-xs text-[#617a90]">{data.total} dokumen · Halaman {data.page} dari {totalPages}</span><div className="flex gap-2"><button data-testid="button-vault-prev" disabled={page <= 1 || vault.isFetching} onClick={() => setPage(p => p - 1)} className="btn btn-outline"><ChevronLeft size={15} /> Sebelumnya</button><button data-testid="button-vault-next" disabled={page >= totalPages || vault.isFetching} onClick={() => setPage(p => p + 1)} className="btn btn-outline">Berikutnya <ChevronRight size={15} /></button></div></nav></>}

    {editing && <DocumentMetadataDialog key={editing.id} doc={editing} expectedUserId={expectedUserId} close={() => setEditing(null)} />}
    {analyzing && <DocumentAnalysisPanel key={analyzing.id} doc={analyzing} expectedUserId={expectedUserId} close={() => setAnalyzing(null)} />}
    {confirm && <SimpleModal title="Hapus dokumen?" close={() => setConfirm(null)}><p className="text-sm leading-7 text-[#567088]">Berkas akan dihapus permanen dari penyimpanan dan tidak dapat dipulihkan. Analisis tersimpan untuk versi ini juga ikut terhapus.</p>{delError && <p role="alert" className="mt-3 text-sm text-[#b34442]">{delError}</p>}<div className="mt-5 flex justify-end gap-2"><button className="btn btn-outline" onClick={() => setConfirm(null)}>Batal</button><button data-testid="button-confirm-delete-document" disabled={del.isPending} className="btn btn-danger" onClick={remove}>{del.isPending ? 'Menghapus...' : 'Ya, hapus permanen'}</button></div></SimpleModal>}
  </div>;
}
