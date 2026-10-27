import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, History, RotateCcw } from 'lucide-react';
import {
  useGetSmapChecklist, useSaveSmapChecklistEntry, useReviewSmapChecklistEntry, useGetSmapChecklistHistory,
  getGetSmapChecklistQueryKey, getGetSmapChecklistHistoryQueryKey,
  type SmapAnswer, type SmapEntry, type SmapQuestion, type SmapDocumentReference, type SmapReviewInputStatus,
} from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from './account-queries';
import { ErrorState, Loading } from './request-states';

const answerLabel: Record<SmapAnswer, string> = { unanswered: 'Belum dijawab', ada: 'Ada', tidak: 'Tidak ada' };
const reviewLabel: Record<string, string> = { unreviewed: 'Belum ditelaah', clarification: 'Perlu klarifikasi', insufficient: 'Belum memadai', adequate: 'Memadai (telaah internal)' };
const reviewTone: Record<string, string> = { unreviewed: 'bg-[#eef2f6] text-[#3d5267]', clarification: 'bg-[#fff4dc] text-[#7a5410]', insufficient: 'bg-[#fbe9e8] text-[#8e2f2d]', adequate: 'bg-[#e3f4ee] text-[#155f4e]' };
const stamp = (s: string | null) => s ? new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
const authBlocked = (e: unknown) => { const s = statusOf(e); return s === 401 || s === 403; };
const safeErr = (e: unknown) => {
  const s = statusOf(e);
  if (s === 409) return 'Butir ini sudah diubah di sesi lain. Draf Anda tetap tersimpan di layar.';
  if (s === 400 || s === 422) return 'Isian belum dapat diterima. Periksa jawaban, catatan, dan dokumen terpilih.';
  if (s === 401 || s === 403) return 'Sesi atau akses akun berubah. Muat ulang halaman untuk melanjutkan.';
  if (s === 404) return 'Kasus atau butir tidak ditemukan.';
  return 'Permintaan belum berhasil. Coba lagi.';
};

type Draft = { questionId: string; baseRevision: number; answer: SmapAnswer; notes: string; evidence: { id: string; fingerprint: string }[] };

function isStale(ref: SmapDocumentReference, docs: SmapDocumentReference[]) {
  return !docs.some(d => d.id === ref.id && d.fingerprint === ref.fingerprint);
}

function draftFrom(q: string, entry: SmapEntry | undefined, docs: SmapDocumentReference[]): Draft {
  return { questionId: q, baseRevision: entry?.revision ?? 0, answer: entry?.answer ?? 'unanswered', notes: entry?.notes ?? '',
    evidence: (entry?.evidence ?? []).filter(r => !isStale(r, docs)).map(r => ({ id: r.id, fingerprint: r.fingerprint })) };
}
const sameDraft = (a: Draft, b: Draft) => a.answer === b.answer && a.notes === b.notes &&
  a.evidence.map(e => e.id + e.fingerprint).sort().join() === b.evidence.map(e => e.id + e.fingerprint).sort().join();

function HistoryList({ caseId, questionId }: { caseId: number; questionId: string }) {
  const history = useGetSmapChecklistHistory(caseId, questionId, { ...useAccountReadOptions(), query: { queryKey: getGetSmapChecklistHistoryQueryKey(caseId, questionId), refetchOnWindowFocus: true, refetchInterval: 20000 } });
  if (history.isLoading) return <Loading rows={2}/>;
  if (history.isError) return authBlocked(history.error) ? <p role="alert" className="text-xs text-[#b34442]">{safeErr(history.error)}</p> : <ErrorState retry={() => history.refetch()} message="Riwayat belum dapat dimuat."/>;
  const rows = history.data ?? [];
  if (rows.length === 0) return <p data-testid="text-smap-history-empty" className="text-xs text-[#688096]">Belum ada versi tersimpan untuk butir ini.</p>;
  return <ol data-testid="list-smap-history" className="space-y-2">{rows.map(h => <li key={`${h.revision}-${h.reviewStatus}-${h.reviewedAt ?? h.savedAt}`} data-testid={`row-smap-history-${h.revision}`} className="rounded-lg border border-[#dbe8f1] bg-white p-3 text-xs text-[#2b4159]">
    <div className="flex flex-wrap items-center gap-2"><span className="mono font-bold text-[#1769d1]">Revisi {h.revision}</span><span>{answerLabel[h.answer]}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${reviewTone[h.reviewStatus]}`}>{reviewLabel[h.reviewStatus]}</span>{h.needsReview && <span className="rounded bg-[#fff4dc] px-1.5 py-0.5 text-[10px] font-bold text-[#7a5410]">Perlu telaah ulang</span>}<span className="ml-auto text-[#688096]">Disimpan {stamp(h.savedAt)}</span></div>
    {h.notes && <p className="mt-1.5 whitespace-pre-wrap break-words">Catatan: {h.notes}</p>}
    <p className="mt-1 break-words text-[#56718a]">Dokumen: {h.evidence.length ? h.evidence.map(e => `${e.name} (v${e.version})`).join(', ') : 'tidak ada'}</p>
    {h.reviewStatus !== 'unreviewed' && <p className="mt-1 break-words text-[#56718a]">Telaah oleh {h.reviewedBy ?? '-'} pada {stamp(h.reviewedAt)}{h.reviewNote ? `: ${h.reviewNote}` : ''}</p>}
  </li>)}</ol>;
}

function ReviewPanel({ caseId, entry, blocked, onDone }: { caseId: number; entry: SmapEntry | undefined; blocked: boolean; onDone: () => void }) {
  const review = useReviewSmapChecklistEntry(useFormMutationOptions());
  const [status, setStatus] = useState<SmapReviewInputStatus | null>(null);
  const [note, setNote] = useState('');
  const canAdequate = !!entry && entry.answer !== 'unanswered' && entry.evidence.length > 0 && !entry.needsReview;
  const disabled = !entry || blocked || review.isPending;
  const submit = () => {
    if (!entry || !status || !note.trim() || blocked) return;
    review.mutate({ id: caseId, questionId: entry.questionId, data: { revision: entry.revision, status, note: note.trim() } }, {
      onSuccess: () => { setStatus(null); setNote(''); onDone(); },
    });
  };
  return <div data-testid="panel-smap-review" className="rounded-xl border border-[#d1dfe9] bg-[#f7fbfe] p-4">
    <div className="eyebrow text-[#1769d1]">LANGKAH 2 / TELAAH INTERNAL</div>
    <p className="mt-1 text-xs leading-5 text-[#56718a]">Telaah terpisah dari deklarasi dan berlaku untuk revisi tersimpan. Menyimpan ulang deklarasi mengembalikan status ke belum ditelaah.</p>
    {!entry ? <p data-testid="text-smap-review-unavailable" className="mt-3 text-xs font-semibold text-[#3d5267]">Simpan deklarasi terlebih dahulu sebelum ditelaah.</p>
      : blocked ? <p data-testid="text-smap-review-blocked" className="mt-3 text-xs font-semibold text-[#7a5410]">Ada perubahan belum disimpan. Simpan atau batalkan draf sebelum menelaah.</p> : null}
    <fieldset disabled={disabled} className="mt-3 space-y-3">
      <legend className="sr-only">Keputusan telaah</legend>
      <div className="flex flex-wrap gap-2">{(['clarification', 'insufficient', 'adequate'] as const).map(s => {
        const off = s === 'adequate' && !canAdequate;
        return <button key={s} type="button" data-testid={`button-smap-review-${s}`} aria-pressed={status === s} disabled={disabled || off} onClick={() => setStatus(s)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${status === s ? 'border-[#1769d1] bg-[#e9f3ff] text-[#1769d1]' : 'border-[#d3e0e9] bg-white hover:bg-[#eff6fb]'}`}>{reviewLabel[s]}</button>;
      })}</div>
      {entry && !canAdequate && <p className="text-[11px] text-[#688096]">Status memadai hanya untuk butir yang sudah dijawab, memiliki dokumen terkini, dan tidak menunggu telaah ulang.</p>}
      <label className="block"><span className="mb-1 block text-xs font-bold text-[#2b4159]">Catatan telaah</span>
        <textarea data-testid="input-smap-review-note" className="field min-h-[72px]" maxLength={3000} value={note} onChange={e => setNote(e.target.value)} placeholder="Alasan keputusan telaah"/></label>
      {review.isError && <p role="alert" data-testid="text-smap-review-error" className="text-xs text-[#b34442]">{safeErr(review.error)}</p>}
      <button type="button" data-testid="button-smap-review-save" onClick={submit} disabled={disabled || !status || !note.trim()} className="btn btn-dark">{review.isPending ? 'Menyimpan telaah...' : 'Simpan telaah'}</button>
    </fieldset>
  </div>;
}

export function CaseSmapChecklist({ caseId, expectedUserId }: { caseId: number; expectedUserId: string }) {
  const qc = useQueryClient();
  const checklist = useGetSmapChecklist(caseId, { ...useAccountReadOptions(), query: { queryKey: getGetSmapChecklistQueryKey(caseId), refetchOnWindowFocus: true, refetchInterval: 15000 } });
  const save = useSaveSmapChecklistEntry(useFormMutationOptions());
  const [group, setGroup] = useState('semua');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState('');
  // Set synchronously at dispatch so same-tick edits are blocked before isPending renders.
  const saving = useRef(false);

  const data = checklist.data;
  const docs = useMemo(() => data?.documents ?? [], [data]);
  const entries = useMemo(() => new Map((data?.entries ?? []).map(e => [e.questionId, e])), [data]);
  const groups = useMemo(() => Array.from(new Set((data?.questions ?? []).map(q => q.group))), [data]);
  const questions = (data?.questions ?? []).filter(q => group === 'semua' || q.group === group);
  const current = data?.questions.find(q => q.id === selected);
  const entry = selected ? entries.get(selected) : undefined;
  const clean = selected ? draftFrom(selected, entry, docs) : null;
  // A dirty draft is kept as-is; polling only refreshes the clean server view.
  const view = draft && draft.questionId === selected ? draft : clean;
  const dirty = !!draft && !!clean && draft.questionId === selected && !sameDraft(draft, clean);

  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  if (checklist.isLoading) return <section className="surface mb-7 p-6"><Loading rows={4}/></section>;
  if (checklist.isError || !data) {
    if (authBlocked(checklist.error)) return <section className="surface mb-7 p-6" data-testid="section-smap-blocked"><p role="alert" className="text-sm text-[#b34442]">{safeErr(checklist.error)}</p></section>;
    return <section className="surface mb-7 p-6"><ErrorState retry={() => checklist.refetch()} message="Checklist SMAP belum dapat dimuat."/></section>;
  }

  const edit = (patch: Partial<Draft>) => { if (!view || saving.current) return; setSaved(''); setDraft({ ...view, ...patch }); };
  const pick = (q: SmapQuestion) => {
    if (q.id === selected || saving.current) return;
    if (dirty && !window.confirm('Buang perubahan yang belum disimpan pada butir ini?')) return;
    setDraft(null); setConflict(false); setSaved(''); save.reset(); setSelected(q.id);
  };
  const invalidate = (questionId: string) => {
    qc.invalidateQueries({ queryKey: getGetSmapChecklistQueryKey(caseId) });
    qc.invalidateQueries({ queryKey: getGetSmapChecklistHistoryQueryKey(caseId, questionId) });
  };
  const submit = (reset = false) => {
    if (!view || saving.current || save.isPending || conflict) return;
    const payload = reset ? { revision: view.baseRevision, answer: 'unanswered' as const, notes: '', evidence: [] } : { revision: view.baseRevision, answer: view.answer, notes: view.notes, evidence: view.evidence };
    if (reset && !window.confirm('Kosongkan deklarasi butir ini? Versi lama tetap tercatat di riwayat.')) return;
    setSaved('');
    saving.current = true;
    const sentQuestion = view.questionId;
    save.mutate({ id: caseId, questionId: view.questionId, data: payload }, {
      onSuccess: (e) => {
        qc.setQueryData(getGetSmapChecklistQueryKey(caseId), (old: typeof data | undefined) => old ? { ...old, entries: [...old.entries.filter(x => x.questionId !== e.questionId), e] } : old);
        setDraft(d => d && d.questionId !== sentQuestion ? d : null); setSaved(`Deklarasi tersimpan sebagai revisi ${e.revision}.`); invalidate(e.questionId);
      },
      onSettled: () => { saving.current = false; },
      onError: (err) => { if (statusOf(err) === 409) setConflict(true); if (reset) setDraft(view); },
    });
  };
  const reload = () => {
    if (saving.current) return;
    if (dirty && !window.confirm('Muat versi terbaru dan buang draf Anda?')) return;
    setDraft(null); setConflict(false); save.reset();
    if (selected) invalidate(selected); else checklist.refetch();
  };
  const toggleDoc = (d: SmapDocumentReference) => {
    if (!view || saving.current) return;
    const has = view.evidence.some(e => e.id === d.id);
    edit({ evidence: has ? view.evidence.filter(e => e.id !== d.id) : [...view.evidence, { id: d.id, fingerprint: d.fingerprint }].slice(0, 10) });
  };
  const staleRefs = (entry?.evidence ?? []).filter(r => isStale(r, docs));

  return <section aria-labelledby="smap-title" data-testid="section-smap" data-owner={expectedUserId} className="surface mb-7 overflow-hidden">
    <div className="border-b border-[#d8e4ec] p-6">
      <div className="flex items-center gap-2 eyebrow text-[#1769d1]"><ClipboardCheck size={14}/> CHECKLIST INTERNAL / SMAP</div>
      <h2 id="smap-title" className="display mt-2 text-xl font-extrabold">Checklist kesiapan SMAP</h2>
      <p className="mt-1 text-xs text-[#617a90]">Templat {data.templateVersion} / {data.questions.length} butir pertanyaan. Deklarasi Anda dan telaah internal dicatat terpisah.</p>
      <div className="mt-4 space-y-2 text-xs leading-5">
        <p data-testid="text-smap-disclaimer" className="rounded-lg border border-[#b9d5e9] bg-[#edf6fd] p-3 text-[#173d5d]">{data.disclaimer}</p>
        <p data-testid="text-smap-edition" role="note" className="flex gap-2 rounded-lg border border-[#ecd9a8] bg-[#fff9ea] p-3 text-[#6a4a0e]"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>Edisi draf saat ini: identitas sumber rujukan belum diverifikasi. Checklist ini bukan persetujuan resmi KPK, ISO, maupun LSBU dan tidak menghasilkan kelulusan.</p>
      </div>
    </div>
    <div className="grid lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <div className="border-b border-[#d8e4ec] p-5 lg:border-b-0 lg:border-r">
        <label className="block"><span className="mb-1 block text-xs font-bold text-[#2b4159]">Kelompok</span>
          <select data-testid="select-smap-group" className="field" value={group} onChange={e => setGroup(e.target.value)}><option value="semua">Semua kelompok</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}</select></label>
        <ul className="mt-4 max-h-[560px] space-y-1.5 overflow-y-auto pr-1" aria-label="Daftar butir SMAP">{questions.map(q => {
          const e = entries.get(q.id); const idx = data.questions.indexOf(q) + 1;
          return <li key={q.id}><button type="button" data-testid={`button-smap-question-${q.id}`} aria-current={selected === q.id} disabled={save.isPending} onClick={() => pick(q)} className={`w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${selected === q.id ? 'border-[#1769d1] bg-[#eaf4ff]' : 'border-[#dbe8f1] bg-white hover:bg-[#f4f9fc]'}`}>
            <span className="flex items-start gap-2"><span className="mono shrink-0 text-[11px] font-bold text-[#1769d1]">{String(idx).padStart(2, '0')}</span><span className="text-sm font-semibold leading-5 text-[#14253a]">{q.text}</span></span>
            <span className="mt-2 flex flex-wrap gap-1.5 pl-6 text-[10px] font-bold"><span data-testid={`status-smap-answer-${q.id}`} className="rounded bg-[#eef2f6] px-1.5 py-0.5 text-[#3d5267]">{answerLabel[e?.answer ?? 'unanswered']}</span><span data-testid={`status-smap-review-${q.id}`} className={`rounded px-1.5 py-0.5 ${reviewTone[e?.reviewStatus ?? 'unreviewed']}`}>{reviewLabel[e?.reviewStatus ?? 'unreviewed']}</span>{e?.needsReview && <span data-testid={`status-smap-stale-${q.id}`} className="rounded bg-[#fff4dc] px-1.5 py-0.5 text-[#7a5410]">Perlu telaah ulang</span>}</span>
          </button></li>;
        })}</ul>
      </div>
      <div className="p-5">
        {!current || !view ? <div data-testid="text-smap-pick" className="grid min-h-[240px] place-items-center rounded-xl border border-dashed border-[#c9d9e6] p-6 text-center text-sm text-[#56718a]">Pilih satu butir di daftar untuk mengisi deklarasi, menelaah, dan melihat riwayat versinya.</div> : <div className="space-y-5">
          <div>
            <div className="eyebrow text-[#6c859a]">{current.group}</div>
            <h3 data-testid="text-smap-question" className="display mt-1 text-lg font-extrabold leading-snug">{current.text}</h3>
            <dl className="mt-3 grid gap-2 text-xs leading-5 text-[#2b4159]">
              <div><dt className="font-bold">Rujukan sumber</dt><dd data-testid="text-smap-source" className="break-words text-[#56718a]">{current.source}</dd></div>
              <div><dt className="font-bold">Bukti yang disarankan (tidak wajib)</dt><dd className="text-[#56718a]">{current.suggestedEvidence}</dd></div>
              <div><dt className="font-bold">Fokus telaah</dt><dd className="text-[#56718a]">{current.reviewFocus}</dd></div>
            </dl>
          </div>
          {entry?.needsReview && <p data-testid="text-smap-needs-review" role="status" className="rounded-lg border border-[#ecd9a8] bg-[#fff9ea] p-3 text-xs text-[#6a4a0e]">Dokumen tertaut hilang atau sudah berganti versi. Butir ini perlu ditelaah ulang; keputusan lama tetap ada di riwayat.</p>}
          <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-3 rounded-xl border border-[#d1dfe9] p-4" data-testid="form-smap-entry">
            <div className="eyebrow text-[#1769d1]">LANGKAH 1 / DEKLARASI PEMILIK</div>
            <fieldset disabled={save.isPending} data-testid="fieldset-smap-entry" className="space-y-3">
            <fieldset><legend className="mb-1 text-xs font-bold text-[#2b4159]">Jawaban</legend><div className="flex flex-wrap gap-2">{(['ada', 'tidak', 'unanswered'] as const).map(a => <label key={a} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold ${view.answer === a ? 'border-[#1769d1] bg-[#e9f3ff] text-[#1769d1]' : 'border-[#d3e0e9]'}`}><input type="radio" className="sr-only" name="smap-answer" data-testid={`radio-smap-answer-${a}`} checked={view.answer === a} onChange={() => edit({ answer: a })}/>{answerLabel[a]}</label>)}</div></fieldset>
            <label className="block"><span className="mb-1 block text-xs font-bold text-[#2b4159]">Catatan</span><textarea data-testid="input-smap-notes" className="field min-h-[80px]" maxLength={3000} value={view.notes} onChange={e => edit({ notes: e.target.value })}/></label>
            <fieldset><legend className="mb-1 text-xs font-bold text-[#2b4159]">Dokumen dari ruang simpan (versi terbaru, maks. 10)</legend>
              {docs.length === 0 ? <p className="text-xs text-[#688096]">Belum ada dokumen bersih yang dapat dipilih untuk kasus ini.</p> : <ul className="space-y-1">{docs.map(d => <li key={d.id}><label className="flex items-center gap-2 text-xs"><input type="checkbox" data-testid={`checkbox-smap-doc-${d.id}`} checked={view.evidence.some(e => e.id === d.id)} onChange={() => toggleDoc(d)}/><span className="break-words">{d.name} <span className="mono text-[#688096]">v{d.version}</span></span></label></li>)}</ul>}
              {staleRefs.length > 0 && <ul data-testid="list-smap-stale-docs" className="mt-2 space-y-1 text-xs text-[#7a5410]">{staleRefs.map(r => <li key={r.id + r.fingerprint}>{r.name} (v{r.version}) tidak lagi tersedia sebagai versi terbaru dan tidak ikut disimpan ulang.</li>)}</ul>}
            </fieldset>
            </fieldset>
            {dirty && <p data-testid="text-smap-dirty" className="text-xs font-semibold text-[#7a5410]">Perubahan belum disimpan.</p>}
            {conflict && <div role="alert" data-testid="text-smap-conflict" className="rounded-lg border border-[#e7b7b5] bg-[#fdf1f0] p-3 text-xs text-[#8e2f2d]">{safeErr({ status: 409 })}<button type="button" data-testid="button-smap-reload" onClick={reload} className="ml-2 inline-flex items-center gap-1 font-bold underline"><RotateCcw size={12}/>Muat versi terbaru</button></div>}
            {save.isError && !conflict && <p role="alert" data-testid="text-smap-save-error" className="text-xs text-[#b34442]">{safeErr(save.error)}</p>}
            {saved && <p role="status" data-testid="text-smap-saved" className="text-xs font-semibold text-[#19745f]">{saved}</p>}
            <div className="flex flex-wrap gap-2">
              <button data-testid="button-smap-save" disabled={!dirty || save.isPending || conflict} className="btn btn-primary">{save.isPending ? 'Menyimpan...' : 'Simpan deklarasi'}</button>
              {dirty && <button type="button" data-testid="button-smap-discard" disabled={save.isPending} onClick={() => { if (!saving.current) setDraft(null); }} className="btn border border-[#d3e0e9]">Batalkan perubahan</button>}
              {entry && !dirty && (entry.answer !== 'unanswered' || entry.notes || entry.evidence.length > 0) && <button type="button" data-testid="button-smap-reset" disabled={save.isPending || conflict} onClick={() => submit(true)} className="btn border border-[#d3e0e9]">Kosongkan deklarasi</button>}
            </div>
            {entry && <p className="text-[11px] text-[#688096]">Revisi tersimpan {entry.revision} / {stamp(entry.savedAt)}</p>}
          </form>
          <ReviewPanel key={`${selected}-${entry?.revision ?? 0}`} caseId={caseId} entry={entry} blocked={dirty || conflict} onDone={() => invalidate(current.id)}/>
          <div><div className="mb-2 flex items-center gap-2 eyebrow text-[#6c859a]"><History size={13}/> RIWAYAT VERSI (50 TERAKHIR)</div><HistoryList caseId={caseId} questionId={current.id}/></div>
        </div>}
      </div>
    </div>
  </section>;
}
