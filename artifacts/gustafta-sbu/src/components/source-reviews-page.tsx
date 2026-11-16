import React, { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getListSbuChatSourceReviewsQueryKey,
  listSbuChatSourceReviews,
  recordSbuChatSourceReview,
  type SbuChatSourceReviewInput,
  type SbuChatSourceReviewInputStatus,
  type SbuChatSourceReviews,
} from '@workspace/api-client-react';
import { ArrowUpRight, BookOpenCheck, Check, Clock3, FileText, History, ShieldAlert } from 'lucide-react';
import { ErrorState, Loading } from '@/components/request-states';
import { useAccountReadOptions, useFormMutationOptions } from '@/components/account-queries';
import { safeSourceUrl } from '@/lib/knowledge-source-view';

type ReviewDecision = SbuChatSourceReviewInputStatus;
type ReviewFunctions = {
  load?: () => Promise<SbuChatSourceReviews>;
  record?: (input: SbuChatSourceReviewInput) => Promise<unknown>;
};

const statusLabels: Record<ReviewDecision, string> = {
  approved: 'Setujui versi',
  not_approved: 'Tidak disetujui',
  withdrawn: 'Cabut sumber',
};

const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Waktu tidak valid' : new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
};

function latestDecisionBySource(data: SbuChatSourceReviews) {
  const latest = new Map<string, SbuChatSourceReviews['decisions'][number]>();
  for (const decision of data.decisions) {
    const current = latest.get(decision.sourceKey);
    if (!current || decision.revision > current.revision) latest.set(decision.sourceKey, decision);
  }
  return latest;
}

function ReviewForm({
  sourceKey, versionId, expectedRevision, currentVersion, onCancel, onSubmit, pending,
}: {
  sourceKey: string;
  versionId: string;
  expectedRevision: number;
  currentVersion: boolean;
  onCancel: () => void;
  onSubmit: (input: SbuChatSourceReviewInput) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<ReviewDecision>('approved');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [attested, setAttested] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim() || !reference.trim() || !attested) return;
    onSubmit({ sourceKey, versionId, expectedRevision, status, reason: reason.trim(), reviewReference: reference.trim() });
  };
  return <form onSubmit={submit} aria-busy={pending} data-testid="form-source-review" className="mt-5 space-y-5 rounded-2xl border border-[#a9c3d8] bg-[#edf5fb] p-4 shadow-sm sm:p-6 dark:border-[#35536f] dark:bg-[#12283d]">
    <div>
      <h4 className="font-bold text-[#17364e] dark:text-[#e4f1fb]">Catat keputusan penelaah</h4>
      <p className="mono mt-1 break-all text-xs leading-5 text-[#526b81] dark:text-[#b6cbe0]">{sourceKey} · {versionId} · revisi berikutnya {expectedRevision + 1}</p>
    </div>
    <label htmlFor={`review-status-${versionId}`} className="block text-sm font-semibold text-[#23435b] dark:text-[#d7e7f5]">Keputusan
      <select id={`review-status-${versionId}`} data-testid="select-review-status" value={status} onChange={event => setStatus(event.target.value as ReviewDecision)} className="field mt-2 min-h-11 w-full">
        <option value="approved">Setujui versi — aktifkan snapshot ini</option>
        {currentVersion && <>
          <option value="not_approved">Tidak disetujui — nonaktifkan versi ini</option>
          <option value="withdrawn">Cabut sumber — nonaktifkan seluruh sumber ini</option>
        </>}
      </select>
    </label>
    <label htmlFor={`review-reason-${versionId}`} className="block text-sm font-semibold text-[#23435b] dark:text-[#d7e7f5]">Alasan keputusan
      <textarea id={`review-reason-${versionId}`} data-testid="input-review-reason" required minLength={1} maxLength={2000} rows={4} value={reason} onChange={event => setReason(event.target.value)} className="field mt-2 w-full leading-6" aria-describedby={`review-reason-help-${versionId}`} placeholder="Catat hasil telaah yang benar-benar dilakukan." />
      <span id={`review-reason-help-${versionId}`} className="mt-1 block text-xs font-normal leading-5 text-[#526b81] dark:text-[#b6cbe0]">Maksimal 2.000 karakter. Jangan masukkan kredensial atau data pribadi.</span>
    </label>
    <label htmlFor={`review-reference-${versionId}`} className="block text-sm font-semibold text-[#23435b] dark:text-[#d7e7f5]">Rujukan bukti telaah
      <textarea id={`review-reference-${versionId}`} data-testid="input-review-reference" required minLength={1} maxLength={1000} rows={3} value={reference} onChange={event => setReference(event.target.value)} className="field mt-2 w-full leading-6" aria-describedby={`review-reference-help-${versionId}`} placeholder="Isi identitas atau lokasi bukti penelaahan yang nyata; jangan gunakan contoh palsu." />
      <span id={`review-reference-help-${versionId}`} className="mt-1 block text-xs font-normal leading-5 text-[#526b81] dark:text-[#b6cbe0]">Maksimal 1.000 karakter. Aplikasi tidak memeriksa bukti yang dirujuk.</span>
    </label>
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#c5d7e5] bg-white/70 p-3 text-sm leading-6 text-[#23435b] dark:border-[#35536f] dark:bg-[#0c2033] dark:text-[#d7e7f5]">
      <input data-testid="checkbox-review-attestation" type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#1769d1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769d1]" />
      <span>Saya sudah menelaah isi, versi, locator, cakupan, dan batas sumber; keputusan dan rujukan di atas sesuai pemeriksaan nyata.</span>
    </label>
    <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${status === 'approved' ? 'border-[#c6d9e5] bg-white text-[#405d73] dark:border-[#35536f] dark:bg-[#0c2033] dark:text-[#c6d8e8]' : 'border-[#d8c29f] bg-[#fff8eb] text-[#674a22] dark:border-[#705a37] dark:bg-[#332919] dark:text-[#f1d8a8]'}`}>
      {status === 'approved'
        ? 'Persetujuan akan mengganti sumber aktif secara atomik. Status metadata terverifikasi tetap hanya berlaku pada cakupan yang tercatat.'
        : status === 'withdrawn'
          ? 'Pencabutan menonaktifkan seluruh kutipan dari sumber ini untuk retrieval.'
          : 'Versi ini akan dinonaktifkan untuk retrieval.'}
      {' '}Keputusan bersifat append-only; kesalahan tidak dapat diedit atau dihapus dari riwayat.
    </div>
    <div className="flex flex-col-reverse gap-2 border-t border-[#c5d7e5] pt-4 sm:flex-row sm:justify-end dark:border-[#35536f]">
      <button data-testid="button-submit-source-review" type="submit" disabled={pending || !attested || !reason.trim() || !reference.trim()} className="btn btn-primary min-h-11 w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? 'Mencatat…' : 'Konfirmasi keputusan'}
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className="btn btn-outline min-h-11 w-full sm:w-auto">Batal</button>
    </div>
  </form>;
}

export function SourceReviewsPage({ expectedUserId, load, record }: { expectedUserId: string; load?: ReviewFunctions['load']; record?: ReviewFunctions['record'] }) {
  const ownerOptions = useAccountReadOptions();
  const formOptions = useFormMutationOptions();
  const queryClient = useQueryClient();
  const queryKey = [...getListSbuChatSourceReviewsQueryKey(), expectedUserId];
  const result = useQuery({
    queryKey,
    queryFn: ({ signal }) => load ? load() : listSbuChatSourceReviews({ signal, ...ownerOptions.request }),
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const [selected, setSelected] = useState<{ sourceKey: string; versionId: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [submitError, setSubmitError] = useState('');
  const latestBySource = useMemo(
    () => result.data ? latestDecisionBySource(result.data) : new Map<string, SbuChatSourceReviews['decisions'][number]>(),
    [result.data],
  );
  const mutation = useMutation({
    mutationFn: (input: SbuChatSourceReviewInput) => record
      ? record(input)
      : recordSbuChatSourceReview(input, formOptions.request),
    onSuccess: async () => {
      setSelected(null);
      setSubmitError('');
      setNotice('Keputusan tersimpan. Daftar sumber dimuat ulang dari server.');
      await queryClient.invalidateQueries({ queryKey });
      await result.refetch();
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setSubmitError(status === 409
        ? 'Revisi berubah. Tidak ada keputusan baru yang dicatat; muat ulang dan telaah kembali sebelum mencoba lagi.'
        : 'Keputusan belum dapat dicatat. Periksa izin penelaah dan isi telaah, lalu muat ulang riwayat.');
    },
  });

  if (result.isLoading) return <div className="space-y-6"><header><div className="eyebrow text-[#1769d1] dark:text-[#82c4ff]">PUSAT PENGETAHUAN / PENGELOLAAN SUMBER</div><h1 className="display mt-2 text-3xl font-extrabold">Telaah sumber</h1></header><Loading /></div>;
  if (result.isError || !result.data) return <section aria-labelledby="source-reviews-title" className="space-y-6">
    <header><div className="eyebrow text-[#1769d1] dark:text-[#82c4ff]">PUSAT PENGETAHUAN / PENGELOLAAN SUMBER</div><h1 id="source-reviews-title" className="display mt-2 text-3xl font-extrabold">Telaah sumber</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Layar khusus penelaah yang berwenang. Pilihan profil tidak memberikan izin.</p></header>
    <ErrorState retry={() => { void result.refetch(); }} message="Riwayat sumber tidak dapat dibaca. Pastikan akun diizinkan oleh server; data penelaah tidak ditampilkan jika izin atau layanan tidak tersedia." />
  </section>;

  const data = result.data;
  const groups = new Map<string, typeof data.versions>();
  for (const version of data.versions) groups.set(version.sourceKey, [...(groups.get(version.sourceKey) ?? []), version]);

  return <section aria-labelledby="source-reviews-title" className="space-y-6 sm:space-y-7" data-testid="source-reviews-page">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="eyebrow text-[#1769d1] dark:text-[#82c4ff]">PUSAT PENGETAHUAN / PENGELOLAAN SUMBER</div>
        <h1 id="source-reviews-title" className="display mt-2 text-3xl font-extrabold sm:text-4xl">Telaah sumber</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Bandingkan snapshot, cakupan dan keterbatasan sebelum mencatat keputusan. Persetujuan hanya mengatur versi retrieval; bukan autentikasi berkas atau keputusan hukum.</p>
      </div>
      <button type="button" data-testid="button-refresh-source-reviews" onClick={() => { setNotice(''); void result.refetch(); }} className="btn btn-outline min-h-11 w-full shrink-0 sm:w-auto"><History size={16} aria-hidden="true"/>Muat ulang ledger</button>
    </header>

    {notice && <div role="status" aria-live="polite" data-testid="source-review-success" className="rounded-xl border border-[#a8d3bf] bg-[#e8f5ee] px-4 py-3 text-sm font-semibold text-[#205841] dark:border-[#326a55] dark:bg-[#102d25] dark:text-[#b5e5ce]">{notice}</div>}
    {submitError && <div role="alert" data-testid="source-review-error" className="rounded-xl border border-[#dfb8ae] bg-[#fff4ef] px-4 py-3 text-sm text-[#843d32] dark:border-[#75483e] dark:bg-[#321d1a] dark:text-[#f0b9ac]">{submitError}<button type="button" onClick={() => { setSubmitError(''); void result.refetch(); }} className="ml-2 min-h-11 rounded px-2 font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">Muat ulang</button></div>}
    {result.isFetching && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Memeriksa ulang versi dan keputusan dari server…</p>}

    <div className="surface flex items-start gap-3 p-4 text-sm leading-6">
      <ShieldAlert size={18} aria-hidden="true" className="mt-1 shrink-0 text-[#8a5c21] dark:text-[#edbd69]"/>
      <p>Jangan menyetujui berdasarkan keberadaan dokumen atau label “Berlaku” saja. Isi alasan dan rujukan telaah nyata. Keputusan disimpan permanen pada ledger, sedangkan identitas dan waktu ditentukan server.</p>
    </div>

    {[...groups.entries()].map(([sourceKey, versions]) => {
      const latest = latestBySource.get(sourceKey);
      const currentVersionId = latest?.versionId ?? versions.find(version => version.baseline)?.versionId;
      const activeVersionId = latest
        ? latest.status === 'approved' ? latest.versionId : undefined
        : versions.find(version => version.baseline)?.versionId;
      return <article key={sourceKey} className="surface overflow-hidden" data-testid={`source-group-${sourceKey}`}>
        <div className="border-b border-border bg-[#f3f8fc] px-4 py-4 dark:bg-[#102337] sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpenCheck size={17} aria-hidden="true" className="shrink-0 text-[#1769d1] dark:text-[#82c4ff]"/>
            <h2 className="display min-w-0 break-all text-lg font-extrabold">{sourceKey}</h2>
            <span className="rounded-full bg-[#e4eff7] px-2.5 py-1 text-[11px] font-bold text-[#294e6a] dark:bg-[#1d3b56] dark:text-[#c6e2fa]">{versions.length} versi</span>
            <span className="rounded-full bg-[#e5f1eb] px-2.5 py-1 text-[11px] font-bold text-[#285b45] dark:bg-[#173a2d] dark:text-[#b6e2c9]">Revisi {latest?.revision ?? 0}</span>
          </div>
          <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
            {activeVersionId ? `Versi retrieval aktif: ${activeVersionId}` : 'Tidak ada versi retrieval aktif.'}
            {latest && ` · Keputusan ${statusLabels[latest.status]} · ${dateTime(latest.decidedAt)}`}
          </p>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          {versions.map(version => {
            const active = version.versionId === activeVersionId;
            const isCurrent = version.versionId === currentVersionId;
            const formOpen = selected?.sourceKey === sourceKey && selected.versionId === version.versionId;
            return <div key={version.versionId} className={`rounded-2xl border p-4 sm:p-5 ${active ? 'border-[#9fc7b8] bg-[#f1f8f4] dark:border-[#39735c] dark:bg-[#102a22]' : 'border-border bg-background'}`} data-testid={`source-version-${version.versionId}`}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="mono break-all text-sm font-bold text-[#17364e] dark:text-[#e1effb]">{version.versionId}</h3>
                    {version.baseline && <span className="rounded-full bg-[#e4eff7] px-2.5 py-1 text-[10px] font-extrabold text-[#294e6a] dark:bg-[#1d3b56] dark:text-[#c6e2fa]">Baseline kode</span>}
                    {active && <span className="rounded-full bg-[#dcefe5] px-2.5 py-1 text-[10px] font-extrabold text-[#205841] dark:bg-[#1a4433] dark:text-[#b8e5ce]"><Check aria-hidden="true" className="mr-1 inline" size={12}/>Aktif di retrieval</span>}
                    {!active && <span className="rounded-full bg-[#f3ead8] px-2.5 py-1 text-[10px] font-extrabold text-[#674a22] dark:bg-[#3a3020] dark:text-[#f0d39c]">Belum aktif</span>}
                  </div>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">{version.citations.length} kartu kutipan · {version.citations.some(citation => citation.verificationStatus === 'unverified') ? 'memuat materi yang belum terverifikasi' : 'cakupan verifikasi lihat per kartu'}</p>
                </div>
                <button type="button" aria-expanded={formOpen} data-testid={`button-review-${version.versionId}`} className="btn btn-outline min-h-11 w-full shrink-0 sm:w-auto" disabled={mutation.isPending || result.isFetching} onClick={() => { setNotice(''); setSubmitError(''); setSelected(formOpen ? null : { sourceKey, versionId: version.versionId }); }}>
                  {formOpen ? 'Tutup formulir' : active ? 'Telaah versi aktif' : 'Telaah versi'}
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {version.citations.map(citation => {
                  const url = safeSourceUrl(citation.sourceUrl);
                  return <details key={citation.id} className="group rounded-xl border border-border bg-card">
                    <summary className="min-h-12 cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-bold text-[#23435b] marker:hidden hover:bg-[#f2f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769d1] dark:text-[#d7e7f5] dark:hover:bg-[#162e44] [&::-webkit-details-marker]:hidden">
                      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#e5eff8] text-[#1769d1] transition-transform group-open:rotate-90 dark:bg-[#203e59] dark:text-[#9bd0ff]" aria-hidden="true">›</span>
                      {citation.document} <span className="ml-1 text-xs font-normal text-muted-foreground">· {citation.locator}</span>
                    </summary>
                    <div className="space-y-3 border-t border-border px-4 py-4 text-sm leading-6">
                      <p className="break-words"><strong>Ringkasan:</strong> {citation.excerpt}</p>
                      <p className="break-words"><strong>Status:</strong> {citation.verificationStatus === 'verified' ? 'Terverifikasi terbatas' : 'Belum terverifikasi'} — {citation.verificationScope}</p>
                      <p className="break-words"><strong>Status dokumen:</strong> {citation.documentStatus}</p>
                      <p className="break-words"><strong>Batas:</strong> {citation.limitation}</p>
                      <p><strong>Diperiksa:</strong> {citation.checkedOn}</p>
                      {url && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Buka sumber rujukan untuk ${citation.document}, tab baru`} className="inline-flex min-h-11 items-center gap-1 rounded-md font-bold text-[#0759b2] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1769d1] dark:text-[#91caff]">Buka sumber rujukan<ArrowUpRight size={13} aria-hidden="true"/></a>}
                    </div>
                  </details>;
                })}
              </div>

              {formOpen && <div id={`review-form-${version.versionId}`}><ReviewForm
                sourceKey={sourceKey} versionId={version.versionId} expectedRevision={latest?.revision ?? 0}
                currentVersion={isCurrent} pending={mutation.isPending}
                onCancel={() => setSelected(null)}
                onSubmit={input => { setSubmitError(''); mutation.mutate(input); }}
              /></div>}
            </div>;
          })}
        </div>
      </article>;
    })}

    {data.decisions.length > 0 && <section className="surface p-4 sm:p-6" data-testid="source-review-history">
      <div className="mb-4 flex items-center gap-2"><History size={17} aria-hidden="true" className="text-[#1769d1] dark:text-[#82c4ff]"/><h2 className="display text-lg font-extrabold">Riwayat keputusan</h2></div>
      <ol className="space-y-3">
        {[...data.decisions].sort((a, b) => b.revision - a.revision || b.decidedAt.localeCompare(a.decidedAt)).map((decision, index) => <li key={`${decision.sourceKey}-${decision.revision}-${index}`} className="rounded-xl border border-border p-4 text-xs leading-5">
          <div className="flex flex-wrap items-center gap-2 font-bold"><Clock3 size={14} aria-hidden="true" className="shrink-0 text-[#1769d1] dark:text-[#82c4ff]"/><span className="break-all">{decision.sourceKey}</span> · revisi {decision.revision} · {statusLabels[decision.status]}</div>
          <p className="mono mt-1 break-all text-xs leading-5 text-muted-foreground">{decision.versionId} · {dateTime(decision.decidedAt)}</p>
          <p className="mt-2"><strong>Alasan:</strong> {decision.reason}</p>
          <p><strong>Rujukan:</strong> {decision.reviewReference}</p>
        </li>)}
      </ol>
    </section>}

    {data.versions.length === 0 && <div className="surface px-6 py-12 text-center text-sm text-muted-foreground"><FileText aria-hidden="true" className="mx-auto mb-3 text-[#1769d1] dark:text-[#82c4ff]" size={24}/>Katalog belum memiliki snapshot sumber.</div>}
  </section>;
}

export default SourceReviewsPage;
