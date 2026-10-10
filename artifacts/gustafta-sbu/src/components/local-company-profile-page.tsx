import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ShieldCheck } from 'lucide-react';
import {
  getGetLocalCompanyProfileQueryKey, useGetLocalCompanyProfile, usePutLocalCompanyProfile,
  type LocalCompanyProfile, type LocalCompanyProfileInput,
} from '@workspace/api-client-react';
import { useFormMutationOptions, useAccountReadOptions } from './account-queries';
import { ErrorState, Loading } from './request-states';

const fields: { key: keyof LocalCompanyProfileInput; label: string; max: number; area?: boolean; hint?: string }[] = [
  { key: 'companyName', label: 'Nama badan usaha', max: 200 },
  { key: 'nib', label: 'NIB', max: 13, hint: 'Kosongkan atau isi 13 digit angka.' },
  { key: 'npwp', label: 'NPWP', max: 32 },
  { key: 'address', label: 'Alamat', max: 2000, area: true },
  { key: 'responsiblePerson', label: 'Penanggung jawab', max: 200 },
];
const empty: LocalCompanyProfileInput = { companyName: '', nib: '', npwp: '', address: '', responsiblePerson: '' };
const safeError = () => 'Profil belum dapat disimpan. Periksa isian (NIB harus 13 digit) lalu coba lagi.';

export function LocalCompanyProfileForm({ expectedUserId, initial }: { expectedUserId: string; initial?: LocalCompanyProfile }) {
  const qc = useQueryClient();
  const save = usePutLocalCompanyProfile(useFormMutationOptions());
  const [form, setForm] = useState<LocalCompanyProfileInput>(initial ? { companyName: initial.companyName, nib: initial.nib, npwp: initial.npwp, address: initial.address, responsiblePerson: initial.responsiblePerson } : empty);
  const nibOk = /^(|[0-9]{13})$/.test(form.nib);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!nibOk || save.isPending) return;
    save.mutate({ data: { companyName: form.companyName.trim(), nib: form.nib.trim(), npwp: form.npwp.trim(), address: form.address.trim(), responsiblePerson: form.responsiblePerson.trim() } }, {
      onSuccess: data => { if (data.ownerId === expectedUserId) qc.setQueryData(getGetLocalCompanyProfileQueryKey(), data); },
    });
  };
  return <form onSubmit={submit} className="surface space-y-5 p-6 sm:p-8" data-testid="form-local-company">
    {fields.map(f => <label key={f.key} className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">{f.label}</span>
      {f.area
        ? <textarea data-testid={`input-${f.key}`} className="field min-h-[96px] resize-y" maxLength={f.max} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
        : <input data-testid={`input-${f.key}`} className="field" maxLength={f.max} inputMode={f.key === 'nib' ? 'numeric' : undefined} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />}
      {f.hint && <span className="mt-1.5 block text-xs text-[#688096]">{f.hint}</span>}</label>)}
    {!nibOk && <p role="alert" className="text-sm text-[#b34442]">NIB harus kosong atau 13 digit angka.</p>}
    {save.isError && <p role="alert" className="text-sm text-[#b34442]">{safeError()}</p>}
    {save.isSuccess && <p role="status" className="text-sm font-semibold text-[#19745f]">Profil tersimpan di akun Anda.</p>}
    <button data-testid="button-save-company" disabled={save.isPending || !nibOk} className="btn btn-primary">{save.isPending ? 'Menyimpan...' : 'Simpan profil'}</button>
  </form>;
}

export function LocalCompanyProfilePage({ expectedUserId }: { expectedUserId: string }) {
  const query = useGetLocalCompanyProfile({ ...useAccountReadOptions(), query: { queryKey: getGetLocalCompanyProfileQueryKey(), retry: false } });
  const status = (query.error as { status?: number } | null)?.status;
  const mismatch = !!query.data && query.data.ownerId !== expectedUserId;
  let body;
  if (query.isLoading) body = <Loading rows={4} />;
  else if (mismatch) body = <ErrorState retry={() => { void query.refetch(); }} message="Profil tidak cocok dengan akun aktif dan tidak ditampilkan." />;
  else if (query.isError && status !== 404) body = <ErrorState retry={() => { void query.refetch(); }} message="Profil perusahaan belum dapat dimuat." />;
   else body = <LocalCompanyProfileForm key={expectedUserId} expectedUserId={expectedUserId} initial={query.data} />;
  return <section data-testid="page-local-company">
    <div className="mb-8"><div className="eyebrow mb-2 text-[#1769d1]">RUANG KERJA / PROFIL</div><h1 className="display flex items-center gap-3 text-[32px] font-extrabold sm:text-[39px]"><Building2 size={30} />Profil perusahaan</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Data ini Anda isi sendiri dan tersimpan privat di akun Anda. Tidak diverifikasi dan tidak terhubung ke layanan lain.</p></div>
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-[#c7deef] bg-[#eff7fd] p-3 text-xs leading-6 text-[#365a76]"><ShieldCheck size={16} className="mt-1 shrink-0" />Isian bersifat deklaratif, bukan data resmi OSS atau lembaga berwenang.</div>
    {body}
  </section>;
}
