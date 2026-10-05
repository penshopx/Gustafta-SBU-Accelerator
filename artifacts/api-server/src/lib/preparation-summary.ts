import type { SbuCaseRow, EvidenceRow, TransitionVerificationRow } from "@workspace/db";
import { assessCase, regulationsFor } from "./sbu-rules";

export const SUMMARY_DISCLAIMER = "Data adalah deklarasi pengguna, bukan verifikasi dokumen, penetapan kelayakan, atau keputusan LSBU.";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const labels: Record<string, string> = {
  draf: "Draf", ditinjau: "Dalam peninjauan", selesai_persiapan: "Persiapan selesai (internal)",
  tercatat: "Tercatat, belum diverifikasi", perlu_bukti: "Perlu catatan bukti", perlu_tinjauan: "Perlu tinjauan",
};

// No remote assets, scripts, owner IDs, evidence text or applicant URLs are exported.
// Evidence categories are sufficient for this preparation list, not document review.
export function preparationSummary(
  item: SbuCaseRow, evidence: EvidenceRow[], verifications: TransitionVerificationRow[],
  generatedAt = new Date(),
) {
  const assessment = assessCase(item, evidence, verifications);
  const categories = [...new Set(evidence.map((entry) => entry.code))].sort();
  const findings = assessment.findings.map((finding) => `<article>
    <h3>${escape(finding.title)}</h3>
    <p><strong>${escape(labels[finding.status])}</strong></p>
    <p>${escape(finding.detail)}</p>
    ${finding.status === "tercatat" && finding.transitionDate
      ? `<p>Tanggal transisi dari sumber terverifikasi: ${escape(finding.transitionDate)}. Konfirmasi penerapannya dengan LSBU.</p>` : ""}
    <p class="source">Sumber: ${escape(finding.source)}</p></article>`).join("");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>Ringkasan persiapan SBU — deklarasi pengguna</title>
  <style>
  *{box-sizing:border-box}body{font:14px/1.6 Arial,sans-serif;color:#19324a;margin:32px auto;max-width:850px;padding:0 20px;overflow-wrap:anywhere}
  h1{font-size:25px}h2{font-size:20px;border-bottom:1px solid #ccdbea;padding-bottom:8px}
  h3{font-size:16px;margin-bottom:8px}article{margin:0 0 24px}p{margin:8px 0}
  .notice{border:2px solid #1769d1;padding:12px;background:#eaf5fd;font-weight:bold}
  .source,.meta{font-size:12px}footer{font-size:11px;border-top:1px solid #19324a;padding-top:5px;margin-top:24px}
  .print-layout{width:100%;border-collapse:collapse}.print-layout td{padding:0}
  .page-notice{font-size:11px;border:1px solid #1769d1;padding:8px;margin-bottom:14px;font-weight:bold}
  @page{size:A4;margin:18mm 16mm 28mm}
  @media print{body{margin:0;max-width:none;padding:0;font-size:11pt}
  thead{display:table-header-group}thead td{padding-bottom:4mm}
  h2,h3{break-after:avoid}article{break-inside:avoid}section{break-before:page}
  .notice{background:white}a{color:inherit}}
  </style></head><body>
  <table class="print-layout"><thead><tr><td><div class="page-notice">${SUMMARY_DISCLAIMER}</div></td></tr></thead><tbody><tr><td>
  <h1>Ringkasan persiapan konsultasi SBU</h1>
  <p class="notice">${SUMMARY_DISCLAIMER}</p>
  <p class="meta">Dibuat: ${escape(generatedAt.toISOString())} (UTC). Snapshot, bukan pemantauan perubahan otomatis.</p>
  <h2>Ringkasan kasus</h2>
  <p>Badan usaha: <strong>${escape(item.companyName)}</strong></p>
  <p>Jenis: ${escape(item.requestType)} · Kualifikasi: ${escape(item.qualification)}</p>
  <p>Klasifikasi: ${escape(item.classification)}</p>
  <p>Status alur internal: ${escape(labels[item.status])}</p>
  <p>Masa berlaku SBU menurut pengguna: ${escape(item.existingSbuExpiresOn ?? "Belum dicatat")} — bukan tenggat transisi regulasi.</p>
  <p class="meta">Kasus terakhir diperbarui: ${escape(item.updatedAt.toISOString())} (UTC).</p>
  <h2>Kategori catatan bukti</h2>
  <p>Kategori di bawah hanya menunjukkan catatan tersedia; bukan dokumen lengkap atau sah. Isi catatan pribadi tidak disertakan.</p>
  ${categories.length ? `<ul>${categories.map(code => `<li>${escape(code)} — ${evidence.filter(entry => entry.code === code).length} catatan deklarasi</li>`).join("")}</ul>` : "<p>Belum ada catatan bukti.</p>"}
  <section><h2>Temuan dan langkah persiapan</h2>
  <p>Lengkapi kategori bertanda “Perlu catatan bukti”; bawa dokumen asli untuk pemeriksaan manual. Temuan transisi memerlukan verifikasi sumber dan telaah ahli, bukan tambahan catatan pemohon.</p>
  <p>Aturan: ${escape(assessment.ruleset)}. ${escape(assessment.disclaimer)}</p>
  ${findings}</section>
  <section><h2>Sumber aturan saat ringkasan dibuat</h2>
  <p>Tanggal/tenggat transisi yang belum terverifikasi tidak ditampilkan. Sumber yang tercatat bukan konfirmasi kelayakan kasus.</p>
  ${regulationsFor(verifications).map(rule => `<article><h3>${escape(rule.title)}</h3><p>${escape(rule.detail)}</p><p class="source">${escape(rule.source)}</p><p>Status verifikasi alur transisi: ${escape({ unverified: "Belum terverifikasi", partial: "Sebagian terverifikasi", verified: "Terverifikasi untuk alur terkait" }[rule.effectiveStatus])}</p></article>`).join("")}
  <h2>Catatan untuk konsultasi</h2><p>Konfirmasikan kecocokan klasifikasi, kualifikasi, jalur SMAP, keaslian dan kecukupan dokumen, serta penerapan sumber terbaru dengan pihak yang berwenang.</p>
  <p>Simpan berkas ini secara privat. Unduhan berada di perangkat Anda; aplikasi tidak mengendalikan salinan yang Anda bagikan.</p></section>
  <footer>${SUMMARY_DISCLAIMER}<br>Gustafta · Daftar persiapan awal · Snapshot ${escape(generatedAt.toISOString())} (UTC)</footer>
  </td></tr></tbody></table>
  </body></html>`;
}
