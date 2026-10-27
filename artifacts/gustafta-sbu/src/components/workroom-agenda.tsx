import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarDays, Download, Pencil, Plus, Search } from 'lucide-react';
import type { WorkroomItem } from '@workspace/api-client-react';
import { agendaCalendar, buildAgenda, calendarCandidates, calendarDay, filterAgenda, jakartaToday, type AgendaBucket, type AgendaFilter } from '@/lib/workroom-agenda';

const filters: { id: AgendaFilter; label: string }[] = [
  { id: 'open', label: 'Aktif' }, { id: 'overdue', label: 'Terlewat' }, { id: 'today', label: 'Hari ini' }, { id: 'week', label: '7 hari' },
  { id: 'undated', label: 'Tanpa tenggat' }, { id: 'done', label: 'Selesai' }, { id: 'all', label: 'Semua' },
];
const bucketMeta: Record<AgendaBucket, { label: string; tone: string; bar: string }> = {
  overdue: { label: 'Terlewat', tone: 'bg-[#fbeceb] text-[#a3362f]', bar: 'bg-[#c9453c]' },
  today: { label: 'Hari ini', tone: 'bg-[#fff3dc] text-[#8a5a00]', bar: 'bg-[#e6a224]' },
  soon: { label: '7 hari ke depan', tone: 'bg-[#e4f0fd] text-[#1559ad]', bar: 'bg-[#1769d1]' },
  later: { label: 'Mendatang', tone: 'bg-[#eaf1f6] text-[#3c566d]', bar: 'bg-[#8fa8bd]' },
  undated: { label: 'Tanpa tenggat', tone: 'bg-[#f0f3f6] text-[#56718a]', bar: 'bg-[#c3d1dc]' },
  invalid: { label: 'Tanggal tidak valid', tone: 'bg-[#fbeceb] text-[#a3362f] ring-1 ring-[#e5b8b3]', bar: 'bg-[#c9453c]' },
  done: { label: 'Selesai', tone: 'bg-[#e3f4ef] text-[#19745f]', bar: 'bg-[#4eb7a2]' },
};
const statusLabel = { todo: 'Belum', doing: 'Berjalan', done: 'Selesai' } as const;
const fmtDay = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const relative = (days: number | null) => days === null ? '' : days === 0 ? 'hari ini' : days < 0 ? `terlewat ${-days} hari` : `${days} hari lagi`;

export function WorkroomAgenda({ caseId, items, onEdit, onAdd }: { caseId: number; items: WorkroomItem[]; onEdit: (item: WorkroomItem) => void; onAdd: () => void }) {
  const [today, setToday] = useState(() => jakartaToday(new Date()));
  const [filter, setFilter] = useState<AgendaFilter>('open');
  const [search, setSearch] = useState('');
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');
  const urlRef = useRef<string | null>(null); const timerRef = useRef<number | null>(null);

  const cleanup = () => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  };

  useEffect(() => {
    const tick = () => setToday(jakartaToday(new Date()));
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', vis);
    const id = window.setInterval(tick, 60_000);
    return () => { window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', vis); window.clearInterval(id); };
  }, []);

  useEffect(() => { setFilter('open'); setSearch(''); setConsentFor(null); setExportError(''); cleanup(); }, [caseId]);
  useEffect(() => () => cleanup(), []);

  const mismatch = items.some(i => i.caseId !== caseId);
  const safeItems = useMemo(() => mismatch ? [] : items, [items, mismatch]);
  const entries = useMemo(() => buildAgenda(safeItems, today), [safeItems, today]);
  const visible = useMemo(() => filterAgenda(entries, filter, search), [entries, filter, search]);
  const candidates = useMemo(() => calendarCandidates(safeItems), [safeItems]);
  const exportKey = JSON.stringify([caseId, candidates.map(i => [i.id, i.revision, i.dueOn, i.title])]);
  const consent = consentFor === exportKey;
  useEffect(() => { setConsentFor(null); setExportError(''); cleanup(); }, [exportKey]);

  const count = (b: AgendaBucket) => entries.filter(e => e.bucket === b).length;
  const stats = [
    { id: 'overdue', label: 'Terlewat', value: count('overdue'), f: 'overdue' as AgendaFilter, accent: 'text-[#a3362f]', ring: 'border-[#efc9c4]' },
    { id: 'today', label: 'Hari ini', value: count('today'), f: 'today' as AgendaFilter, accent: 'text-[#8a5a00]', ring: 'border-[#f1dcae]' },
    { id: 'soon', label: '7 hari ke depan', value: count('soon'), f: 'week' as AgendaFilter, accent: 'text-[#1559ad]', ring: 'border-[#c4daf3]' },
  ];
  const invalidCount = count('invalid');

  const download = () => {
    setExportError('');
    if (!consent || !candidates.length || mismatch) return;
    try {
      const ics = agendaCalendar(caseId, safeItems, new Date());
      cleanup();
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      urlRef.current = url;
      const a = document.createElement('a'); a.href = url; a.download = `agenda-sbu-kasus-${caseId}.ics`; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a);
      try { a.click(); } finally { a.remove(); }
      timerRef.current = window.setTimeout(() => { if (urlRef.current === url) { URL.revokeObjectURL(url); urlRef.current = null; } timerRef.current = null; }, 1000);
    } catch (e) {
      cleanup();
      setExportError(e instanceof Error && e.message ? e.message : 'Berkas kalender gagal dibuat. Coba lagi.');
    }
  };

  return <section aria-labelledby={`agenda-title-${caseId}`} data-testid="section-agenda" className="mb-6 overflow-hidden rounded-2xl border border-[#d4e2ec] bg-[#f7fbfe]">
    <div className="flex flex-col gap-4 border-b border-[#dbe7ef] p-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="eyebrow flex items-center gap-2 text-[#1769d1]"><CalendarClock size={13} aria-hidden /> AGENDA PERSIAPAN SBU</div>
        <h3 id={`agenda-title-${caseId}`} className="display mt-1.5 text-lg font-extrabold text-[#19324a]">Tindak lanjut menurut urgensi</h3>
        <p data-testid="text-agenda-baseline" className="mt-1 text-xs text-[#56718a]">Acuan tanggal: <span className="mono font-bold text-[#2b4159]">{fmtDay(today)}</span> WIB (Asia/Jakarta). Tenggat internal, bukan tenggat resmi.</p>
      </div>
      <button type="button" data-testid="button-agenda-add" onClick={onAdd} className="btn btn-primary self-start sm:self-auto"><Plus size={15} aria-hidden /> Tambah tindakan</button>
    </div>

    <div className="p-5">
      {mismatch ? <p role="alert" data-testid="text-agenda-mismatch" className="text-sm text-[#b34442]">Data agenda tidak cocok dengan kasus ini.</p> : <>
        <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="agenda-overview">
          {stats.map(s => <button key={s.id} type="button" data-testid={`stat-agenda-${s.id}`} onClick={() => setFilter(s.f)} aria-label={`${s.label}: ${s.value} tindakan. Tampilkan`} className={`group rounded-xl border bg-white p-3 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_#0d2a4614] sm:p-4 ${s.ring}`}>
            <span className={`display block text-2xl font-extrabold sm:text-3xl ${s.accent}`}>{s.value}</span>
            <span className="mt-1 block text-[11px] font-bold leading-4 text-[#47667e] sm:text-xs">{s.label}</span>
          </button>)}
        </div>
        {invalidCount > 0 && <p data-testid="text-agenda-invalid" className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#a3362f]"><AlertTriangle size={14} aria-hidden /> {invalidCount} tindakan memiliki tanggal tenggat tidak valid. Perbaiki lewat tombol ubah.</p>}

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block flex-1"><span className="sr-only">Cari tindakan</span>
            <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7a8999]" />
            <input data-testid="input-agenda-search" type="search" className="field !pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari judul, penanggung jawab, keterangan" /></label>
          <div role="group" aria-label="Saring agenda" data-testid="filter-agenda" className="flex gap-1 overflow-x-auto rounded-xl border border-[#d4e1ea] bg-white p-1">
            {filters.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} data-testid={`filter-agenda-${f.id}`} onClick={() => setFilter(f.id)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${filter === f.id ? 'bg-[#14253a] text-white' : 'text-[#56718a] hover:bg-[#eef6fc]'}`}>{f.label}</button>)}
          </div>
        </div>

        <div aria-live="polite" className="mt-4">
          {entries.length === 0 ? <div data-testid="state-agenda-empty" className="rounded-xl border border-dashed border-[#bfd0de] bg-white p-7 text-center">
            <CalendarDays className="mx-auto text-[#8fa8bd]" size={22} aria-hidden />
            <p className="mt-2 text-sm font-bold text-[#19324a]">Belum ada tindakan untuk diagendakan.</p>
            <p className="mt-1 text-xs text-[#56718a]">Tambahkan tindak lanjut dengan tenggat agar muncul di sini.</p>
          </div> : visible.length === 0 ? <div data-testid="state-agenda-no-results" className="rounded-xl border border-dashed border-[#bfd0de] bg-white p-6 text-center text-sm text-[#56718a]">
            Tidak ada tindakan yang cocok dengan pencarian atau saringan ini.
            <button type="button" data-testid="button-agenda-reset" onClick={() => { setSearch(''); setFilter('all'); }} className="ml-2 font-bold text-[#1769d1] underline">Tampilkan semua</button>
          </div> : <ul className="space-y-2" data-testid="list-agenda">
            {visible.map(({ item, bucket, days }) => { const m = bucketMeta[bucket]; return <li key={item.id} data-testid={`row-agenda-${item.id}`} className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-[#dbe8f1] bg-white py-3 pl-5 pr-3 transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_6px_18px_#0d2a4612]">
              <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${m.bar}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.tone}`}>{m.label}</span>
                  <span className="text-[11px] font-semibold text-[#56718a]">Status: {statusLabel[item.status]}</span>
                </div>
                <p className={`mt-1.5 break-words text-sm font-bold text-[#19324a] ${bucket === 'done' ? 'line-through opacity-60' : ''}`}>{item.title}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#4a647b]">
                  <span data-testid={`text-agenda-due-${item.id}`} className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden />
                    {item.dueOn === null ? 'Tanpa tenggat' : calendarDay(item.dueOn) === null ? <span className="font-bold text-[#a3362f]">Tanggal tidak valid: <span className="mono">{item.dueOn}</span></span> : <>{fmtDay(item.dueOn)}{bucket !== 'done' && <span className="text-[#688096]"> · {relative(days)}</span>}</>}</span>
                  <span data-testid={`text-agenda-assignee-${item.id}`}>{item.assignee ? `PJ: ${item.assignee}` : 'Belum ada penanggung jawab'}</span>
                </div>
              </div>
              <button type="button" data-testid={`button-agenda-edit-${item.id}`} aria-label={`Ubah ${item.title}`} onClick={() => onEdit(item)} className="shrink-0 rounded-lg p-2 text-[#3c566d] transition-colors hover:bg-[#ecf4f9] hover:text-[#1769d1]"><Pencil size={15} aria-hidden /></button>
            </li>; })}
          </ul>}
        </div>

        <div className="mt-6 rounded-xl border border-[#d4e1ea] bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <p className="text-sm font-bold text-[#19324a]">Ekspor ke kalender (.ics)</p>
              <p data-testid="text-agenda-export-count" className="mt-1 text-xs font-semibold text-[#1559ad]">{candidates.length} tindakan aktif bertenggat valid akan diekspor (tidak terpengaruh pencarian atau saringan).</p>
              <p className="mt-2 text-xs leading-5 text-[#56718a]">Berkas hanya berisi judul tindakan dan tanggal tenggat; tanpa keterangan, penanggung jawab, atau dokumen. Ini salinan sekali ambil, bukan sinkronisasi langsung dan tidak mengirim pemberitahuan otomatis. Tanggal adalah target internal, bukan tenggat hukum.</p>
            </div>
          </div>
          <label className="mt-3 flex items-start gap-2.5 text-xs leading-5 text-[#2b4159]">
            <input type="checkbox" data-testid="checkbox-agenda-consent" checked={consent} onChange={e => setConsentFor(e.target.checked ? exportKey : null)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1769d1]" />
            <span>Saya paham judul tindakan akan tersimpan di berkas ini dan dapat terunggah ke penyedia kalender bila saya mengimpornya.</span>
          </label>
          <button type="button" data-testid="button-agenda-download" disabled={!consent || candidates.length === 0} onClick={download} className="btn btn-outline mt-3"><Download size={15} aria-hidden /> Unduh agenda ({candidates.length})</button>
          {exportError && <p role="alert" data-testid="text-agenda-export-error" className="mt-2 text-xs text-[#b34442]">{exportError}</p>}
        </div>
      </>}
    </div>
  </section>;
}
