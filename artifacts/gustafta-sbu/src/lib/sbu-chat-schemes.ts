import type { SbuChatPurpose, SbuChatScheme } from '@workspace/api-client-react';

export type SchemeInfo = { id: SbuChatScheme; kbli: string; title: string };

export const BG_SCHEMES: SchemeInfo[] = [
  { id: 'BG001', kbli: '41011', title: 'Konstruksi Konvensional Gedung Hunian' },
  { id: 'BG002', kbli: '41012', title: 'Konstruksi Konvensional Gedung Perkantoran' },
  { id: 'BG003', kbli: '41013', title: 'Konstruksi Konvensional Gedung Industri' },
  { id: 'BG004', kbli: '41014', title: 'Konstruksi Konvensional Gedung Perbelanjaan' },
  { id: 'BG005', kbli: '41015', title: 'Konstruksi Konvensional Gedung Kesehatan' },
  { id: 'BG006', kbli: '41016', title: 'Konstruksi Konvensional Gedung Pendidikan' },
  { id: 'BG007', kbli: '41017', title: 'Konstruksi Konvensional Gedung Penginapan' },
  { id: 'BG008', kbli: '41018', title: 'Konstruksi Konvensional Gedung Hiburan dan Olahraga' },
  { id: 'BG009', kbli: '41019', title: 'Konstruksi Konvensional Gedung Lainnya' },
];

export const UNAVAILABLE_CLASSIFICATIONS = ['BS (Bangunan Sipil)', 'IN (Instalasi)', 'KK (Konstruksi Khusus)', 'KP (Konstruksi Prapabrikasi)', 'PA (Penyewaan Peralatan)', 'PL (Penyiapan Lahan)', 'PB (Penyelesaian Bangunan)'];

export const PILOT_SOURCE_NOTICE = 'Sumber pilot hanya berisi pemetaan subklasifikasi ke KBLI dan penjelasan ruang lingkup KBLI. Belum mencakup persyaratan lengkap (kualifikasi, tenaga kerja, peralatan, keuangan) sehingga jawaban tentang persyaratan harus diperiksa pada regulasi primer.';

export const schemeInfo = (id?: SbuChatScheme): SchemeInfo | undefined => BG_SCHEMES.find(s => s.id === id);

/** Scheme is never sent with a private document scope or the document-checker purpose. */
export const schemeAllowed = (purpose: SbuChatPurpose, documentScoped: boolean): boolean => !documentScoped && purpose !== 'pemeriksa_dokumen';

export const schemeForSend = (scheme: SbuChatScheme | undefined, purpose: SbuChatPurpose, documentScoped: boolean): SbuChatScheme | undefined =>
  scheme && schemeAllowed(purpose, documentScoped) && schemeInfo(scheme) ? scheme : undefined;

/** Strict equality including both undefined; a reply with a stray scheme is rejected. */
export const sameScheme = (sent: SbuChatScheme | undefined, got: unknown): boolean => sent === undefined ? got === undefined : got === sent;

export const schemePrompts = (s: SchemeInfo): string[] => [
  `Jelaskan ruang lingkup KBLI ${s.kbli} dan jenis pekerjaan yang termasuk subklasifikasi ${s.id}.`,
  `Jelaskan batas penjelasan pilot ${s.id} (${s.title}). Informasi apa yang masih perlu ditelaah sebelum menilai persyaratan?`,
  `Proyek saya membangun gedung campuran. Bagaimana menimbang apakah ${s.id} relevan, dan apa yang harus saya periksa sendiri di regulasi primer?`,
];
