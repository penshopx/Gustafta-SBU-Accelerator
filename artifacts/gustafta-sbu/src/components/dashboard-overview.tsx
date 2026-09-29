import React, { type ReactNode } from 'react';
import { ArrowRight, BriefcaseBusiness, ChevronRight, ClipboardList, Plus, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import type { Dashboard, SbuCase } from '@workspace/api-client-react';
import { formatTimestampDate } from '../lib/display-date';
import { ErrorState, Loading } from './request-states';

export const statusLabels: Record<string, string> = { draf: 'Draf', ditinjau: 'Dalam peninjauan', selesai_persiapan: 'Persiapan selesai', tercatat: 'Tercatat', perlu_bukti: 'Perlu bukti', perlu_tinjauan: 'Perlu tinjauan' };

export function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="surface relative overflow-hidden px-7 py-12 text-center"><div className="absolute top-0 left-0 h-1 w-full bg-[#9bcaf3]" /><div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f3fd] text-[#1769d1]"><ClipboardList size={25} /></div><h3 className="display text-xl font-extrabold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#586f86]">{detail}</p>{action && <div className="mt-6">{action}</div>}</div>;
}

export function Status({ value }: { value: string }) {
  return <span data-testid={`status-${value}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${value === 'selesai_persiapan' || value === 'tercatat' ? 'bg-[#e8f7f3] text-[#19745f] border-[#bde4d9]' : value === 'ditinjau' || value === 'perlu_tinjauan' ? 'bg-[#fff5df] text-[#8e6214] border-[#ecd5a5]' : 'bg-[#edf4fb] text-[#366283] border-[#caddea]'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabels[value] || value}</span>;
}

export function CaseRows({ cases }: { cases: SbuCase[] }) {
  return <div className="overflow-hidden rounded-2xl border border-[#d4e1ea] bg-white">{cases.map((item, i) => <Link href={`/cases/${item.id}`} data-testid={`link-case-${item.id}`} key={item.id} className={`group flex flex-col gap-4 p-5 transition-colors hover:bg-[#f4f9fd] sm:flex-row sm:items-center ${i > 0 ? 'border-t border-[#e2eaf0]' : ''}`}><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e7f2fc] text-[#1769d1]"><BriefcaseBusiness size={19}/></div><div className="min-w-0 flex-1"><div data-testid={`text-case-company-${item.id}`} className="truncate font-bold text-[#183049]">{item.companyName}</div><div className="mt-1 text-xs text-[#637c92]">{item.requestType === 'baru' ? 'Permohonan baru' : 'Perpanjangan'} · Kualifikasi {item.qualification} · {item.classification}</div></div><div className="flex items-center justify-between gap-4 sm:justify-end"><Status value={item.status}/><span className="hidden min-w-[85px] text-right text-xs text-[#70869a] md:block">{formatTimestampDate(item.updatedAt)}</span><ChevronRight size={17} className="text-[#7c97af] transition-transform group-hover:translate-x-1"/></div></Link>)}</div>;
}

export function DashboardResult({ result }: { result: { isLoading: boolean; isError: boolean; data?: Dashboard; refetch: () => void } }) {
  if (result.isLoading) return <Loading rows={4} />;
  if (result.isError) return <ErrorState retry={result.refetch} />;
  return result.data ? <DashboardOverview dashboard={result.data} /> : null;
}

export function DashboardOverview({ dashboard }: { dashboard: Dashboard }) {
  const metrics = [
    { n: dashboard.total, l: 'Total kasus', sub: 'Di ruang kerja Anda', color: '#1769d1' },
    { n: dashboard.draft, l: 'Draf', sub: 'Masih disusun', color: '#456b8b' },
    { n: dashboard.reviewing, l: 'Ditinjau', sub: 'Perlu dicermati', color: '#af791d' },
    { n: dashboard.prepared, l: 'Persiapan selesai', sub: 'Bukan persetujuan LSBU', color: '#217e6b' },
  ];
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((s, i) => <div key={s.l} className="surface relative overflow-hidden p-5"><div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: s.color }} /><div className="text-xs font-semibold text-[#60788c]">{s.l}</div><div data-testid={`text-dashboard-${i}`} className="display mt-5 text-4xl font-extrabold">{s.n}</div><div className="mt-2 text-[11px] text-[#71879b]">{s.sub}</div></div>)}</div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.55fr_.85fr]"><section><div className="mb-4 flex items-center justify-between"><h2 className="display text-xl font-extrabold">Kasus terbaru</h2><Link href="/cases" className="text-xs font-bold text-[#1769d1]" data-testid="link-recent-all">Semua kasus <ArrowRight size={13} className="inline" /></Link></div>{dashboard.recent.length ? <CaseRows cases={dashboard.recent} /> : <Empty title="Belum ada kasus" detail="Mulai dengan mencatat satu permohonan SBU. Anda bisa melengkapi deklarasi bukti setelahnya." action={<Link href="/cases" data-testid="link-first-case" className="btn btn-primary">Buat kasus <Plus size={16} /></Link>} />}</section><aside className="rounded-2xl bg-[#18334e] p-6 text-white"><div className="eyebrow text-[#8dc9f6]">CATATAN PENTING</div><ShieldCheck size={32} className="mt-10 text-[#9bd2f8]" /><h3 className="display mt-4 text-2xl font-extrabold">Tercatat ≠ terverifikasi.</h3><p className="mt-3 text-sm leading-7 text-[#c3d8e8]">Deklarasi bukti dibuat oleh pengguna. Tinjau dokumen asli, kesesuaian klasifikasi, dan ketentuan yang berlaku bersama pihak kompeten sebelum pengajuan.</p><Link href="/regulations" data-testid="link-dashboard-rules" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#9bd2f8]">Baca rujukan <ArrowRight size={15} /></Link></aside></div>
  </>;
}