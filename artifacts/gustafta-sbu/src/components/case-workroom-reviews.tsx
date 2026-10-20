import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  useGetWorkroomReviews, usePreviewWorkroomReview, useCreateWorkroomReview, getGetWorkroomReviewsQueryKey,
  getGetCaseQueryKey, getListEvidenceQueryKey, getListCaseDocumentsQueryKey, getGetWorkroomQueryKey,
  type ReviewPreview, type ReviewSelection, type ReviewSnapshot, type ReviewRecord, type ReviewWorkspace,
} from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from './account-queries';
import { ErrorState, Loading } from './request-states';

const MAX = 50;
const decisionLabel = { approved: 'Setuju internal', needs_changes: 'Perlu perbaikan' } as const;
type Decision = keyof typeof decisionLabel;
const stamp = (s: string) => new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const status = (e: unknown) => (e as { status?: number } | null)?.status;
const errMsg = (e: unknown) => e instanceof Error && e.message ? e.message : 'Permintaan belum berhasil. Coba lagi.';
const kb = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const toggle = <T,>(arr: T[], v: T) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

function SnapshotView({ snap, testid }: { snap: ReviewSnapshot; testid: string }) {
  const c = snap.case;
  return <div data-testid={testid} className="space-y-4 text-sm text-[#2b4159]">
    <div className="rounded-lg border border-[#dbe8f1] bg-[#f7fbfe] p-3" data-testid={`${testid}-case`}>
      <div className="eyebrow mb-1 text-[#1769d1]">ATRIBUT KASUS (SELALU TERMASUK)</div>
      <p className="font-bold">{c.companyName}</p>
      <p className="text-xs text-[#56718a]">Permohonan {c.requestType} / kualifikasi {c.qualification} / klasifikasi {c.classification} / status {c.status} / masa berlaku SBU {c.existingSbuExpiresOn ?? 'tidak dicatat'} / diperbarui {stamp(c.updatedAt)}</p>
    </div>
    <div><div className="eyebrow mb-1 text-[#1769d1]">CATATAN RUANG KERJA ({snap.workroomItems.length})</div>
      {snap.workroomItems.length === 0 ? <p className="text-xs text-[#688096]">Tidak ada.</p> : <ul className="space-y-2">{snap.workroomItems.map(i => <li key={i.id} data-testid={`${testid}-item-${i.id}`} className="rounded-lg border border-[#dbe8f1] bg-white p-3">
        <p className="break-words font-bold">{i.title}</p>
        {i.body && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#56718a]">{i.body}</p>}
        <p className="mt-1 text-[11px] text-[#688096]">Jenis {i.kind} / status {i.status} / PJ {i.assignee || '-'} / tenggat {i.dueOn ?? '-'} / revisi {i.revision} / diperbarui {stamp(i.updatedAt)}</p></li>)}</ul>}</div>
    <div><div className="eyebrow mb-1 text-[#1769d1]">CATATAN BUKTI ({snap.evidence.length})</div>
      {snap.evidence.length === 0 ? <p className="text-xs text-[#688096]">Tidak ada.</p> : <ul className="space-y-2">{snap.evidence.map(e => <li key={e.id} data-testid={`${testid}-evidence-${e.id}`} className="rounded-lg border border-[#dbe8f1] bg-white p-3"><p className="break-words font-bold">{e.code} / {e.title}</p>{e.note && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#56718a]">{e.note}</p>}<p className="mt-1 text-[11px] text-[#688096]">Diperbarui {stamp(e.updatedAt)}</p></li>)}</ul>}</div>
    <div><div className="eyebrow mb-1 text-[#1769d1]">METADATA DOKUMEN ({snap.documents.length})</div>
      <p className="mb-1 text-[11px] text-[#688096]">Hanya rujukan metadata. Berkas asli tetap di ruang simpan; isi berkas dan tautan unduhan tidak disimpan.</p>
      {snap.documents.length === 0 ? <p className="text-xs text-[#688096]">Tidak ada.</p> : <ul className="space-y-2">{snap.documents.map(d => <li key={d.id} data-testid={`${testid}-document-${d.id}`} className="rounded-lg border border-[#dbe8f1] bg-white p-3"><p className="break-words font-bold">{d.name} (v{d.version})</p>{d.description && <p className="mt-1 break-words text-xs text-[#56718a]">{d.description}</p>}<p className="mt-1 text-[11px] text-[#688096]">{d.category} / {d.contentType} / {kb(d.size)} / status {d.status} / pindai {d.scanStatus} / dibuat {stamp(d.createdAt)}</p></li>)}</ul>}</div>
  </div>;
}

type Draft = { decision: Decision | null; note: string };
function PreviewDialog({ caseId, preview, seq, draft, setDraft, onClose, onDone, onRefreshPreview, stale, refreshing, refreshError, onSaving }: {
  caseId: number; preview: ReviewPreview; seq: number; draft: Draft; setDraft: (d: Draft) => void; onClose: () => void; onDone: () => void;
  onRefreshPreview: () => void; stale: boolean; refreshing: boolean; refreshError?: unknown; onSaving: (b: boolean) => void;
}) {
  const save = useCreateWorkroomReview(useFormMutationOptions());
  const [confirmed, setConfirmed] = useState(false);
  const { decision, note } = draft;
  const box = useRef<HTMLElement>(null);
  useEffect(() => { setConfirmed(false); save.reset(); // every new preview response needs fresh confirmation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
  useEffect(() => { onSaving(save.isPending); }, [save.isPending, onSaving]);
  useEffect(() => () => onSaving(false), [onSaving]);
  useEffect(() => { box.current?.focus(); }, []);
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return;
    const f = Array.from(box.current.querySelectorAll<HTMLElement>('button,input,textarea,[tabindex]:not([tabindex="-1"])')).filter(x => !(x as HTMLButtonElement).disabled);
    if (f.length === 0) { e.preventDefault(); return; }
    const a = document.activeElement;
    if (e.shiftKey && (a === f[0] || a === box.current)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };
  const submitting = useRef(false);
  const busy = save.isPending || refreshing;
  const conflict = stale || status(save.error) === 409;
  const valid = confirmed && !!decision && note.trim().length > 0 && note.length <= 2000 && !conflict;
  const close = () => { if (!busy) onClose(); };
  const submit = () => {
    if (!valid || submitting.current || !decision) return;
    submitting.current = true;
    save.mutate({ id: caseId, data: { selection: preview.selection, snapshotHash: preview.snapshotHash, latestReviewId: preview.latestReviewId, decision, note: note.trim(), confirmed: true } },
      { onSuccess: onDone, onSettled: () => { submitting.current = false; } });
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d1b2ad9] p-4" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else trap(e); }}>
    <section ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pratinjau tinjauan" data-testid="dialog-review-preview" className="surface my-auto w-full max-w-[720px] overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#d8e4ec] p-5"><h2 className="display text-lg font-extrabold">Pratinjau snapshot tinjauan</h2><button type="button" disabled={busy} onClick={close} aria-label="Tutup" data-testid="button-review-close" className="rounded-lg p-2 hover:bg-[#ecf4f9] disabled:opacity-50"><X size={18} /></button></div>
      <div className="max-h-[70dvh] space-y-5 overflow-y-auto p-5">
        <p className="text-xs leading-5 text-[#47667e]">Ini isi persis yang akan disimpan sebagai riwayat privat. Nilai terbaru tidak dicampurkan ke pratinjau.</p>
        <p data-testid="text-review-preview-version" className="break-all font-mono text-[11px] text-[#56718a]">Referensi versi snapshot: {preview.snapshotHash}</p>
        <SnapshotView snap={preview.snapshot} testid="review-preview" />
        <fieldset disabled={busy} className="space-y-4 border-t border-[#e0e9ef] pt-4">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" data-testid="checkbox-review-confirm" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /><span>Saya sudah memeriksa snapshot di atas dan ingin mencatat tinjauan internal yang tidak dapat diedit atau dihapus tersendiri. Riwayat ikut terhapus jika kasus dihapus.</span></label>
          <div role="radiogroup" aria-label="Keputusan" className="grid gap-2 sm:grid-cols-2">{(Object.keys(decisionLabel) as Decision[]).map(d => <button key={d} type="button" role="radio" aria-checked={decision === d} data-testid={`button-review-decision-${d}`} onClick={() => setDraft({ ...draft, decision: d })} className={`rounded-xl border p-3 text-left text-sm font-bold ${decision === d ? 'border-[#1769d1] bg-[#eaf4ff] ring-1 ring-[#1769d1]' : 'border-[#d1dfe9] bg-white'}`}>{decisionLabel[d]}</button>)}</div>
          <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Catatan tinjauan (terlihat di riwayat, maks. 2000 karakter)</span><textarea data-testid="input-review-note" className="field min-h-[100px]" maxLength={2000} value={note} onChange={e => setDraft({ ...draft, note: e.target.value })} /><span className="mt-1 block text-right text-[11px] text-[#688096]">{note.length}/2000</span></label>
        </fieldset>
        {conflict && <div role="alert" data-testid="text-review-conflict" className="rounded-lg border border-[#e3c3c2] bg-[#fbeeed] p-3 text-sm text-[#8f2f2e]">Materi atau riwayat berubah sejak pratinjau ini dibuat. Catatan Anda dipertahankan, tetapi tidak dikirim ulang otomatis. Segarkan pratinjau, periksa ulang, lalu konfirmasi kembali.
          <button type="button" data-testid="button-review-refresh-preview" disabled={busy} onClick={onRefreshPreview} className="mt-2 block font-bold underline">{refreshing ? 'Menyegarkan...' : 'Segarkan pratinjau'}</button></div>}
        {save.isError && status(save.error) !== 409 && <p role="alert" data-testid="text-review-error" className="text-sm text-[#b34442]">{errMsg(save.error)}</p>}
        {!!refreshError && <p role="alert" data-testid="text-review-refresh-error" className="text-sm text-[#b34442]">{errMsg(refreshError)} Jika bahan tidak tersedia lagi, tutup pratinjau, kosongkan pilihan dan pilih ulang bahan yang tersedia.</p>}
        <p className="text-[11px] leading-5 text-[#688096]">Tinjauan ini hanya catatan internal pemilik kasus. Bukan persetujuan LSBU/OSS, tidak dibagikan, dan tidak mengubah kasus, bukti, atau penilaian. Tidak menerbitkan SBU, mengaktifkan Gustafta, atau mengirim pengajuan eksternal.</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e0e9ef] p-4"><button type="button" disabled={busy} onClick={close} data-testid="button-review-cancel" className="btn btn-outline">Batal</button><button type="button" disabled={!valid || busy} onClick={submit} data-testid="button-review-save" className="btn btn-primary">{save.isPending ? 'Menyimpan...' : 'Simpan tinjauan'}</button></div>
    </section></div>;
}

function Row({ r, onOpen, stale }: { r: ReviewRecord; onOpen: () => void; stale: boolean }) {
  return <li data-testid={`card-review-${r.id}`} className="rounded-xl border border-[#dbe8f1] bg-white p-4">
    <div className="flex flex-wrap items-center gap-2"><span data-testid={`text-review-sequence-${r.id}`} className="mono text-[11px] text-[#688096]">#{r.sequenceNo}</span><span data-testid={`text-review-decision-${r.id}`} className="text-sm font-extrabold text-[#19324a]">{decisionLabel[r.decision]}</span>
      <span data-testid={`status-review-current-${r.id}`} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${stale ? 'bg-[#e8edf2] text-[#52677e]' : r.current ? 'bg-[#e1f4ee] text-[#19745f]' : 'bg-[#fdf1dc] text-[#8a5a10]'}`}>{stale ? 'Status terbaru belum terverifikasi' : r.current ? 'Materi terpilih tidak berubah' : 'Perlu tinjau ulang'}</span>
      <span className="ml-auto text-[11px] text-[#688096]">{stamp(r.decidedAt)}</span></div>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#2b4159]">{r.note}</p>
    <p data-testid={`text-review-version-${r.id}`} className="mt-2 break-all font-mono text-[11px] text-[#56718a]">Referensi versi snapshot: {r.snapshotHash}</p>
    <p className="mt-2 text-[11px] text-[#688096]">Cakupan: {r.snapshot.workroomItems.length} catatan, {r.snapshot.evidence.length} bukti, {r.snapshot.documents.length} dokumen. Materi yang tidak dipilih atau ditambahkan kemudian tidak tercakup.</p>
    <button type="button" data-testid={`button-review-open-${r.id}`} onClick={onOpen} className="mt-2 text-xs font-bold text-[#1769d1] underline">Lihat snapshot asli</button></li>;
}

export function CaseWorkroomReviews({ caseId, expectedUserId }: { caseId: number; expectedUserId: string }) {
  const qc = useQueryClient();
  const readOptions = useAccountReadOptions();
  const q = useGetWorkroomReviews(caseId, { ...readOptions, query: {
    queryKey: getGetWorkroomReviewsQueryKey(caseId), staleTime: 15000, retry: 2, refetchOnMount: 'always', refetchOnWindowFocus: true,
    refetchInterval: () => document.visibilityState === 'visible' ? 20000 : false,
  } });
  const preview = usePreviewWorkroomReview(useFormMutationOptions());
  const [sel, setSel] = useState<ReviewSelection>({ workroomIds: [], evidenceIds: [], documentIds: [] });
  const [draft, setDraft] = useState<ReviewPreview | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<ReviewRecord | null>(null);
  const [stale, setStale] = useState(false);
  const previewing = useRef(false);
  const [seq, setSeq] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rec, setRec] = useState<Draft>({ decision: null, note: '' });
  const onSaving = useCallback((b: boolean) => setSaving(b), []);

  // Reset local state on account/case change.
  useEffect(() => { setDraft(null); setOpen(false); setViewing(null); setStale(false); setSeq(0); setSaving(false); setRec({ decision: null, note: '' }); setSel({ workroomIds: [], evidenceIds: [], documentIds: [] }); preview.reset(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, expectedUserId]);

  // Source mutations elsewhere make the "current" badge stale; invalidate only the reviews query.
  useEffect(() => {
    const keys = new Set([getGetCaseQueryKey(caseId), getListEvidenceQueryKey(caseId), getListCaseDocumentsQueryKey(caseId), getGetWorkroomQueryKey(caseId)].map(k => JSON.stringify(k)));
    return qc.getQueryCache().subscribe(ev => {
      if (ev.type === 'updated' && ev.action.type === 'success' && keys.has(JSON.stringify(ev.query.queryKey))) {
        void qc.invalidateQueries({ queryKey: getGetWorkroomReviewsQueryKey(caseId) });
      }
    });
  }, [qc, caseId]);

  const raw = q.data as ReviewWorkspace | undefined;
  const foreign = !!raw && (raw.caseId !== caseId || raw.materials.case.id !== caseId
    || raw.materials.workroomItems.some(i => i.caseId !== caseId));
  const data = raw && !foreign ? raw : undefined;
  const writing = preview.isPending || saving;
  const total = sel.workroomIds.length + sel.evidenceIds.length + sel.documentIds.length;
  const reviews = useMemo(() => data?.reviews ?? [], [data]);

  const change = (next: ReviewSelection) => { if (writing) return; setRec({ decision: null, note: '' }); setSeq(0); setDraft(null); setOpen(false); setStale(false); setSel(next); };
  const runPreview = (after?: () => void) => {
    if (previewing.current || total === 0) return;
    previewing.current = true;
    preview.mutate({ id: caseId, data: sel }, {
      onSuccess: p => { if (p.snapshot.case.id === caseId) { setDraft(p); setSeq(n => n + 1); setStale(false); setOpen(true); after?.(); } },
      onSettled: () => { previewing.current = false; },
    });
  };
  const overLimit = (n: number) => n >= MAX;
  const m = data?.materials;
  const list = (title: string, n: number, items: { key: string | number; label: string; sub: string }[], field: keyof ReviewSelection, tid: string) =>
    <fieldset className="rounded-xl border border-[#dbe8f1] p-3" disabled={writing}>
      <legend className="px-1 text-xs font-bold text-[#2b4159]">{title} ({n} dipilih, maks. {MAX})</legend>
      {items.length === 0 ? <p className="text-xs text-[#688096]">Belum ada.</p> : <ul className="max-h-56 space-y-1 overflow-y-auto">{items.map(i => {
        const cur = sel[field] as (string | number)[]; const on = cur.includes(i.key);
        return <li key={i.key}><label className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-[#f1f7fb]"><input type="checkbox" data-testid={`checkbox-review-${tid}-${i.key}`} checked={on} disabled={!on && overLimit(cur.length)} onChange={() => change({ ...sel, [field]: toggle(cur, i.key) })} className="mt-1" /><span className="min-w-0"><span className="block break-words font-semibold">{i.label}</span><span className="block text-[11px] text-[#688096]">{i.sub}</span></span></label></li>; })}</ul>}
    </fieldset>;

  return <section aria-labelledby="reviews-title" data-testid="section-workroom-reviews" data-owner={expectedUserId} className="surface mb-7 overflow-hidden">
    <div className="border-b border-[#d8e4ec] p-5 sm:p-6">
      <div className="eyebrow text-[#1769d1]">TINJAUAN MANUSIA INTERNAL</div>
      <h2 id="reviews-title" className="display mt-2 text-xl font-extrabold text-[#19324a]">Tinjauan snapshot kasus</h2>
      <p data-testid="text-review-disclaimer" className="mt-2 text-sm leading-6 text-[#47667e]">Anda, sebagai pemilik kasus, dapat mencatat persetujuan internal atas materi yang Anda pilih. Keputusan tidak dapat diubah atau dihapus selama kasus ada; menghapus kasus ikut menghapus seluruh catatan tinjauan dan snapshotnya. Ini bukan persetujuan LSBU/OSS, tidak menerbitkan SBU, mengaktifkan Gustafta, atau mengirim pengajuan eksternal. Materi yang tidak dipilih atau ditambahkan kemudian tidak ikut disetujui.</p>
    </div>
    <div className="space-y-6 p-5 sm:p-6">
      {q.isLoading ? <div data-testid="state-review-loading" aria-busy="true"><Loading rows={2} /></div>
        : q.isError || foreign || !data || !m ? <div data-testid="state-review-error"><ErrorState retry={() => { void q.refetch(); }} message={foreign ? 'Data tinjauan tidak cocok dengan kasus ini.' : undefined} /></div>
        : <>
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[#3c566d]"><span>Pilih materi untuk ditinjau. Atribut kasus selalu disertakan.</span>
            <button type="button" data-testid="button-review-reload" disabled={q.isFetching} onClick={() => { void q.refetch(); }} className="font-bold text-[#1769d1] underline disabled:opacity-50">{q.isFetching ? 'Memuat...' : 'Muat ulang'}</button></div>
          <div className="grid gap-4 lg:grid-cols-3">
            {list('Catatan ruang kerja', sel.workroomIds.length, m.workroomItems.map(i => ({ key: i.id, label: i.title, sub: `${i.kind} / ${i.status} / rev ${i.revision}` })), 'workroomIds', 'workroom')}
            {list('Catatan bukti', sel.evidenceIds.length, m.evidence.map(e => ({ key: e.id, label: `${e.code} / ${e.title}`, sub: `Diperbarui ${stamp(e.updatedAt)}` })), 'evidenceIds', 'evidence')}
            {list('Dokumen (metadata)', sel.documentIds.length, m.documents.map(d => ({ key: d.id, label: d.name, sub: `v${d.version} / ${d.category} / ${kb(d.size)}` })), 'documentIds', 'document')}
          </div>
          {preview.isError && <p role="alert" data-testid="text-review-preview-error" className="text-sm text-[#b34442]">{errMsg(preview.error)}</p>}
          <div className="flex flex-wrap items-center justify-end gap-3">{total === 0 && <span data-testid="text-review-selection-empty" className="text-xs text-[#688096]">Pilih minimal satu materi.</span>}
            <button type="button" data-testid="button-review-clear" disabled={total === 0 || writing} onClick={() => change({ workroomIds: [], evidenceIds: [], documentIds: [] })} className="btn btn-outline">Kosongkan pilihan dan draf</button>
            <button type="button" data-testid="button-review-preview" disabled={total === 0 || writing} onClick={() => draft && !stale ? setOpen(true) : runPreview()} className="btn btn-primary">{writing ? 'Menyiapkan pratinjau...' : 'Pratinjau tinjauan'}</button></div>
          <div><div className="eyebrow mb-2 text-[#1769d1]">RIWAYAT TINJAUAN</div>
            {reviews.length === 0 ? <div data-testid="state-review-empty" className="rounded-xl border border-dashed border-[#bfd0de] p-8 text-center text-sm text-[#56718a]">Belum ada tinjauan tersimpan untuk kasus ini.</div>
              : <ul className="space-y-3">{reviews.map(r => <Row key={r.id} r={r} stale={q.isError || q.isFetching && q.isRefetchError} onOpen={() => setViewing(r)} />)}</ul>}
            {data.historyTruncated && <p data-testid="text-review-truncated" className="mt-2 text-xs text-[#688096]">Hanya 50 tinjauan terbaru yang ditampilkan.</p>}</div>
        </>}
    </div>
    {open && draft && <PreviewDialog key={`preview-${expectedUserId}-${caseId}`} caseId={caseId} preview={draft} seq={seq} draft={rec} setDraft={setRec} onSaving={onSaving} stale={stale} refreshing={preview.isPending} refreshError={preview.error}
      onClose={() => setOpen(false)}
      onDone={() => { setOpen(false); setDraft(null); setSeq(0); setRec({ decision: null, note: '' }); setSel({ workroomIds: [], evidenceIds: [], documentIds: [] }); void qc.invalidateQueries({ queryKey: getGetWorkroomReviewsQueryKey(caseId) }); }}
      onRefreshPreview={() => { setStale(true); preview.mutate({ id: caseId, data: draft.selection }, { onSuccess: p => { setDraft(p); setSeq(n => n + 1); setStale(false); } }); }} />}
    {viewing && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d1b2ad9] p-4" onKeyDown={e => { if (e.key === 'Escape') setViewing(null); }}>
      <section role="dialog" aria-modal="true" aria-label="Snapshot tinjauan" data-testid="dialog-review-snapshot" className="surface my-auto w-full max-w-[720px] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#d8e4ec] p-5"><h2 className="display text-lg font-extrabold">Snapshot asli / {decisionLabel[viewing.decision]}</h2><button type="button" onClick={() => setViewing(null)} aria-label="Tutup" data-testid="button-review-snapshot-close" className="rounded-lg p-2 hover:bg-[#ecf4f9]"><X size={18} /></button></div>
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto p-5"><p className="break-all font-mono text-[11px] text-[#56718a]">Referensi versi snapshot: {viewing.snapshotHash}</p><SnapshotView snap={viewing.snapshot} testid="review-history" /></div></section></div>}
  </section>;
}
