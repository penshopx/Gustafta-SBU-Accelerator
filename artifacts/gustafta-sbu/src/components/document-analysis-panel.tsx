import { useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, ScanSearch, Trash2, X } from 'lucide-react';
import {
  analyzeCaseDocument, useListDocumentAnalyses, useDeleteDocumentAnalysis,
  getListDocumentAnalysesQueryKey, getListCaseDocumentsQueryKey, getListDocumentVaultQueryKey,
  type CaseDocument, type DocumentAnalysis, type DocumentAnalysisInput,
  useGetDocumentAnalysisSource,
  getGetDocumentAnalysisSourceQueryKey,
} from '@workspace/api-client-react';
import { useFormMutationOptions, useAccountReadOptions } from './account-queries';
import { SimpleModal, categoryLabels } from './document-metadata-dialog';
import { Loading, ErrorState } from './request-states';
import { parseAnalysisPages } from './document-analysis-selection';

const AI_LIMIT = 4194304;
const TIMEOUT = 90000;
const focusLabels: Record<DocumentAnalysisInput['focus'], string> = {
  kesiapan_sbu: 'Kesiapan SBU', legalitas: 'Legalitas', keuangan: 'Keuangan', personel: 'Personel', pengalaman: 'Pengalaman', smap: 'SMAP',
};
const focusKeys = Object.keys(focusLabels) as DocumentAnalysisInput['focus'][];

function analysisError(e: unknown): string {
  const s = (e as { status?: number } | null)?.status;
  if (s === 401) return 'Sesi Anda berakhir. Masuk kembali; pertanyaan Anda tetap tersimpan di layar ini.';
  if (s === 409) return 'Permintaan ditolak karena akun atau dokumen tidak sesuai. Muat ulang halaman lalu coba lagi.';
  if (s === 422) return 'Pilihan tidak dapat dianalisis. Pilih 1–10 halaman yang ada dengan payload hasil maksimal 4 MiB; PDF harus terbaca dan tidak terproteksi. Draf Anda tetap ada.';
  if (s === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.';
  if (s === 503) return 'Layanan analisis sedang tidak tersedia. Tidak ada hasil yang dibuat; coba lagi nanti.';
  return 'Analisis belum dapat diselesaikan. Tidak ada hasil yang dibuat; coba lagi.';
}
const fmt = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); };

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="mt-4"><h4 className="text-xs font-bold text-[#2b4159]">{title}</h4><ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-[#2f465d]">{items.map((t, i) => <li key={i} className="break-words">{String(t)}</li>)}</ul></div>;
}

export function DocumentAnalysisPanel({ doc, expectedUserId, close }: { doc: CaseDocument & { caseName?: string }; expectedUserId: string; close: () => void }) {
  const qc = useQueryClient();
  const options = useFormMutationOptions();
  const owner = options.request;
  const caseId = doc.caseId; const documentId = doc.id;
  const key = getListDocumentAnalysesQueryKey(caseId, documentId);
  const list = useListDocumentAnalyses(caseId, documentId, { ...useAccountReadOptions(), query: { queryKey: key, retry: false } });
  const source = useGetDocumentAnalysisSource(caseId, documentId, {
    ...useAccountReadOptions(), query: { queryKey: getGetDocumentAnalysisSourceQueryKey(caseId, documentId), retry: false, enabled: doc.status === 'ready' && doc.scanStatus === 'clean' },
  });
  const del = useDeleteDocumentAnalysis(options);
  const [consent, setConsent] = useState(false);
  const [consentScope, setConsentScope] = useState('');
  const [focus, setFocus] = useState<DocumentAnalysisInput['focus']>('kesiapan_sbu');
  const [question, setQuestion] = useState('');
  const [selection, setSelection] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<DocumentAnalysis | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const token = useRef(0);
  useEffect(() => () => { token.current++; ctl.current?.abort(); }, []);

  const tooBig = doc.contentType !== 'application/pdf' && doc.size > AI_LIMIT;
  const sourceInfo = source.data?.documentId === documentId && source.data.version === doc.version ? source.data : undefined;
  const pages = sourceInfo ? parseAnalysisPages(selection, sourceInfo.pageCount) : null;
  const revision = sourceInfo?.sourceRevision;
  const scope = `${revision}:${JSON.stringify(pages)}`;
  const approved = consent && consentScope === scope;
  useEffect(() => { setConsent(false); }, [revision]);
  const matches = (a: DocumentAnalysis) => a.ownerId === expectedUserId && a.caseId === caseId && a.documentId === documentId;
  const items = list.data;
  const foreign = !!items && (!Array.isArray(items) || items.some(a => !matches(a)));
  const sorted = Array.isArray(items) && !foreign ? [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  const run = async () => {
    if (!approved || !pages || !sourceInfo || pending || tooBig || doc.status !== 'ready' || doc.scanStatus !== 'clean') return;
    const mine = ++token.current;
    const c = new AbortController(); ctl.current = c;
    setPending(true); setError(null);
    const q = question.trim();
    const body: DocumentAnalysisInput = { consent: true, focus, pages, sourceRevision: sourceInfo.sourceRevision, ...(q ? { question: q } : {}) };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const guard = new Promise<never>((_, rej) => {
        timer = setTimeout(() => { c.abort(); rej(Object.assign(new Error('timeout'), { status: 0 })); }, TIMEOUT);
        c.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { status: 0 })));
      });
      const res = await Promise.race([analyzeCaseDocument(caseId, documentId, body, { ...owner, signal: c.signal }), guard]);
      if (token.current !== mine) return;
      if (!matches(res)) { setError('Respons tidak sesuai akun, kasus, atau dokumen ini sehingga tidak ditampilkan.'); return; }
      qc.setQueryData<DocumentAnalysis[]>(key, old => [res, ...(old ?? []).filter(a => a.id !== res.id)]);
      void qc.invalidateQueries({ queryKey: key });
      setQuestion('');
    } catch (e) {
      if (token.current === mine) setError(c.signal.aborted ? 'Permintaan dibatalkan atau melewati batas 90 detik. Periksa riwayat sebelum mencoba lagi; dokumen asli tidak diubah.' : analysisError(e));
    } finally {
      clearTimeout(timer);
      if (token.current === mine) { setPending(false); ctl.current = null; }
    }
  };
  const cancel = () => { ctl.current?.abort(); };

  const remove = () => {
    if (!confirm) return; setDelError(null);
    const target = confirm;
    del.mutate({ id: caseId, documentId, analysisId: target.id }, {
      onSuccess: () => {
        qc.setQueryData<DocumentAnalysis[]>(key, old => (old ?? []).filter(a => a.id !== target.id));
        void qc.invalidateQueries({ queryKey: key });
        void qc.invalidateQueries({ queryKey: getListCaseDocumentsQueryKey(caseId) });
        void qc.invalidateQueries({ queryKey: getListDocumentVaultQueryKey() });
        setConfirm(null);
      },
      onError: () => setDelError('Analisis belum terhapus. Berkas tidak terpengaruh; coba lagi.'),
    });
  };

  return <SimpleModal title="Bedah Dokumen" close={close} wide>
    <div className="min-w-0">
      <div className="rounded-lg bg-[#eef6fd] p-3 text-xs leading-5 text-[#365a76]"><b className="break-words">{doc.name}</b><br />Versi {doc.version ?? 1} · {categoryLabels[doc.category ?? 'lainnya']}{doc.caseName ? ` · ${doc.caseName}` : ''}</div>
      {tooBig && <p role="alert" className="mt-3 text-sm text-[#b34442]">Berkas melebihi batas analisis AI 4 MiB. Berkas tetap tersimpan; analisis tidak tersedia untuk versi ini.</p>}
      {source.isLoading ? <p className="mt-3 text-xs">Membaca jumlah halaman secara lokal; belum mengirim ke AI...</p>
        : source.isError || !sourceInfo ? <ErrorState retry={() => { setConsent(false); void source.refetch(); }} message="Jumlah halaman atau versi dokumen belum dapat dikonfirmasi. Tidak ada pengiriman ke AI." />
        : <p className="mt-3 text-sm text-[#365a76]">Dokumen asli: {sourceInfo.pageCount} halaman. Pilih maksimal 10 halaman; payload hasil maksimal 4 MiB.</p>}
      <fieldset disabled={pending || tooBig || !sourceInfo} className="mt-4 min-w-0 space-y-4 border-0 p-0">
        <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Halaman asli yang dikirim</span><input data-testid="input-analysis-pages" className="field" maxLength={200} value={selection} onChange={e => { setSelection(e.target.value); setConsent(false); }} placeholder="Contoh: 2-4, 9, 15" /><span className="mt-1 block text-xs text-[#617a90]">{pages ? `Urutan kirim: ${pages.join(', ')}` : 'Masukkan 1–10 nomor halaman/rentang yang ada, tanpa duplikat.'}</span></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Fokus analisis</span><select data-testid="select-analysis-focus" className="field" value={focus} onChange={e => setFocus(e.target.value as DocumentAnalysisInput['focus'])}>{focusKeys.map(k => <option key={k} value={k}>{focusLabels[k]}</option>)}</select></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Pertanyaan (opsional)</span><textarea data-testid="input-analysis-question" className="field min-h-[84px]" maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Contoh: apakah masa berlaku terbaca jelas?" /><span className="mt-1 block text-right text-[11px] text-[#688096]">{question.length}/2000</span></label>
        <label className="flex items-start gap-3 rounded-lg border border-[#bfd0de] bg-[#f7fbfe] p-3 text-xs leading-5 text-[#2b4159]"><input data-testid="checkbox-analysis-consent" type="checkbox" disabled={!pages} className="mt-0.5 h-4 w-4 shrink-0" checked={approved} onChange={e => { setConsent(e.target.checked); setConsentScope(scope); }} /><span>Saya mengizinkan hanya halaman asli {pages?.join(', ') || '(belum dipilih)'} dari versi {sourceInfo?.version ?? doc.version} dokumen ini dan pertanyaan manual saya dikirim ke OpenAI melalui Replit, model {sourceInfo?.model ?? '(belum dikonfirmasi)'}. Kredit Replit akan terpakai sesuai pemakaian model, jumlah halaman, dan token; biaya pasti tidak dihitung di sini. Halaman dapat berisi informasi pribadi dan saya berwenang membagikannya. PDF dikirim sebagai tampilan gambar halaman, tanpa lampiran/metadata PDF; detail kecil bisa kurang terbaca. Halaman lain, dokumen lain, dan profil tidak dikirim; tidak ada integrasi Gustafta.</span></label>
      </fieldset>
      <p className="mt-3 text-xs leading-5 text-[#617a90]">Hasil bersifat awal: bukan penilaian kepatuhan hukum, bukan keputusan SBU, bukan penilaian otomatis, dan tidak mengesahkan atau membatalkan bukti. Lokasi sumber adalah indikasi AI yang perlu Anda periksa sendiri.</p>
      {error && <p role="alert" data-testid="text-analysis-error" className="mt-3 text-sm text-[#b34442]">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button data-testid="button-run-analysis" onClick={() => void run()} disabled={!approved || !pages || !sourceInfo || pending || tooBig || doc.status !== 'ready' || doc.scanStatus !== 'clean'} className="btn btn-primary"><ScanSearch size={16} />{pending ? 'Menganalisis...' : 'Jalankan analisis'}</button>
        {pending && <button data-testid="button-cancel-analysis" onClick={cancel} className="btn btn-outline"><X size={14} /> Batalkan</button>}
      </div>
      <h3 className="display mt-7 text-base font-extrabold">Riwayat analisis</h3>
      <div className="mt-3 space-y-3">
        {list.isLoading ? <Loading rows={1} /> : list.isError || foreign ? <ErrorState retry={() => { void list.refetch(); }} message="Riwayat analisis belum dapat dimuat." /> : sorted.length === 0 ? <p className="rounded-lg border border-dashed border-[#bfd0de] p-4 text-sm text-[#617a90]">Belum ada analisis untuk versi dokumen ini. Tidak ada yang dikirim sampai Anda menekan Jalankan analisis.</p> : sorted.map(a => {
          const open = !collapsed[a.id]; const r = a.result;
          return <article key={a.id} data-testid="analysis-result" className="min-w-0 rounded-xl border border-[#d1dfe9] bg-white p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0 text-xs text-[#617a90]"><b className="text-[#14253a]">{focusLabels[a.focus] ?? a.focus}</b> · {fmt(a.createdAt)} · {a.model}</div><div className="flex shrink-0 gap-1"><button aria-label={open ? 'Ciutkan' : 'Buka'} onClick={() => setCollapsed(c => ({ ...c, [a.id]: open }))} className="rounded-lg p-1.5 hover:bg-[#eaf4fc]">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button><button data-testid={`button-delete-analysis-${a.id}`} aria-label="Hapus analisis" onClick={() => { setDelError(null); setConfirm(a); }} className="rounded-lg p-1.5 text-[#ad4a48] hover:bg-[#fff0ef]"><Trash2 size={16} /></button></div></div>
            {open && <div className="mt-3">
              <p className="mb-3 text-xs leading-5 text-[#617a90]">{a.sourcePages ? `Snapshot versi ${a.sourceVersion}, ${a.sourcePageCount} halaman asli. Pemetaan halaman lampiran → halaman asli: ${a.sourcePages.map((p, i) => `${i + 1} → ${p}`).join('; ')}. Cocokkan lokasi AI dengan pemetaan ini dan dokumen asli.` : 'Hasil lama: snapshot halaman asli tidak tersedia. Jangan mengasumsikan pemetaan halaman.'}</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#2f465d]">{String(r.summary)}</p>
              {r.extracted.length > 0 && <div className="mt-4"><h4 className="text-xs font-bold text-[#2b4159]">Informasi terbaca</h4><dl className="mt-1.5 space-y-2">{r.extracted.map((x, i) => <div key={i} className="rounded-lg bg-[#f3f8fc] p-2.5 text-sm"><dt className="font-bold text-[#14253a]">{String(x.label)}</dt><dd className="break-words text-[#2f465d]">{String(x.value)}</dd><dd className="mt-0.5 text-[11px] text-[#617a90]">Lokasi menurut AI (perlu dicek): {String(x.location)}</dd></div>)}</dl></div>}
              <List title="Hal yang perlu diperhatikan" items={r.concerns} />
              <List title="Informasi yang belum ada" items={r.missingInformation} />
              <List title="Langkah berikutnya" items={r.nextSteps} />
              <p className="mt-4 text-[11px] leading-5 text-[#617a90]">{String(a.disclaimer)}</p>
            </div>}
          </article>;
        })}
      </div>
    </div>
    {confirm && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0d1b2ad9] p-4"><section role="dialog" aria-modal="true" aria-label="Hapus analisis" className="surface w-full max-w-[440px] p-5"><h2 className="display text-lg font-extrabold">Hapus analisis ini?</h2><p className="mt-2 text-sm leading-6 text-[#567088]">Hanya hasil analisis yang dihapus; berkas dokumen tetap tersimpan.</p>{delError && <p role="alert" className="mt-2 text-sm text-[#b34442]">{delError}</p>}<div className="mt-5 flex justify-end gap-2"><button className="btn btn-outline" onClick={() => setConfirm(null)}>Batal</button><button data-testid="button-confirm-delete-analysis" disabled={del.isPending} className="btn btn-danger" onClick={remove}>{del.isPending ? 'Menghapus...' : 'Ya, hapus analisis'}</button></div></section></div>}
  </SimpleModal>;
}
