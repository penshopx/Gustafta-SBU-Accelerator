import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Plus, Search, UsersRound } from 'lucide-react';
import { useListPersonnel, getListPersonnelQueryKey } from '@workspace/api-client-react';
import { useAccountReadOptions } from '@/components/account-queries';
import { ErrorState, Loading } from '@/components/request-states';
import { PersonnelForm } from '@/components/personnel-form';
import { DateBadge, Disclosure, assignmentLabels, statusLabels, worstStatus } from '@/components/personnel-ui';

export function PersonnelList({ canOwnCases }: { canOwnCases: boolean }) {
  const [, navigate] = useLocation();
  const list = useListPersonnel({ ...useAccountReadOptions(), query: { queryKey: getListPersonnelQueryKey() } });
  const [q, setQ] = useState(''); const [assignment, setAssignment] = useState(''); const [ds, setDs] = useState(''); const [creating, setCreating] = useState(false);
  const rows = useMemo(() => (list.data ?? []).filter(p => (!assignment || p.assignment === assignment) && (!ds || p.certificates.some(c => c.dateStatus === ds)) && p.fullName.toLowerCase().includes(q.trim().toLowerCase())), [list.data, q, assignment, ds]);
  const filtered = !!(q || assignment || ds);
  return <div className="mx-auto max-w-5xl">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="eyebrow mb-2 text-[#1769d1]">RUANG KERJA / PERSONEL &amp; SKK</div><h1 className="display text-[32px] font-extrabold leading-tight sm:text-[39px]">Personel &amp; SKK BUJK</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Catat penanggung jawab dan sertifikat kompetensi kerja mereka beserta tanggal berlakunya, secara privat di akun Anda.</p></div>
      <button type="button" data-testid="button-new-person" onClick={() => setCreating(true)} className="btn btn-primary shrink-0"><Plus size={16} /> Personel baru</button>
    </div>
    <Disclosure />
    <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_170px_210px]">
      <div className="relative"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8298aa]" /><input data-testid="input-person-search" aria-label="Cari nama" className="field !pl-11" maxLength={100} value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama personel" /></div>
      <select data-testid="select-filter-assignment" aria-label="Penugasan" className="field" value={assignment} onChange={e => setAssignment(e.target.value)}><option value="">Semua penugasan</option>{Object.entries(assignmentLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select data-testid="select-filter-status" aria-label="Status tanggal SKK" className="field" value={ds} onChange={e => setDs(e.target.value)}><option value="">Semua status tanggal</option>{Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
    {list.isLoading && <Loading rows={4} />}
    {list.isError && <ErrorState retry={() => void list.refetch()} message="Daftar personel belum dapat dimuat." />}
    {list.isSuccess && rows.length === 0 && <div data-testid="empty-personnel" className="surface fade-up px-6 py-14 text-center"><div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf4ff] text-[#1769d1]"><UsersRound size={26} /></div><h2 className="display text-2xl font-extrabold">{filtered ? 'Tidak ada personel yang cocok.' : 'Belum ada personel.'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#58718a]">{filtered ? 'Ubah kata kunci atau filter.' : 'Tambahkan personel pertama, lalu catat SKK-nya.'}</p>{!filtered && <button type="button" data-testid="button-empty-create-person" onClick={() => setCreating(true)} className="btn btn-primary mt-6"><Plus size={16} /> Tambah personel</button>}</div>}
    {rows.length > 0 && <ul className="space-y-2.5">{rows.map((p, i) => { const w = worstStatus(p); return <li key={p.id} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} className="surface fade-up group transition-colors hover:border-[#1769d1]">
      <Link href={`/personnel/${p.id}`} data-testid={`link-person-${p.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#eaf4ff] text-sm font-bold text-[#1769d1]">{p.fullName.slice(0, 2).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-bold text-[#14253a]">{p.fullName}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#688096]"><span className="rounded bg-[#ecf4f9] px-1.5 py-0.5 font-bold text-[#2b4159]">{assignmentLabels[p.assignment]}</span>{p.position && <span>{p.position}</span>}{p.caseId != null && <span>Kasus #{p.caseId}</span>}<span>{p.certificates.length} SKK</span></span></span>
        <span className="flex items-center gap-3">{w ? <DateBadge status={w} /> : <span className="text-xs text-[#688096]">Belum ada SKK</span>}<ArrowRight size={16} className="text-[#9bb3c7] transition-transform group-hover:translate-x-1" /></span>
      </Link></li>; })}</ul>}
    {creating && <PersonnelForm canOwnCases={canOwnCases} close={() => setCreating(false)} onSaved={p => navigate(`/personnel/${p.id}`)} />}
  </div>;
}
