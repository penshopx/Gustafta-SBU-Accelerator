import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  useGetPersonnel, getGetPersonnelQueryKey, getListPersonnelQueryKey, useDeletePersonnel, useDeleteSkkCertificate,
  type SkkCertificate,
} from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from '@/components/account-queries';
import { ErrorState, Loading } from '@/components/request-states';
import { saveDocumentBlob, documentError } from '@/components/case-documents';
import { PersonnelForm, usePersonnelCache } from '@/components/personnel-form';
import { CertificateForm } from '@/components/certificate-form';
import { DateBadge, Dialog, Disclosure, assignmentLabels, daysText, fmtDay, mutationError, statusOf } from '@/components/personnel-ui';

export function PersonnelDetail({ id, expectedUserId, canOwnCases }: { id: string; expectedUserId: string; canOwnCases: boolean }) {
  const qc = useQueryClient(); const [, navigate] = useLocation(); const read = useAccountReadOptions(); const options = useFormMutationOptions();
  const detail = useGetPersonnel(id, { ...read, query: { enabled: !!id, queryKey: getGetPersonnelQueryKey(id), staleTime: 0, refetchOnMount: 'always' as const } });
  const delPerson = useDeletePersonnel(options); const delCert = useDeleteSkkCertificate(options); const cache = usePersonnelCache();
  const p = detail.data;
  const [editing, setEditing] = useState(false); const [deleting, setDeleting] = useState(false);
  const [certForm, setCertForm] = useState<SkkCertificate | 'new' | null>(null); const [certDel, setCertDel] = useState<SkkCertificate | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reload = () => { void detail.refetch(); void qc.invalidateQueries({ queryKey: getListPersonnelQueryKey() }); setEditing(false); setCertForm(null); setCertDel(null); };
  const download = async (c: SkkCertificate) => {
    if (!c.documentAvailable || c.documentId == null || c.documentCaseId == null || c.documentName == null) { setNote('Dokumen bukti belum tersedia untuk diunduh (belum siap, belum dinyatakan bersih, atau sudah dihapus).'); return; }
    setNote(null);
    try { await saveDocumentBlob(c.documentCaseId, { id: c.documentId, name: c.documentName }, read.request); } catch (e) { setNote(documentError(e, 'Dokumen belum dapat diunduh. Silakan coba lagi.')); }
  };
  const openCertDelete = (c: SkkCertificate) => { delCert.reset(); setCertDel(c); };
  if (detail.isLoading) return <div className="mx-auto max-w-5xl"><Loading rows={3} /></div>;
  if (detail.isError || !p) { const nf = statusOf(detail.error) === 404; return nf
    ? <div className="mx-auto max-w-xl"><div data-testid="state-person-missing" className="surface p-9 text-center"><AlertTriangle className="mx-auto mb-4 text-[#bb5451]" size={26} /><h2 className="text-lg font-bold">Personel tidak ditemukan</h2><p className="mt-2 text-sm text-[#58708a]">Data mungkin sudah dihapus atau bukan milik akun ini.</p><Link href="/personnel" className="btn btn-primary mt-5" data-testid="link-back-list">Kembali ke daftar</Link></div></div>
    : <div className="mx-auto max-w-xl"><ErrorState retry={() => void detail.refetch()} message="Personel belum dapat dimuat." /></div>; }
  return <div className="mx-auto max-w-5xl">
    <Link href="/personnel" data-testid="link-back-personnel" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#1769d1] hover:underline"><ArrowLeft size={14} /> Semua personel</Link>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div className="eyebrow mb-2 text-[#1769d1]">PERSONEL / REVISI {p.revision}</div><h1 data-testid="text-person-name" className="display break-words text-[28px] font-extrabold leading-tight sm:text-[34px]">{p.fullName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#688096]"><span className="rounded bg-[#dff0fc] px-1.5 py-0.5 font-bold text-[#173d5d]">{assignmentLabels[p.assignment]} (tercatat)</span>{p.position && <span>{p.position}</span>}{p.caseId != null && <Link href={`/cases/${p.caseId}`} className="font-bold text-[#1769d1]">Kasus #{p.caseId}</Link>}<span data-testid="text-as-of">Per tanggal {fmtDay(p.asOfDate)}</span><button type="button" data-testid="button-refresh-status" onClick={() => void detail.refetch()} disabled={detail.isFetching} className="inline-flex items-center gap-1 font-bold text-[#1769d1] disabled:opacity-60"><RefreshCw size={12} className={detail.isFetching ? 'animate-spin' : ''} /> Muat ulang status tanggal</button></div>
        {p.notes && <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words text-sm text-[#526b81]">{p.notes}</p>}</div>
      <div className="flex shrink-0 gap-2"><button type="button" data-testid="button-edit-person" onClick={() => setEditing(true)} className="btn btn-outline"><Pencil size={14} /> Ubah</button><button type="button" data-testid="button-delete-person" onClick={() => setDeleting(true)} className="btn btn-danger"><Trash2 size={14} /> Hapus</button></div>
    </div>
    <Disclosure />
    <div className="mb-3 flex items-center justify-between"><h2 className="display text-xl font-extrabold">SKK tercatat ({p.certificates.length})</h2><button type="button" data-testid="button-add-cert" onClick={() => setCertForm('new')} className="btn btn-primary"><Plus size={15} /> Tambah SKK</button></div>
    {note && <p role="status" data-testid="text-cert-note" className="mb-3 rounded-lg border border-[#c7deef] bg-[#eff7fd] p-3 text-sm text-[#365a76]">{note} <Link href="/documents" className="font-bold text-[#1769d1] underline">Ruang Simpan</Link></p>}
    {p.certificates.length === 0 ? <div data-testid="empty-certificates" className="surface px-6 py-12 text-center"><h3 className="display text-xl font-extrabold">Belum ada SKK untuk personel ini.</h3><p className="mt-2 text-sm text-[#58718a]">Tambahkan nomor, penerbit, dan tanggal yang tertera pada sertifikat.</p></div>
      : <ul className="space-y-3">{p.certificates.map(c => <li key={c.id} data-testid={`card-cert-${c.id}`} className="surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><div className="break-words font-bold text-[#14253a]">{c.jobTitle}{c.level != null && <span className="ml-2 rounded bg-[#ecf4f9] px-1.5 py-0.5 text-xs">Jenjang {c.level}</span>}</div>
            <div className="mono mt-1 break-all text-xs text-[#527089]">{c.certificateNumber} · {c.issuer}</div></div>
          <DateBadge status={c.dateStatus} days={daysText(c)} /></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[#688096]">Terbit (deklarasi)</dt><dd className="font-bold">{fmtDay(c.issuedOn)}</dd></div><div><dt className="text-[#688096]">Berakhir (deklarasi)</dt><dd className="font-bold">{fmtDay(c.expiresOn)}</dd></div></dl>
        {c.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[#526b81]">{c.notes}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e0e9ef] pt-3">
          {c.documentId && (c.documentAvailable ? <button type="button" data-testid={`button-download-cert-${c.id}`} onClick={() => void download(c)} className="btn btn-outline !min-h-[34px] !text-xs"><Download size={13} /> Unduh {c.documentName ?? 'dokumen bukti'}</button> : <span data-testid={`text-doc-unavailable-${c.id}`} role="note" className="rounded-lg border border-[#ecc977] bg-[#fff3d9] px-2.5 py-1.5 text-xs text-[#7a5200]">Dokumen bukti{c.documentName ? ` "${c.documentName}"` : ''} belum tersedia (belum siap atau belum bersih).</span>)}
          <button type="button" data-testid={`button-edit-cert-${c.id}`} onClick={() => setCertForm(c)} className="btn btn-outline !min-h-[34px] !text-xs"><Pencil size={13} /> Ubah</button>
          <button type="button" data-testid={`button-delete-cert-${c.id}`} aria-label={`Hapus SKK ${c.certificateNumber}`} onClick={() => openCertDelete(c)} className="btn btn-danger !min-h-[34px] !text-xs"><Trash2 size={13} /> Hapus</button></div></li>)}</ul>}
    {editing && <PersonnelForm initial={p} canOwnCases={canOwnCases} close={() => setEditing(false)} onSaved={() => setEditing(false)} onReload={reload} />}
    {certForm && <CertificateForm person={p} initial={certForm === 'new' ? undefined : certForm} expectedUserId={expectedUserId} close={() => setCertForm(null)} onReload={reload} />}
    {certDel && <Dialog title="Hapus SKK?" close={() => setCertDel(null)} alert><p className="text-sm leading-6 text-[#526b81]">Catatan SKK {certDel.certificateNumber} akan dihapus permanen. Dokumen yang tersimpan di Ruang Simpan tidak ikut terhapus.</p>
      {delCert.isError && <p role="alert" className="mt-3 text-sm text-[#b34442]">{mutationError(delCert.error, 'SKK belum dapat dihapus. Coba lagi.')}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" autoFocus onClick={() => setCertDel(null)} className="btn btn-outline" data-testid="button-cancel-delete-cert">Batal</button><button type="button" data-testid="button-confirm-delete-cert" disabled={delCert.isPending} onClick={() => delCert.mutate({ personnelId: p.id, certificateId: certDel.id }, { onSuccess: () => { setCertDel(null); cache({ ...p, certificates: p.certificates.filter(x => x.id !== certDel.id) }); void detail.refetch(); } })} className="btn btn-danger">{delCert.isPending ? 'Menghapus...' : 'Hapus permanen'}</button></div></Dialog>}
    {deleting && <Dialog title="Hapus personel?" close={() => setDeleting(false)} alert><p className="text-sm leading-6 text-[#526b81]">&ldquo;{p.fullName}&rdquo; beserta {p.certificates.length} catatan SKK akan dihapus permanen. Dokumen asli di Ruang Simpan tidak ikut terhapus.</p>
      {delPerson.isError && <p role="alert" className="mt-3 text-sm text-[#b34442]">{mutationError(delPerson.error, 'Personel belum dapat dihapus. Coba lagi.')}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" autoFocus onClick={() => setDeleting(false)} className="btn btn-outline" data-testid="button-cancel-delete-person">Batal</button><button type="button" data-testid="button-confirm-delete-person" disabled={delPerson.isPending} onClick={() => delPerson.mutate({ personnelId: p.id }, { onSuccess: () => { qc.removeQueries({ queryKey: getGetPersonnelQueryKey(p.id) }); void qc.invalidateQueries({ queryKey: getListPersonnelQueryKey() }); navigate('/personnel'); } })} className="btn btn-danger">{delPerson.isPending ? 'Menghapus...' : 'Hapus permanen'}</button></div></Dialog>}
  </div>;
}
