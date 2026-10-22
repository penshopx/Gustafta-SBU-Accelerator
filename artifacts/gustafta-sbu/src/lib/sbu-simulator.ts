/** Declarative preparation exercise only. No legal thresholds or official verification. */
export type SimulatorDocumentStatus = 'belum_diperiksa' | 'belum_tersedia' | 'tersedia' | 'perlu_perbaikan' | 'tidak_relevan';
export type SimulatorDocument = { status: SimulatorDocumentStatus; reference: string; companyName: string; note: string };
export const SIMULATOR_AREAS = [
  { id: 'legalitas', label: 'Identitas dan legalitas badan usaha' },
  { id: 'keuangan', label: 'Informasi dan dokumen keuangan' },
  { id: 'personel', label: 'Personel, penugasan, dan SKK' },
  { id: 'pengalaman', label: 'Pengalaman pekerjaan dan rincian kontrak' },
  { id: 'peralatan', label: 'Peralatan dan bukti pendukung' },
  { id: 'sistem', label: 'Sistem manajemen dan dokumen pendukung' },
  { id: 'sbu_lama', label: 'SBU sebelumnya dan riwayat perubahan' },
] as const;
export type SimulatorAreaId = typeof SIMULATOR_AREAS[number]['id'];
export type SimulatorDraft = {
  requestType: 'baru' | 'perpanjangan';
  companyName: string;
  businessType: string;
  subclassification: string;
  qualification: string;
  firstSbu: 'belum_diketahui' | 'ya' | 'tidak';
  existingNumber: string;
  existingExpiresOn: string;
  documents: Record<SimulatorAreaId, SimulatorDocument>;
  contractReference: string;
  allocation: string;
  reusedExperience: 'belum_diketahui' | 'ya' | 'tidak';
  acknowledge: boolean;
};
export type SimulatorFinding = {
  id: string; area: string; severity: 'missing' | 'conflict' | 'review';
  title: string; detail: string; action: string;
};
export const SIMULATOR_LIMITATION = 'Simulasi deklarasi persiapan, bukan verifikasi berkas asli, keaslian SKK, pemenuhan persyaratan resmi, atau keputusan LSBU/OSS. Tidak ada aturan draf BG001 atau ambang LKUT yang diaktifkan.';
export function createSimulatorDraft(): SimulatorDraft {
  return {
    requestType: 'baru', companyName: '', businessType: 'BUJKN', subclassification: '', qualification: '',
    firstSbu: 'belum_diketahui', existingNumber: '', existingExpiresOn: '',
    documents: Object.fromEntries(SIMULATOR_AREAS.map(area => [area.id, {
      status: 'belum_diperiksa', reference: '', companyName: '', note: '',
    }])) as SimulatorDraft['documents'],
    contractReference: '', allocation: '', reusedExperience: 'belum_diketahui', acknowledge: false,
  };
}
const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id');
export function validSimulatorDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function simulatorProfileErrors(draft: SimulatorDraft): string[] {
  const errors: string[] = [];
  if (!draft.companyName.trim()) errors.push('Isi nama badan usaha atau nama perusahaan simulasi.');
  if (!draft.businessType.trim()) errors.push('Isi jenis badan usaha.');
  if (!draft.subclassification.trim()) errors.push('Isi subklasifikasi yang ingin dipelajari; bukan kode KBLI.');
  if (!draft.qualification.trim()) errors.push('Isi kualifikasi sesuai dokumen atau skenario, bukan hasil perkiraan.');
  if (draft.requestType === 'perpanjangan') {
    if (!draft.existingNumber.trim()) errors.push('Isi nomor SBU sebelumnya.');
    if (!validSimulatorDate(draft.existingExpiresOn)) errors.push('Isi tanggal kalender masa berlaku SBU sebelumnya yang sah.');
  }
  return errors;
}
export function evaluateSimulator(draft: SimulatorDraft) {
  const findings: SimulatorFinding[] = [];
  const add = (finding: SimulatorFinding) => findings.push(finding);
  simulatorProfileErrors(draft).forEach((detail, i) => add({
    id: `profil-${i}`, area: 'Profil', severity: 'missing', title: 'Profil simulasi belum lengkap',
    detail, action: 'Kembali ke tahap profil dan lengkapi isian.',
  }));
  const areas = SIMULATOR_AREAS.filter(area => area.id !== 'sbu_lama' || draft.requestType === 'perpanjangan');
  let reviewed = 0;
  for (const area of areas) {
    const document = draft.documents[area.id];
    if (document.status !== 'belum_diperiksa') reviewed++;
    if (document.status === 'belum_diperiksa' || document.status === 'belum_tersedia') {
      add({ id: area.id, area: area.label, severity: 'missing',
        title: document.status === 'belum_diperiksa' ? 'Area belum diperiksa' : 'Bahan belum tersedia',
        detail: 'Kondisi ini berasal dari isian pengguna, bukan pemeriksaan dokumen asli.',
        action: 'Periksa kebutuhan berdasarkan sumber resmi dan lengkapi referensi bahan yang relevan.' });
    } else if (document.status === 'perlu_perbaikan') {
      add({ id: area.id, area: area.label, severity: 'conflict', title: 'Perbaikan dicatat pengguna',
        detail: document.note.trim() || 'Rincian perbaikan belum diisi.', action: 'Jelaskan kekurangan dan tindak lanjutnya sebelum tinjauan.' });
    } else if (document.status === 'tidak_relevan') {
      add({ id: area.id, area: area.label, severity: document.note.trim() ? 'review' : 'missing',
        title: 'Pengecualian perlu ditelaah', detail: document.note.trim() || 'Alasan tidak relevan belum dicatat.',
        action: 'Konfirmasikan alasan dan dasar pengecualian kepada penelaah; pilihan ini bukan pembebasan syarat.' });
    } else if (!document.reference.trim()) {
      add({ id: `${area.id}-referensi`, area: area.label, severity: 'missing', title: 'Referensi bahan belum dicatat',
        detail: 'Status tersedia belum disertai nama/nomor dokumen atau versi.', action: 'Catat referensi agar bahan dapat ditelusuri; tidak perlu mengunggah dokumen di simulator.' });
    }
    if (document.companyName.trim() && draft.companyName.trim() && normalized(document.companyName) !== normalized(draft.companyName)) {
      add({ id: `${area.id}-nama`, area: area.label, severity: 'conflict', title: 'Nama badan usaha tidak konsisten',
        detail: 'Nama yang Anda catat pada area ini berbeda dari profil simulasi.',
        action: 'Periksa nama dan dasar perubahan nama; perbedaan belum membuktikan dokumen tidak sah.' });
    }
  }
  if (draft.requestType === 'baru' && draft.firstSbu === 'belum_diketahui') {
    add({ id: 'pertama', area: 'Profil', severity: 'review', title: 'Kondisi pertama kali memiliki SBU belum diketahui',
      detail: 'Permohonan baru tidak otomatis berarti SBU pertama kali.', action: 'Konfirmasikan riwayat badan usaha sebelum menentukan jalur persyaratan.' });
  }
  if (draft.requestType === 'perpanjangan' || draft.documents.pengalaman.status === 'tersedia') {
    if (!draft.contractReference.trim() || !draft.allocation.trim()) {
      add({ id: 'alokasi', area: 'Pengalaman', severity: 'review', title: 'Referensi dan alokasi pengalaman perlu diperjelas',
        detail: 'Belum cukup informasi untuk menelaah bagian kontrak yang relevan.',
        action: 'Catat kontrak dan rincian porsi/major item/RAB. Periode pengalaman serta larangan penggunaan ulang harus ditelaah, tidak diputuskan otomatis.' });
    }
    if (draft.reusedExperience !== 'tidak') {
      add({ id: 'penggunaan-ulang', area: 'Pengalaman', severity: 'review', title: 'Penggunaan pengalaman perlu ditelusuri',
        detail: draft.reusedExperience === 'ya' ? 'Anda mencatat pengalaman pernah digunakan untuk bagian atau permohonan lain.' : 'Riwayat penggunaan pengalaman belum diketahui.',
        action: 'Telusuri alokasi dan riwayat pemakaian bersama penelaah; simulator tidak menjumlahkan atau menolak pengalaman otomatis.' });
    }
  }
  add({ id: 'cakupan-aturan', area: 'Batas pemeriksaan', severity: 'review', title: 'Pemenuhan persyaratan resmi belum dapat disimpulkan',
    detail: 'Daftar ini adalah area panduan umum, bukan matriks wajib universal. Tidak ada verifikasi berkas asli atau evaluasi hukum aktif.',
    action: 'Cocokkan jenis usaha, subklasifikasi, kualifikasi, versi sumber resmi, serta bahan asli dengan penelaah yang berwenang.' });
  const missing = findings.filter(item => item.severity === 'missing').length;
  const conflicts = findings.filter(item => item.severity === 'conflict').length;
  return { findings, reviewed, totalAreas: areas.length, coverage: Math.round(reviewed / areas.length * 100),
    missing, conflicts, reviews: findings.filter(item => item.severity === 'review').length,
    status: missing ? 'Isian persiapan belum lengkap' : conflicts ? 'Ada ketidaksesuaian untuk diperiksa' : 'Deklarasi tercatat — perlu tinjauan manusia',
  };
}
export function simulatorReportText(draft: SimulatorDraft): string {
  const result = evaluateSimulator(draft);
  return [
    'SBU SIMULATOR — HASIL DEKLARASI PERSIAPAN',
    SIMULATOR_LIMITATION,
    `Badan usaha: ${draft.companyName}`,
    `Jalur: ${draft.requestType}; Jenis usaha: ${draft.businessType}`,
    `Subklasifikasi: ${draft.subclassification}; Kualifikasi: ${draft.qualification}`,
    ...(draft.requestType === 'perpanjangan' ? [`SBU sebelumnya: ${draft.existingNumber}; tanggal: ${draft.existingExpiresOn}`] : []),
    `Hasil: ${result.status}`,
    `Area ditandai: ${result.reviewed}/${result.totalAreas} (${result.coverage}%). Bukan skor kelayakan atau peluang lolos.`,
    '', 'BAHAN YANG DIDEKLARASIKAN',
    ...SIMULATOR_AREAS.filter(area => area.id !== 'sbu_lama' || draft.requestType === 'perpanjangan').map(area => {
      const doc = draft.documents[area.id];
      return `${area.label}: ${doc.status}\nReferensi: ${doc.reference || '—'}\nNama pada bahan: ${doc.companyName || '—'}\nCatatan: ${doc.note || '—'}`;
    }),
    '', `Kontrak: ${draft.contractReference || '—'}`, `Alokasi: ${draft.allocation || '—'}`,
    `Pernah digunakan: ${draft.reusedExperience}`, '', 'TEMUAN DAN TINDAK LANJUT',
    ...result.findings.map((finding, i) => `${i + 1}. ${finding.area} — ${finding.title}\n${finding.detail}\nTindak lanjut: ${finding.action}`),
    '', 'Tidak ada data yang diunggah, dikirim ke AI, atau disimpan ke kasus oleh simulator ini.',
  ].join('\n');
}
