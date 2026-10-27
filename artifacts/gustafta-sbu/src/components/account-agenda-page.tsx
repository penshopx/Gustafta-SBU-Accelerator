import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BriefcaseBusiness, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { useGetAccountAgenda, getGetAccountAgendaQueryKey, type AccountAgenda, type AccountAgendaAction } from '@workspace/api-client-react';
import { useAccountReadOptions } from './account-queries';
import { ErrorState, Loading } from './request-states';
import { calendarDay } from '@/lib/workroom-agenda';

type Filter = 'active' | 'overdue' | 'today' | 'week' | 'undated' | 'done' | 'all';
const PAGE_SIZE = 20;
const filters: { id: Filter; label: string }[] = [
  { id: 'active', label: 'Aktif' }, { id: 'overdue', label: 'Terlewat' }, { id: 'today', label: 'Hari ini' }, { id: 'week', label: '7 hari' },
  { id: 'undated', label: 'Tanpa tenggat' }, { id: 'done', label: 'Selesai' }, { id: 'all', label: 'Semua' },
];
const statusLabel = { todo: 'Belum', doing: 'Berjalan', done: 'Selesai' } as const;
// Pure calendar-day math in UTC on server-provided strings; device timezone is never consulted.
const dayNum = (d: string): number | null => { const time = calendarDay(d); return time === null ? null : time / 86400000; };
const fmtDay = (d: string) => { const n = dayNum(d); return n === null ? d : new Date(n * 86400000).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const fmtAsOf = (s: string) => { const t = new Date(s); return isNaN(t.getTime()) ? '' : t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }); };

type Bucket = 'overdue' | 'today' | 'soon' | 'later' | 'undated' | 'invalid' | 'done';
const bucketMeta: Record<Bucket, { label: string; tone: string; bar: string }> = {
  overdue: { label: 'Terlewat', tone: 'bg-[#fbeceb] text-[#a3362f]', bar: 'bg-[#c9453c]' },
  today: { label: 'Hari ini', tone: 'bg-[#fff3dc] text-[#8a5a00]', bar: 'bg-[#e6a224]' },
  soon: { label: '7 hari ke depan', tone: 'bg-[#e4f0fd] text-[#1559ad]', bar: 'bg-[#1769d1]' },
  later: { label: 'Mendatang', tone: 'bg-[#eaf1f6] text-[#3c566d]', bar: 'bg-[#8fa8bd]' },
  undated: { label: 'Tanpa tenggat', tone: 'bg-[#f0f3f6] text-[#56718a]', bar: 'bg-[#c3d1dc]' },
  invalid: { label: 'Tanggal tidak valid', tone: 'bg-[#fbeceb] text-[#a3362f] ring-1 ring-[#e5b8b3]', bar: 'bg-[#c9453c]' },
  done: { label: 'Selesai', tone: 'bg-[#e3f4ef] text-[#19745f]', bar: 'bg-[#4eb7a2]' },
};
function classify(a: AccountAgendaAction, today: number): { bucket: Bucket; days: number | null } {
  if (a.status === 'done') return { bucket: 'done', days: null };
  if (a.dueOn === null) return { bucket: 'undated', days: null };
  const n = dayNum(a.dueOn); if (n === null) return { bucket: 'invalid', days: null };
  const days = n - today;
  return { bucket: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later', days };
}
const relative = (d: number | null) => d === null ? '' : d === 0 ? 'hari ini' : d < 0 ? `terlewat ${-d} hari` : `${d} hari lagi`;
const isConflict = (e: unknown) => (e as { status?: number } | null)?.status === 409;

export function AccountAgendaPage({ expectedUserId }: { expectedUserId: string }) {
  return <AgendaView key={expectedUserId} expectedUserId={expectedUserId} />;
}
export default AccountAgendaPage;

function AgendaView({ expectedUserId }: { expectedUserId: string }) {
  const readOptions = useAccountReadOptions();
  const [filter, setFilter] = useState<Filter>('active');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params = { page, pageSize: PAGE_SIZE, filter, ...(search ? { search } : {}) };
  const q = useGetAccountAgenda(params, { ...readOptions, query: { queryKey: getGetAccountAgendaQueryKey(params), enabled: !!expectedUserId, staleTime: 15000, refetchOnWindowFocus: true, refetchOnMount: 'always' } });
  const data = q.data as AccountAgenda | undefined;
  const owned = !!data && data.ownerId === expectedUserId;
  const mismatch = !!data && !owned;
  const pageGone = owned && page > 1 && data.total <= (page - 1) * PAGE_SIZE;
  useEffect(() => { if (pageGone) setPage(1); }, [pageGone]);

  const choose = (f: Filter) => { setFilter(f); setPage(1); };
  const submit = (e: FormEvent) => { e.preventDefault(); setSearch(draft.trim().slice(0, 120)); setPage(1); };
  const clear = () => { setDraft(''); setSearch(''); setPage(1); };
  const refresh = () => { void q.refetch(); };
  const showData = owned && !q.isError && !pageGone;
  const today = showData ? dayNum(data.today) : null;
  const from = showData && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = showData ? from + data.items.length - (data.items.length ? 1 : 0) : 0;

  return <div data-testid="page-account-agenda" className="fade-up">
    <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="eyebrow mb-2 flex items-center gap-2 text-[#1769d1]"><CalendarClock size={13} aria-hidden /> RUANG KERJA / AGENDA LINTAS KASUS</div>
        <h1 className="display text-[32px] font-extrabold leading-tight text-[#14253a] sm:text-[39px]">Agenda tindak lanjut</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Semua tindakan dari kasus Anda, diurutkan server menurut urgensi. Buka kasus untuk mengubah, menambah, atau mengekspor ke kalender.</p>
      </div>
      <button type="button" data-testid="button-agenda-refresh" onClick={refresh} disabled={q.isFetching} className="btn btn-outline self-start sm:self-auto"><RefreshCw size={15} aria-hidden className={q.isFetching ? 'animate-spin' : ''} /> {q.isFetching ? 'Memuat...' : 'Muat ulang'}</button>
    </div>

    <div className="mb-6 grid gap-3 rounded-2xl border border-[#d4e2ec] bg-[#f7fbfe] p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
      <div className="flex items-center gap-3 rounded-xl bg-[#14253a] px-4 py-3 text-white">
        <CalendarDays size={18} className="text-[#82c8ff]" aria-hidden />
        <div><div className="eyebrow text-[#8dc9f6]">ACUAN TANGGAL WIB</div>
          <div data-testid="text-agenda-baseline" className="mono mt-0.5 text-sm font-bold">{showData ? fmtDay(data.today) : '—'}</div></div>
      </div>
      <p data-testid="text-agenda-disclaimer" className="text-xs leading-5 text-[#47667e]">Acuan hari dihitung server untuk zona Asia/Jakarta (WIB){showData && fmtAsOf(data.asOf) ? `, diperbarui pukul ${fmtAsOf(data.asOf)} WIB` : ''}. <strong className="text-[#19324a]">Tanggal di sini adalah target internal Anda, bukan tenggat hukum atau tenggat resmi LSBU.</strong> Tidak ada pengingat otomatis.</p>
    </div>

    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <form role="search" onSubmit={submit} className="flex flex-1 gap-2">
        <label className="relative block flex-1"><span className="sr-only">Cari tindakan</span>
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a8999]" />
          <input data-testid="input-agenda-search" type="search" maxLength={120} className="field !pl-9" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Cari judul, perusahaan, penanggung jawab" /></label>
        <button type="submit" data-testid="button-agenda-search" className="btn btn-dark">Cari</button>
      </form>
      <div role="group" aria-label="Saring agenda" className="flex gap-1 overflow-x-auto rounded-xl border border-[#d4e1ea] bg-white p-1">
        {filters.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} data-testid={`filter-agenda-${f.id}`} onClick={() => choose(f.id)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${filter === f.id ? 'bg-[#14253a] text-white' : 'text-[#56718a] hover:bg-[#eef6fc]'}`}>{f.label}</button>)}
      </div>
    </div>
    {search && <p className="mb-4 flex items-center gap-2 text-xs text-[#47667e]">Hasil untuk <span className="font-bold text-[#19324a]">"{search}"</span><button type="button" data-testid="button-agenda-clear-search" onClick={clear} className="inline-flex items-center gap-1 font-bold text-[#1769d1]"><X size={12} aria-hidden /> Hapus pencarian</button></p>}

    <div aria-live="polite" aria-busy={q.isLoading || pageGone}>
      {q.isError ? <ErrorState retry={refresh} message={isConflict(q.error) ? 'Akun aktif berubah atau data sedang diperbarui. Muat ulang untuk melihat agenda terbaru akun ini.' : undefined} />
        : mismatch ? <ErrorState retry={refresh} message="Data agenda tidak cocok dengan akun yang sedang masuk. Data tidak ditampilkan." />
        : !showData ? <div data-testid="state-agenda-loading"><Loading rows={4} /></div>
        : data.items.length === 0 ? <div data-testid="state-agenda-empty" className="surface relative overflow-hidden px-7 py-12 text-center">
            <div className="absolute left-0 top-0 h-1 w-full bg-[#9bcaf3]" />
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f3fd] text-[#1769d1]"><CalendarDays size={22} aria-hidden /></div>
            <h3 className="display text-lg font-extrabold">{search || filter !== 'all' ? 'Tidak ada tindakan yang cocok' : 'Belum ada tindakan'}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#586f86]">{search || filter !== 'all' ? 'Coba saringan lain atau hapus pencarian.' : 'Tambahkan tindak lanjut dari ruang kerja salah satu kasus Anda.'}</p>
            <div className="mt-5 flex justify-center gap-2">
              {(search || filter !== 'all') && <button type="button" data-testid="button-agenda-show-all" onClick={() => { clear(); choose('all'); }} className="btn btn-outline">Tampilkan semua</button>}
              <Link href="/cases" data-testid="link-agenda-cases" className="btn btn-primary">Buka kasus <ArrowRight size={15} aria-hidden /></Link>
            </div>
          </div>
        : <>
          <ul className="space-y-2" data-testid="list-account-agenda">
            {data.items.map(a => { const { bucket, days } = today === null ? { bucket: 'invalid' as Bucket, days: null } : classify(a, today); const m = bucketMeta[bucket]; return <li key={a.id}>
              <Link href={`/cases/${a.caseId}`} data-testid={`row-account-agenda-${a.id}`} className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-[#dbe8f1] bg-white py-3 pl-5 pr-3 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_6px_18px_#0d2a4612]">
                <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${m.bar}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.tone}`}>{m.label}</span>
                    <span className="text-[11px] font-semibold text-[#56718a]">Status: {statusLabel[a.status]}</span>
                  </div>
                  <p className={`mt-1.5 break-words text-sm font-bold text-[#19324a] ${a.status === 'done' ? 'line-through opacity-60' : ''}`}>{a.title}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#4a647b]">
                    <span className="inline-flex min-w-0 items-center gap-1"><BriefcaseBusiness size={12} aria-hidden /><span className="truncate font-semibold text-[#2b4159]">{a.companyName}</span>{a.classification && <span className="text-[#688096]">· {a.classification}</span>}</span>
                    <span data-testid={`text-account-agenda-due-${a.id}`} className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden />
                      {a.dueOn === null ? 'Tanpa tenggat' : dayNum(a.dueOn) === null ? <span className="font-bold text-[#a3362f]">Tanggal tidak valid: <span className="mono">{a.dueOn}</span></span> : <>{fmtDay(a.dueOn)}{bucket !== 'done' && days !== null && <span className="text-[#688096]"> · {relative(days)}</span>}</>}</span>
                    <span>{a.assignee ? `PJ: ${a.assignee}` : 'Belum ada penanggung jawab'}</span>
                  </div>
                </div>
                <ChevronRight size={17} aria-hidden className="mt-1 shrink-0 text-[#7c97af] transition-transform group-hover:translate-x-1" />
              </Link></li>; })}
          </ul>
          <nav aria-label="Halaman agenda" className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p data-testid="text-agenda-range" className="mono text-xs text-[#56718a]">{from}–{to} dari {data.total} tindakan · hal. {data.page}</p>
            <div className="flex gap-2">
              <button type="button" data-testid="button-agenda-prev" disabled={page <= 1 || q.isFetching} onClick={() => setPage(p => Math.max(1, p - 1))} className="btn btn-outline"><ChevronLeft size={15} aria-hidden /> Sebelumnya</button>
              <button type="button" data-testid="button-agenda-next" disabled={!data.hasNext || q.isFetching} onClick={() => setPage(p => p + 1)} className="btn btn-outline">Berikutnya <ChevronRight size={15} aria-hidden /></button>
            </div>
          </nav>
          {q.isFetching && <p role="status" className="mt-2 text-center text-xs text-[#688096]">Memperbarui...</p>}
        </>}
    </div>
  </div>;
}
