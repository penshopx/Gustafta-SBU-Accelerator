import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, Loader2, Plus, SendHorizontal, ShieldAlert, Square } from 'lucide-react';
import { sendSbuChatMessage, useGetSbuChatBudget, getGetSbuChatBudgetQueryKey, useGetSbuChatQuota, getGetSbuChatQuotaQueryKey, useGetSbuChatSpecialists, getGetSbuChatSpecialistsQueryKey, type SbuChatInput, type SbuChatSpecialist, type SbuChatCitation } from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from '@/components/account-queries';
import { ChatCitations, chatAnswerForCopy } from './chat-citations';
import { ChatQuotaNotice, chatLimitMessage, chatQuotaFromError } from './chat-quota';
import { aiBudgetErrorMessage } from '@/lib/ai-budget-error';
import { ChatBudgetNotice, chatBudgetForOwner } from './chat-budget';

type Mode = SbuChatInput['mode'];
type SpecId = SbuChatSpecialist['id'];
type Confirm = null | { kind: 'mode'; to: Mode } | { kind: 'specialist'; to: SpecId } | { kind: 'new' };
type Msg = { id: number; role: 'user' | 'assistant'; content: string; citations?: SbuChatCitation[]; retrievalNotice?: string };

const MODES: { id: Mode; label: string; desc: string; intro: string; prompts: string[] }[] = [
  { id: 'bujk', label: 'BUJK', desc: 'Badan usaha jasa konstruksi yang menyiapkan berkas SBU sendiri.', intro: 'Tanyakan cara menyusun berkas, memahami istilah, dan menyiapkan diri sebelum pra-verifikasi. Jawaban bersifat panduan, bukan penilaian kelayakan.', prompts: ['Bantu saya membuat daftar periksa persiapan dokumen SBU untuk badan usaha saya.', 'Apa saja yang biasanya perlu saya siapkan sebelum pra-verifikasi?', 'Jelaskan perbedaan permohonan baru dan perpanjangan dengan bahasa sederhana.'] },
  { id: 'pendamping', label: 'Pendamping / Fasilitator / Konsultan', desc: 'Pihak yang mendampingi klien menyiapkan berkas dan komunikasi.', intro: 'Gunakan untuk merapikan alur pendampingan, menyusun pertanyaan klarifikasi ke klien, dan membahasakan persyaratan secara jelas.', prompts: ['Susun daftar pertanyaan klarifikasi awal untuk klien yang baru mulai menyiapkan SBU.', 'Bagaimana membagi tahapan pendampingan agar klien paham perannya?', 'Bantu saya menulis catatan ketidaklengkapan dokumen yang sopan dan jelas untuk klien.'] },
  { id: 'asesor', label: 'Asesor Badan Usaha', desc: 'Panduan struktur telaah dan catatan, bukan pengganti keputusan asesmen.', intro: 'Gunakan untuk menata kerangka telaah, pertanyaan verifikasi, dan penulisan catatan temuan. Penilaian tetap tanggung jawab Anda dan lembaga berwenang.', prompts: ['Bantu saya menyusun kerangka catatan temuan telaah dokumen yang netral.', 'Pertanyaan klarifikasi apa yang layak diajukan saat bukti tampak tidak konsisten?', 'Bagaimana membedakan temuan faktual dari opini dalam laporan telaah?'] },
  { id: 'lsbu', label: 'LSBU', desc: 'Pertimbangan operasional lembaga sertifikasi badan usaha.', intro: 'Gunakan untuk berpikir tentang alur kerja, komunikasi pemohon, dan dokumentasi internal. Ini bukan layanan resmi dan tidak mewakili lembaga mana pun.', prompts: ['Bantu saya merancang alur komunikasi status permohonan yang jelas bagi pemohon.', 'Apa praktik baik pendokumentasian internal untuk proses telaah?', 'Susun draf panduan singkat bagi pemohon tentang kelengkapan berkas.'] },
  { id: 'asosiasi', label: 'Asosiasi Badan Usaha', desc: 'Dukungan pembinaan anggota dan bahan sosialisasi.', intro: 'Gunakan untuk menyiapkan materi pembinaan anggota, tanya jawab umum, dan alur rujukan. Tidak ada data anggota yang terbaca di sini.', prompts: ['Bantu saya menyusun materi sosialisasi persiapan SBU untuk anggota.', 'Buat daftar pertanyaan umum yang sering diajukan anggota baru.', 'Bagaimana mengarahkan anggota agar memeriksa sumber regulasi primer sendiri?'] },
  { id: 'umum', label: 'Pengguna lainnya', desc: 'Untuk peran lain yang ingin memahami alur SBU secara umum.', intro: 'Tanyakan hal dasar tentang SBU dan persiapan berkasnya. Jawaban bersifat umum dan perlu diperiksa pada sumber resmi.', prompts: ['Jelaskan secara garis besar apa itu SBU dan siapa yang berkepentingan.', 'Istilah apa yang perlu saya pahami sebelum membaca regulasi SBU?', 'Bagaimana cara memeriksa bahwa informasi yang saya baca masih berlaku?'] },
];

const ROLE_DEFAULT: Record<string, Mode> = { kontraktor: 'bujk', konsultan: 'pendamping', asosiasi: 'asosiasi' };
export const defaultModeForRole = (role?: string): Mode => (role && ROLE_DEFAULT[role]) || 'umum';

const MAX_USER = 4000, MAX_MSGS = 20, MAX_TOTAL = 40000, TIMEOUT_MS = 80000;

const errorFor = (e: unknown): string => {
  const budgetMessage = aiBudgetErrorMessage(e);
  if (budgetMessage) return budgetMessage;
  const status = (e as { status?: number } | null)?.status;
  if (status === 401) return 'Sesi Anda berakhir atau tidak valid. Muat ulang halaman atau masuk kembali.';
  if (status === 409) return 'Akun aktif tidak cocok dengan sesi ini. Muat ulang halaman sebelum melanjutkan.';
  if (status === 429) return chatLimitMessage(e)!;
  if (status === 503) return 'Layanan asisten sedang tidak tersedia. Coba lagi beberapa saat lagi.';
  return 'Pesan belum dapat dikirim. Draf Anda dipertahankan; silakan coba lagi.';
};

function buildPayload(history: Msg[]) {
  let w = history.slice(-MAX_MSGS).map(m => ({
    role: m.role, content: m.content.slice(0, m.role === 'assistant' ? 12000 : MAX_USER),
  }));
  const total = (l: { content: string }[]) => l.reduce((n, m) => n + m.content.length, 0);
  while (w.length > 1 && (w[0].role !== 'user' || total(w) > MAX_TOTAL)) w = w.slice(1);
  return w.map(m => ({ role: m.role, content: m.content }));
}

export default function SbuChatPage({ expectedUserId, initialRole }: { expectedUserId: string; initialRole?: string }) {
  const options = useFormMutationOptions();
  const readOptions = useAccountReadOptions();
  const queryClient = useQueryClient();
  const quotaQuery = useGetSbuChatQuota({
    ...readOptions,
    query: { queryKey: getGetSbuChatQuotaQueryKey(), retry: false, staleTime: 0, refetchInterval: 15000, refetchOnWindowFocus: 'always', refetchOnMount: 'always' },
  });
  const quota = quotaQuery.data?.userId === expectedUserId ? quotaQuery.data : undefined;
  const budgetQuery = useGetSbuChatBudget({
    ...readOptions,
    query: { queryKey: getGetSbuChatBudgetQueryKey(), retry: false, staleTime: 0, refetchInterval: 15000, refetchOnWindowFocus: 'always', refetchOnMount: 'always' },
  });
  const budget = budgetQuery.isError ? undefined : chatBudgetForOwner(budgetQuery.data, expectedUserId);
  const budgetReady = budget?.status === 'available' && !budgetQuery.isFetching;
  const [mode, setMode] = useState<Mode>(() => defaultModeForRole(initialRole));
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [specialist, setSpecialist] = useState<SpecId>('sbuclaw');
  const catalog = useGetSbuChatSpecialists({ query: { enabled: true, retry: 1, staleTime: 60000, queryKey: getGetSbuChatSpecialistsQueryKey() } });
  const specs = catalog.data;
  const spec = specs?.find(x => x.id === specialist);
  const groups = specs ? Array.from(new Set(specs.map(x => x.group))) : [];
  const modeRef = useRef(mode); modeRef.current = mode;
  const specRef = useRef(specialist); specRef.current = specialist;
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const timer = useRef<number | null>(null);
  const timedOut = useRef(false);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const info = MODES.find(m => m.id === mode)!;

  const abort = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    ctrl.current?.abort();
    ctrl.current = null;
  }, []);
  useEffect(() => abort, [abort]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, loading, error]);

  const send = async (text: string, base: Msg[] = messages) => {
    const content = text.trim();
    if (!content || loading || ctrl.current || !consent || !catalog.isSuccess || !spec || !quota || quotaQuery.isError || !budgetReady || content.length > MAX_USER) return;
    const next = [...base, { id: ++seq.current, role: 'user' as const, content }];
    const c = new AbortController();
    ctrl.current = c; timedOut.current = false;
    timer.current = window.setTimeout(() => { timedOut.current = true; c.abort(); }, TIMEOUT_MS);
    const sentMode = modeRef.current, sentSpec = specRef.current;
    setLoading(true); setError(null);
    try {
      const res = await sendSbuChatMessage({ mode: sentMode, specialist: sentSpec, consent: true, providerConsent: 'anthropic-claude-sonnet-5-5-v1', messages: buildPayload(next) }, { ...options.request, signal: c.signal });
      if (c.signal.aborted) return;
      if (res.userId !== expectedUserId || res.mode !== sentMode || res.specialist !== sentSpec || typeof res.answer !== 'string' ||
          !Array.isArray(res.citations) || typeof res.retrievalNotice !== 'string') {
        setError('Respons tidak sesuai dengan akun atau mode atau spesialis yang aktif, sehingga tidak ditampilkan. Muat ulang halaman lalu coba lagi.');
        return;
      }
      if (res.quota.userId !== expectedUserId) {
        setError('Sesi kuota berubah. Muat ulang halaman sebelum melanjutkan.'); return;
      }
      queryClient.setQueryData(getGetSbuChatQuotaQueryKey(), res.quota);
      setMessages([...next, { id: ++seq.current, role: 'assistant', content: res.answer, citations: res.citations, retrievalNotice: res.retrievalNotice }]);
      setDraft('');
    } catch (e) {
      if (c.signal.aborted && !timedOut.current) return;
      const errorQuota = chatQuotaFromError(e, expectedUserId);
      if (errorQuota) queryClient.setQueryData(getGetSbuChatQuotaQueryKey(), errorQuota);
      setError(timedOut.current ? 'Permintaan melebihi 80 detik dan dihentikan. Draf dipertahankan; percobaan yang diterima tetap memakai kuota.' :
        errorFor(e) + (errorQuota && (e as { status?: number }).status === 503 ? ' Percobaan yang telah dicadangkan tetap memakai kuota akun.' : ''));
    } finally {
      if (ctrl.current === c) { abort(); setLoading(false); }
      void queryClient.invalidateQueries({ queryKey: getGetSbuChatQuotaQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetSbuChatBudgetQueryKey() });
    }
  };

  const cancel = () => { abort(); setLoading(false); setError('Permintaan dibatalkan. Draf dipertahankan. Percobaan yang sudah diterima tetap memakai kuota.'); };
  const resetAll = (to?: { mode?: Mode; specialist?: SpecId }) => { abort(); setLoading(false); setMessages([]); setDraft(''); setError(null); setConfirm(null); if (to?.mode) setMode(to.mode); if (to?.specialist) setSpecialist(to.specialist); };
  const dirty = messages.length > 0 || draft.trim().length > 0;
  const pickMode = (to: Mode) => {
    if (loading || to === mode) return;
    if (dirty) setConfirm({ kind: 'mode', to }); else { setError(null); setMode(to); }
  };
  const pickSpec = (to: string) => {
    const t = specs?.find(x => x.id === to);
    if (loading || !t || t.id === specialist) return;
    if (dirty) setConfirm({ kind: 'specialist', to: t.id }); else { setError(null); setSpecialist(t.id); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); }
  };
  const copy = async (m: Msg) => {
    try { await navigator.clipboard.writeText(chatAnswerForCopy(m.content, m.citations, m.retrievalNotice)); setCopied(m.id); window.setTimeout(() => setCopied(null), 1500); } catch { /* clipboard unavailable */ }
  };
  const over = draft.length > MAX_USER;
  const canSend = consent && catalog.isSuccess && !!spec && !!quota && !quotaQuery.isError && budgetReady && !loading && !!draft.trim() && !over;

  return <div className="mx-auto max-w-5xl">
    <div className="mb-6">
      <div className="eyebrow mb-2 text-[#1769d1]">RUANG KERJA / ASISTEN PERAN</div>
      <h1 className="display text-[32px] font-extrabold leading-tight sm:text-[39px]">Asisten persiapan SBU</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Panduan awal sesuai konteks peran Anda. Peran di sini hanya konteks percakapan, bukan hak akses, dan asisten tidak mengubah kasus, bukti, maupun menyatakan kesiapan atau sertifikasi.</p>
    </div>

    <div role="note" data-testid="text-chat-disclaimer" className="mb-5 flex gap-3 rounded-xl border border-[#b9d5e9] bg-[#dff0fc] p-4 text-xs leading-5 text-[#173d5d]">
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[#1769d1]" />
      <p>Jawaban AI bersifat pendahuluan dan perlu ditinjau manusia yang kompeten. Bukan nasihat hukum, bukan keputusan LSBU atau instansi, dan tidak menjamin penerbitan SBU. Asisten mencari ringkasan sumber publik terkurasi, bukan dokumen lengkap atau verifikasi live. Baca bagian sumber dan batas verifikasi di bawah jawaban; periksa ketentuan primer di <Link href="/regulations" data-testid="link-chat-regulations" className="font-bold underline">Pusat regulasi</Link>.</p>
    </div>

    {quota && !quotaQuery.isError ? <ChatQuotaNotice quota={quota} /> :
      <p role="status" className="mb-5 text-sm text-[#526b81]">{quotaQuery.isPending ? 'Memeriksa kuota asisten…' : 'Kuota belum dapat diperiksa. Pengiriman dinonaktifkan sementara.'}
        {!quotaQuery.isPending && <button type="button" className="ml-2 font-bold underline" onClick={() => void quotaQuery.refetch()}>Periksa lagi</button>}
      </p>}

    <ChatBudgetNotice budget={budget} pending={budgetQuery.isPending} checking={budgetQuery.isFetching} onRefresh={() => void budgetQuery.refetch()} />

    <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Mode peran">
      {MODES.map(m => <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} disabled={loading} data-testid={`button-mode-${m.id}`} onClick={() => pickMode(m.id)} className={`rounded-xl border p-3.5 text-left transition-colors ${mode === m.id ? 'border-[#1769d1] bg-[#eaf4ff] ring-1 ring-[#1769d1]' : 'border-[#d1dfe9] bg-white hover:bg-[#f4f9fc]'}`}>
        <span className="flex items-center justify-between text-sm font-bold text-[#14253a]">{m.label}{mode === m.id && <Check size={15} className="text-[#1769d1]" />}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[#566f85]">{m.desc}</span>
      </button>)}
    </div>

    <div className="surface fade-up mb-5 p-4 sm:p-5" data-testid="panel-specialist">
      <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
        <div>
          <label htmlFor="select-chat-specialist" className="eyebrow mb-2 block text-[#1769d1]">SPESIALIS TOPIK (BUKAN PERAN)</label>
          {catalog.isLoading && <div data-testid="loading-specialists" className="loading-block h-[44px]" aria-busy="true" />}
          {catalog.isError && <div role="alert" data-testid="error-specialists" className="rounded-lg border border-[#e5b8b3] bg-[#fdf1ef] p-3 text-xs text-[#8e2f2e]">Katalog spesialis belum dapat dimuat, sehingga pengiriman dinonaktifkan.<button type="button" data-testid="button-retry-specialists" onClick={() => void catalog.refetch()} className="btn btn-outline mt-2 !min-h-[32px] !text-xs">Coba lagi</button></div>}
          {specs && <select id="select-chat-specialist" data-testid="select-chat-specialist" value={specialist} disabled={loading} onChange={e => pickSpec(e.target.value)} className="field w-full">
            {groups.map(g => <optgroup key={g} label={g}>{specs.filter(x => x.group === g).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
          </select>}
          <p className="mt-2 text-[11px] leading-4 text-[#688096]">Spesialis hanya mengarahkan topik dan konteks jawaban. Tidak mengubah hak akses, model, sub-agen, maupun basis pengetahuan.</p>
        </div>
        <div className="min-w-0 rounded-lg border border-[#d8e4ec] bg-[#f4f9fc] p-3.5 text-xs leading-5">
          {spec ? <>
            <div className="text-sm font-bold text-[#14253a]">{spec.name} <span className="mono ml-1 text-[10px] font-normal text-[#678096]">{spec.group}</span></div>
            <p data-testid="text-specialist-description" className="mt-1 text-[#34506a]">{spec.description}</p>
            <div className="eyebrow mb-1 mt-3 text-[#678096]">STATUS PENGETAHUAN</div>
            <p data-testid="text-specialist-knowledge" className="text-[#34506a]">{spec.knowledgeStatus}</p>
            <p className="mt-2 text-[11px] text-[#688096]">Aplikasi mandiri: basis pengetahuan Gustafta tidak disalin. Tidak ada pengiriman ke OSS, LKPM, atau E-SIMPAN maupun pencarian regulasi langsung.</p>
          </> : <p className="text-[#688096]">Pilih spesialis setelah katalog dimuat.</p>}
        </div>
      </div>
    </div>

    <section className="surface overflow-hidden" aria-label="Percakapan">
      <div className="flex items-center justify-between gap-3 border-b border-[#d8e4ec] bg-[#101f32] px-5 py-3 text-[#e6f2ff]">
        <div className="min-w-0"><div className="eyebrow text-[#8ec7f4]">PERAN / SPESIALIS AKTIF</div><div className="truncate text-sm font-bold" data-testid="text-active-context">Peran: {info.label}<span className="mx-2 text-[#607d98]">/</span>Spesialis: {spec?.name ?? '...'}</div></div>
        <button type="button" data-testid="button-new-chat" disabled={loading || (!messages.length && !draft)} onClick={() => dirty ? setConfirm({ kind: 'new' }) : resetAll()} className="btn !min-h-[36px] border border-[#607d98] !text-xs text-white hover:bg-[#203b56]"><Plus size={14} /> Percakapan baru</button>
      </div>

      <div className="max-h-[56dvh] min-h-[280px] space-y-4 overflow-y-auto bg-[#f7fbfe] p-4 sm:p-6" data-testid="list-chat-messages">
        {!messages.length && <div className="fade-up">
          <p className="text-sm leading-7 text-[#34506a]">{info.intro}</p>
          <div className="eyebrow mb-2 mt-5 text-[#678096]">CONTOH PERTANYAAN</div>
          <div className="grid gap-2">{(spec ? spec.prompts.slice(0, 3) : info.prompts).map((p, i) => <button key={p} type="button" data-testid={`button-suggestion-${i}`} disabled={loading} onClick={() => { setDraft(p); }} className="rounded-lg border border-[#cddcea] bg-white px-4 py-3 text-left text-sm text-[#1d3651] transition-colors hover:border-[#1769d1] hover:bg-[#eef6fc]">{p}</button>)}</div>
        </div>}
        {messages.map(m => <div key={m.id} data-testid={`message-${m.role}-${m.id}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[80%] ${m.role === 'user' ? 'bg-[#1769d1] text-white' : 'border border-[#cddcea] bg-white text-[#14253a]'}`}>
            <div className={`eyebrow mb-1 ${m.role === 'user' ? 'text-[#cfe6ff]' : 'text-[#1769d1]'}`}>{m.role === 'user' ? 'Anda' : 'Asisten AI / pendahuluan'}</div>
            <div className="whitespace-pre-wrap break-words select-text">{m.content}</div>
            {m.role === 'assistant' && <ChatCitations citations={m.citations ?? []} notice={m.retrievalNotice ?? ''} />}
            {m.role === 'assistant' && <button type="button" data-testid={`button-copy-${m.id}`} onClick={() => copy(m)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#1769d1] hover:underline">{copied === m.id ? <Check size={13} /> : <Copy size={13} />}{copied === m.id ? 'Tersalin' : 'Salin jawaban'}</button>}
          </div>
        </div>)}
        {loading && <div className="flex items-center gap-2 text-sm text-[#34506a]"><Loader2 size={16} className="animate-spin" /> Asisten sedang menyusun jawaban...</div>}
        <div ref={endRef} />
      </div>

      <div role="status" aria-live="polite" className="sr-only">{loading ? 'Menunggu jawaban asisten' : error ?? (messages.length ? 'Jawaban diterima' : '')}</div>
      {error && <div role="alert" data-testid="text-chat-error" className="mx-4 mt-4 flex gap-2 rounded-lg border border-[#e5b8b3] bg-[#fdf1ef] p-3 text-sm text-[#8e2f2e] sm:mx-6"><AlertTriangle size={16} className="mt-1 shrink-0" /><span>{error}</span></div>}

      <div className="border-t border-[#d8e4ec] bg-white p-4 sm:p-6">
        <label className="mb-3 flex items-start gap-2.5 text-xs leading-5 text-[#34506a]">
          <input type="checkbox" data-testid="checkbox-consent" checked={consent} disabled={loading} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1769d1]" />
          <span>Saya setuju teks yang saya ketik dan kirim secara manual, serta cuplikan sumber publik terkurasi yang dipilih aplikasi, dikirim ke Claude Sonnet 5.5 melalui Replit AI Integrations. Data perusahaan, kasus, dan dokumen tidak ikut terkirim otomatis; jangan menulis data sensitif yang tidak perlu.</span>
        </label>
        <textarea data-testid="input-chat-message" aria-label="Pesan Anda" className="field min-h-[88px] resize-y" rows={3} value={draft} disabled={loading} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} placeholder="Tulis pertanyaan. Enter untuk kirim, Shift+Enter untuk baris baru." />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className={`mono text-[11px] ${over ? 'font-bold text-[#b34442]' : 'text-[#688096]'}`}>{draft.length}/{MAX_USER}</span>
          <div className="flex gap-2">
            {loading && <button type="button" data-testid="button-cancel-chat" onClick={cancel} className="btn btn-outline"><Square size={13} /> Batalkan</button>}
            <button type="button" data-testid="button-send-chat" disabled={!canSend} onClick={() => void send(draft)} className="btn btn-primary">{error && !loading ? 'Kirim ulang' : 'Kirim'} <SendHorizontal size={15} /></button>
          </div>
        </div>
        {!consent && <p className="mt-2 text-xs text-[#688096]">Centang persetujuan untuk mengaktifkan pengiriman.</p>}
        <p className="mt-3 border-t border-[#e0e9ef] pt-3 text-xs leading-5 text-[#688096]">Percakapan hanya disimpan sementara di memori halaman ini. Memuat ulang atau meninggalkan halaman menghapusnya. Setiap permintaan membawa paling banyak 20 pesan terakhir.</p>
      </div>
    </section>

    {confirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1b2ad9] p-4" onMouseDown={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
      <div role="alertdialog" aria-modal="true" aria-label="Konfirmasi" className="surface w-full max-w-md p-6">
        <h2 className="display text-xl font-extrabold">{confirm.kind === 'mode' ? 'Ganti peran dan hapus percakapan?' : confirm.kind === 'specialist' ? 'Ganti spesialis dan hapus percakapan?' : 'Mulai percakapan baru?'}</h2>
        <p className="mt-3 text-sm leading-6 text-[#526b81]">Percakapan dan draf saat ini akan dihapus dan tidak dapat dipulihkan. Persetujuan berbagi data tetap berlaku karena penyedia AI dan tujuan penggunaannya sama.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" data-testid="button-confirm-cancel" autoFocus onClick={() => setConfirm(null)} className="btn btn-outline">Batal</button>
          <button type="button" data-testid="button-confirm-ok" onClick={() => resetAll(confirm.kind === 'mode' ? { mode: confirm.to } : confirm.kind === 'specialist' ? { specialist: confirm.to } : undefined)} className="btn btn-primary">{confirm.kind === 'new' ? 'Hapus dan mulai baru' : 'Hapus dan ganti'}</button>
        </div>
      </div>
    </div>}
  </div>;
}
