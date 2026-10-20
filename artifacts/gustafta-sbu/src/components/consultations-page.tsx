import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileText, Loader2, MessagesSquare, Pencil, Plus, SendHorizontal, ShieldAlert, Trash2, X } from 'lucide-react';
import {
  useListConsultations, getListConsultationsQueryKey, useCreateConsultation, useGetConsultation, getGetConsultationQueryKey,
  useRenameConsultation, useDeleteConsultation, useSendConsultationMessage, useListCases, useGetSbuChatSpecialists, getGetSbuChatSpecialistsQueryKey,
  type CreateConsultationInput, type Consultation,
} from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from '@/components/account-queries';
import { ErrorState, Loading } from '@/components/request-states';
import { ConsultationAnalysisPicker, type AnalysisChoice } from './consultation-analysis-picker';

type Mode = CreateConsultationInput['mode'];
const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: 'bujk', label: 'BUJK', desc: 'Badan usaha menyiapkan berkas sendiri.' },
  { id: 'pendamping', label: 'Pendamping / Fasilitator', desc: 'Mendampingi klien menyiapkan berkas.' },
  { id: 'asesor', label: 'Asesor Badan Usaha', desc: 'Struktur telaah dan catatan temuan.' },
  { id: 'lsbu', label: 'LSBU', desc: 'Pertimbangan operasional lembaga.' },
  { id: 'asosiasi', label: 'Asosiasi', desc: 'Pembinaan anggota dan sosialisasi.' },
  { id: 'umum', label: 'Pengguna lainnya', desc: 'Pemahaman alur SBU secara umum.' },
];
const modeLabel = (m: string) => MODES.find(x => x.id === m)?.label ?? m;
const MAX = 4000;
const fmt = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }); };
const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
const sendError = (e: unknown) => {
  const s = statusOf(e);
  if (s === 401) return 'Sesi Anda berakhir atau tidak valid. Muat ulang halaman atau masuk kembali.';
  if (s === 403) return 'Akun aktif tidak cocok dengan sesi ini. Muat ulang halaman sebelum melanjutkan.';
  if (s === 404) return 'Konsultasi atau sumber analisis tidak tersedia. Snapshot lama tetap tersimpan; pilih sumber yang tersedia melalui konsultasi baru.';
  if (s === 409) return 'Percakapan atau sumber analisis berubah. Muat ulang untuk meninjau; bila versi sumber berubah, buat konsultasi baru dan setujui cuplikan terbaru.';
  if (s === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.';
  if (s === 503) return 'Layanan AI sedang tidak tersedia. Coba lagi beberapa saat lagi.';
  return 'Pesan belum dapat dikirim. Draf Anda dipertahankan; silakan coba lagi.';
};
const caseStatusLabel: Record<string, string> = { draf: 'Draf', ditinjau: 'Ditinjau', selesai_persiapan: 'Persiapan selesai' };

function Dialog({ title, close, children, alert }: { title: string; close: () => void; children: ReactNode; alert?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [close]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d1b2ad9] p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} className="surface fade-up my-auto w-full max-w-[600px] overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#d8e4ec] px-6 py-5"><h2 className="display text-xl font-extrabold">{title}</h2><button type="button" data-testid="button-close-dialog" aria-label="Tutup" onClick={close} className="rounded-lg p-2 hover:bg-[#ecf4f9]"><X size={18} /></button></div>
      <div className="p-6">{children}</div>
    </section></div>;
}

function Disclosure() {
  return <div role="note" data-testid="text-consultation-disclaimer" className="mb-6 flex gap-3 rounded-xl border border-[#b9d5e9] bg-[#dff0fc] p-4 text-xs leading-5 text-[#173d5d]">
    <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[#1769d1]" />
    <p>Jawaban AI bersifat pendahuluan dan perlu ditinjau manusia yang kompeten. Bukan nasihat hukum, bukan keputusan LSBU atau instansi, dan tidak menjamin penerbitan SBU. Riwayat disimpan privat di akun Anda. Konteks kasus hanya berupa cuplikan yang Anda pilih saat membuat konsultasi; dokumen, bukti, dan profil perusahaan tidak dibaca otomatis.</p>
  </div>;
}

function CreateDialog({ close, canUseCases, onCreated }: { close: () => void; canUseCases: boolean; onCreated: (c: Consultation) => void }) {
  const qc = useQueryClient();
  const readOptions = useAccountReadOptions();
  const create = useCreateConsultation(useFormMutationOptions());
  const catalog = useGetSbuChatSpecialists({ query: { enabled: true, retry: 1, staleTime: 60000, queryKey: getGetSbuChatSpecialistsQueryKey() } });
  const cases = useListCases({ ...readOptions, query: { enabled: canUseCases, queryKey: ['consultation-case-picker'] as never } });
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('bujk');
  const [spec, setSpec] = useState<CreateConsultationInput['specialist']>('sbuclaw');
  const [caseId, setCaseId] = useState('');
  const [attach, setAttach] = useState(false);
  const [analysisChoice, setAnalysisChoice] = useState<AnalysisChoice>({ ready: true });
  const specs = catalog.data;
  const groups = useMemo(() => specs ? Array.from(new Set(specs.map(x => x.group))) : [], [specs]);
  const chosen = cases.data?.find(c => String(c.id) === caseId);
  const specInfo = specs?.find(s => s.id === spec);
  const valid = title.trim().length > 0 && !!specInfo && catalog.isSuccess && analysisChoice.ready && (!caseId || !!chosen);
  const submit = () => {
    if (!valid || create.isPending) return;
    const data: CreateConsultationInput = { title: title.trim(), mode, specialist: spec };
    if (chosen) {
      data.caseId = chosen.id;
      data.includeCaseContext = attach;
      if (analysisChoice.selection) data.analysisSelection = analysisChoice.selection;
      if (attach) data.expectedCaseContext = {
        companyName: chosen.companyName, requestType: chosen.requestType,
        classification: chosen.classification, qualification: chosen.qualification, status: chosen.status,
      };
    }
    create.mutate({ data }, {
      onSuccess: c => { qc.setQueryData(getGetConsultationQueryKey(c.id), c); void qc.invalidateQueries({ queryKey: getListConsultationsQueryKey() }); onCreated(c); },
      onError: e => { if ((statusOf(e) === 409 || statusOf(e) === 404) && chosen) { setAttach(false); setAnalysisChoice({ ready: true }); setCaseId(''); void cases.refetch(); } },
    });
  };
  return <Dialog title="Konsultasi baru" close={close}>
    <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-5">
      <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Judul</span><input data-testid="input-consultation-title" className="field" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Persiapan perpanjangan SBU gedung" /></label>
      <fieldset><legend className="mb-2 text-xs font-bold text-[#2b4159]">Mode peran</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">{MODES.map(m => <button type="button" key={m.id} role="radio" aria-checked={mode === m.id} data-testid={`button-consult-mode-${m.id}`} onClick={() => setMode(m.id)} className={`rounded-lg border p-3 text-left transition-colors ${mode === m.id ? 'border-[#1769d1] bg-[#eaf4ff] ring-1 ring-[#1769d1]' : 'border-[#d1dfe9] bg-white hover:bg-[#f4f9fc]'}`}><span className="flex items-center justify-between text-sm font-bold">{m.label}{mode === m.id && <Check size={14} className="text-[#1769d1]" />}</span><span className="mt-0.5 block text-[11px] leading-4 text-[#566f85]">{m.desc}</span></button>)}</div>
      </fieldset>
      <div>
        <label htmlFor="select-consult-specialist" className="mb-2 block text-xs font-bold text-[#2b4159]">Spesialis topik</label>
        {catalog.isLoading && <div className="loading-block h-[44px]" aria-busy="true" />}
        {catalog.isError && <div role="alert" className="rounded-lg border border-[#e5b8b3] bg-[#fdf1ef] p-3 text-xs text-[#8e2f2e]">Katalog spesialis belum dapat dimuat.<button type="button" onClick={() => void catalog.refetch()} data-testid="button-retry-specialists" className="btn btn-outline ml-3 !min-h-[30px] !text-xs">Coba lagi</button></div>}
        {specs && <select id="select-consult-specialist" data-testid="select-consult-specialist" className="field" value={spec} onChange={e => setSpec(e.target.value as CreateConsultationInput['specialist'])}>{groups.map(g => <optgroup key={g} label={g}>{specs.filter(x => x.group === g).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}</select>}
        {specInfo && <p className="mt-2 text-[11px] leading-4 text-[#688096]">{specInfo.description}</p>}
      </div>
      <div className="rounded-xl border border-[#d8e4ec] bg-[#f4f9fc] p-4">
        <label htmlFor="select-consult-case" className="mb-2 block text-xs font-bold text-[#2b4159]">Kasus terkait (opsional)</label>
        {!canUseCases ? <p className="text-xs text-[#688096]">Peran Anda tidak memiliki ruang kasus. Konsultasi dibuat tanpa kasus.</p> : <>
          {cases.isLoading && <div className="loading-block h-[44px]" aria-busy="true" />}
          {cases.isError && <div role="alert" className="text-xs text-[#8e2f2e]">Daftar kasus belum dapat dimuat. Anda tetap dapat membuat konsultasi tanpa kasus.<button type="button" onClick={() => void cases.refetch()} className="ml-2 font-bold underline">Coba lagi</button></div>}
          {cases.data && <select id="select-consult-case" data-testid="select-consult-case" className="field" value={caseId} onChange={e => { setCaseId(e.target.value); setAttach(false); setAnalysisChoice({ ready: true }); }}><option value="">Tanpa kasus</option>{cases.data.map(c => <option key={c.id} value={c.id}>{c.companyName} / {c.classification}</option>)}</select>}
          {chosen && <div className="fade-up mt-4">
            <div className="eyebrow mb-2 text-[#678096]">CUPLIKAN OPSIONAL — HANYA DISIMPAN BILA DISETUJUI</div>
            <dl data-testid="panel-case-preview" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-[#cddcea] bg-white p-3 text-xs">
              <dt className="text-[#688096]">Nama badan usaha</dt><dd className="font-bold text-[#14253a]">{chosen.companyName}</dd>
              <dt className="text-[#688096]">Jenis permohonan</dt><dd className="font-bold text-[#14253a]">{chosen.requestType}</dd>
              <dt className="text-[#688096]">Klasifikasi</dt><dd className="font-bold text-[#14253a]">{chosen.classification}</dd>
              <dt className="text-[#688096]">Kualifikasi</dt><dd className="font-bold text-[#14253a]">{chosen.qualification}</dd>
              <dt className="text-[#688096]">Status</dt><dd className="font-bold text-[#14253a]">{caseStatusLabel[chosen.status] ?? chosen.status}</dd>
            </dl>
            <label className="mt-3 flex items-start gap-2.5 text-xs leading-5 text-[#34506a]"><input type="checkbox" data-testid="checkbox-attach-case" checked={attach} onChange={e => setAttach(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1769d1]" /><span>Lampirkan kelima isian di atas sebagai konteks konsultasi ini. Hanya cuplikan ini yang disimpan; dokumen, bukti, dan profil tidak diakses. Tanpa centang, kasus hanya ditautkan tanpa konteks.</span></label>
          </div>}
          {chosen && <ConsultationAnalysisPicker key={chosen.id} caseId={chosen.id} onChange={setAnalysisChoice} />}
        </>}
      </div>
      {create.isError && <p role="alert" data-testid="text-create-error" className="text-sm text-[#b34442]">{[404, 409].includes(statusOf(create.error) ?? 0) ? 'Konsultasi belum dibuat. Sumber mungkin berubah atau hilang; pilih ulang kasus dan analisis, lalu beri persetujuan baru.' : 'Konsultasi belum dapat dibuat. Periksa isian lalu coba lagi.'}</p>}
      <div className="flex justify-end gap-2 border-t border-[#e0e9ef] pt-5">
        <button type="button" data-testid="button-cancel-create" onClick={close} className="btn btn-outline">Batal</button>
        <button data-testid="button-create-consultation" disabled={!valid || create.isPending} className="btn btn-primary">{create.isPending ? 'Membuat...' : 'Buat konsultasi'} <ArrowRight size={15} /></button>
      </div>
    </form>
  </Dialog>;
}

function RenameDialog({ c, close, onDone }: { c: { id: string; title: string }; close: () => void; onDone: (u: Consultation) => void }) {
  const rename = useRenameConsultation(useFormMutationOptions());
  const [title, setTitle] = useState(c.title);
  const ok = title.trim().length > 0 && title.trim() !== c.title;
  return <Dialog title="Ubah judul" close={close}>
    <form onSubmit={e => { e.preventDefault(); if (ok && !rename.isPending) rename.mutate({ id: c.id, data: { title: title.trim() } }, { onSuccess: onDone }); }} className="space-y-4">
      <input data-testid="input-rename-title" aria-label="Judul baru" autoFocus className="field" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
      {rename.isError && <p role="alert" className="text-sm text-[#b34442]">Judul belum dapat diubah. Coba lagi.</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={close} data-testid="button-cancel-rename" className="btn btn-outline">Batal</button><button data-testid="button-save-rename" disabled={!ok || rename.isPending} className="btn btn-primary">{rename.isPending ? 'Menyimpan...' : 'Simpan judul'}</button></div>
    </form>
  </Dialog>;
}

function DeleteDialog({ c, close, onDone }: { c: { id: string; title: string }; close: () => void; onDone: () => void }) {
  const del = useDeleteConsultation(useFormMutationOptions());
  return <Dialog title="Hapus konsultasi?" close={close} alert>
    <p className="text-sm leading-6 text-[#526b81]">Riwayat percakapan &ldquo;{c.title}&rdquo; akan dihapus permanen dan tidak dapat dipulihkan.</p>
    {del.isError && <p role="alert" className="mt-3 text-sm text-[#b34442]">Konsultasi belum dapat dihapus. Coba lagi.</p>}
    <div className="mt-6 flex justify-end gap-2"><button type="button" autoFocus onClick={close} data-testid="button-cancel-delete" className="btn btn-outline">Batal</button><button type="button" data-testid="button-confirm-delete" disabled={del.isPending} onClick={() => del.mutate({ id: c.id }, { onSuccess: onDone })} className="btn btn-danger">{del.isPending ? 'Menghapus...' : 'Hapus permanen'}</button></div>
  </Dialog>;
}

function ConsultationList({ canUseCases }: { canUseCases: boolean }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const list = useListConsultations({ ...useAccountReadOptions(), query: { queryKey: getListConsultationsQueryKey() } });
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const sorted = useMemo(() => [...(list.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [list.data]);
  return <div className="mx-auto max-w-5xl">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="eyebrow mb-2 text-[#1769d1]">RUANG KERJA / KLINIK KONSULTASI</div><h1 className="display text-[32px] font-extrabold leading-tight sm:text-[39px]">Klinik Konsultasi SBU</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Konsultasi persiapan SBU dengan riwayat privat. Pilih mode, spesialis, dan (jika mau) cuplikan kasus, lalu lanjutkan kapan saja.</p></div>
      <button type="button" data-testid="button-new-consultation" onClick={() => setCreating(true)} className="btn btn-primary shrink-0"><Plus size={16} /> Konsultasi baru</button>
    </div>
    <Disclosure />
    {list.isLoading && <Loading rows={4} />}
    {list.isError && <ErrorState retry={() => void list.refetch()} message="Riwayat konsultasi belum dapat dimuat." />}
    {list.isSuccess && sorted.length === 0 && <div data-testid="empty-consultations" className="surface fade-up px-6 py-14 text-center">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf4ff] text-[#1769d1]"><MessagesSquare size={26} /></div>
      <h2 className="display text-2xl font-extrabold">Belum ada konsultasi.</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#58718a]">Mulai satu konsultasi untuk menyimpan tanya jawab Anda secara privat. Percakapan umum tanpa riwayat tetap ada di <Link href="/assistant" className="font-bold text-[#1769d1] underline">Asisten peran</Link>.</p>
      <button type="button" data-testid="button-empty-create" onClick={() => setCreating(true)} className="btn btn-primary mt-6"><Plus size={16} /> Buat konsultasi pertama</button>
    </div>}
    {sorted.length > 0 && <ul className="space-y-2.5">{sorted.map((c, i) => <li key={c.id} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} className="surface fade-up group flex items-stretch transition-colors hover:border-[#1769d1]">
      <Link href={`/consultations/${c.id}`} data-testid={`link-consultation-${c.id}`} className="flex min-w-0 flex-1 items-center gap-4 p-4 sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#eaf4ff] text-[#1769d1]"><MessagesSquare size={18} /></span>
        <span className="min-w-0"><span className="block truncate text-[15px] font-bold text-[#14253a]">{c.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#688096]"><span className="rounded bg-[#ecf4f9] px-1.5 py-0.5 font-bold text-[#2b4159]">{modeLabel(c.mode)}</span><span className="mono">{c.specialist}</span>{c.caseId != null && <span className="inline-flex items-center gap-1"><FileText size={12} /> Kasus #{c.caseId}</span>}<span>{fmt(c.updatedAt)}</span></span></span>
        <ArrowRight size={16} className="ml-auto shrink-0 text-[#9bb3c7] transition-transform group-hover:translate-x-1" />
      </Link>
      <div className="flex items-center gap-1 border-l border-[#e0e9ef] px-2">
        <button type="button" aria-label={`Ubah judul ${c.title}`} data-testid={`button-rename-${c.id}`} onClick={() => setRenaming({ id: c.id, title: c.title })} className="rounded-lg p-2 text-[#527089] hover:bg-[#ecf4f9]"><Pencil size={15} /></button>
        <button type="button" aria-label={`Hapus ${c.title}`} data-testid={`button-delete-${c.id}`} onClick={() => setDeleting({ id: c.id, title: c.title })} className="rounded-lg p-2 text-[#ae3b3a] hover:bg-[#fdf1ef]"><Trash2 size={15} /></button>
      </div>
    </li>)}</ul>}
    {creating && <CreateDialog close={() => setCreating(false)} canUseCases={canUseCases} onCreated={c => navigate(`/consultations/${c.id}`)} />}
    {renaming && <RenameDialog c={renaming} close={() => setRenaming(null)} onDone={() => { void qc.invalidateQueries({ queryKey: getListConsultationsQueryKey() }); setRenaming(null); }} />}
    {deleting && <DeleteDialog c={deleting} close={() => setDeleting(null)} onDone={() => { void qc.invalidateQueries({ queryKey: getListConsultationsQueryKey() }); setDeleting(null); }} />}
  </div>;
}

function ConsultationDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const readOptions = useAccountReadOptions();
  const detail = useGetConsultation(id, { query: { enabled: !!id, queryKey: getGetConsultationQueryKey(id) }, ...readOptions });
  const send = useSendConsultationMessage(useFormMutationOptions());
  const [draft, setDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const requestId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const c = detail.data;
  const count = c?.messages.length ?? 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count, send.isPending]);

  const patch = (u: Consultation) => {
    qc.setQueryData(getGetConsultationQueryKey(id), u);
    void qc.invalidateQueries({ queryKey: getListConsultationsQueryKey() });
  };
  const onDraft = (v: string) => { setDraft(v); requestId.current = null; setError(null); setConflict(false); };
  const over = draft.length > MAX;
  const canSend = !!c && consent && !!draft.trim() && !over && !send.isPending && !conflict;
  const submit = () => {
    if (!c || !canSend) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setError(null);
    send.mutate({ id, data: { content: draft.trim(), consent: true, revision: c.revision, requestId: requestId.current } }, {
      onSuccess: u => { patch(u); setDraft(''); requestId.current = null; },
      onError: e => {
        if (statusOf(e) === 409) {
          setConflict(true);
          setConsent(false);
          setError('Percakapan atau sumber Bedah Dokumen berubah. Pesan belum dikirim. Tinjau ulang setelah pemuatan; jika sumber berubah, buat konsultasi baru dan setujui cuplikan terbaru.');
          void detail.refetch().then(() => setConflict(false));
        } else {
          if (statusOf(e) === 404) setConsent(false);
          setError(sendError(e));
        }
      },
    });
  };

  if (detail.isLoading) return <div className="mx-auto max-w-5xl"><Loading rows={3} /></div>;
  if (detail.isError || !c) {
    const nf = statusOf(detail.error) === 404;
    return <div className="mx-auto max-w-xl"><div data-testid="state-consultation-missing" className="surface p-9 text-center"><AlertTriangle className="mx-auto mb-4 text-[#bb5451]" size={26} /><h2 className="text-lg font-bold">{nf ? 'Konsultasi tidak ditemukan' : 'Konsultasi belum dapat dimuat'}</h2><p className="mt-2 text-sm text-[#58708a]">{nf ? 'Konsultasi mungkin sudah dihapus atau bukan milik akun ini.' : 'Koneksi sedang terganggu. Coba muat ulang.'}</p><div className="mt-5 flex justify-center gap-2">{!nf && <button type="button" data-testid="button-retry" onClick={() => void detail.refetch()} className="btn btn-outline">Coba lagi</button>}<Link href="/consultations" className="btn btn-primary" data-testid="link-back-list">Kembali ke daftar</Link></div></div></div>;
  }
  return <div className="mx-auto max-w-5xl">
    <Link href="/consultations" data-testid="link-back-consultations" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#1769d1] hover:underline"><ArrowLeft size={14} /> Semua konsultasi</Link>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><div className="eyebrow mb-2 text-[#1769d1]">KONSULTASI / REVISI {c.revision}</div><h1 data-testid="text-consultation-title" className="display break-words text-[28px] font-extrabold leading-tight sm:text-[34px]">{c.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#688096]"><span className="rounded bg-[#dff0fc] px-1.5 py-0.5 font-bold text-[#173d5d]">{modeLabel(c.mode)}</span><span className="mono">{c.specialist}</span>{c.caseId != null && <span>Kasus #{c.caseId}</span>}<span>Diperbarui {fmt(c.updatedAt)}</span></div></div>
      <div className="flex shrink-0 gap-2"><button type="button" data-testid="button-rename-consultation" onClick={() => setRenaming(true)} className="btn btn-outline"><Pencil size={14} /> Ubah judul</button><button type="button" data-testid="button-delete-consultation" onClick={() => setDeleting(true)} className="btn btn-danger"><Trash2 size={14} /> Hapus</button></div>
    </div>
    <div role="note" data-testid="text-detail-disclaimer" className="mb-5 flex gap-3 rounded-xl border border-[#b9d5e9] bg-[#dff0fc] p-4 text-xs leading-5 text-[#173d5d]"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-[#1769d1]" /><p>{c.disclaimer}</p></div>
    {c.context.trim() && <details className="surface mb-5 p-4" data-testid="panel-context" open><summary className="eyebrow cursor-pointer text-[#678096]">KONTEKS TERSIMPAN — KASUS / BEDAH DOKUMEN (SNAPSHOT SAAT DIBUAT)</summary><p className="mt-2 text-xs">Tinjau cuplikan dan referensi berikut sebelum mengirim. Snapshot tidak mengikuti perubahan sumber dan tidak mengubah bukti atau penilaian kasus.</p><pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-[#f4f9fc] p-3 text-xs leading-5 text-[#34506a]" style={{ fontFamily: 'inherit' }}>{c.context}</pre></details>}
    <section className="surface overflow-hidden" aria-label="Percakapan">
      <div className="max-h-[56dvh] min-h-[280px] space-y-4 overflow-y-auto bg-[#f7fbfe] p-4 sm:p-6" data-testid="list-consultation-messages">
        {count === 0 && <div data-testid="empty-messages" className="fade-up py-10 text-center"><MessagesSquare className="mx-auto mb-3 text-[#9bb3c7]" size={28} /><p className="text-sm font-bold text-[#14253a]">Percakapan masih kosong.</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#688096]">Tulis pertanyaan pertama di bawah. Setiap percakapan perlu persetujuan sebelum teks dikirim ke penyedia AI.</p></div>}
        {c.messages.map(m => <div key={m.id} data-testid={`message-${m.role}-${m.id}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[80%] ${m.role === 'user' ? 'bg-[#1769d1] text-white' : 'border border-[#cddcea] bg-white text-[#14253a]'}`}><div className={`eyebrow mb-1 ${m.role === 'user' ? 'text-[#cfe6ff]' : 'text-[#1769d1]'}`}>{m.role === 'user' ? 'Anda' : 'Asisten AI / pendahuluan'}<span className="ml-2 font-normal opacity-80">{fmt(m.createdAt)}</span></div><div className="whitespace-pre-wrap break-words select-text">{m.content}</div></div></div>)}
        {send.isPending && <div data-testid="status-pending" className="flex items-center gap-2 text-sm text-[#34506a]"><Loader2 size={16} className="animate-spin" /> Asisten sedang menyusun jawaban...</div>}
        <div ref={endRef} />
      </div>
      <div role="status" aria-live="polite" className="sr-only">{send.isPending ? 'Menunggu jawaban' : send.isSuccess && !error ? 'Jawaban diterima' : ''}</div>
      {error && <div role="alert" data-testid="text-send-error" className="mx-4 mt-4 flex gap-2 rounded-lg border border-[#e5b8b3] bg-[#fdf1ef] p-3 text-sm text-[#8e2f2e] sm:mx-6"><AlertTriangle size={16} className="mt-1 shrink-0" /><span>{error}</span></div>}
      <div className="border-t border-[#d8e4ec] bg-white p-4 sm:p-6">
        <label className="mb-3 flex items-start gap-2.5 text-xs leading-5 text-[#34506a]"><input type="checkbox" data-testid="checkbox-consent" checked={consent} disabled={send.isPending} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1769d1]" /><span>Saya setuju teks yang saya ketik{c.context.trim() ? ' dan snapshot cuplikan beserta referensi kasus / Bedah Dokumen yang tersimpan persis di atas' : ''} dikirim kepada penyedia AI untuk percakapan ini. Dokumen asli, profil, dan hasil analisis lain tidak dikirim. Jangan menulis data sensitif yang tidak perlu. Persetujuan berlaku untuk percakapan ini selama halaman terbuka.</span></label>
        <textarea data-testid="input-consultation-message" aria-label="Pesan Anda" className="field min-h-[88px] resize-y" rows={3} value={draft} disabled={send.isPending} onChange={e => onDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} placeholder="Tulis pertanyaan. Enter untuk kirim, Shift+Enter untuk baris baru." />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className={`mono text-[11px] ${over ? 'font-bold text-[#b34442]' : 'text-[#688096]'}`}>{draft.length}/{MAX}</span>
          <button type="button" data-testid="button-send-message" disabled={!canSend} onClick={submit} className="btn btn-primary">{send.isPending ? 'Mengirim...' : error ? 'Kirim ulang' : 'Kirim'} <SendHorizontal size={15} /></button>
        </div>
        {!consent && <p className="mt-2 text-xs text-[#688096]">Centang persetujuan untuk mengaktifkan pengiriman.</p>}
      </div>
    </section>
    {renaming && <RenameDialog c={c} close={() => setRenaming(false)} onDone={u => { patch(u); setRenaming(false); }} />}
    {deleting && <DeleteDialog c={c} close={() => setDeleting(false)} onDone={() => { qc.removeQueries({ queryKey: getGetConsultationQueryKey(id) }); void qc.invalidateQueries({ queryKey: getListConsultationsQueryKey() }); navigate('/consultations'); }} />}
  </div>;
}

export default function ConsultationsPage({ id, initialRole }: { expectedUserId: string; initialRole?: string; id?: string }) {
  const canUseCases = initialRole === 'kontraktor' || initialRole === 'konsultan';
  return id ? <ConsultationDetail key={id} id={id} /> : <ConsultationList canUseCases={canUseCases} />;
}
