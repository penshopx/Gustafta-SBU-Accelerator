import type { EvidenceRow, SbuCaseRow } from "@workspace/db";

export const RULESET = "Permen PU 6/2025 + Kepdirjen 281/KPTS/DK/2026 (persiapan)";

export const REGULATIONS = [
  {
    id: "permen-6-2025",
    title: "Permen PU Nomor 6 Tahun 2025",
    detail: "Rujukan standar kegiatan usaha jasa konstruksi. Lampiran I memuat alternatif bukti SMAP, termasuk surat komitmen khusus permohonan SBU pertama kali, serta ketentuan pemenuhannya menurut kualifikasi.",
    source: "Permen PU 6/2025, Lampiran I (PDF unggahan hlm. 266); Pasal 20–21 (PDF hlm. 12–13)",
    effectiveStatus: "Jangan samakan tanggal penyesuaian skema LSBU dengan awal periode konversi SBU eksisting.",
  },
  {
    id: "kepdirjen-281-2026",
    title: "Kepdirjen Bina Konstruksi 281/KPTS/DK/2026",
    detail: "Standar skema sertifikasi badan usaha jasa konstruksi. Menggantikan Kepdirjen 37/2025; pilihan bukti SMAP tidak boleh direduksi menjadi satu jalur saja.",
    source: "Kepdirjen 281/KPTS/DK/2026, diktum KELIMA (PDF unggahan hlm. 4) dan skema SMAP (PDF hlm. 27–32)",
    effectiveStatus: "Surat pengantar menyatakan pelaksanaan skema baru menunggu penyesuaian SIJK dan surat pemberlakuan; tanggal operasional belum terverifikasi di aplikasi ini.",
  },
];

type Finding = {
  code: string;
  title: string;
  status: "tercatat" | "perlu_bukti" | "perlu_tinjauan";
  detail: string;
  source: string;
};

const initialChecks = [
  ["legalitas", "Legalitas dan identitas badan usaha"],
  ["penjualan", "Penjualan tahunan"],
  ["keuangan", "Kemampuan keuangan"],
  ["tenaga", "Tenaga kerja konstruksi"],
  ["peralatan", "Peralatan konstruksi"],
] as const;

export function assessCase(sbuCase: SbuCaseRow, evidence: EvidenceRow[]) {
  const recorded = new Set(evidence.map((item) => item.code));
  const findings: Finding[] = initialChecks.map(([code, title]) => ({
    code,
    title,
    status: recorded.has(code) ? "tercatat" : "perlu_bukti",
    detail: recorded.has(code)
      ? "Keterangan bukti sudah dicatat. Isi, keaslian, kecocokan klasifikasi, dan kecukupannya belum diverifikasi."
      : "Belum ada keterangan bukti. Rincian persyaratan bergantung pada klasifikasi, kualifikasi, dan skema yang berlaku.",
    source: "Kepdirjen 281/KPTS/DK/2026, standar skema sertifikasi dan formulir penilaian.",
  }));

  const hasCertificate = recorded.has("smap_cert");
  const hasPancek = recorded.has("smap_pancek");
  const hasCommitment = recorded.has("smap_commitment");
  const hasTraining = recorded.has("smap_training");
  let smapStatus: Finding["status"] = "perlu_bukti";
  let smapDetail = "Belum ada keterangan jalur SMAP. Catat sertifikat SMAP atau lembar konfirmasi PANCEK yang relevan.";
  if (hasCertificate || hasPancek) {
    smapStatus = "tercatat";
    smapDetail = "Jalur sertifikat/PANCEK telah dicatat, tetapi bukti dan kesesuaiannya tetap harus diperiksa secara manual.";
  } else if (hasCommitment && sbuCase.requestType === "baru") {
    smapStatus = "perlu_tinjauan";
    smapDetail = "Surat komitmen hanya dapat dipertimbangkan untuk pengajuan SBU pertama kali; pilihan 'baru' di sini belum membuktikan bahwa ini benar-benar SBU pertama badan usaha. Tenggat pemenuhan 1/2/3 tahun menurut kualifikasi harus diperiksa dari penerbitan sertifikat.";
  } else if (hasTraining && sbuCase.qualification === "kecil") {
    smapStatus = "perlu_tinjauan";
    smapDetail = "Jalur pelatihan/bimtek untuk BUJK kecil memerlukan pemeriksaan konteks dan dokumen pendukung; tidak dinyatakan otomatis memenuhi syarat.";
  } else if (hasCommitment || hasTraining) {
    smapStatus = "perlu_tinjauan";
    smapDetail = "Bukti yang dicatat tidak otomatis berlaku untuk jenis permohonan/kualifikasi ini. Tinjau dengan skema LSBU yang berlaku.";
  }
  findings.push({
    code: "smap",
    title: "Sistem Manajemen Anti Penyuapan (SMAP)",
    status: smapStatus,
    detail: smapDetail + " Dokumen penerapan internal dapat menjadi pendukung PANCEK, bukan bukti akhir yang berdiri sendiri.",
    source: "Permen PU 6/2025 Lampiran I (PDF hlm. 266); Kepdirjen 281/2026 (PDF hlm. 27–32).",
  });
  if (sbuCase.requestType === "perpanjangan") {
    findings.push({
      code: "transisi",
      title: "Masa transisi skema dan konversi",
      status: "perlu_tinjauan",
      detail: "Tanggal surat pemberlakuan SIJK belum tersedia. Jangan hitung tenggat konversi SBU eksisting dari tanggal Kepdirjen; cek status terkini pada sumber resmi.",
      source: "Permen PU 6/2025 Pasal 20–21; surat pengantar Kepdirjen 281/2026 (PDF hlm. 1).",
    });
  }
  return {
    caseId: sbuCase.id,
    ruleset: RULESET,
    status: findings.some((item) => item.status === "perlu_bukti") ? "perlu_bukti" : "perlu_tinjauan",
    recordedCount: findings.filter((item) => item.status === "tercatat").length,
    requiredCount: findings.length,
    disclaimer: "Ini daftar persiapan awal berdasarkan keterangan pengguna, bukan verifikasi dokumen, penetapan kelayakan, keputusan LSBU, atau bukti bahwa sistem pemerintah sudah menerima permohonan.",
    findings,
  };
}