import React from 'react';
import type { SbuChatQuota } from '@workspace/api-client-react';

export function chatQuotaFromError(error: unknown, userId: string): SbuChatQuota | undefined {
  const data = (error as { data?: { quota?: SbuChatQuota } } | null)?.data;
  const quota = data?.quota;
  if (!quota || quota.userId !== userId || !Number.isInteger(quota.dailyRemaining) ||
      !Number.isInteger(quota.dailyLimit) || !Number.isInteger(quota.minuteRemaining) ||
      !Number.isInteger(quota.minuteLimit) || !Number.isInteger(quota.retryAfterSeconds) ||
      quota.dailyRemaining < 0 || quota.minuteRemaining < 0 || typeof quota.busy !== 'boolean' ||
      !Number.isFinite(Date.parse(quota.dailyResetAt)) || !Number.isFinite(Date.parse(quota.minuteResetAt))) return;
  return quota;
}

export function chatLimitMessage(error: unknown): string | undefined {
  const failure = error as { status?: number; data?: { code?: string } } | null;
  if (failure?.status !== 429) return;
  switch (failure.data?.code) {
    case 'chat_daily_limit': return 'Kuota harian habis. Coba lagi setelah reset pukul 07.00 WIB. Memulai percakapan baru tidak mereset kuota.';
    case 'chat_minute_limit': return 'Batas enam percobaan per menit tercapai. Tunggu hingga menit berganti lalu kirim kembali.';
    case 'chat_busy': return 'Akun Anda masih memiliki permintaan berjalan, mungkin di tab lain. Tunggu jawaban sebelumnya selesai.';
    default: return 'Batas penggunaan tercapai. Tunggu sebentar lalu coba lagi.';
  }
}

export function ChatQuotaNotice({ quota }: { quota: SbuChatQuota }) {
  return <div role="status" data-testid="text-chat-quota" className="mb-5 rounded-xl border border-[#b9d5e9] bg-[#eaf4ff] p-4 text-xs leading-5 text-[#173d5d]">
    <p className="font-bold">Sisa kuota: {quota.dailyRemaining} dari {quota.dailyLimit} percobaan harian; {quota.minuteRemaining} dari {quota.minuteLimit} percobaan menit ini.</p>
    <p>Reset harian pukul 07.00 WIB ({new Date(quota.dailyResetAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}). Kuota berlaku per akun di semua tab, mode, dan spesialis.</p>
    {quota.busy && <p>Masih ada permintaan berjalan pada akun ini.</p>}
    {quota.retryAfterSeconds > 0 && <p>Coba kembali dalam sekitar {quota.retryAfterSeconds} detik; status diperbarui berkala.</p>}
    <p>Percobaan yang sudah diterima tetap dihitung saat gagal, dibatalkan, atau dicoba ulang. Percakapan baru tidak mereset kuota.</p>
  </div>;
}
