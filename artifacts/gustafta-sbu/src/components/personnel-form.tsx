import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import {
  useCreatePersonnel, useUpdatePersonnel, useListCases, getListCasesQueryKey, getListPersonnelQueryKey, getGetPersonnelQueryKey,
  type Personnel, type PersonnelInputAssignment,
} from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from '@/components/account-queries';
import { Dialog, Fld, assignmentLabels, mutationError, statusOf } from '@/components/personnel-ui';

export function usePersonnelCache() {
  const qc = useQueryClient();
  return (p: Personnel) => {
    qc.setQueryData(getGetPersonnelQueryKey(p.id), p);
    qc.setQueryData<Personnel[] | undefined>(getListPersonnelQueryKey(), old => old ? (old.some(x => x.id === p.id) ? old.map(x => x.id === p.id ? p : x) : [p, ...old]) : old);
    void qc.invalidateQueries({ queryKey: getListPersonnelQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetPersonnelQueryKey(p.id) });
  };
}

export function PersonnelForm({ initial, canOwnCases, close, onSaved, onReload }: { initial?: Personnel; canOwnCases: boolean; close: () => void; onSaved: (p: Personnel) => void; onReload?: () => void }) {
  const options = useFormMutationOptions();
  const create = useCreatePersonnel(options); const update = useUpdatePersonnel(options);
  const cache = usePersonnelCache();
  const [expectedRevision] = useState(initial?.revision ?? 0); // captured when the form opened
  const cases = useListCases({ ...useAccountReadOptions(), query: { enabled: canOwnCases, queryKey: getListCasesQueryKey() } });
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [assignment, setAssignment] = useState<PersonnelInputAssignment>(initial?.assignment ?? 'pjbu');
  const [position, setPosition] = useState(initial?.position ?? '');
  const [caseId, setCaseId] = useState(initial?.caseId != null ? String(initial.caseId) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const invisible = /[\p{Cc}\p{Cf}]/u.test(fullName) || (fullName.length > 0 && !fullName.trim());
  const pending = create.isPending || update.isPending; const error = create.error || update.error;
  const save = (e: FormEvent) => {
    e.preventDefault(); if (pending || invisible || !fullName.trim()) return;
    const common = { fullName: fullName.trim(), assignment, position: position.trim(), caseId: caseId ? Number(caseId) : null, notes: notes.trim() };
    const done = (p: Personnel) => { cache(p); onSaved(p); };
    if (initial) update.mutate({ personnelId: initial.id, data: { expectedRevision, ...common } }, { onSuccess: done });
    else create.mutate({ data: common }, { onSuccess: done });
  };
  const conflict = statusOf(error) === 409;
  return <Dialog title={initial ? 'Ubah personel' : 'Personel baru'} close={close}>
    <form onSubmit={save} className="space-y-5">
      <Fld label="Nama lengkap"><input data-testid="input-person-name" className="field" required maxLength={160} value={fullName} onChange={e => setFullName(e.target.value)} aria-invalid={invisible} />{invisible && <span role="alert" data-testid="text-name-invalid" className="mt-1 block text-xs text-[#b34442]">Nama tidak boleh berisi karakter kontrol atau karakter tak terlihat.</span>}</Fld>
      <div className="grid gap-4 sm:grid-cols-2">
        <Fld label="Penugasan (peran tercatat)"><select data-testid="select-person-assignment" className="field" value={assignment} onChange={e => setAssignment(e.target.value as PersonnelInputAssignment)}>{Object.entries(assignmentLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Fld>
        <Fld label="Jabatan"><input data-testid="input-person-position" className="field" maxLength={160} value={position} onChange={e => setPosition(e.target.value)} /></Fld>
      </div>
      {canOwnCases ? <Fld label="Kasus terkait (opsional)" hint="Jika dipilih, dokumen bukti SKK dibatasi pada kasus yang sama.">
        <select data-testid="select-person-case" className="field" value={caseId} onChange={e => setCaseId(e.target.value)}><option value="">Tanpa kasus</option>
          {caseId && !cases.data?.some(c => String(c.id) === caseId) && <option value={caseId}>Kasus #{caseId}</option>}
          {cases.data?.map(c => <option key={c.id} value={c.id}>{c.companyName} / {c.classification}</option>)}</select>
        {cases.isError && <span role="alert" className="mt-1 block text-xs text-[#8e2f2e]">Daftar kasus belum dapat dimuat.</span>}</Fld>
        : <p className="text-xs text-[#688096]">Peran Anda tidak memiliki ruang kasus; personel dicatat tanpa kasus.</p>}
      <Fld label="Catatan"><textarea data-testid="input-person-notes" className="field min-h-[84px]" maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} /></Fld>
      {error && <div role="alert" data-testid="text-person-error" className="text-sm text-[#b34442]">{mutationError(error, 'Personel belum dapat disimpan. Periksa isian lalu coba lagi.')}{conflict && onReload && <button type="button" data-testid="button-reload-person" onClick={onReload} className="btn btn-outline mt-2 block !text-xs">Muat ulang data terbaru</button>}</div>}
      <div className="flex justify-end gap-2 border-t border-[#e0e9ef] pt-5"><button type="button" data-testid="button-cancel-person" onClick={close} className="btn btn-outline">Batal</button><button data-testid="button-save-person" disabled={pending || invisible || !fullName.trim()} className="btn btn-primary">{pending ? 'Menyimpan...' : initial ? 'Simpan perubahan' : 'Tambah personel'} <ArrowRight size={15} /></button></div>
    </form></Dialog>;
}
