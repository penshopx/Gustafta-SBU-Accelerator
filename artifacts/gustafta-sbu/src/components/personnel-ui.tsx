import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Personnel, SkkCertificate } from '@workspace/api-client-react';

export const assignmentLabels: Record<string, string> = { pjbu: 'PJBU', pjt: 'PJT', pjsk: 'PJSK', lainnya: 'Lainnya' };
export const statusLabels: Record<string, string> = { unknown: 'Tanggal belum lengkap', not_yet_effective: 'Belum berlaku', active_declared: 'Berlaku (deklarasi)', expiring: 'Segera berakhir', expired: 'Berakhir' };
const tone: Record<string, string> = {
  unknown: 'border-[#c9d4de] bg-[#eef2f6] text-[#42576b]', not_yet_effective: 'border-[#b9d5e9] bg-[#dff0fc] text-[#173d5d]',
  active_declared: 'border-[#a9d8c9] bg-[#e4f5ee] text-[#19614f]', expiring: 'border-[#ecc977] bg-[#fff3d9] text-[#7a5200]', expired: 'border-[#e5b8b3] bg-[#fdf1ef] text-[#8e2f2e]',
};
const rank: Record<string, number> = { expired: 5, expiring: 4, unknown: 3, not_yet_effective: 2, active_declared: 1 };
export const worstStatus = (p: Personnel) => p.certificates.reduce<string | null>((w, c) => !w || rank[c.dateStatus] > rank[w] ? c.dateStatus : w, null);
export const statusOf = (e: unknown) => (e as { status?: number } | null)?.status;
export const fmtDay = (s?: string | null) => { if (!s) return 'Belum diisi'; const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', { dateStyle: 'medium', timeZone: 'UTC' }); };
export const daysText = (c: SkkCertificate) => c.daysRemaining == null ? '' : c.dateStatus === 'expired' ? `${Math.abs(c.daysRemaining)} hari lalu` : c.dateStatus === 'not_yet_effective' ? '' : c.daysRemaining === 0 ? 'Hari terakhir (inklusif)' : `${c.daysRemaining} hari tersisa`;
export const mutationError = (e: unknown, fallback: string) => {
  const s = statusOf(e);
  if (s === 409) return 'Data ini sudah berubah sejak formulir dibuka (mungkin dari tab lain). Draf Anda tetap dipertahankan dan belum disimpan. Muat ulang data terbaru, lalu buka formulir lagi untuk menyunting.';
  if (s === 404) return 'Data tidak ditemukan atau bukan milik akun ini.';
  if (s === 403 || s === 401) return 'Sesi atau akun aktif tidak cocok. Muat ulang halaman sebelum melanjutkan.';
  return fallback;
};

export function DateBadge({ status, days }: { status: string; days?: string }) {
  return <span data-testid={`status-date-${status}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone[status]}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabels[status]}{days ? <span className="font-normal">· {days}</span> : null}</span>;
}

export function Dialog({ title, close, children, alert }: { title: string; close: () => void; children: ReactNode; alert?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [close]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d1b2ad9] p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} className="surface fade-up my-auto w-full max-w-[600px] overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#d8e4ec] px-6 py-5"><h2 className="display text-xl font-extrabold">{title}</h2><button type="button" data-testid="button-close-dialog" aria-label="Tutup" onClick={close} className="rounded-lg p-2 hover:bg-[#ecf4f9]"><X size={18} /></button></div>
      <div className="p-6">{children}</div></section></div>;
}
export function Fld({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">{label}</span>{children}{hint && <span className="mt-1.5 block text-xs text-[#688096]">{hint}</span>}</label>; }
export function Disclosure() {
  return <div role="note" data-testid="text-personnel-disclaimer" className="mb-6 rounded-xl border border-[#b9d5e9] bg-[#dff0fc] p-4 text-xs leading-5 text-[#173d5d]">Penugasan adalah peran yang Anda catat, bukan kualifikasi terverifikasi. Tanggal SKK adalah tanggal yang Anda deklarasikan (zona Asia/Jakarta, hari berakhir dihitung inklusif); jendela &ldquo;segera berakhir&rdquo; 30 hari hanya penanda bantu, bukan ketentuan regulasi. Gustafta tidak memverifikasi sertifikat dan tidak mengubah penilaian kasus. Jangan memasukkan NIK atau kredensial rahasia.</div>;
}
