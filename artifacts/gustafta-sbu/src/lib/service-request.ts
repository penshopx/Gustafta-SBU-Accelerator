export const SERVICE_WHATSAPP_DISPLAY = '0812-8794-1900';
export const SERVICE_WHATSAPP_NUMBER = '6281287941900';

export const SERVICE_LIMITS = { name: 100, company: 160, phone: 24, location: 120, classification: 160, notes: 1000 } as const;

export type ApplicationType = 'baru' | 'perpanjangan' | 'belum-yakin';
export const APPLICATION_TYPES: { value: ApplicationType; label: string }[] = [
  { value: 'baru', label: 'SBU baru' },
  { value: 'perpanjangan', label: 'Perpanjangan SBU' },
  { value: 'belum-yakin', label: 'Belum yakin' },
];

export type HelpArea = 'legalitas' | 'pengalaman' | 'peralatan' | 'skk' | 'pub-lkut' | 'smap' | 'asosiasi' | 'umum';
export const HELP_AREAS: { value: HelpArea; label: string; hint: string }[] = [
  { value: 'legalitas', label: 'Legalitas & OSS', hint: 'NIB, KBLI, akta, data perizinan' },
  { value: 'pengalaman', label: 'Pengalaman (E-SIMPAN)', hint: 'Kontrak dan bukti pekerjaan' },
  { value: 'peralatan', label: 'Peralatan (SIMPK)', hint: 'Data alat dan kepemilikan' },
  { value: 'skk', label: 'SKK & personel', hint: 'Tenaga ahli dan penugasan' },
  { value: 'pub-lkut', label: 'PUB / LKUT', hint: 'Pembelajaran peningkatan kemampuan usaha dan laporan kegiatan usaha tahunan' },
  { value: 'smap', label: 'SMAP / Pancek', hint: 'Dokumen penerapan SMAP, sertifikat ISO, dan panduan cegah korupsi' },
  { value: 'asosiasi', label: 'Asosiasi', hint: 'Keanggotaan asosiasi badan usaha' },
  { value: 'umum', label: 'Dokumen umum / belum yakin', hint: 'Butuh arahan awal' },
];

export type ServiceRequestDraft = {
  name: string; company: string; phone: string; location: string;
  applicationType: ApplicationType | ''; help: HelpArea[]; classification: string; notes: string;
};
export type ServiceRequestField = keyof ServiceRequestDraft | 'consent';
export type ServiceRequestErrors = Partial<Record<ServiceRequestField, string>>;

export const emptyServiceRequest = (): ServiceRequestDraft => ({ name: '', company: '', phone: '', location: '', applicationType: '', help: [], classification: '', notes: '' });

/** Returns 62-prefixed digits, or null if the input is not a plausible Indonesian mobile number. Only spaces, dashes, dots and parentheses are tolerated as separators. */
export function normalizeIndonesianMobile(input: string): string | null {
  const t = input.trim();
  if (!t || t.length > SERVICE_LIMITS.phone) return null;
  if (!/^\+?[\d\s\-.()]+$/.test(t)) return null;
  const plus = t.startsWith('+');
  const digits = t.replace(/[^\d]/g, '');
  let local: string;
  if (plus) { if (!digits.startsWith('62')) return null; local = digits.slice(2); }
  else if (digits.startsWith('62')) local = digits.slice(2);
  else if (digits.startsWith('0')) local = digits.slice(1);
  else return null;
  if (!/^8\d{7,11}$/.test(local)) return null;
  return '62' + local;
}

const APP_VALUES = new Set(APPLICATION_TYPES.map(a => a.value));
const HELP_VALUES = new Set(HELP_AREAS.map(h => h.value));

export function validateServiceRequest(d: ServiceRequestDraft, consent: boolean): ServiceRequestErrors {
  const e: ServiceRequestErrors = {};
  const req = (k: 'name' | 'company' | 'location', label: string) => {
    const v = d[k].trim();
    if (!v) e[k] = `${label} wajib diisi.`;
    else if (v.length > SERVICE_LIMITS[k]) e[k] = `${label} maksimal ${SERVICE_LIMITS[k]} karakter.`;
  };
  req('name', 'Nama kontak'); req('company', 'Nama badan usaha');
  if (!d.phone.trim()) e.phone = 'Nomor WhatsApp wajib diisi.';
  else if (!normalizeIndonesianMobile(d.phone)) e.phone = 'Gunakan nomor seluler Indonesia, mis. 0812-3456-7890 atau +62 812 3456 7890.';
  req('location', 'Kota/provinsi');
  if (!d.applicationType || !APP_VALUES.has(d.applicationType)) e.applicationType = 'Pilih jenis permohonan.';
  if (d.help.length === 0 || d.help.some(h => !HELP_VALUES.has(h))) e.help = 'Pilih minimal satu bantuan yang dibutuhkan.';
  if (d.classification.trim().length > SERVICE_LIMITS.classification) e.classification = `Subklasifikasi maksimal ${SERVICE_LIMITS.classification} karakter.`;
  if (d.notes.trim().length > SERVICE_LIMITS.notes) e.notes = `Catatan maksimal ${SERVICE_LIMITS.notes} karakter.`;
  if (!consent) e.consent = 'Centang persetujuan sebelum meninjau pesan.';
  return e;
}

export function buildServiceRequestMessage(d: ServiceRequestDraft): string {
  const app = APPLICATION_TYPES.find(a => a.value === d.applicationType)?.label ?? '-';
  const help = HELP_AREAS.filter(h => d.help.includes(h.value)).map(h => `- ${h.label}`);
  const phone = normalizeIndonesianMobile(d.phone);
  return [
    'Halo Gustafta SBU Accelerator, saya ingin berkonsultasi awal tentang bantuan persiapan dokumen permohonan SBU.',
    '',
    `Nama kontak: ${d.name.trim()}`,
    `Badan usaha: ${d.company.trim()}`,
    `WhatsApp: ${phone ? '+' + phone : d.phone.trim()}`,
    `Kota/provinsi: ${d.location.trim()}`,
    `Jenis permohonan: ${app}`,
    'Bantuan yang dibutuhkan:',
    ...help,
    `Subklasifikasi: ${d.classification.trim() || '-'}`,
    `Catatan: ${d.notes.trim() || '-'}`,
    '',
    'Saya paham ini permintaan kontak awal, bukan pengajuan resmi, dan tidak ada jaminan terbitnya SBU.',
  ].join('\n');
}

export function buildWhatsAppUrl(message: string, number: string = SERVICE_WHATSAPP_NUMBER): string {
  const url = new URL(`https://wa.me/${number}`);
  url.searchParams.set('text', message);
  return url.toString();
}
