import type { SmapChecklist } from "@workspace/api-zod";
import { SMAP_DISCLAIMER, SMAP_TEMPLATE, smapQuestions } from "./smap-checklist";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const answers = { unanswered: "Belum dijawab", ada: "Ada (deklarasi)", tidak: "Tidak (deklarasi)" };
const reviews = {
  unreviewed: "Belum ditelaah", clarification: "Perlu klarifikasi",
  insufficient: "Belum memadai (internal)", adequate: "Memadai (internal)",
};

export function smapSummarySection(snapshot?: SmapChecklist) {
  const questions = snapshot?.questions ?? smapQuestions;
  return `<section class="smap"><h2>Checklist SMAP — deklarasi dan telaah internal</h2>
    <p class="notice">${escape(snapshot?.disclaimer ?? SMAP_DISCLAIMER)}</p>
    <p class="meta">Versi template: ${escape(snapshot?.templateVersion ?? SMAP_TEMPLATE)}.
    Hanya revisi terakhir per butir pada snapshot ini. Riwayat lengkap tetap di aplikasi.
    Bukan skor kesiapan atau keputusan kelulusan. Identitas penelaah adalah akun pencatat, bukan bukti kewenangan LSBU.</p>
    <p>Catatan deklarasi dan telaah SMAP di bawah ikut diekspor. Rujukan dokumen hanya nama, ID dan versi saat dipilih; berkas asli, lokasi penyimpanan dan tautan unduh tidak disertakan.</p>
    ${questions.map(q => {
      const entry = snapshot?.entries.find(e => e.questionId === q.id);
      return `<article>
      <h3>${escape(q.id)} · ${escape(q.group)} · ${escape(q.text)}</h3>
      <p class="source">Locator sumber contoh (belum terverifikasi): ${escape(q.source)}</p>
      <p>Jawaban: ${escape(answers[entry?.answer ?? "unanswered"])} · Revisi: ${entry?.revision ?? 0}</p>
      <p>Catatan deklarasi SMAP: ${escape(entry?.notes || "Belum dicatat")}</p>
      <p>Telaah internal: ${escape(reviews[entry?.reviewStatus ?? "unreviewed"])}${entry?.needsReview ? " — PERLU DITINJAU ULANG; keputusan lama tidak menyatakan kecukupan bukti saat ini." : ""}</p>
      <p>Catatan telaah: ${escape(entry?.reviewNote || "Belum dicatat")}</p>
      <p class="meta">Penelaah (ID akun): ${escape(entry?.reviewedBy ?? "Belum ditelaah")} · Waktu telaah: ${escape(entry?.reviewedAt ?? "Belum dicatat")} · Waktu simpan revisi: ${escape(entry?.savedAt ?? "Belum dicatat")} (UTC).</p>
      ${entry?.evidence.length ? `<ul>${entry.evidence.map(e => {
        const available = snapshot?.documents.some(d => d.id === e.id && d.fingerprint === e.fingerprint);
        return `<li>${escape(e.name)} · ID ${escape(e.id)} · versi ${escape(e.version)} — ${available
          ? "Rujukan sesuai pada snapshot; bukan verifikasi isi"
          : "RUJUKAN BERUBAH / TIDAK TERSEDIA; perlu tinjauan ulang"}</li>`;
      }).join("")}</ul>` : "<p>Belum ada rujukan dokumen pada butir ini.</p>"}
      </article>`;
    }).join("")}</section>`;
}
