import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

test("printable personnel uses generated contracts, Jakarta asOf and declared-date indicators without changing assessment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "summary-personnel-"));
  try {
    const outfile = join(directory, "summary.mjs");
    await build({
      stdin: {
        contents: `export { preparationSummary } from "./src/lib/preparation-summary";
          export { declaredDateStatus, jakartaToday } from "./src/lib/skk-calendar";
          export { GetPersonnelResponse } from "@workspace/api-zod";`,
        resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts",
      },
      outfile, bundle: true, platform: "node", format: "esm",
    });
    const { preparationSummary, declaredDateStatus, jakartaToday, GetPersonnelResponse } = await import(pathToFileURL(outfile).href);
    const now = new Date("2026-01-15T18:30:00Z");
    const asOfDate = jakartaToday(now);
    assert.equal(asOfDate, "2026-01-16", "Jakarta date differs from UTC at this instant");
    const item = {
      id: 1, ownerId: "PRIVATE_OWNER", companyName: "Perusahaan Uji", requestType: "baru",
      qualification: "kecil", classification: "gedung", status: "draf", existingSbuExpiresOn: null,
      createdAt: now, updatedAt: now,
    };
    const states = [
      [null, null, "unknown", null],
      ["2026-01-17", "2027-01-01", "not_yet_effective", 350],
      ["2025-01-01", "2026-02-16", "active_declared", 31],
      ["2025-01-01", "2026-02-15", "expiring", 30],
      ["2025-01-01", "2026-01-16", "expiring", 0],
      ["2025-01-01", "2026-01-15", "expired", -1],
    ];
    const person = GetPersonnelResponse.parse({
      id: "00000000-0000-4000-8000-000000000001", fullName: "<img src=x onerror=alert(1)>",
      assignment: "pjbu", position: "<b>Direktur</b>", caseId: 1, notes: "PRIVATE_PERSON_NOTE", revision: 0,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), asOfDate,
      certificates: states.map(([issuedOn, expiresOn, dateStatus, daysRemaining], i) => {
        assert.deepEqual(declaredDateStatus(issuedOn, expiresOn, asOfDate), { dateStatus, daysRemaining });
        return {
          id: `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`,
          personnelId: "00000000-0000-4000-8000-000000000001",
          certificateNumber: `SKK-${i}<script>`, issuer: "<em>Penerbit</em>", jobTitle: "Jabatan",
          level: i === 0 ? null : 6, issuedOn, expiresOn, dateStatus, daysRemaining,
          documentId: i === 0 ? "00000000-0000-4000-8000-000000000002" : null,
          documentName: i === 0 ? "<script>Dokumen</script>" : null,
          documentCaseId: i === 0 ? 1 : null, documentAvailable: i === 0,
          notes: "PRIVATE_CERT_NOTE", revision: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(),
        };
      }),
    });
    // Exercise the generated parser and JSON wire representation, not raw fixtures alone.
    const people = [JSON.parse(JSON.stringify(person))];
    const baseline = preparationSummary(item, [], [], now);
    const html = preparationSummary(item, [], [], now, people);
    assert.match(baseline, /Belum ada personel yang ditautkan/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;b&gt;Direktur&lt;\/b&gt;/);
    assert.match(html, /&lt;script&gt;Dokumen&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>|<img|PRIVATE_|2026-01-16T/);
    for (const label of ["Tanggal berakhir belum dicatat", "Belum memasuki tanggal terbit deklarasi",
      "Dalam rentang tanggal deklarasi", "Mendekati tanggal berakhir deklarasi", "Melewati tanggal berakhir deklarasi"]) {
      assert.ok(html.includes(label), label);
    }
    assert.match(html, /asOf: 2026-01-16 \(Asia\/Jakarta\)/);
    assert.match(html, /Jenjang: Belum dicatat/);
    assert.match(html, /bukan verifikasi keaslian, kecukupan personel, atau persetujuan sertifikasi/);
    assert.equal(html.slice(html.indexOf("<section><h2>Temuan")),
      baseline.slice(baseline.indexOf("<section><h2>Temuan")), "personnel must not alter findings/rules");
    const noCert = preparationSummary(item, [], [], now, [{ ...people[0], certificates: [] }]);
    assert.match(noCert, /Belum ada SKK tercatat untuk personel ini/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
