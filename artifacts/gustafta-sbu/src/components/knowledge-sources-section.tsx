import * as React from 'react';
import { useState } from 'react';
import { ArrowUpRight, Search, X } from 'lucide-react';
import type { KnowledgeSource } from '@workspace/api-client-react';
import { KnowledgeSourcePdf } from './knowledge-source-pdf';
import {
  emptyFilters, filterSources, hasPrintedLocator, hasPdfLocator, roleLabels, safeSourceUrl, selectSource, sourceRoles, sourceTopics,
  verificationLabels, type SourceFilters,
} from '@/lib/knowledge-source-view';

export type KnowledgeSourcesResult = { data?: KnowledgeSource[]; isLoading: boolean; isError: boolean; isFetching?: boolean; refetch: () => unknown };

export function KnowledgeSourcesSection({ result, initialFilters = emptyFilters, initialSelectedId = null }: { result: KnowledgeSourcesResult; initialFilters?: SourceFilters; initialSelectedId?: string | null }) {
  const [filters, setFilters] = useState<SourceFilters>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  // Cached data is never shown on error or while any refetch is in flight.
  const fresh = result.isError || result.isLoading || result.isFetching ? undefined : result.data;
  const selected = selectSource(fresh, selectedId);
  // Conceal (do not destroy) a previously opened reader during the short
  // background status check. Failure/withdrawal/owner unmount still destroys it.
  // Initial loading never retains a cached source or renders a stale dialog.
  const retained = React.useRef<KnowledgeSource | null>(null);
  if (fresh || result.isError || result.isLoading || selectedId === null) retained.current = selected ?? null;
  const detailSource = retained.current?.id === selectedId ? retained.current : null;
  const detail = detailSource && <div hidden={!!result.isFetching} inert={!!result.isFetching}>
    <SourceDetail key={detailSource.id} source={detailSource} suspended={!!result.isFetching} close={() => setSelectedId(null)}/>
  </div>;
  const set = (patch: Partial<SourceFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const header = <div className="mb-4 mt-10"><div className="eyebrow text-[#1769d1]">KUTIPAN SUMBER TERKURASI</div><h2 className="display mt-2 text-2xl font-extrabold">Sumber aktif yang dapat ditelusuri</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Status terverifikasi hanya merujuk pada metadata sumber dalam cakupan yang tercatat, bukan penilaian bahwa aturan berlaku bagi kasus Anda.</p></div>;

  if (result.isError) return <section aria-label="Sumber terkurasi" data-testid="sources-error">{header}<div role="alert" className="surface p-8 text-center"><h3 className="text-lg font-bold">Sumber belum dapat ditampilkan</h3><p className="mt-2 text-sm text-[#58708a]">Koneksi sedang terganggu. Coba muat ulang data.</p><button data-testid="button-sources-retry" onClick={() => result.refetch()} className="btn btn-outline mt-5">Coba lagi</button></div></section>;
  if (!fresh) return <><section aria-label="Sumber terkurasi" data-testid="sources-loading">{header}<div aria-label="Memuat sumber" className="surface p-5">Memuat sumber terkurasi...</div></section>{detail}</>;
  if (!fresh.length) return <section aria-label="Sumber terkurasi" data-testid="sources-empty">{header}<div className="surface px-7 py-10 text-center"><h3 className="display text-lg font-extrabold">Belum ada sumber aktif</h3><p className="mx-auto mt-2 max-w-md text-sm text-[#586f86]">Tidak ada kutipan terkurasi yang tersedia saat ini.</p></div></section>;

  const shown = filterSources(fresh, filters);
  const active = filters.query || filters.role || filters.status || filters.topic;
  const sel = 'field text-sm';
  return <><section aria-label="Sumber terkurasi" data-testid="sources-section">
    {header}
    <div className="surface mb-4 grid gap-3 p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
      <label className="relative block"><span className="sr-only">Cari sumber</span><Search size={15} className="absolute left-3 top-3.5 text-[#678096]"/><input data-testid="input-source-search" type="search" className={`${sel} w-full pl-9`} placeholder="Cari dokumen, kutipan, lokator, versi, topik" value={filters.query} onChange={(e) => set({ query: e.target.value })}/></label>
      <label><span className="sr-only">Peran sumber</span><select data-testid="select-source-role" className={`${sel} w-full`} value={filters.role} onChange={(e) => set({ role: e.target.value })}><option value="">Semua jenis</option>{sourceRoles(fresh).map((r) => <option key={r} value={r}>{roleLabels[r] ?? r}</option>)}</select></label>
      <label><span className="sr-only">Status metadata</span><select data-testid="select-source-status" className={`${sel} w-full`} value={filters.status} onChange={(e) => set({ status: e.target.value })}><option value="">Semua status</option><option value="verified">{verificationLabels.verified}</option><option value="unverified">{verificationLabels.unverified}</option></select></label>
      <label><span className="sr-only">Topik</span><select data-testid="select-source-topic" className={`${sel} w-full`} value={filters.topic} onChange={(e) => set({ topic: e.target.value })}><option value="">Semua topik</option>{sourceTopics(fresh).map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
      <button type="button" data-testid="button-source-reset" disabled={!active} onClick={() => setFilters(emptyFilters)} className="btn btn-outline">Atur ulang</button>
    </div>
    <p role="status" aria-live="polite" data-testid="text-source-count" className="mb-3 text-xs font-semibold text-[#42637e]">Menampilkan {shown.length} dari {fresh.length} sumber</p>
    {shown.length ? <ul className="grid gap-3 lg:grid-cols-2">{shown.map((s) => <li key={s.id} className="surface p-5">
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e7f3fc] px-3 py-1 text-[10px] font-bold text-[#326384]">{roleLabels[s.sourceRole] ?? s.sourceRole}</span><span className="text-[10px] font-bold text-[#58708a]">{verificationLabels[s.verificationStatus] ?? s.verificationStatus}</span></div>
      <h3 className="display mt-3 text-lg font-extrabold">{s.document}</h3>
      <p className="mt-1 text-xs text-[#58708a]">Versi {s.version}</p>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#57728a]">{s.excerpt}</p>
      <button type="button" data-testid={`button-source-detail-${s.id}`} aria-haspopup="dialog" onClick={() => setSelectedId(s.id)} className="mt-4 text-sm font-bold text-[#1769d1] underline underline-offset-2">Lihat detail sumber</button>
    </li>)}</ul>
    : <div data-testid="sources-no-match" className="surface px-7 py-10 text-center"><h3 className="display text-lg font-extrabold">Tidak ada sumber yang cocok</h3><p className="mt-2 text-sm text-[#586f86]">Ubah kata kunci atau filter.</p><button type="button" data-testid="button-source-reset-empty" onClick={() => setFilters(emptyFilters)} className="btn btn-outline mt-4">Atur ulang</button></div>}
  </section>{detail}</>;
}

function Row({ label, children, id }: { label: string; children: React.ReactNode; id: string }) {
  return <div className="border-t border-[#e1eaf0] py-3"><dt className="text-[11px] font-bold uppercase tracking-wide text-[#58708a]">{label}</dt><dd data-testid={`source-${id}`} className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#27425a]">{children}</dd></div>;
}

export function SourceDetail({ source: s, close, suspended = false }: { source: KnowledgeSource; close: () => void; suspended?: boolean }) {
  const url = safeSourceUrl(s.sourceUrl);
  const panel = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const targets = [...(panel.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]') ?? [])];
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [close, suspended]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d1b2ad9] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="source-detail-title" data-testid="dialog-source-detail" className="surface my-auto max-h-[90vh] w-full max-w-[640px] overflow-y-auto shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[#d8e4ec] p-6"><h2 id="source-detail-title" className="display text-xl font-extrabold">{s.document}</h2><button data-testid="button-close-source-detail" onClick={close} aria-label="Tutup" className="rounded-lg p-2 hover:bg-[#ecf4f9]"><X size={18}/></button></div>
      <dl className="px-6 pb-4">
        <Row id="document" label="Dokumen">{s.document}</Row>
        <Row id="version" label="Versi">{s.version} (ID versi: {s.versionId})</Row>
        <Row id="role" label="Peran sumber">{roleLabels[s.sourceRole] ?? s.sourceRole}</Row>
        <Row id="topics" label="Topik">{s.topics.length ? s.topics.join(', ') : 'Tidak dicatat'}</Row>
        <Row id="locator" label="Lokator">{s.locator}</Row>
        <Row id="pdf" label="Halaman PDF">{hasPdfLocator(s.locator) ? 'Lihat penanda PDF pada lokator di atas, dicatat apa adanya.' : 'Nomor halaman PDF tidak dicatat secara eksplisit.'}</Row>
        <Row id="printed" label="Halaman cetak">{hasPrintedLocator(s.locator) ? 'Lihat penanda cetak pada lokator di atas, dicatat apa adanya.' : 'Nomor halaman cetak tidak dicatat secara eksplisit; tidak disamakan dengan halaman PDF.'}</Row>
        <Row id="checkedOn" label="Diperiksa pada">{s.checkedOn}</Row>
        <Row id="excerpt" label="Ringkasan terkurasi">{s.excerpt}</Row>
        <Row id="status" label="Status metadata sumber">{verificationLabels[s.verificationStatus] ?? s.verificationStatus}. Ini hanya merujuk metadata sumber dalam cakupan di bawah, bukan penilaian keberlakuan hukum.</Row>
        <Row id="scope" label="Cakupan verifikasi">{s.verificationScope}</Row>
        <Row id="documentStatus" label="Status dokumen">{s.documentStatus}</Row>
        <Row id="limitation" label="Batasan">{s.limitation}</Row>
        <Row id="url" label="Tautan sumber">{url ? <a data-testid="link-source-detail" href={url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-[#1769d1] underline underline-offset-2">{url} <ArrowUpRight size={12} className="inline"/></a> : 'Tautan tidak tersedia atau tidak aman.'}</Row>
      </dl>
      <KnowledgeSourcePdf key={s.id} source={s} />
    </section>
  </div>;
}
