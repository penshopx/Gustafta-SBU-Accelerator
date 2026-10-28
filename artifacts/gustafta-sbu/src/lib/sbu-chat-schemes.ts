import type { SbuChatPurpose, SbuChatScheme } from '@workspace/api-client-react';

export type SchemeFamily = 'BG' | 'BS';
export type SchemeInfo = { id: SbuChatScheme; kbli: string; title: string; family: SchemeFamily };

export const SCHEME_FAMILIES: { id: SchemeFamily; label: string; short: string; desc: string }[] = [
  { id: 'BG', label: 'Bangunan Gedung', short: 'BG', desc: 'Gedung hunian, perkantoran, industri, dan gedung lain (KBLI 4101x).' },
  { id: 'BS', label: 'Bangunan Sipil', short: 'BS', desc: 'Jalan, jembatan, rel, air, pelabuhan, energi, utilitas (KBLI 421xx, 422xx, 429xx).' },
];

const bg = (id: SbuChatScheme, kbli: string, title: string): SchemeInfo => ({ id, kbli, title, family: 'BG' });
const bs = (id: SbuChatScheme, kbli: string, title: string): SchemeInfo => ({ id, kbli, title, family: 'BS' });

export const BG_SCHEMES: SchemeInfo[] = [
  bg('BG001', '41011', 'Konstruksi Konvensional Gedung Hunian'),
  bg('BG002', '41012', 'Konstruksi Konvensional Gedung Perkantoran'),
  bg('BG003', '41013', 'Konstruksi Konvensional Gedung Industri'),
  bg('BG004', '41014', 'Konstruksi Konvensional Gedung Perbelanjaan'),
  bg('BG005', '41015', 'Konstruksi Konvensional Gedung Kesehatan'),
  bg('BG006', '41016', 'Konstruksi Konvensional Gedung Pendidikan'),
  bg('BG007', '41017', 'Konstruksi Konvensional Gedung Penginapan'),
  bg('BG008', '41018', 'Konstruksi Konvensional Gedung Hiburan dan Olahraga'),
  bg('BG009', '41019', 'Konstruksi Konvensional Gedung Lainnya'),
];

/** Exact official mapping; KBLI is NOT sequential (e.g. BS017 = 42999, BS018 = 42995, BS020 = 42209). */
export const BS_SCHEMES: SchemeInfo[] = [
  bs('BS001', '42101', 'Konstruksi Jalan Pada Permukaan Tanah'),
  bs('BS002', '42102', 'Konstruksi Bangunan Sipil Jembatan, Jalan Layang, Fly Over, dan Underpass'),
  bs('BS003', '42103', 'Konstruksi Jalan Rel'),
  bs('BS004', '42201', 'Konstruksi Jaringan Irigasi dan Drainase'),
  bs('BS005', '42202', 'Konstruksi Bangunan Sipil Pengolahan Air Bersih'),
  bs('BS006', '42203', 'Konstruksi Bangunan Sipil Sistem Pengolahan Limbah'),
  bs('BS007', '42204', 'Konstruksi Bangunan Sipil Elektrikal'),
  bs('BS008', '42205', 'Konstruksi Bangunan Sipil Telekomunikasi Untuk Prasarana Transportasi'),
  bs('BS009', '42206', 'Konstruksi Sentral Telekomunikasi'),
  bs('BS010', '42911', 'Konstruksi Bangunan Prasarana Sumber Daya Air'),
  bs('BS011', '42912', 'Konstruksi Bangunan Pelabuhan Bukan Perikanan'),
  bs('BS012', '42913', 'Konstruksi Bangunan Pelabuhan Perikanan'),
  bs('BS013', '42991', 'Konstruksi Bangunan Sipil Minyak dan Gas Bumi'),
  bs('BS014', '42992', 'Konstruksi Bangunan Sipil Pertambangan'),
  bs('BS015', '42993', 'Konstruksi Bangunan Sipil Panas Bumi'),
  bs('BS016', '42994', 'Konstruksi Bangunan Sipil Fasilitas Olahraga'),
  bs('BS017', '42999', 'Konstruksi Bangunan Sipil Lainnya YTDL'),
  bs('BS018', '42995', 'Konstruksi Bangunan Sipil Fasilitas Pengolahan'),
  bs('BS019', '42996', 'Konstruksi Bangunan Sipil Fasilitas Militer dan Bandar Antariksa'),
  bs('BS020', '42209', 'Konstruksi Proyek Utilitas Lainnya'),
];

export const ALL_SCHEMES: SchemeInfo[] = [...BG_SCHEMES, ...BS_SCHEMES];

export const schemesForFamily = (f: SchemeFamily): SchemeInfo[] => (f === 'BG' ? BG_SCHEMES : BS_SCHEMES);
export const familyInfo = (f: SchemeFamily) => SCHEME_FAMILIES.find(x => x.id === f)!;

export const UNAVAILABLE_CLASSIFICATIONS = ['IN (Instalasi)', 'KK (Konstruksi Khusus)', 'KP (Konstruksi Prapabrikasi)', 'PA (Penyewaan Peralatan)', 'PL (Penyiapan Lahan)', 'PB (Penyelesaian Bangunan)'];

export const PILOT_SOURCE_NOTICE = 'Sumber pilot hanya berisi pemetaan subklasifikasi ke KBLI dan penjelasan ruang lingkup KBLI. Belum mencakup persyaratan lengkap (kualifikasi, tenaga kerja, peralatan, keuangan), aturan transisi, maupun autentikasi dokumen, sehingga jawaban tentang hal tersebut harus diperiksa pada regulasi primer.';

/** Combined BG + BS lookup; unknown ids return undefined. */
export const schemeInfo = (id?: unknown): SchemeInfo | undefined => (typeof id === 'string' ? ALL_SCHEMES.find(s => s.id === id) : undefined);

export const schemeFamilyOf = (id?: unknown): SchemeFamily | undefined => schemeInfo(id)?.family;

/** Human label for the active scheme, family-specific (never always BG). */
export const schemeActiveLabel = (s: SchemeInfo): string => `${s.id} (${familyInfo(s.family).label}, KBLI ${s.kbli}, pilot)`;

/** Scheme is never sent with a private document scope or the document-checker purpose. */
export const schemeAllowed = (purpose: SbuChatPurpose, documentScoped: boolean): boolean => !documentScoped && purpose !== 'pemeriksa_dokumen';

export const schemeForSend = (scheme: SbuChatScheme | undefined, purpose: SbuChatPurpose, documentScoped: boolean): SbuChatScheme | undefined =>
  scheme && schemeAllowed(purpose, documentScoped) && schemeInfo(scheme) ? scheme : undefined;

/** Strict equality including both undefined; a reply with a stray scheme is rejected. */
export const sameScheme = (sent: SbuChatScheme | undefined, got: unknown): boolean => sent === undefined ? got === undefined : got === sent;

/** Starter prompts stay within the active scheme: scope, limitations, context. No comparison with unselected schemes' sources. */
export const schemePrompts = (s: SchemeInfo): string[] => {
  const fam = familyInfo(s.family).label;
  return [
    `Jelaskan ruang lingkup KBLI ${s.kbli} dan jenis pekerjaan yang termasuk subklasifikasi ${s.id} (${fam}).`,
    `Apa batas penjelasan pilot ${s.id} (${s.title})? Informasi apa yang belum tercakup dan masih perlu ditelaah di regulasi primer sebelum menilai persyaratan?`,
    `Dalam konteks proyek ${fam.toLowerCase()} saya, hal apa yang perlu saya pastikan sendiri sebelum menyimpulkan bahwa pekerjaan saya termasuk ${s.id}?`,
  ];
};
