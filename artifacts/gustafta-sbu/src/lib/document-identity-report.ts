import { compareDocumentIdentities, type IdentityRow } from './document-identity';

const fields = { companyName: 'Nama badan usaha', nib: 'NIB', npwp: 'NPWP' };
const kinds = { missing: 'Belum diisi', format: 'Format tidak sesuai', mismatch: 'Isian berbeda antar berkas' };
const actions = {
  missing: 'Lengkapi isian dari dokumen asli, lalu bandingkan kembali.',
  format: 'Periksa ulang ketikan pada dokumen asli; format bukan bukti terdaftar atau berlaku.',
  mismatch: 'Tinjau perbedaan dengan dokumen asli dan sumber resmi; jangan mengubah data hanya agar tampak sama.',
};

export function formatIdentityReport(rows: IdentityRow[]): string {
  const result = compareDocumentIdentities(rows);
  const label = (id: string) => {
    const index = rows.findIndex(row => row.id === id);
    return `Berkas ${index + 1} (${rows[index].label.replace(/[\r\n\t\u2028\u2029]/gu, ' ').trim() || 'tanpa nama'})`;
  };
  return [
    'DRAF INTERNAL — PEMERIKSAAN KONSISTENSI IDENTITAS BERKAS',
    'Gustafta SBU Accelerator',
    'Pemeriksaan isian manual, bukan pembacaan dokumen atau verifikasi resmi.',
    'Bukan keputusan LSBU, bukan bukti keabsahan, dan bukan jaminan penerbitan SBU.',
    '',
    `Jumlah berkas: ${result.documentCount}`,
    `Kolom dapat dibandingkan: ${result.comparableFields} dari 3`,
    'Kolom hanya dapat dibandingkan bila minimal dua berkas terisi dengan format wajar.',
    '',
    'BERKAS YANG DIBANDINGKAN',
    ...rows.map(row => `- ${label(row.id)}`),
    '',
    'HASIL DAN TINDAK LANJUT',
    ...(result.issues.length ? result.issues.flatMap((issue, index) => [
      `${index + 1}. ${fields[issue.field]} — ${kinds[issue.kind]}`,
      `   Berkas: ${issue.documentIds.map(label).join(', ')}`,
      `   Tindakan: ${actions[issue.kind]}`,
      ...(issue.field === 'npwp' && issue.kind === 'mismatch'
        ? ['   NPWP 15 dan 16 digit tidak dikonversi atau disamakan otomatis; telaah manual diperlukan.'] : []),
    ]) : ['Tidak ada perbedaan terdeteksi pada isian. Ini bukan bukti bahwa dokumen sah.']),
    ...(result.comparableFields === 0 ? ['Belum ada kolom yang dapat dibandingkan; jangan anggap hasil ini sebagai kelengkapan.'] : []),
    '',
    'BATAS PEMERIKSAAN DAN PRIVASI',
    'Tidak ada pemeriksaan ke OSS, DJP, atau LSBU dan tidak ada pengiriman ke AI.',
    'Nilai pada kolom nama badan usaha, NIB, dan NPWP tidak dimasukkan ke laporan.',
    'Nama berkas dimasukkan sesuai isian Anda; pastikan tidak memuat data sensitif sebelum membagikan.',
    'Laporan adalah snapshot saat diunduh; perubahan berkas atau isian memerlukan pemeriksaan ulang.',
    'Normalisasi: kapital/spasi nama; spasi NIB; titik, strip, dan spasi NPWP (termasuk normalisasi Unicode).',
  ].join('\n');
}
