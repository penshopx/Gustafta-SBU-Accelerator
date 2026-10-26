import React from 'react';
import type { SbuChatBudget } from '@workspace/api-client-react';

export function chatBudgetForOwner(data: SbuChatBudget | undefined, userId: string) {
  if (!data || data.userId !== userId ||
      !['available', 'exhausted', 'unavailable'].includes(data.status) ||
      !Number.isFinite(Date.parse(data.checkedAt)) ||
      (data.nextResetAt !== null && !Number.isFinite(Date.parse(data.nextResetAt)))) return;
  return data;
}

export function ChatBudgetNotice({ budget, pending, checking, onRefresh }: {
  budget?: SbuChatBudget;
  pending: boolean;
  checking: boolean;
  onRefresh(): void;
}) {
  const available = budget?.status === 'available';
  const exhausted = budget?.status === 'exhausted';
  return <div role="status" data-testid="text-chat-budget" className={`mb-5 rounded-xl border p-4 text-xs leading-5 ${available ? 'border-[#b9d5e9] bg-[#eaf4ff] text-[#173d5d]' : 'border-[#e5c58f] bg-[#fff7e8] text-[#64420e]'}`}>
    <p className="font-bold">Anggaran bersama Asisten</p>
    <p>{pending ? 'Memeriksa ketersediaan anggaran bersama…' : available
      ? 'Anggaran saat ini cukup untuk satu reservasi pengiriman.'
      : exhausted
        ? 'Anggaran bersama belum cukup untuk satu pengiriman lagi. Pengiriman dinonaktifkan meskipun kuota akun Anda masih tersisa.'
        : 'Anggaran bersama belum dapat diverifikasi. Pengiriman dinonaktifkan sementara; draf Anda tetap tersimpan di halaman ini.'}</p>
    {exhausted && budget.nextResetAt && <p>Pemeriksaan ulang setelah batas periode: {new Date(budget.nextResetAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} WIB. Ketersediaan tetap perlu diperiksa kembali.</p>}
    {exhausted && !budget.nextResetAt && <p>Menunggu peninjauan pengelola; waktu ketersediaan belum dapat dipastikan.</p>}
    <p>Kuota akun dan anggaran operasional adalah dua batas berbeda. Anggaran Asisten dipakai bersama seluruh akun dan juga mengikuti batas AI gabungan. Membuka tab atau percakapan baru tidak menambah anggaran.</p>
    <p>Pemeriksaan ini tidak memakai kuota atau memanggil AI. Status diperbarui berkala dan saat kembali ke tab; server tetap memeriksa serta mencadangkan biaya saat pesan dikirim.</p>
    <button type="button" data-testid="button-refresh-chat-budget" disabled={checking} onClick={onRefresh} className="mt-2 font-bold underline disabled:opacity-60">{checking ? 'Memeriksa anggaran…' : 'Periksa anggaran lagi'}</button>
  </div>;
}
