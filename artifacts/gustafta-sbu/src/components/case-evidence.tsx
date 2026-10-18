import { useFormMutationOptions, useAccountReadOptions } from './account-queries';
import React, { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useListEvidence, useAddEvidence, useUpdateEvidence, useDeleteEvidence,
  getListEvidenceQueryKey, getGetAssessmentQueryKey,
  type SbuCase, type Evidence, type EvidenceInput,
} from '@workspace/api-client-react';
import { formatTimestampDate } from '../lib/display-date';
import { Empty } from './dashboard-overview';
import { ErrorState, Loading } from './request-states';

const evidenceOptions = [
  { code: 'legalitas', title: 'Legalitas dan identitas badan usaha' },
  { code: 'penjualan', title: 'Penjualan tahunan' },
  { code: 'keuangan', title: 'Kemampuan keuangan' },
  { code: 'tenaga', title: 'Tenaga kerja konstruksi' },
  { code: 'peralatan', title: 'Peralatan konstruksi' },
  { code: 'smap_cert', title: 'Sertifikat SMAP' },
  { code: 'smap_pancek', title: 'Lembar konfirmasi PANCEK' },
  { code: 'smap_commitment', title: 'Surat komitmen SMAP (pengajuan SBU pertama kali)' },
  { code: 'smap_training', title: 'Pelatihan/bimtek SMAP (BUJK kecil)' },
];

const errText = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kendala. Silakan coba lagi.';

function EvidenceDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [close]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d1b2ad9] p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="surface my-auto w-full max-w-[560px] overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#d8e4ec] p-6"><h2 className="display text-xl font-extrabold">{title}</h2><button data-testid="button-close-dialog" onClick={close} aria-label="Tutup" className="rounded-lg p-2 hover:bg-[#ecf4f9]"><X size={18}/></button></div>
      <div className="p-6">{children}</div>
    </section>
  </div>;
}

function EvidenceForm({ id, initial, suggestedCode = '', close, requestType, qualification }: { id: number; initial?: Evidence; suggestedCode?: string; close: () => void; requestType: SbuCase['requestType']; qualification: SbuCase['qualification'] }) {
  const qc = useQueryClient();
  const options = useFormMutationOptions();
  const add = useAddEvidence(options);
  const update = useUpdateEvidence(options);
  const suggested = evidenceOptions.find(option => option.code === suggestedCode);
  const [code, setCode] = useState(initial?.code || suggested?.code || '');
  const [title, setTitle] = useState(initial?.title || suggested?.title || '');
  const [note, setNote] = useState(initial?.note || '');
  const save = (e: FormEvent) => {
    e.preventDefault();
    const done = () => {
      qc.invalidateQueries({ queryKey: getListEvidenceQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetAssessmentQueryKey(id) });
      close();
    };
    if (initial) update.mutate({ id, evidenceId: initial.id, data: { title: title.trim(), note: note.trim() } }, { onSuccess: done });
    else add.mutate({ id, data: { code: code.trim(), title: title.trim(), note: note.trim() } as EvidenceInput }, { onSuccess: done });
  };
  const choices = evidenceOptions.filter(option => option.code !== 'smap_commitment' || requestType === 'baru')
    .filter(option => option.code !== 'smap_training' || qualification === 'kecil');
  return <form onSubmit={save} className="space-y-5">
    <div className="rounded-lg border border-[#c7deef] bg-[#eff7fd] p-3 text-xs leading-6 text-[#365a76]">Ini adalah deklarasi pengguna, bukan verifikasi dokumen; unggahan dokumen asli tidak otomatis dihitung sebagai bukti. Jangan masukkan data sensitif ke dalam catatan. Surat komitmen hanya untuk SBU pertama kali, bukan otomatis setiap permohonan baru.</div>
    <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Kategori bukti</span>{initial ? <input className="field" disabled value={evidenceOptions.find(x => x.code === code)?.title || code} /> : <select data-testid="select-evidence-code" className="field" required value={code} onChange={e => { const next = choices.find(x => x.code === e.target.value); setCode(e.target.value); setTitle(next?.title || ''); }}><option value="">Pilih kategori bukti</option>{choices.map(option => <option key={option.code} value={option.code}>{option.title}</option>)}</select>}</label>
    <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Judul catatan</span><input data-testid="input-evidence-title" className="field" required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="Nama dokumen yang Anda nyatakan tersedia" /></label>
    <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Catatan pengguna</span><textarea data-testid="input-evidence-note" className="field min-h-[110px] resize-y" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Misalnya: perlu dicocokkan dengan dokumen asli" /><span className="mt-1.5 block text-xs text-[#688096]">Jelaskan kondisi atau lokasi dokumen secara ringkas.</span></label>
    {(add.error || update.error) && <p role="alert" className="text-sm text-[#b34442]">{errText(add.error || update.error)}</p>}
    <div className="flex justify-end gap-2 border-t border-[#e0e9ef] pt-5"><button type="button" data-testid="button-cancel-evidence" className="btn btn-outline" onClick={close}>Batal</button><button data-testid="button-save-evidence" disabled={add.isPending || update.isPending || !code.trim() || !title.trim()} className="btn btn-primary">{add.isPending || update.isPending ? 'Menyimpan...' : initial ? 'Simpan perubahan' : 'Catat bukti'} <ArrowRight size={15}/></button></div>
  </form>;
}

export function CaseEvidence({ id, requestType, qualification, suggestion, onSuggestionClose }: { id: number; requestType: SbuCase['requestType']; qualification: SbuCase['qualification']; suggestion?: string | null; onSuggestionClose?: () => void }) {
  const qc = useQueryClient();
  const evidence = useListEvidence(id, { ...useAccountReadOptions(), query: { queryKey: getListEvidenceQueryKey(id) } });
  const remove = useDeleteEvidence(useFormMutationOptions());
  const [open, setOpen] = useState(suggestion !== null && suggestion !== undefined);
  const [editing, setEditing] = useState<Evidence>();
  const [confirm, setConfirm] = useState<number | null>(null);
  useEffect(() => {
    if (suggestion !== null && suggestion !== undefined) {
      setEditing(undefined);
      setOpen(true);
    }
  }, [suggestion]);
  const closeForm = () => { setOpen(false); onSuggestionClose?.(); };
  const confirmDelete = (evidenceId: number) => {
    remove.reset();
    setConfirm(evidenceId);
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListEvidenceQueryKey(id) });
    qc.invalidateQueries({ queryKey: getGetAssessmentQueryKey(id) });
    setConfirm(null);
  };
  return <section>
    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="display text-xl font-extrabold">Catatan bukti Anda</h2><p className="mt-1 text-xs text-[#617a90]">Hanya catatan deklaratif. Dokumen asli yang diunggah terpisah tidak otomatis menjadi bukti dan tidak diverifikasi.</p></div><button data-testid="button-add-evidence" onClick={() => { setEditing(undefined); setOpen(true); }} className="btn btn-primary"><Plus size={16}/> Tambah catatan</button></div>
    {evidence.isLoading ? <Loading/> : evidence.isError ? <ErrorState retry={() => evidence.refetch()}/> : evidence.data?.length ? <div className="space-y-3">{evidence.data.map(ev => <div key={ev.id} data-testid={`card-evidence-${ev.id}`} className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-start"><span className="mono shrink-0 rounded-lg bg-[#eaf4fc] px-2.5 py-2 text-[11px] font-bold text-[#1769d1]">{ev.code}</span><div className="min-w-0 flex-1"><h3 className="font-bold">{ev.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#5c758b]">{ev.note || 'Tidak ada catatan tambahan.'}</p><p className="mt-2 text-[11px] text-[#8195a5]">Diperbarui {formatTimestampDate(ev.updatedAt)} · Dideklarasikan pengguna</p></div><div className="flex gap-1"><button data-testid={`button-edit-evidence-${ev.id}`} aria-label={`Ubah ${ev.title}`} onClick={() => { setEditing(ev); setOpen(true); }} className="rounded-lg p-2 text-[#456986] hover:bg-[#eaf4fc]"><Pencil size={16}/></button><button data-testid={`button-delete-evidence-${ev.id}`} aria-label={`Hapus ${ev.title}`} onClick={() => confirmDelete(ev.id)} className="rounded-lg p-2 text-[#ad4a48] hover:bg-[#fff0ef]"><Trash2 size={16}/></button></div></div>)}</div> : <Empty title="Belum ada catatan bukti" detail="Lihat kode kebutuhan di penilaian awal, lalu deklarasikan dokumen yang Anda miliki. Pencatatan ini tidak memverifikasi keaslian dokumen." action={<button data-testid="button-add-first-evidence" onClick={() => { setEditing(undefined); setOpen(true); }} className="btn btn-primary"><Plus size={16}/> Catat bukti</button>} />}
    {open && <EvidenceDialog title={editing ? 'Ubah catatan bukti' : 'Tambah catatan bukti'} close={closeForm}><EvidenceForm key={editing?.id ?? suggestion ?? 'new'} id={id} initial={editing} suggestedCode={suggestion ?? ''} requestType={requestType} qualification={qualification} close={closeForm}/></EvidenceDialog>}
    {confirm !== null && <EvidenceDialog title="Hapus catatan bukti?" close={() => setConfirm(null)}><p className="text-sm leading-7 text-[#567088]">Catatan deklarasi ini akan dihapus. Penilaian awal akan diperbarui sesuai catatan yang tersisa.</p>{remove.error && <p role="alert" className="mt-4 text-sm text-[#b34442]">{errText(remove.error)}</p>}<div className="mt-6 flex justify-end gap-2"><button data-testid="button-cancel-delete" onClick={() => setConfirm(null)} className="btn btn-outline">Batal</button><button data-testid="button-confirm-delete" disabled={remove.isPending} onClick={() => remove.mutate({ id, evidenceId: confirm }, { onSuccess: refresh })} className="btn btn-danger">{remove.isPending ? 'Menghapus...' : 'Ya, hapus'}</button></div></EvidenceDialog>}
  </section>;
}