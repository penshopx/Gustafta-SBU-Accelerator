import React from 'react';
import { ArrowUpRight, Building2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  getGetRuangSimpanCompanyProfileQueryKey,
  useGetRuangSimpanCompanyProfile,
  type RuangSimpanCompanyProfileResponse,
} from '@workspace/api-client-react';
import { Loading } from './request-states';

type ResultProps = {
  expectedUserId: string;
  data?: RuangSimpanCompanyProfileResponse;
  error?: unknown;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  retry: () => void;
};

function errorDescription(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Profil belum dapat dibaca dengan aman. Coba muat ulang.';
  const value = error as { status?: unknown; data?: unknown };
  const code = value.data && typeof value.data === 'object' && 'code' in value.data
    ? (value.data as { code?: unknown }).code : undefined;
  if (value.status === 401) return 'Sesi telah berakhir. Masuk kembali untuk membaca profil.';
  if (value.status === 404 && code === 'connection_not_configured') return 'Belum ada koneksi tertaut. Setelah pemilik memberi izin profile:read, minta operator mengatur pemetaan koneksi aman di server.';
  if (value.status === 424 && code === 'connection_invalid') return 'Koneksi kedaluwarsa, dicabut, atau tidak aktif. Perbarui melalui operator Gustafta.';
  if (value.status === 424 && code === 'insufficient_scope') return 'Izin profile:read diperlukan untuk membaca profil ini. Akses dokumen tidak diperlukan.';
  if (value.status === 429 && code === 'rate_limited') return 'Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba lagi; tidak ada percobaan ulang otomatis.';
  if (value.status === 503 && (code === 'source_unavailable' || code === 'connection_unavailable')) return 'Sumber atau koneksi tidak tersedia. Profil tidak dapat dibaca dengan aman saat ini; ini bukan berarti profil kosong.';
  return 'Profil belum dapat dibaca dengan aman. Coba muat ulang.';
}

function DisplayField({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div className="border-t border-[#dce7ef] py-5">
    <dt className="eyebrow mb-2 text-[#6a8398]">{label}</dt>
    <dd data-testid={testId} className="break-words text-sm font-semibold leading-6 text-[#18344c]">{value || 'Belum diisi'}</dd>
  </div>;
}

/** Pure rendering boundary: never use query data unless it is fresh, successful, and owned by this account. */
export function CompanyProfileResult({ expectedUserId, data, error, isError, isFetching, isPending, retry }: ResultProps) {
  const blocked = isError || (!isFetching && !isPending && !!data && data.userId !== expectedUserId);
  const mismatch = !isError && !isFetching && !isPending && !!data && data.userId !== expectedUserId;
  const safeData = !blocked && !isFetching && !isPending && data?.userId === expectedUserId ? data.profile : undefined;
  const empty = !!safeData && safeData.revision === 0 && !safeData.name.trim() && !safeData.nib.trim() && !safeData.address.trim() && safeData.updated_at === null;
  let updated = 'Belum ada pembaruan';
  if (safeData?.updated_at) {
    const parsed = new Date(safeData.updated_at);
    updated = Number.isNaN(parsed.getTime()) ? 'Tanggal pembaruan tidak tersedia' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(parsed);
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="eyebrow mb-2 text-[#1769d1]">RUANG SIMPAN / PROFIL PERUSAHAAN</div>
        <h1 className="display text-[32px] font-extrabold leading-tight sm:text-[39px]">Profil perusahaan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[#526b81]">Baca identitas perusahaan dari Gustafta Ruang Simpan untuk membantu persiapan berkas SBU. Halaman ini tidak mengubah data sumber.</p>
      </div>
      <button type="button" data-testid="button-refresh-company-profile" onClick={retry} disabled={isFetching || isPending} className="btn btn-outline shrink-0 self-start sm:self-auto"><RefreshCw size={16} aria-hidden="true" />{isFetching || isPending ? 'Memuat profil…' : 'Muat ulang'}</button>
    </div>

    {isFetching || isPending ? <div data-testid="status-company-profile-loading" role="status"><Loading rows={3} /></div>
      : mismatch ? <section className="surface border-[#e9c9c5] p-7" role="alert" data-testid="status-company-profile-mismatch"><CircleAlert size={24} className="mb-4 text-[#bb5451]" /><h2 className="display text-xl font-extrabold">Profil tidak dapat ditampilkan</h2><p className="mt-2 text-sm leading-6 text-[#526b81]">Pemilik respons berbeda dari akun aktif. Muat ulang halaman sebelum melanjutkan.</p><button type="button" data-testid="button-reload-company-profile" onClick={() => window.location.reload()} className="btn btn-outline mt-5">Muat ulang halaman</button></section>
      : isError || !safeData ? <section className="surface border-[#e9c9c5] p-7" role="alert" data-testid="status-company-profile-error"><CircleAlert size={24} className="mb-4 text-[#bb5451]" /><h2 className="display text-xl font-extrabold">Profil belum dapat ditampilkan</h2><p className="mt-2 text-sm leading-6 text-[#526b81]">{errorDescription(error)}</p></section>
      : <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(250px,.8fr)]">
        <section className="surface overflow-hidden" aria-label="Data profil perusahaan" data-testid="section-company-profile">
          <div className="flex items-center gap-3 border-b border-[#dce7ef] bg-[#f4f9fc] px-6 py-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e1effa] text-[#1769d1]"><Building2 size={20} /></span><div><h2 className="display text-lg font-extrabold">Identitas dari sumber</h2><p className="text-xs text-[#698096]">Gustafta Ruang Simpan · hanya baca</p></div></div>
          <dl className="px-6 pb-1">
            {empty && <div role="status" data-testid="status-company-profile-empty" className="mt-6 rounded-xl border border-[#c6ddec] bg-[#eef7fc] p-4 text-sm leading-6 text-[#355771]">Profil sumber belum diisi. Data kosong ini berhasil dibaca dari Ruang Simpan, bukan gangguan koneksi.</div>}
            <DisplayField label="Nama perusahaan" value={safeData.name} testId="text-company-name" />
            <DisplayField label="Nomor Induk Berusaha (NIB)" value={safeData.nib} testId="text-company-nib" />
            <DisplayField label="Alamat" value={safeData.address} testId="text-company-address" />
            <div className="grid grid-cols-2 gap-4 border-t border-[#dce7ef] py-5">
              <div><dt className="eyebrow mb-2 text-[#6a8398]">Revisi sumber</dt><dd data-testid="text-company-revision" className="mono text-sm font-bold text-[#18344c]">{safeData.revision}</dd></div>
              <div><dt className="eyebrow mb-2 text-[#6a8398]">Terakhir diperbarui</dt><dd data-testid="text-company-updated" className="text-sm font-semibold text-[#18344c]">{updated}</dd></div>
            </div>
          </dl>
        </section>
        <aside className="rounded-2xl border border-[#c7deed] bg-[#e8f4fb] p-6 lg:self-start"><ShieldCheck size={24} className="text-[#1769d1]" /><h2 className="display mt-5 text-lg font-extrabold">Akses terbatas</h2><p className="mt-3 text-sm leading-7 text-[#46657d]">Hanya izin <strong>profile:read</strong> yang diperlukan; dokumen tidak dibaca. Token diberikan sekali, berlaku 90 hari dan dapat dicabut. Data ini membantu persiapan, bukan bukti keaslian, validitas hukum, atau sertifikasi SBU.</p><a data-testid="link-ruang-simpan" href="https://gustafta.my.id/ruang-simpan" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#1769d1] hover:underline">Buka Gustafta Ruang Simpan <ArrowUpRight size={15} /></a></aside>
      </div>}
  </div>;
}

export function CompanyProfilePage({ expectedUserId }: { expectedUserId: string }) {
  const query = useGetRuangSimpanCompanyProfile({
    query: { queryKey: getGetRuangSimpanCompanyProfileQueryKey(), retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
    request: { cache: 'no-store' },
  });
  return <CompanyProfileResult expectedUserId={expectedUserId} data={query.data} error={query.error} isError={query.isError} isFetching={query.isFetching} isPending={query.isPending} retry={() => { void query.refetch(); }} />;
}