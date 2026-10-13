import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { useCreateSkkCertificate, useUpdateSkkCertificate, useListDocumentVault, getListDocumentVaultQueryKey, type Personnel, type SkkCertificate } from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from '@/components/account-queries';
import { Dialog, Fld, mutationError, statusOf } from '@/components/personnel-ui';
import { usePersonnelCache } from '@/components/personnel-form';

export function CertificateForm({ person, initial, expectedUserId, close, onReload }: { person: Personnel; initial?: SkkCertificate; expectedUserId: string; close: () => void; onReload: () => void }) {
  const options = useFormMutationOptions(); const read = useAccountReadOptions();
  const create = useCreateSkkCertificate(options); const update = useUpdateSkkCertificate(options);
  const cache = usePersonnelCache();
  const [expectedRevision] = useState(initial?.revision ?? 0);
  const [number, setNumber] = useState(initial?.certificateNumber ?? ''); const [issuer, setIssuer] = useState(initial?.issuer ?? '');
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? ''); const [level, setLevel] = useState(initial?.level != null ? String(initial.level) : '');
  const [issuedOn, setIssuedOn] = useState(initial?.issuedOn ?? ''); const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? '');
  const [documentId, setDocumentId] = useState(initial?.documentId ?? ''); const [notes, setNotes] = useState(initial?.notes ?? '');
  const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);
  const params = { ...(dq ? { q: dq } : {}), ...(person.caseId != null ? { caseId: person.caseId } : {}), page };
  const vault = useListDocumentVault(params, { ...read, query: { queryKey: getListDocumentVaultQueryKey(params), retry: false } });
  const docs = (vault.data?.documents ?? []).filter(d => d.status === 'ready' && d.scanStatus === 'clean' && d.ownerId === expectedUserId && (person.caseId == null || d.caseId === person.caseId));
  const totalPages = vault.data ? Math.max(1, Math.ceil(vault.data.total / (vault.data.pageSize || 50))) : 1;
  const pending = create.isPending || update.isPending; const error = create.error || update.error;
  const dateBad = !!issuedOn && !!expiresOn && expiresOn < issuedOn;
  const save = (e: FormEvent) => {
    e.preventDefault(); if (pending || dateBad || !number.trim() || !issuer.trim() || !jobTitle.trim()) return;
    const body = { certificateNumber: number.trim(), issuer: issuer.trim(), jobTitle: jobTitle.trim(), level: level ? Number(level) : null, issuedOn: issuedOn || null, expiresOn: expiresOn || null, documentId: documentId || null, notes: notes.trim() };
    const done = (p: Personnel) => { cache(p); close(); };
    if (initial) update.mutate({ personnelId: person.id, certificateId: initial.id, data: { expectedRevision, ...body } }, { onSuccess: done });
    else create.mutate({ personnelId: person.id, data: body }, { onSuccess: done });
  };
  return <Dialog title={initial ? 'Ubah SKK' : 'Tambah SKK'} close={close}>
    <form onSubmit={save} className="space-y-4">
      <Fld label="Nomor sertifikat"><input data-testid="input-cert-number" className="field" required maxLength={160} value={number} onChange={e => setNumber(e.target.value)} /></Fld>
      <div className="grid gap-4 sm:grid-cols-2"><Fld label="Penerbit"><input data-testid="input-cert-issuer" className="field" required maxLength={160} value={issuer} onChange={e => setIssuer(e.target.value)} /></Fld>
        <Fld label="Jabatan kerja"><input data-testid="input-cert-job" className="field" required maxLength={160} value={jobTitle} onChange={e => setJobTitle(e.target.value)} /></Fld></div>
      <div className="grid gap-4 sm:grid-cols-3"><Fld label="Jenjang (1-9)"><select data-testid="select-cert-level" className="field" value={level} onChange={e => setLevel(e.target.value)}><option value="">Belum diisi</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n}>{n}</option>)}</select></Fld>
        <Fld label="Terbit (deklarasi)"><input data-testid="input-cert-issued" type="date" className="field" value={issuedOn} onChange={e => setIssuedOn(e.target.value)} /></Fld>
        <Fld label="Berakhir (deklarasi)"><input data-testid="input-cert-expires" type="date" className="field" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} /></Fld></div>
      {dateBad && <p role="alert" className="text-xs text-[#b34442]">Tanggal berakhir tidak boleh sebelum tanggal terbit.</p>}
      <Fld label="Dokumen bukti (opsional)" hint={person.caseId != null ? 'Hanya dokumen siap dan bersih dari kasus personel ini.' : 'Hanya dokumen siap dan bersih. Mengaitkan dokumen bukan verifikasi.'}>
        <div className="space-y-2">
          <input data-testid="input-cert-doc-search" aria-label="Cari dokumen" className="field" maxLength={100} value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama atau catatan dokumen" />
          <select data-testid="select-cert-document" className="field" value={documentId} onChange={e => setDocumentId(e.target.value)}><option value="">Tanpa dokumen</option>
            {documentId && !docs.some(d => d.id === documentId) && <option value={documentId}>{initial?.documentId === documentId && initial.documentName ? initial.documentName : 'Dokumen terpilih'} (terpilih)</option>}
            {docs.map(d => <option key={d.id} value={d.id}>{d.name} ({d.caseName})</option>)}</select>
          {vault.isLoading && <div className="loading-block h-[20px]" aria-busy="true" />}
          {vault.isError && <span role="alert" className="block text-xs text-[#8e2f2e]">Daftar dokumen belum dapat dimuat. <button type="button" data-testid="button-retry-vault" onClick={() => void vault.refetch()} className="font-bold underline">Coba lagi</button></span>}
          {vault.isSuccess && <div className="flex items-center justify-between gap-2 text-xs text-[#617a90]"><span data-testid="text-cert-doc-page">{vault.data.total} dokumen · Halaman {vault.data.page} dari {totalPages}</span><span className="flex gap-1"><button type="button" data-testid="button-doc-prev" aria-label="Halaman sebelumnya" disabled={page <= 1 || vault.isFetching} onClick={() => setPage(p => p - 1)} className="btn btn-outline !min-h-[30px] !px-2"><ChevronLeft size={14} /></button><button type="button" data-testid="button-doc-next" aria-label="Halaman berikutnya" disabled={page >= totalPages || vault.isFetching} onClick={() => setPage(p => p + 1)} className="btn btn-outline !min-h-[30px] !px-2"><ChevronRight size={14} /></button></span></div>}
          {vault.isSuccess && docs.length === 0 && <span className="block text-xs text-[#688096]">Tidak ada dokumen siap dan bersih di halaman ini. Unggah dari kasus di <Link href="/documents" className="font-bold text-[#1769d1] underline">Ruang Simpan</Link>.</span>}
        </div></Fld>
      <Fld label="Catatan"><textarea data-testid="input-cert-notes" className="field min-h-[72px]" maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} /></Fld>
      {error && <div role="alert" data-testid="text-cert-error" className="text-sm text-[#b34442]">{mutationError(error, 'SKK belum dapat disimpan. Periksa isian lalu coba lagi.')}{statusOf(error) === 409 && <button type="button" data-testid="button-reload-cert" onClick={onReload} className="btn btn-outline mt-2 block !text-xs">Muat ulang data terbaru</button>}</div>}
      <div className="flex justify-end gap-2 border-t border-[#e0e9ef] pt-5"><button type="button" onClick={close} data-testid="button-cancel-cert" className="btn btn-outline">Batal</button><button data-testid="button-save-cert" disabled={pending || dateBad || !number.trim() || !issuer.trim() || !jobTitle.trim()} className="btn btn-primary">{pending ? 'Menyimpan...' : initial ? 'Simpan perubahan' : 'Tambah SKK'} <ArrowRight size={15} /></button></div>
    </form></Dialog>;
}
