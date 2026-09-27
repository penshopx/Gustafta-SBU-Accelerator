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
             const evidenceRows = () => globalThis.__routeEvidenceRows ??
               (globalThis.__routeEvidence ? [globalThis.__routeEvidence] : []);
              const caseRows = () => globalThis.__routeCaseRows ??
                (globalThis.__routeCase ? [globalThis.__routeCase] : []);
            export const db = {
              select() {
                return {
                  from(table) {
                    return {
                      where(predicate) {
                        if (table === evidenceTable) globalThis.__routeEvidenceReads++;
                         const rows = table === casesTable ? caseRows() : evidenceRows();
                         const result = rows.filter((row) => row && predicate(row));
                         return Object.assign(Promise.resolve(result), {
                           orderBy: () => Promise.resolve(result),
                         });
                      }
                    };
                  }
                };
               },
               insert(table) {
                 return {
                   values(input) {
                     return {
                       onConflictDoNothing() {
                         return {
                           returning() {
                             globalThis.__routeEvidenceWrites++;
                             const rows = evidenceRows();
                             if (rows.some((row) => row.caseId === input.caseId && row.code === input.code))
                               return Promise.resolve([]);
                             const item = { id: Math.max(0, ...rows.map((row) => row.id)) + 1,
                               ...input, updatedAt: new Date("2026-02-03T00:00:00Z") };
                             rows.push(item);
                             return Promise.resolve([item]);
                           }
                         };
                       }
                     };
                   }
                 };
               },
               update(table) {
                 return {
                   set(changes) {
                     return {
                       where(predicate) {
                         return {
                           returning() {
                              if (table === evidenceTable) globalThis.__routeEvidenceWrites++;
                              const item = (table === casesTable ? caseRows() : evidenceRows()).find(predicate);
                             if (item) Object.assign(item, changes);
                             return Promise.resolve(item ? [item] : []);
                           }
                         };
                       }
                     };
                   }
                 };
               },
               delete(table) {
                 return {
                   where(predicate) {
                     return {
                       returning() {
                          if (table === evidenceTable) globalThis.__routeEvidenceWrites++;
                          const rows = table === casesTable ? caseRows() : evidenceRows();
                         const index = rows.findIndex(predicate);
                         return Promise.resolve(index < 0 ? [] : rows.splice(index, 1));
                       }
                     };
                   }
                 };
              }
            };
            export const casesTable = { id: "id", ownerId: "ownerId" };
             export const evidenceTable = { id: "id", caseId: "caseId" };
            export const profilesTable = {};
          `,
           "@clerk/express": `export const getAuth = () => ({ userId: globalThis.__routeUserId ?? "test-user" });`,
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
app.use(express.json());
app.use("/api", router);

async function request(server, path, options) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) : null, raw };
}

test("respons daftar regulasi menahan tenggat dan hitung mundur transisi yang belum terverifikasi", async () => {
  const server = app.listen(0);
  try {
    const { status, body, raw } = await request(server, "/api/regulations");
    assert.equal(status, 200, raw);
    assert.ok(Array.isArray(body), "respons harus berupa daftar regulasi");
    assert.deepEqual(body.map((regulation) => regulation.id).sort(),
      ["kepdirjen-281-2026", "permen-6-2025"]);

    for (const regulation of body) {
      assert.equal(regulation.effectiveStatus, "Tenggat belum terverifikasi",
        `${regulation.id} tidak boleh menayangkan tenggat resmi sebelum verifikasi`);
      assert.deepEqual(Object.keys(regulation).sort(),
        ["detail", "effectiveStatus", "id", "source", "title"].sort(),
        `${regulation.id} tidak boleh memiliki kolom tanggal/hitung mundur tambahan`);
    }
    assert.doesNotMatch(raw, /\b20\d{2}-\d{2}-\d{2}\b/,
      "tanggal transisi tidak boleh muncul di JSON, termasuk dalam teks rujukan");
    assert.doesNotMatch(raw, /"(?:[^"]*(?:deadline|countdown|dueDate|conversionDate|remainingDays|daysLeft|transitionDate|effectiveDate|tenggatKonversi|hitungMundur)[^"]*)"\s*:/i,
      "JSON tidak boleh memuat kolom tanggal transisi atau hitung mundur");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

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

test("pengguna lain tidak dapat mengubah atau menghapus kasus, tetapi pemilik dapat melakukannya", async () => {
  globalThis.__routeCaseRows = [{
    id: 54,
    ownerId: "case-owner",
    companyName: "Perusahaan Privat",
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  }];
  globalThis.__routeUserId = "different-user";
  const server = app.listen(0);
  const casePath = "/api/cases/54";
  const patch = (companyName) => ({
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyName }),
  });
  try {
    const original = structuredClone(globalThis.__routeCaseRows);
    const forbiddenPatch = await request(server, casePath, patch("Diubah Pihak Lain"));
    assert.equal(forbiddenPatch.status, 404, forbiddenPatch.raw);
    assert.deepEqual(forbiddenPatch.body, { error: "Permohonan tidak ditemukan." });
    assert.deepEqual(globalThis.__routeCaseRows, original, "PATCH pihak lain tidak boleh mengubah kasus");

    const forbiddenDelete = await request(server, casePath, { method: "DELETE" });
    assert.equal(forbiddenDelete.status, 404, forbiddenDelete.raw);
    assert.deepEqual(forbiddenDelete.body, { error: "Permohonan tidak ditemukan." });
    assert.deepEqual(globalThis.__routeCaseRows, original, "DELETE pihak lain tidak boleh menghapus kasus");

    globalThis.__routeUserId = "case-owner";
    const updated = await request(server, casePath, patch("Diubah Pemilik"));
    assert.equal(updated.status, 200, updated.raw);
    assert.equal(updated.body.companyName, "Diubah Pemilik");
    assert.equal(globalThis.__routeCaseRows[0].companyName, "Diubah Pemilik");

    const removed = await request(server, casePath, { method: "DELETE" });
    assert.equal(removed.status, 204, removed.raw);
    assert.deepEqual(globalThis.__routeCaseRows, []);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
  }
});

test("bukti kasus pengguna lain tidak dapat dibaca atau diubah, sementara pemilik dapat mengelolanya", async () => {
  const privateNote = "Isi bukti privat";
  globalThis.__routeCase = {
    id: 44, ownerId: "case-owner", companyName: "Perusahaan Privat",
  };
  globalThis.__routeEvidenceRows = [{
    id: 7, caseId: 44, code: "legalitas", title: "Bukti privat",
    note: privateNote, updatedAt: new Date("2026-02-02T00:00:00Z"),
  }];
  globalThis.__routeEvidenceReads = 0;
  globalThis.__routeEvidenceWrites = 0;
  globalThis.__routeUserId = "case-owner";
  const server = app.listen(0);
  const evidencePath = "/api/cases/44/evidence";
  const missingPath = "/api/cases/45/evidence";
  const json = (method, data) => ({
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  });
  try {
    const initial = await request(server, evidencePath);
    assert.equal(initial.status, 200, initial.raw);
    assert.equal(initial.body[0].note, privateNote);

    globalThis.__routeUserId = "different-user";
    const operations = [
      { method: "GET", path: "", options: undefined },
      { method: "POST", path: "", options: json("POST", { code: "pajak", title: "Pajak", note: "Catatan baru" }) },
      { method: "POST (isi tidak valid)", path: "", options: json("POST", {}) },
      { method: "PATCH", path: "/7", options: json("PATCH", { note: "Diganti pihak lain" }) },
      { method: "PATCH (isi tidak valid)", path: "/7", options: json("PATCH", {}) },
      { method: "DELETE", path: "/7", options: { method: "DELETE" } },
    ];
    const snapshot = structuredClone(globalThis.__routeEvidenceRows);
    const readsBefore = globalThis.__routeEvidenceReads;
    const writesBefore = globalThis.__routeEvidenceWrites;
    for (const { method, path, options } of operations) {
      const forbidden = await request(server, evidencePath + path, options);
      const missing = await request(server, missingPath + path, options);
      assert.equal(forbidden.status, 404, `${method}: ${forbidden.raw}`);
      assert.equal(missing.status, 404, `${method}: ${missing.raw}`);
      assert.deepEqual(forbidden.body, missing.body, `${method}: kasus orang lain harus tampak tidak ada`);
      assert.deepEqual(forbidden.body, { error: "Permohonan tidak ditemukan." });
      assert.doesNotMatch(forbidden.raw, /Isi bukti privat|Bukti privat|legalitas|caseId|updatedAt/);
    }
    assert.equal(globalThis.__routeEvidenceReads, readsBefore, "kasus orang lain tidak boleh membaca bukti");
    assert.equal(globalThis.__routeEvidenceWrites, writesBefore, "kasus orang lain tidak boleh menulis bukti");
    assert.deepEqual(globalThis.__routeEvidenceRows, snapshot, "bukti yang tersimpan tidak berubah");

    globalThis.__routeUserId = "case-owner";
    const added = await request(server, evidencePath, json("POST", {
      code: "pajak", title: "Pajak", note: "Catatan pemilik",
    }));
    assert.equal(added.status, 201, added.raw);
    assert.equal(added.body.note, "Catatan pemilik");
    const updated = await request(server, `${evidencePath}/${added.body.id}`,
      json("PATCH", { note: "Catatan diperbarui pemilik" }));
    assert.equal(updated.status, 200, updated.raw);
    assert.equal(updated.body.note, "Catatan diperbarui pemilik");
    const removed = await request(server, `${evidencePath}/${added.body.id}`, { method: "DELETE" });
    assert.equal(removed.status, 204, removed.raw);
    const finalList = await request(server, evidencePath);
    assert.equal(finalList.status, 200, finalList.raw);
    assert.deepEqual(finalList.body.map((item) => item.id), [7]);
    assert.equal(finalList.body[0].note, privateNote);
    assert.equal(globalThis.__routeEvidenceWrites, writesBefore + 3);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeEvidenceWrites;
    delete globalThis.__routeUserId;
  }
});