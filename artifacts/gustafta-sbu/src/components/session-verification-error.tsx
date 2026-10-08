import React, { useState } from 'react';
import { CircleAlert } from 'lucide-react';

export function sessionFailureMessage(error: unknown): { status: number | null; message: string; check?: string } {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'session_loading_timeout') return { status: null, check: 'Pemuatan sesi', message: 'Pemuatan sesi terlalu lama. Muat ulang halaman untuk memeriksa sesi kembali. Data privat belum dibuka.' };
  if (code === 'session_verification_timeout') return { status: null, check: 'GET /api/me · batas waktu terlampaui', message: 'Pemeriksaan identitas terlalu lama. Coba lagi atau muat ulang halaman. Data privat tetap tertutup.' };
  const status = error && typeof error === 'object' && 'status' in error
    && typeof error.status === 'number' && Number.isInteger(error.status)
    && error.status >= 100 && error.status <= 599 ? error.status : null;
  const data = error && typeof error === 'object' && 'data' in error ? error.data : null;
  const apiCode = data && typeof data === 'object' && 'code' in data ? data.code : null;
  if (status === 401 && apiCode === 'session_issuer_mismatch') return { status, check: 'GET /api/me · HTTP 401 · session_issuer_mismatch', message: 'Penerbit sesi tidak cocok dengan konfigurasi autentikasi server. Konfigurasi perlu diperiksa; masuk ulang saja belum tentu menyelesaikannya. Data privat tetap tertutup.' };
  if (status === 401 && apiCode === 'session_missing') return { status, check: 'GET /api/me · HTTP 401 · session_missing', message: 'Server belum menerima kredensial sesi. Gunakan halaman Masuk aplikasi; membuka alamat API langsung tidak memulai sesi. Data ruang kerja tidak dihapus.' };
  if (status === 401 && apiCode === 'session_expired') return { status, check: 'GET /api/me · HTTP 401 · session_expired', message: 'Sesi sudah kedaluwarsa. Keluar dan masuk kembali untuk memperbarui sesi. Data ruang kerja tidak dihapus.' };
  if (status === 401 && apiCode === 'session_not_verified') return { status, check: 'GET /api/me · HTTP 401 · session_not_verified', message: 'Kredensial sesi belum berhasil diverifikasi server. Keluar dan masuk kembali; jika tetap ditolak, autentikasi server perlu diperiksa. Data privat tetap tertutup.' };
  if (status === 401) return { status, message: 'Server belum mengenali sesi Anda. Keluar dan masuk kembali untuk memperbarui sesi. Data ruang kerja tidak dihapus.' };
  if (status === 403) return { status, message: 'Pemeriksaan identitas ditolak oleh server. Masuk kembali tidak otomatis memberikan izin tambahan.' };
  if (status === 404) return { status, message: 'Layanan pemeriksaan identitas tidak ditemukan. Muat ulang halaman; jika tetap gagal, konfigurasi API perlu diperiksa.' };
  if (status !== null && status >= 500) return { status, message: 'Layanan pemeriksaan identitas sedang gagal. Coba lagi setelah layanan pulih; data privat tetap ditutup.' };
  if (status !== null && status >= 200 && status < 300) return { status, message: 'Respons pemeriksaan identitas tidak dapat dibaca. Konfigurasi atau format respons API perlu diperiksa.' };
  return { status, message: 'Identitas sesi belum dapat diperiksa. Periksa koneksi lalu coba lagi. Data privat tetap ditutup sampai pemeriksaan berhasil.' };
}

export function SessionVerificationError({ error, retry, reload, signOut }: {
  error: unknown;
  retry: () => Promise<unknown>;
  reload: () => void;
  signOut: () => Promise<unknown>;
}) {
  const failure = sessionFailureMessage(error);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    setActionError(false);
    try { await action(); }
    catch { setActionError(true); }
    finally { setPending(false); }
  };
  return <section className="surface p-9 text-center" data-testid="session-verification-error">
    <CircleAlert className="mx-auto mb-4 text-[#bb5451]" size={26} />
    <h2 className="text-lg font-bold">Identitas sesi belum terverifikasi</h2>
    <p role="alert" className="mt-2 text-sm leading-6 text-[#58708a]">{failure.message}</p>
    <p className="mt-3 text-xs text-[#58708a]">Pemeriksaan: {failure.check ?? `GET /api/me${failure.status !== null ? ` · HTTP ${failure.status}` : ' · koneksi atau respons gagal'}`}</p>
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      <button disabled={pending} className="btn btn-outline" data-testid="button-retry-session" onClick={() => void run(retry)}>{pending ? 'Memproses...' : 'Coba lagi'}</button>
      <button disabled={pending} className="btn btn-outline" data-testid="button-reload-session" onClick={reload}>Muat ulang halaman</button>
      {failure.status === 401 && <button disabled={pending} className="btn btn-primary" data-testid="button-relogin-session" onClick={() => void run(signOut)}>Keluar dan masuk kembali</button>}
    </div>
    {actionError && <p role="alert" className="mt-4 text-sm text-[#b34442]">Tindakan belum berhasil. Coba muat ulang halaman. Ruang kerja tetap tertutup.</p>}
  </section>;
}
