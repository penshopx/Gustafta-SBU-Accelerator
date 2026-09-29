import type { EvidenceRow, SbuCaseRow, TransitionVerificationRow } from "@workspace/db";

export const RULESET = "Permen PU 6/2025 + Kepdirjen 281/KPTS/DK/2026 (persiapan)";

// Keputusan penayangan dibuat per alur; tidak ada tanggal transisi di respons API
// sampai bukti pemerintah dan telaah ahli untuk alur tersebut terverifikasi.
const TRANSITION_STATUS = "Tenggat belum terverifikasi";
const TRANSITION_FINDINGS = [
  {
    code: "transisi",
    title: "Penyesuaian skema LSBU",
    detail: "Tenggat LSBU belum layak ditayangkan: diktum KEEMPAT Kepdirjen 281/KPTS/DK/2026 menyebut 6 bulan sejak penetapan, tetapi status terbaru Kepdirjen belum dikonfirmasi Ditjen/LPJK dan tafsir implementasinya belum ditelaah ahli skema/LSBU yang teridentifikasi. Tanggal penetapan Kepdirjen bukan pemicu konversi SBU.",
    source: "Kepdirjen 281/KPTS/DK/2026 diktum KEEMPAT (PDF unggahan hlm. 4).",
  },
  {
    code: "transisi_operasional",
    title: "Pemberlakuan operasional sertifikasi",
    detail: "Tanggal mulai layanan belum layak ditayangkan: kesiapan SIJK dan keberadaan, nomor, penandatangan, tanggal terbit, cakupan, serta status surat Pasal 20 ayat (2) belum terkonfirmasi Ditjen/LPJK; syarat operasional Pasal 20–21 belum ditelaah ahli skema/LSBU yang teridentifikasi. Undangan sosialisasi bukan surat pemberlakuan.",
    source: "Kepdirjen 281/KPTS/DK/2026 surat pengantar (PDF unggahan hlm. 1); Permen PU 6/2025 Pasal 20–21.",
  },
  {
    code: "transisi_konversi",
    title: "Konversi SBU eksisting",
    detail: "Tanggal/hitung mundur konversi belum layak ditayangkan. Konversi SBU eksisting memakai 6 bulan sejak terbitnya surat Pasal 20 ayat (2), bukan tanggal Kepdirjen. Keberadaan dan status surat Pasal 20 ayat (2) belum terkonfirmasi, termasuk tanggal terbit dan cakupannya; pengecualian Pasal 21 ayat (7) belum ditelaah ahli skema/LSBU yang teridentifikasi. Naskah telaah yang pernah disampaikan tidak dapat divalidasi sebagai telaah ahli.",
    source: "Permen PU 6/2025 Pasal 20–21, termasuk Pasal 21 ayat (7).",
  },
] as const;

export const REGULATIONS = [
  {
    id: "permen-6-2025",
    title: "Permen PU Nomor 6 Tahun 2025",
    detail: "Rujukan standar kegiatan usaha jasa konstruksi. Lampiran I memuat alternatif bukti SMAP, termasuk surat komitmen khusus permohonan SBU pertama kali, serta ketentuan pemenuhannya menurut kualifikasi.",
    source: "Permen PU 6/2025, Lampiran I (PDF unggahan hlm. 266); Pasal 20–21 (PDF hlm. 12–13)",
    effectiveStatus: TRANSITION_STATUS,
  },
  {
    id: "kepdirjen-281-2026",
    title: "Kepdirjen Bina Konstruksi 281/KPTS/DK/2026",
    detail: "Standar skema sertifikasi badan usaha jasa konstruksi. Menggantikan Kepdirjen 37/2025; pilihan bukti SMAP tidak boleh direduksi menjadi satu jalur saja.",
    source: "Kepdirjen 281/KPTS/DK/2026, diktum KELIMA (PDF unggahan hlm. 4) dan skema SMAP (PDF hlm. 27–32)",
    effectiveStatus: TRANSITION_STATUS,
  },
];

type Finding = {
  code: string;
  title: string;
  status: "tercatat" | "perlu_bukti" | "perlu_tinjauan";
  detail: string;
  source: string;
  transitionDate?: string;
};

export const TRANSITION_TRACKS = ["transisi", "transisi_operasional", "transisi_konversi"] as const;

function sixMonthsAfter(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + 6, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

function transitionFinding(
  track: typeof TRANSITION_FINDINGS[number],
  verification: TransitionVerificationRow | undefined,
): Finding {
  // A stored assertion alone cannot authorize a date: require a reviewer-authorized,
  // active publisher source AND an affirmative identified expert review for this track.
  if (verification?.track !== track.code ||
      verification.documentStatus !== "berlaku" ||
      verification.sourceVerified !== true ||
      verification.expertApproved !== true ||
      !verification.verifiedBy ||
      !verification.publisher.trim() || !verification.sourceUrl.startsWith("https://") ||
      !verification.documentNumber.trim() || !verification.signatory.trim() ||
      !verification.issuedOn || !verification.scope.trim() ||
      !verification.expertName.trim() || !verification.expertOrganization.trim() ||
      !verification.expertReview.trim() || !verification.expertReviewedOn) {
    return { ...track, status: "perlu_tinjauan" };
  }
  return {
    code: track.code,
    title: track.title,
    status: "tercatat",
    detail: `Sumber penerbit ${verification.publisher}, surat ${verification.documentNumber} berstatus berlaku dan telaah ${verification.expertName} (${verification.expertOrganization}) telah diverifikasi untuk alur ini. Tetap periksa penerapan pada permohonan Anda dengan LSBU.`,
    source: `${verification.publisher}: ${verification.sourceUrl}; ${track.source}`,
    transitionDate: track.code === "transisi_operasional"
      ? verification.issuedOn : sixMonthsAfter(verification.issuedOn),
  };
}

const initialChecks = [
  ["legalitas", "Legalitas dan identitas badan usaha"],
  ["penjualan", "Penjualan tahunan"],
  ["keuangan", "Kemampuan keuangan"],
  ["tenaga", "Tenaga kerja konstruksi"],
  ["peralatan", "Peralatan konstruksi"],
] as const;

export function assessCase(sbuCase: SbuCaseRow, evidence: EvidenceRow[], verifications: TransitionVerificationRow[] = []) {
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
    findings.push(...TRANSITION_FINDINGS.map((track) =>
      transitionFinding(track, verifications.find((item) => item.track === track.code))));
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