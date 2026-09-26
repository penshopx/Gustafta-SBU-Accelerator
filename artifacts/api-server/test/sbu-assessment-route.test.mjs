import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { build } from "esbuild";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const temporaryDir = await mkdtemp(join(testDir, ".sbu-route-test-"));
after(() => rm(temporaryDir, { recursive: true, force: true }));

// Bundle the real route, rule engine and generated response schema. Only auth
// and persistence are replaced, so the test exercises Express JSON output.
await build({
  entryPoints: [join(testDir, "../src/routes/sbu.ts")],
  outfile: join(temporaryDir, "route.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["express"],
  plugins: [{
    name: "test-data",
    setup(build) {
      build.onResolve({ filter: /^(@workspace\/db|@clerk\/express|drizzle-orm|@workspace\/api-zod)$/ }, (args) => {
        if (args.path === "@workspace/api-zod") return { path: join(testDir, "../../../lib/api-zod/src/index.ts") };
        return { path: args.path, namespace: "test-data" };
      });
      build.onLoad({ filter: /.*/, namespace: "test-data" }, (args) => ({
        contents: ({
          "@workspace/db": `
            export const db = {
              select() {
                return {
                  from(table) {
                    return {
                      where(predicate) {
                        if (table === evidenceTable) globalThis.__routeEvidenceReads++;
                        const rows = table === casesTable
                          ? [globalThis.__routeCase] : [globalThis.__routeEvidence];
                        return Promise.resolve(rows.filter((row) => row && predicate(row)));
                      }
                    };
                  }
                };
              }
            };
            export const casesTable = { id: "id", ownerId: "ownerId" };
            export const evidenceTable = { caseId: "caseId" };
            export const profilesTable = {};
          `,
          "@clerk/express": `export const getAuth = () => ({ userId: "test-user" });`,
          "drizzle-orm": `
            export const eq = (column, value) => (row) => row[column] === value;
            export const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
            export const desc = () => true;
          `,
        })[args.path],
        loader: "js",
      }));
    },
  }],
});

const { default: router } = await import(join(temporaryDir, "route.mjs"));
const app = express();
app.use("/api", router);

async function request(server, path) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const raw = await response.text();
  return { status: response.status, body: JSON.parse(raw), raw };
}

test("respons kasus mempertahankan kedaluwarsa SBU tetapi penilaian tidak mengirim tenggat konversi", async () => {
  const sbuExpiry = "2027-04-15";
  const kepdirjenDate = "2026-03-01";
  const wrongConversionDate = "2026-09-01";
  globalThis.__routeCase = {
    id: 12,
    ownerId: "test-user",
    companyName: "Contoh BUJK",
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "contoh",
    status: "draf",
    existingSbuExpiresOn: sbuExpiry,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidence = {
    id: 1,
    caseId: 12,
    code: "legalitas",
    title: "Legalitas",
    note: `Kepdirjen ditetapkan ${kepdirjenDate}; surat Pasal 20 ayat (2) dan telaah ahli belum terverifikasi`,
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidenceReads = 0;

  const server = app.listen(0);
  try {
    const caseResponse = await request(server, "/api/cases/12");
    assert.equal(caseResponse.status, 200, caseResponse.raw);
    assert.equal(caseResponse.body.existingSbuExpiresOn.slice(0, 10), sbuExpiry,
      "tanggal kedaluwarsa SBU yang dicatat pengguna harus tetap tersedia di detail kasus");

    const { body: assessment, raw, status } = await request(server, "/api/cases/12/assessment");
    assert.equal(status, 200, raw);
    assert.equal(assessment.caseId, 12);
    const transition = assessment.findings.find((finding) => finding.code === "transisi_konversi");
    assert.ok(transition);
    assert.equal(transition.status, "perlu_tinjauan");
    assert.match(transition.detail, /surat Pasal 20 ayat \(2\).*belum terkonfirmasi/);
    assert.match(transition.detail, /belum ditelaah ahli/);
    assert.match(transition.detail, /bukan tanggal Kepdirjen/);
    assert.doesNotMatch(raw, /\b20\d{2}-\d{2}-\d{2}\b/,
      "tanggal dari input kasus atau Kepdirjen tidak boleh menjadi tanggal konversi di penilaian");
    assert.doesNotMatch(raw, /"(?:[^"]*(?:deadline|countdown|dueDate|conversionDate|remainingDays|daysLeft|tenggatKonversi|hitungMundur)[^"]*)"\s*:/i);
    assert.doesNotMatch(raw, new RegExp(`${wrongConversionDate}|${sbuExpiry}|${kepdirjenDate}`));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidence;
    delete globalThis.__routeEvidenceReads;
  }
});

test("penilaian kasus milik pengguna lain mengembalikan 404 tanpa data kasus atau temuan", async () => {
  const privateCompany = "Perusahaan Rahasia Pengguna Lain";
  const privateFinding = "Temuan rahasia pengguna lain";
  globalThis.__routeCase = {
    id: 34,
    ownerId: "another-user",
    companyName: privateCompany,
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "rahasia",
    status: "draf",
    existingSbuExpiresOn: "2027-04-15",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidence = {
    id: 2,
    caseId: 34,
    code: "legalitas",
    title: "Legalitas",
    note: privateFinding,
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidenceReads = 0;

  const server = app.listen(0);
  try {
    const forbidden = await request(server, "/api/cases/34/assessment");
    const missing = await request(server, "/api/cases/35/assessment");
    assert.equal(forbidden.status, 404, forbidden.raw);
    assert.equal(missing.status, 404, missing.raw);
    assert.deepEqual(forbidden.body, missing.body, "kasus milik orang lain harus tampak seperti kasus yang tidak ada");
    assert.deepEqual(forbidden.body, { error: "Permohonan tidak ditemukan." });
    assert.doesNotMatch(forbidden.raw, new RegExp(`${privateCompany}|${privateFinding}|findings|caseId`));
    assert.equal(globalThis.__routeEvidenceReads, 0, "bukti kasus orang lain tidak boleh dibaca");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidence;
    delete globalThis.__routeEvidenceReads;
  }
});