// Only display fixed messages for recognized server codes, never raw errors.
export function aiBudgetErrorMessage(error: unknown): string | undefined {
  const failure = error as { status?: number; data?: { code?: string } } | null;
  if (failure?.status !== 503) return;
  switch (failure.data?.code) {
    case 'ai_budget_exhausted':
      return 'Batas anggaran operasional AI bersama tercapai. Teks atau dokumen tidak dikirim ke AI. Draf dipertahankan; coba lagi setelah anggaran tersedia.';
    case 'ai_budget_unavailable':
      return 'Anggaran operasional AI belum dapat diverifikasi. Teks atau dokumen tidak dikirim ke AI. Draf dipertahankan; coba lagi nanti.';
    default:
      return;
  }
}
