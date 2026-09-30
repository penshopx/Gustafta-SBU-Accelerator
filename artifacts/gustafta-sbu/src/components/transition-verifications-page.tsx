import React, { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, CircleAlert, ClipboardCheck, FileText, LockKeyhole, Pencil, RefreshCw, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import {
  getListTransitionVerificationsQueryKey,
  useListTransitionVerifications,
  usePutTransitionVerification,
  type TransitionVerification,
  type TransitionVerificationInput,
  type TransitionVerificationTrack,
} from '@workspace/api-client-react';

type Track = TransitionVerificationTrack;
const tracks: { id: Track; number: string; name: string; note: string }[] = [
  { id: 'transisi', number: '01', name: 'Transisi umum', note: 'Ketentuan dasar masa transisi' },
  { id: 'transisi_operasional', number: '02', name: 'Transisi operasional', note: 'Pelaksanaan dan masa penyesuaian' },
  { id: 'transisi_konversi', number: '03', name: 'Transisi konversi', note: 'Peralihan klasifikasi dan konversi' },
];
const blank: TransitionVerificationInput = {
  publisher: '', sourceUrl: '', documentNumber: '', signatory: '', issuedOn: '', scope: '',
  documentStatus: 'belum_terkonfirmasi', sourceVerified: false, expertName: '',
  expertOrganization: '', expertReview: '', expertReviewedOn: '', expertApproved: false,
};
const statusText: Record<TransitionVerificationInput['documentStatus'], string> = {
  berlaku: 'Berlaku', dicabut: 'Dicabut', belum_terkonfirmasi: 'Belum terkonfirmasi',
};
const fieldClass = 'field !rounded-lg !border-[#b7c9d7] !bg-[#fbfdfe] text-sm focus:!border-[#1769d1]';
const labelClass = 'mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-[#3e5c73]';

function statusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const e = error as { status?: number; response?: { status?: number } };
    return e.status ?? e.response?.status;
  }
  return undefined;
}
function errorText(error: unknown) {
  const status = statusCode(error);
  if (status === 403) return 'Akses ditolak. Akun ini tidak memiliki izin penelaah sumber resmi. Hubungi pengelola akses jika Anda seharusnya dapat meninjau catatan ini.';
  if (status === 401) return 'Sesi berakhir. Masuk kembali lalu coba lagi.';
  return error instanceof Error && error.message ? error.message : 'Permintaan gagal. Periksa koneksi lalu coba lagi.';
}
function dateText(value: string | undefined) {
  if (!value) return 'Belum tercatat';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(date);
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validHttps(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}
function Cell({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return <div className="min-w-0 border-t border-[#dce7ee] py-4">
    <dt className="mono mb-2 text-[10px] uppercase tracking-[.06em] text-[#648097]">{label}</dt>
    <dd data-testid={testId} className="break-words text-sm font-semibold leading-6 text-[#203b51]">{children}</dd>
  </div>;
}
function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className={labelClass}>{label}</span>{children}{hint && <span className="mt-1.5 block text-xs leading-5 text-[#6b8192]">{hint}</span>}</label>;
}

function VerificationForm({
  track, current, onCancel, onSaved, onDenied,
}: {
  track: Track; current?: TransitionVerification; onCancel: () => void;
  onSaved: (record: TransitionVerification) => Promise<void>; onDenied: () => void;
}) {
  const [form, setForm] = useState<TransitionVerificationInput>(() => current ? {
    publisher: current.publisher, sourceUrl: current.sourceUrl, documentNumber: current.documentNumber,
    signatory: current.signatory, issuedOn: current.issuedOn, scope: current.scope,
    documentStatus: current.documentStatus, sourceVerified: current.sourceVerified,
    expertName: current.expertName, expertOrganization: current.expertOrganization,
    expertReview: current.expertReview, expertReviewedOn: current.expertReviewedOn,
    expertApproved: current.expertApproved,
  } : { ...blank });
  const [problem, setProblem] = useState('');
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const mutation = usePutTransitionVerification();
  const update = <K extends keyof TransitionVerificationInput>(key: K, value: TransitionVerificationInput[K]) => {
    setForm(previous => ({ ...previous, [key]: value })); setProblem(''); setConfirmation(null);
  };
  const check = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned: TransitionVerificationInput = {
      ...form,
      publisher: form.publisher.trim(), sourceUrl: form.sourceUrl.trim(), documentNumber: form.documentNumber.trim(),
      signatory: form.signatory.trim(), scope: form.scope.trim(), expertName: form.expertName.trim(),
      expertOrganization: form.expertOrganization.trim(), expertReview: form.expertReview.trim(),
    };
    const required: (keyof TransitionVerificationInput)[] = ['publisher', 'documentNumber', 'signatory', 'scope', 'expertName', 'expertOrganization', 'expertReview'];
    if (required.some(key => String(cleaned[key]).length < (key === 'documentNumber' ? 1 : 2))) {
      setProblem('Lengkapi seluruh identitas dokumen dan telaah ahli sebelum menyimpan.'); return;
    }
    if (!validHttps(cleaned.sourceUrl)) { setProblem('Tautan sumber harus berupa URL HTTPS yang valid tanpa kredensial.'); return; }
    if (!validDate(cleaned.issuedOn) || !validDate(cleaned.expertReviewedOn)) { setProblem('Isi kedua tanggal dengan tanggal kalender yang valid.'); return; }
    if (cleaned.sourceVerified && cleaned.documentStatus !== 'berlaku') { setProblem('Sumber hanya dapat dinyatakan terverifikasi jika status dokumen berlaku.'); return; }
    if (cleaned.publisher.length > 160 || cleaned.documentNumber.length > 160 || cleaned.signatory.length > 160 || cleaned.expertName.length > 160 || cleaned.expertOrganization.length > 160 || cleaned.scope.length > 2000 || cleaned.expertReview.length > 2000) {
      setProblem('Satu atau lebih kolom melebihi batas panjang yang diizinkan.'); return;
    }
    setForm(cleaned);
    const reasons: string[] = [];
    if (current?.sourceVerified && !cleaned.sourceVerified) reasons.push('Verifikasi sumber resmi yang sebelumnya disetujui akan dicabut.');
    if (current?.expertApproved && !cleaned.expertApproved) reasons.push('Persetujuan telaah ahli yang sebelumnya diberikan akan dicabut.');
    if (cleaned.documentStatus === 'dicabut') reasons.push('Status dokumen akan ditandai dicabut.');
    if (reasons.length) { setConfirmation(reasons); return; }
    void save(cleaned);
  };
  const save = async (payload: TransitionVerificationInput) => {
    setProblem('');
    try {
      const saved = await mutation.mutateAsync({ track, data: payload });
      setConfirmation(null);
      await onSaved(saved);
    } catch (error) {
      setConfirmation(null);
      if (statusCode(error) === 403) onDenied();
      else setProblem(errorText(error));
    }
  };
  const input = (key: 'publisher' | 'documentNumber' | 'signatory' | 'expertName' | 'expertOrganization', placeholder: string, minLength = 2) =>
    <input className={fieldClass} data-testid={`input-verification-${key}`} required minLength={minLength} maxLength={160} value={form[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder} />;

  return <div className="rounded-2xl border border-[#b9d2e3] bg-[#f9fcfe] shadow-[0_18px_45px_#173d6012]" data-testid={`form-verification-${track}`}>
    <div className="flex items-start justify-between gap-3 border-b border-[#d7e5ee] px-5 py-5 sm:px-7">
      <div><div className="eyebrow text-[#1769d1]">PENGGANTIAN REKAMAN / {track.replaceAll('_', ' ')}</div><h3 className="display mt-2 text-xl font-extrabold text-[#142b42]">{current ? 'Perbarui catatan verifikasi' : 'Catat verifikasi baru'}</h3><p className="mt-1 text-xs leading-5 text-[#647c90]">Seluruh kolom akan menggantikan isi rekaman saat ini. Periksa ulang sebelum menyimpan.</p></div>
      <button type="button" data-testid="button-close-verification-form" aria-label="Tutup formulir" onClick={onCancel} disabled={mutation.isPending} className="rounded-lg p-2 text-[#506d83] hover:bg-[#e5f0f7]"><X size={18}/></button>
    </div>
    <form onSubmit={check} className="p-5 sm:p-7">
      <div className="mb-6 flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#dbeefa] text-[#1769d1]"><FileText size={16}/></span><div><h4 className="text-sm font-extrabold text-[#19364e]">01 / Dokumen sumber</h4><p className="text-xs text-[#71889a]">Identitas dan ruang lingkup sumber primer.</p></div></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Penerbit dokumen">{input('publisher', 'Instansi penerbit')}</FormField>
        <FormField label="Nomor dokumen">{input('documentNumber', 'Nomor sesuai dokumen', 1)}</FormField>
        <FormField label="Penandatangan">{input('signatory', 'Nama penandatangan')}</FormField>
        <FormField label="Tanggal diterbitkan"><input type="date" required className={fieldClass} data-testid="input-verification-issuedOn" value={form.issuedOn} onChange={e => update('issuedOn', e.target.value)}/></FormField>
        <div className="sm:col-span-2"><FormField label="Tautan sumber resmi" hint="Gunakan alamat HTTPS langsung ke sumber yang dapat ditelusuri."><input type="url" required pattern="https://.*" className={fieldClass} data-testid="input-verification-sourceUrl" value={form.sourceUrl} onChange={e => update('sourceUrl', e.target.value)} placeholder="https://..."/></FormField></div>
        <div className="sm:col-span-2"><FormField label="Ruang lingkup"><textarea required minLength={2} maxLength={2000} rows={3} className={fieldClass} data-testid="textarea-verification-scope" value={form.scope} onChange={e => update('scope', e.target.value)} placeholder="Jelaskan bagian aturan yang relevan untuk jalur ini."/></FormField></div>
        <FormField label="Status dokumen"><select className={fieldClass} data-testid="select-verification-documentStatus" value={form.documentStatus} onChange={e => update('documentStatus', e.target.value as TransitionVerificationInput['documentStatus'])}><option value="belum_terkonfirmasi">Belum terkonfirmasi</option><option value="berlaku">Berlaku</option><option value="dicabut">Dicabut</option></select></FormField>
        <label className="flex items-center gap-3 self-end rounded-lg border border-[#cadce8] bg-[#edf5fa] px-4 py-3 text-sm font-bold text-[#23425a]"><input type="checkbox" className="h-4 w-4 accent-[#1769d1]" data-testid="checkbox-verification-sourceVerified" checked={form.sourceVerified} onChange={e => update('sourceVerified', e.target.checked)}/><span>Sumber resmi telah diverifikasi</span></label>
      </div>
      <div className="mb-6 mt-9 flex items-center gap-3 border-t border-[#d7e5ee] pt-7"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#dbeefa] text-[#1769d1]"><ClipboardCheck size={16}/></span><div><h4 className="text-sm font-extrabold text-[#19364e]">02 / Telaah ahli</h4><p className="text-xs text-[#71889a]">Penelaah, organisasi, dan keputusan terpisah.</p></div></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Nama ahli">{input('expertName', 'Nama lengkap penelaah')}</FormField>
        <FormField label="Organisasi ahli">{input('expertOrganization', 'Organisasi atau lembaga')}</FormField>
        <FormField label="Tanggal telaah"><input type="date" required className={fieldClass} data-testid="input-verification-expertReviewedOn" value={form.expertReviewedOn} onChange={e => update('expertReviewedOn', e.target.value)}/></FormField>
        <label className="flex items-center gap-3 self-end rounded-lg border border-[#cadce8] bg-[#edf5fa] px-4 py-3 text-sm font-bold text-[#23425a]"><input type="checkbox" className="h-4 w-4 accent-[#1769d1]" data-testid="checkbox-verification-expertApproved" checked={form.expertApproved} onChange={e => update('expertApproved', e.target.checked)}/><span>Telaah ahli disetujui</span></label>
        <div className="sm:col-span-2"><FormField label="Catatan telaah"><textarea required minLength={2} maxLength={2000} rows={4} className={fieldClass} data-testid="textarea-verification-expertReview" value={form.expertReview} onChange={e => update('expertReview', e.target.value)} placeholder="Tuliskan alasan dan batas interpretasi penelaah."/></FormField></div>
      </div>
      {problem && <p role="alert" data-testid="alert-verification-save" className="mt-6 rounded-lg border border-[#e8c6bb] bg-[#fff3ef] px-4 py-3 text-sm leading-6 text-[#9b3e32]">{problem}</p>}
      <div className="mt-8 flex flex-wrap justify-end gap-2 border-t border-[#d7e5ee] pt-6"><button type="button" data-testid="button-cancel-verification" className="btn btn-outline" disabled={mutation.isPending} onClick={onCancel}>Batal</button><button type="submit" data-testid="button-save-verification" disabled={mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan rekaman...' : 'Tinjau dan simpan'} <ArrowRight size={15}/></button></div>
    </form>
    {confirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1d31d9] p-4" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="verification-confirm-title" aria-describedby="verification-confirm-detail" className="w-full max-w-md rounded-2xl border border-[#d6e5ed] bg-[#f8fbfd] p-6 shadow-2xl sm:p-8">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0e6] text-[#ab5b25]"><ShieldAlert size={21}/></span>
      <h3 id="verification-confirm-title" className="display mt-5 text-2xl font-extrabold text-[#19334b]">Konfirmasi perubahan penting</h3>
      <p id="verification-confirm-detail" className="mt-2 text-sm leading-6 text-[#526e82]">Tindakan berikut akan memengaruhi status verifikasi jalur ini:</p>
      <ul className="mt-4 space-y-2">{confirmation.map(reason => <li key={reason} className="rounded-lg bg-[#fff0e8] px-4 py-3 text-sm font-semibold leading-6 text-[#8e4730]">{reason}</li>)}</ul>
      <p className="mt-4 text-xs leading-5 text-[#658095]">Rekaman lama akan diganti secara penuh. Anda dapat mengubahnya kembali melalui formulir ini.</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" data-testid="button-cancel-verification-confirmation" disabled={mutation.isPending} className="btn btn-outline" onClick={() => setConfirmation(null)}>Kembali periksa</button><button type="button" data-testid="button-confirm-verification" disabled={mutation.isPending} className="btn !bg-[#a74934] !text-white" onClick={() => void save(form)}>{mutation.isPending ? 'Menyimpan...' : 'Ya, ganti rekaman'}</button></div>
    </div></div>}
  </div>;
}

export function TransitionVerificationsPage() {
  const queryClient = useQueryClient();
  const result = useListTransitionVerifications({ query: { queryKey: getListTransitionVerificationsQueryKey(), retry: false, refetchOnWindowFocus: true } });
  const [selected, setSelected] = useState<Track>('transisi');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const [refreshProblem, setRefreshProblem] = useState('');
  const record = result.data?.find(item => item.track === selected);
  const label = tracks.find(item => item.id === selected)!;
  const selectTrack = (track: Track) => { setSelected(track); setEditing(false); setNotice(''); setRefreshProblem(''); };
  const onSaved = async (saved: TransitionVerification) => {
    queryClient.setQueryData<TransitionVerification[]>(getListTransitionVerificationsQueryKey(), old =>
      old ? [...old.filter(item => item.track !== saved.track), saved] : [saved]);
    void queryClient.invalidateQueries({
      predicate: query => typeof query.queryKey[0] === 'string' &&
        /^\/api\/cases\/\d+\/assessment$/.test(query.queryKey[0]),
    });
    setEditing(false);
    setNotice(`Rekaman ${label.name.toLowerCase()} berhasil disimpan.`);
    const refreshed = await result.refetch();
    if (refreshed.isError) setRefreshProblem('Rekaman tersimpan, tetapi daftar terbaru belum dapat dimuat. Coba muat ulang.');
    else setRefreshProblem('');
  };
  const isDenied = denied || (result.isError && statusCode(result.error) === 403);
  return <section className="min-h-[70dvh] text-[#172d42]">
    {!isDenied && <div className="relative mb-7 overflow-hidden rounded-2xl bg-[#122b42] px-6 py-7 text-[#f2f8fb] sm:px-9 sm:py-9">
      <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border border-[#4f7897] opacity-50"/><div className="pointer-events-none absolute -right-3 -top-16 h-60 w-60 rounded-full border border-[#4f7897] opacity-50"/>
      <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><div className="eyebrow mb-4 flex items-center gap-2 text-[#91c9e9]"><span className="h-px w-7 bg-[#91c9e9]"/> SUMBER RESMI / RUANG PENELAAH</div><h1 className="display max-w-2xl text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-[42px]">Verifikasi masa transisi<span className="text-[#91c9e9]">.</span></h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#bcd0df]">Tiga jalur, satu catatan yang dapat ditelusuri. Periksa sumber dokumen dan keputusan telaah sebelum mengganti rekaman.</p></div><div className="flex shrink-0 items-center gap-3 rounded-xl border border-[#48647a] bg-[#203c54] px-4 py-3"><LockKeyhole size={18} className="text-[#91c9e9]"/><div><div className="eyebrow text-[#91c9e9]">AKSES TERBATAS</div><div className="mt-1 text-xs text-[#d7e6ee]">Izin ditentukan server, bukan peran profil.</div></div></div></div>
    </div>}
    {isDenied ? <div role="alert" data-testid="status-verification-denied" className="rounded-2xl border border-[#e4c8c1] bg-[#fff7f2] p-7 sm:p-10"><ShieldAlert size={28} className="text-[#a84c38]"/><h2 className="display mt-5 text-2xl font-extrabold">Akses penelaah ditolak</h2><p className="mt-3 max-w-xl text-sm leading-7 text-[#654c49]">Catatan sumber resmi hanya tersedia untuk penelaah yang diberi izin oleh server. Mengubah peran atau data profil tidak memberikan akses. Jika Anda penelaah resmi, hubungi pengelola akses.</p><button data-testid="button-retry-verifications-denied" disabled={result.isFetching} className="btn btn-outline mt-6" onClick={() => { void result.refetch().then(response => { if (response.isSuccess) setDenied(false); }); }}><RefreshCw size={15}/> {result.isFetching ? 'Memeriksa akses...' : 'Coba akses lagi'}</button></div>
    : result.isLoading || (result.isFetching && !result.data) ? <div data-testid="status-verifications-loading" role="status" className="grid gap-4 lg:grid-cols-[245px_1fr]"><div className="loading-block h-60"/><div className="loading-block h-96"/></div>
    : result.isError ? <div role="alert" data-testid="status-verifications-error" className="rounded-2xl border border-[#e4c8c1] bg-[#fff7f2] p-8"><CircleAlert size={24} className="text-[#a84c38]"/><h2 className="display mt-4 text-xl font-extrabold">Catatan belum dapat dimuat</h2><p className="mt-2 text-sm text-[#6b5651]">{errorText(result.error)}</p><button data-testid="button-retry-verifications" className="btn btn-outline mt-5" onClick={() => void result.refetch()}><RefreshCw size={15}/> Muat ulang</button></div>
    : <div className="grid items-start gap-5 lg:grid-cols-[245px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-2xl border border-[#d3e0e9] bg-[#f9fcfd]"><div className="border-b border-[#dbe6ed] px-5 py-4"><div className="eyebrow text-[#638196]">DAFTAR JALUR / 03</div></div><nav aria-label="Jalur transisi" className="p-2">{tracks.map(track => {
        const item = result.data?.find(value => value.track === track.id);
        return <button type="button" key={track.id} data-testid={`button-track-${track.id}`} aria-current={selected === track.id ? 'page' : undefined} onClick={() => selectTrack(track.id)} className={`w-full rounded-xl px-4 py-4 text-left transition-colors ${selected === track.id ? 'bg-[#dceefa] text-[#123d60]' : 'text-[#38566c] hover:bg-[#edf5f9]'}`}><span className="flex items-center justify-between gap-2"><span className="mono text-[10px] font-bold text-[#3479aa]">{track.number} / JALUR</span>{selected === track.id && <ArrowRight size={14}/>}</span><span className="mt-2 block text-sm font-extrabold">{track.name}</span><span className="mt-1 block text-[11px] leading-5 text-[#658095]">{track.note}</span><span data-testid={`status-track-${track.id}`} className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${item?.sourceVerified && item?.expertApproved && item.documentStatus === 'berlaku' ? 'bg-[#d6eee7] text-[#236657]' : 'bg-[#f5ebd9] text-[#876139]'}`}>{item ? item.sourceVerified && item.expertApproved && item.documentStatus === 'berlaku' ? 'Sumber & ahli disetujui' : 'Perlu peninjauan' : 'Belum diverifikasi'}</span></button>;
      })}</nav><div className="border-t border-[#dbe6ed] bg-[#edf5f9] px-5 py-4 text-xs leading-5 text-[#527087]">Status jalur hanya mengikuti rekaman yang tersimpan; kolom kosong tidak berarti persetujuan.</div></aside>
      <div className="min-w-0">
        {notice && <div role="status" data-testid="status-verification-success" className="mb-4 flex items-start gap-2 rounded-xl border border-[#b8dccc] bg-[#eaf6f0] px-4 py-3 text-sm font-semibold text-[#27614e]"><Check size={17} className="mt-0.5 shrink-0"/>{notice}</div>}
        {refreshProblem && <div role="alert" data-testid="status-verification-refresh-error" className="mb-4 rounded-xl border border-[#e4c8c1] bg-[#fff7f2] px-4 py-3 text-sm text-[#9b4839]">{refreshProblem}<button data-testid="button-refresh-verification-after-save" type="button" className="ml-2 font-bold underline" onClick={() => { setRefreshProblem(''); void result.refetch(); }}>Muat ulang</button></div>}
        <div className="mb-4 flex flex-col justify-between gap-4 rounded-2xl border border-[#d3e0e9] bg-[#f9fcfd] p-5 sm:flex-row sm:items-center sm:p-6"><div><div className="eyebrow text-[#1769d1]">JALUR {label.number} / {selected.replaceAll('_', ' ').toUpperCase()}</div><h2 data-testid="text-verification-track-title" className="display mt-2 text-2xl font-extrabold text-[#162f46]">{label.name}</h2><p className="mt-1 text-xs leading-5 text-[#6b8294]">{record ? 'Rekaman tersimpan. Tinjau seluruh rincian sebelum memperbarui.' : 'Belum ada rekaman untuk jalur ini. Statusnya belum diverifikasi.'}</p></div><button type="button" data-testid={`button-edit-verification-${selected}`} className="btn btn-primary shrink-0" onClick={() => { setEditing(true); setNotice(''); setRefreshProblem(''); }} disabled={editing}><Pencil size={15}/>{record ? 'Ganti rekaman' : 'Buat rekaman'}</button></div>
        {editing ? <VerificationForm key={selected} track={selected} current={record} onCancel={() => setEditing(false)} onSaved={onSaved} onDenied={() => { setDenied(true); setEditing(false); setNotice(''); }}/>
        : !record ? <div data-testid={`status-verification-empty-${selected}`} className="rounded-2xl border border-dashed border-[#b6ccdb] bg-[#edf5fa] px-6 py-12 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#dbeaf4] text-[#3d779d]"><FileText size={25}/></span><h3 className="display mt-5 text-xl font-extrabold">Belum diverifikasi</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5b768b]">Belum ada sumber resmi atau telaah ahli yang tercatat untuk jalur ini. Jangan gunakan jalur ini sebagai dasar tanggal transisi sampai rekamannya diperiksa.</p><button type="button" data-testid={`button-create-verification-${selected}`} className="btn btn-outline mt-6" onClick={() => setEditing(true)}>Catat sumber dan telaah <ArrowRight size={15}/></button></div>
        : <div data-testid={`record-verification-${selected}`} className="overflow-hidden rounded-2xl border border-[#d3e0e9] bg-[#f9fcfd]">
          <div className="flex flex-col justify-between gap-4 border-b border-[#dce7ee] bg-[#eaf4fa] px-5 py-5 sm:flex-row sm:items-center sm:px-7"><div><div className="eyebrow text-[#42718e]">REKAMAN SAAT INI</div><div data-testid={`status-verification-${selected}`} className="mt-2 flex items-center gap-2 text-sm font-extrabold text-[#1d455e]">{record.sourceVerified && record.expertApproved && record.documentStatus === 'berlaku' ? <ShieldCheck size={18} className="text-[#28745c]"/> : <ShieldAlert size={18} className="text-[#a16e35]"/>}{record.sourceVerified && record.expertApproved && record.documentStatus === 'berlaku' ? 'Sumber dan telaah disetujui' : 'Verifikasi belum lengkap atau status dokumen perlu perhatian'}</div></div><span className={`self-start rounded-full px-3 py-1.5 text-[11px] font-extrabold ${record.documentStatus === 'berlaku' ? 'bg-[#d8eee7] text-[#286b58]' : record.documentStatus === 'dicabut' ? 'bg-[#fae4db] text-[#9a4b38]' : 'bg-[#f4ebd8] text-[#806035]'}`}>{statusText[record.documentStatus]}</span></div>
          <div className="grid gap-7 px-5 py-6 sm:px-7 lg:grid-cols-2 lg:gap-10">
            <div><div className="mb-3 flex items-center gap-2"><FileText size={17} className="text-[#2273a6]"/><h3 className="display text-base font-extrabold">Dokumen sumber</h3></div><dl><Cell label="Penerbit" testId="text-verification-publisher">{record.publisher}</Cell><Cell label="Nomor dokumen" testId="text-verification-documentNumber">{record.documentNumber}</Cell><Cell label="Penandatangan" testId="text-verification-signatory">{record.signatory}</Cell><Cell label="Tanggal terbit" testId="text-verification-issuedOn">{dateText(record.issuedOn)}</Cell><Cell label="Sumber resmi" testId="text-verification-sourceUrl">{validHttps(record.sourceUrl) ? <a data-testid="link-verification-source" className="inline-flex items-start gap-1 text-[#1769d1] underline underline-offset-2 hover:text-[#104c9d]" href={record.sourceUrl} target="_blank" rel="noopener noreferrer">{record.sourceUrl}<ArrowUpRight size={14} className="mt-1 shrink-0"/></a> : record.sourceUrl}</Cell><Cell label="Ruang lingkup" testId="text-verification-scope"><span className="whitespace-pre-wrap font-medium">{record.scope}</span></Cell><Cell label="Status dokumen" testId="text-verification-documentStatus">{statusText[record.documentStatus]}</Cell><Cell label="Verifikasi sumber" testId="text-verification-sourceVerified"><span className={`inline-flex items-center gap-1.5 ${record.sourceVerified ? 'text-[#236e56]' : 'text-[#a06137]'}`}>{record.sourceVerified ? <Check size={15}/> : <ArrowDownRight size={15}/>} {record.sourceVerified ? 'Terverifikasi' : 'Belum diverifikasi'}</span></Cell></dl></div>
            <div><div className="mb-3 flex items-center gap-2"><ClipboardCheck size={17} className="text-[#2273a6]"/><h3 className="display text-base font-extrabold">Telaah ahli</h3></div><dl><Cell label="Nama ahli" testId="text-verification-expertName">{record.expertName}</Cell><Cell label="Organisasi ahli" testId="text-verification-expertOrganization">{record.expertOrganization}</Cell><Cell label="Tanggal telaah" testId="text-verification-expertReviewedOn">{dateText(record.expertReviewedOn)}</Cell><Cell label="Catatan telaah" testId="text-verification-expertReview"><span className="whitespace-pre-wrap font-medium">{record.expertReview}</span></Cell><Cell label="Persetujuan ahli" testId="text-verification-expertApproved"><span className={`inline-flex items-center gap-1.5 ${record.expertApproved ? 'text-[#236e56]' : 'text-[#a06137]'}`}>{record.expertApproved ? <Check size={15}/> : <ArrowDownRight size={15}/>} {record.expertApproved ? 'Disetujui' : 'Belum disetujui'}</span></Cell></dl><div className="mt-5 rounded-xl border border-[#cddfe9] bg-[#edf5f9] px-5 py-4"><div className="eyebrow text-[#47738f]">JEJAK PEMBARUAN</div><dl className="mt-2"><Cell label="Diverifikasi oleh" testId="text-verification-verifiedBy">{record.verifiedBy || 'Belum tercatat'}</Cell><Cell label="Terakhir diperbarui" testId="text-verification-updatedAt">{dateText(record.updatedAt)}</Cell></dl></div></div>
          </div>
        </div>}
      </div>
    </div>}
  </section>;
}

export default TransitionVerificationsPage;