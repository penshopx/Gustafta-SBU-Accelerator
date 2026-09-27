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
              const profileRows = () => globalThis.__routeProfileRows ?? [];
            export const db = {
              select() {
                return {
                  from(table) {
                    return {
                      where(predicate) {
                         if (table === casesTable) globalThis.__routeCaseReads = (globalThis.__routeCaseReads ?? 0) + 1;
                        if (table === evidenceTable) globalThis.__routeEvidenceReads++;
                         const rows = table === casesTable ? caseRows() :
                            table === profilesTable ? profileRows() : evidenceRows();
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
                      if (table === profilesTable) {
                        globalThis.__routeProfileWrites = (globalThis.__routeProfileWrites ?? 0) + 1;
                        return {
                          onConflictDoNothing() {
                            if (!profileRows().some((row) => row.userId === input.userId))
                              profileRows().push({ role: "belum_dipilih", ...input });
                            return Promise.resolve();
                           },
                           onConflictDoUpdate({ target, set }) {
                             if (target !== profilesTable.userId) throw new Error("unexpected profile conflict target");
                             return {
                               returning() {
                                 let profile = profileRows().find((row) => row.userId === input.userId);
                                 if (profile) {
                                   Object.assign(profile, set);
                                 } else {
                                   profile = { role: "belum_dipilih", displayName: "", organizationName: "", ...input };
                                   profileRows().push(profile);
                                 }
                                 return Promise.resolve([profile]);
                               }
                             };
                          }
                        };
                      }
                      if (table === casesTable) {
                        globalThis.__routeCaseWrites = (globalThis.__routeCaseWrites ?? 0) + 1;
                        return {
                          returning() {
                            const item = {
                              id: Math.max(0, ...caseRows().map((row) => row.id)) + 1,
                              ...input, status: "draf",
                              createdAt: new Date("2026-02-01T00:00:00Z"),
                              updatedAt: new Date("2026-02-01T00:00:00Z"),
                            };
                            caseRows().push(item);
                            return Promise.resolve([item]);
                          }
                        };
                      }
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
             export const profilesTable = { userId: "userId" };
          `,
           "@clerk/express": `export const getAuth = () => ({ userId: globalThis.__routeUserId === undefined ? "test-user" : globalThis.__routeUserId });`,
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
    const lsbu = assessment.findings.find((finding) => finding.code === "transisi");
    const operational = assessment.findings.find((finding) => finding.code === "transisi_operasional");
    const transition = assessment.findings.find((finding) => finding.code === "transisi_konversi");
    assert.ok(lsbu && operational && transition, "ketiga alur harus tetap dipisahkan");
    for (const finding of [lsbu, operational, transition]) {
      assert.equal(finding.status, "perlu_tinjauan", `${finding.code} belum layak ditayangkan`);
      assert.deepEqual(Object.keys(finding).sort(), ["code", "detail", "source", "status", "title"],
        `${finding.code} tidak boleh menambah kolom tanggal atau hitung mundur`);
      assert.match(finding.detail, /belum (?:layak|terkonfirmasi|ditelaah)/,
        `${finding.code} harus menjelaskan bahwa verifikasi belum cukup`);
      assert.doesNotMatch(finding.detail, /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+20\d{2}\b|\b\d+\s*(?:hari|jam|menit|detik)\s+(?:lagi|tersisa)\b/i,
        `${finding.code} tidak boleh menayangkan tanggal tenggat atau hitung mundur`);
    }
    assert.match(lsbu.detail, /6 bulan sejak penetapan/);
    assert.match(lsbu.detail, /Tanggal penetapan Kepdirjen bukan pemicu konversi SBU/);
    assert.match(operational.detail, /kesiapan SIJK.*surat Pasal 20 ayat \(2\).*belum terkonfirmasi/);
    assert.match(operational.detail, /belum ditelaah ahli/);
    assert.match(transition.detail, /6 bulan sejak terbitnya surat Pasal 20 ayat \(2\), bukan tanggal Kepdirjen/);
    assert.match(transition.detail, /surat Pasal 20 ayat \(2\).*belum terkonfirmasi/);
    assert.match(transition.detail, /belum ditelaah ahli/);
    assert.doesNotMatch(raw, /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]20\d{2}\b|\b\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+20\d{2}\b/i,
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

test("daftar dan detail permohonan hanya memperlihatkan data milik pengguna yang masuk", async () => {
  const caseData = (id, ownerId, companyName) => ({
    id,
    ownerId,
    companyName,
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  });
  const privateCompany = "Perusahaan Rahasia Pemilik Kedua";
  globalThis.__routeCaseRows = [
    caseData(71, "first-owner", "Perusahaan Pertama"),
    caseData(72, "second-owner", privateCompany),
    caseData(73, "first-owner", "Perusahaan Ketiga"),
  ];
  globalThis.__routeUserId = "first-owner";
  const server = app.listen(0);
  try {
    const firstList = await request(server, "/api/cases");
    assert.equal(firstList.status, 200, firstList.raw);
    assert.deepEqual(firstList.body.map((item) => item.id), [71, 73]);
    assert.doesNotMatch(firstList.raw, /Perusahaan Rahasia Pemilik Kedua|"id":72|"ownerId":"second-owner"/,
      "daftar tidak boleh memuat data pemilik lain");

    const ownDetail = await request(server, "/api/cases/71");
    assert.equal(ownDetail.status, 200, ownDetail.raw);
    assert.equal(ownDetail.body.companyName, "Perusahaan Pertama");

    const otherDetail = await request(server, "/api/cases/72");
    const missingDetail = await request(server, "/api/cases/999");
    assert.equal(otherDetail.status, 404, otherDetail.raw);
    assert.equal(missingDetail.status, 404, missingDetail.raw);
    assert.deepEqual(otherDetail.body, missingDetail.body,
      "ID milik orang lain harus tampak seperti ID yang tidak ada");
    assert.deepEqual(otherDetail.body, { error: "Permohonan tidak ditemukan." });
    assert.equal(otherDetail.raw, missingDetail.raw, "respons mentah tidak boleh membedakan pemilik lain");
    assert.doesNotMatch(otherDetail.raw, /Perusahaan Rahasia Pemilik Kedua|second-owner|72|gedung/);

    globalThis.__routeUserId = "second-owner";
    const secondList = await request(server, "/api/cases");
    assert.equal(secondList.status, 200, secondList.raw);
    assert.deepEqual(secondList.body.map((item) => item.id), [72]);
    assert.doesNotMatch(secondList.raw, /Perusahaan Pertama|Perusahaan Ketiga|"id":71|"id":73/);
    const secondDetail = await request(server, "/api/cases/72");
    assert.equal(secondDetail.status, 200, secondDetail.raw);
    assert.equal(secondDetail.body.companyName, privateCompany);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
  }
});

test("dashboard hanya menghitung status dan menampilkan permohonan milik pengguna yang masuk", async () => {
  const caseData = (id, ownerId, status, companyName) => ({
    id,
    ownerId,
    companyName,
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "gedung",
    status,
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  });
  globalThis.__routeCaseRows = [
    caseData(91, "first-owner", "draf", "Pertama 91"),
    caseData(92, "second-owner", "draf", "Rahasia Kedua 92"),
    caseData(93, "first-owner", "ditinjau", "Pertama 93"),
    caseData(94, "second-owner", "selesai_persiapan", "Rahasia Kedua 94"),
    caseData(95, "first-owner", "selesai_persiapan", "Pertama 95"),
    caseData(96, "first-owner", "draf", "Pertama 96"),
    caseData(97, "first-owner", "ditinjau", "Pertama 97"),
    caseData(98, "first-owner", "draf", "Pertama 98"),
  ];
  globalThis.__routeUserId = "first-owner";
  const server = app.listen(0);
  try {
    const first = await request(server, "/api/dashboard");
    assert.equal(first.status, 200, first.raw);
    assert.deepEqual(
      { total: first.body.total, draft: first.body.draft, reviewing: first.body.reviewing, prepared: first.body.prepared },
      { total: 6, draft: 3, reviewing: 2, prepared: 1 },
    );
    assert.deepEqual(first.body.recent.map((item) => item.id), [91, 93, 95, 96, 97],
      "recent hanya memuat lima permohonan pemilik yang masuk");
    assert.doesNotMatch(first.raw, /Rahasia Kedua|second-owner|"id":92|"id":94/,
      "dashboard tidak boleh memuat data pemilik lain");

    globalThis.__routeUserId = "second-owner";
    const second = await request(server, "/api/dashboard");
    assert.equal(second.status, 200, second.raw);
    assert.deepEqual(
      { total: second.body.total, draft: second.body.draft, reviewing: second.body.reviewing, prepared: second.body.prepared },
      { total: 2, draft: 1, reviewing: 0, prepared: 1 },
    );
    assert.deepEqual(second.body.recent.map((item) => item.id), [92, 94]);
    assert.doesNotMatch(second.raw, /Pertama 9|first-owner|"id":91|"id":93|"id":95|"id":96|"id":97|"id":98/,
      "dashboard pemilik kedua tidak boleh memuat data pemilik pertama");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
  }
});

test("pengunjung tanpa sesi tidak dapat membaca daftar atau detail permohonan", async () => {
  const privateCompany = "Perusahaan Rahasia Tanpa Sesi";
  globalThis.__routeUserId = null;
  globalThis.__routeCaseRows = [{
    id: 74,
    ownerId: "case-owner",
    companyName: privateCompany,
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "gedung-privat",
    status: "draf",
    existingSbuExpiresOn: "2027-04-15",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  }];
  globalThis.__routeCaseReads = 0;

  const server = app.listen(0);
  try {
    for (const path of ["/api/cases", "/api/cases/74"]) {
      const response = await request(server, path);
      assert.equal(response.status, 401, `${path}: ${response.raw}`);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." }, path);
      assert.doesNotMatch(response.raw,
        /Perusahaan Rahasia Tanpa Sesi|case-owner|gedung-privat|2027-04-15|"id":74|ownerId|companyName|existingSbuExpiresOn/,
        `${path}: respons tidak boleh membocorkan data permohonan`);
      assert.equal(globalThis.__routeCaseReads, 0, `${path}: permohonan tidak boleh dibaca sebelum masuk`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeCaseReads;
  }
});

test("pengunjung tanpa sesi tidak dapat membuat permohonan atau profil, tetapi peran yang diizinkan dapat membuatnya", async () => {
  globalThis.__routeUserId = null;
  globalThis.__routeCaseRows = [];
  globalThis.__routeProfileRows = [];
  globalThis.__routeCaseWrites = 0;
  globalThis.__routeProfileWrites = 0;
  const server = app.listen(0);
  const create = (companyName) => request(server, "/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      companyName, requestType: "baru", qualification: "kecil",
      classification: "gedung", existingSbuExpiresOn: null,
    }),
  });
  try {
    const denied = await create("Permohonan Tanpa Sesi");
    assert.equal(denied.status, 401, denied.raw);
    assert.deepEqual(denied.body, { error: "Silakan masuk untuk melanjutkan." });
    assert.equal(globalThis.__routeCaseWrites, 0, "tidak boleh mencoba menulis permohonan");
    assert.equal(globalThis.__routeProfileWrites, 0, "tidak boleh mencoba menulis profil");
    assert.deepEqual(globalThis.__routeCaseRows, [], "tidak ada permohonan yang dibuat");
    assert.deepEqual(globalThis.__routeProfileRows, [], "tidak ada profil yang dibuat");

    globalThis.__routeProfileRows.push(
      { userId: "owner-kontraktor", role: "kontraktor" },
      { userId: "owner-konsultan", role: "konsultan" },
    );
    for (const [role, userId] of [
      ["kontraktor", "owner-kontraktor"],
      ["konsultan", "owner-konsultan"],
    ]) {
      globalThis.__routeUserId = userId;
      const created = await create(`Permohonan ${role}`);
      assert.equal(created.status, 201, created.raw);
      assert.equal(created.body.companyName, `Permohonan ${role}`);
      assert.equal(created.body.status, "draf");
      assert.equal(globalThis.__routeCaseRows.at(-1).ownerId, userId);
    }
    assert.equal(globalThis.__routeCaseRows.length, 2);
    assert.equal(globalThis.__routeProfileRows.length, 2, "profil pengguna yang sudah ada tidak digandakan");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeCaseWrites;
    delete globalThis.__routeProfileWrites;
  }
});

test("PATCH /api/me menolak pengunjung tanpa sesi tanpa mengubah atau membuat profil, tetapi pengguna masuk dapat memperbarui profil", async () => {
  const original = { userId: "profile-owner", role: "kontraktor", displayName: "Nama Asli", organizationName: "Perusahaan Asli" };
  globalThis.__routeProfileRows = [structuredClone(original)];
  globalThis.__routeProfileWrites = 0;
  globalThis.__routeUserId = null;
  const server = app.listen(0);
  const update = (displayName) => request(server, "/api/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "konsultan", displayName, organizationName: "Perusahaan Baru" }),
  });
  try {
    const denied = await update("Pengubah Tanpa Sesi");
    assert.equal(denied.status, 401, denied.raw);
    assert.deepEqual(denied.body, { error: "Silakan masuk untuk melanjutkan." });
    assert.equal(globalThis.__routeProfileWrites, 0, "tanpa sesi tidak boleh mencoba menulis profil");
    assert.deepEqual(globalThis.__routeProfileRows, [original], "profil yang ada tidak boleh berubah");

    globalThis.__routeProfileRows = [];
    const deniedCreate = await update("Profil Baru Tanpa Sesi");
    assert.equal(deniedCreate.status, 401, deniedCreate.raw);
    assert.equal(globalThis.__routeProfileWrites, 0, "tanpa sesi tidak boleh mencoba membuat profil");
    assert.deepEqual(globalThis.__routeProfileRows, [], "profil baru tidak boleh dibuat");

    globalThis.__routeProfileRows = [structuredClone(original)];
    globalThis.__routeUserId = "profile-owner";
    const allowed = await update("Nama Diperbarui");
    assert.equal(allowed.status, 200, allowed.raw);
    assert.deepEqual(allowed.body, {
      role: "konsultan", displayName: "Nama Diperbarui", organizationName: "Perusahaan Baru",
    });
    assert.deepEqual(globalThis.__routeProfileRows, [{
      userId: "profile-owner", ...allowed.body,
    }], "pengguna masuk hanya memperbarui profilnya sendiri");
    assert.equal(globalThis.__routeProfileWrites, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeProfileWrites;
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

test("penilaian tanpa identitas mengembalikan 401 sebelum membaca kasus atau bukti", async () => {
  const privateCompany = "Perusahaan Rahasia Tanpa Sesi";
  const privateFinding = "Temuan rahasia tanpa sesi";
  globalThis.__routeUserId = null;
  globalThis.__routeCase = {
    id: 34,
    ownerId: "case-owner",
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
    title: "Bukti rahasia",
    note: privateFinding,
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeCaseReads = 0;
  globalThis.__routeEvidenceReads = 0;

  const server = app.listen(0);
  try {
    const response = await request(server, "/api/cases/34/assessment");
    assert.equal(response.status, 401, response.raw);
    assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
    assert.doesNotMatch(response.raw, /Perusahaan Rahasia Tanpa Sesi|Temuan rahasia tanpa sesi|Bukti rahasia|findings|caseId|ownerId|recordedCount/);
    assert.equal(globalThis.__routeCaseReads, 0, "permohonan tidak boleh dibaca sebelum masuk");
    assert.equal(globalThis.__routeEvidenceReads, 0, "bukti tidak boleh dibaca sebelum masuk");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidence;
    delete globalThis.__routeCaseReads;
    delete globalThis.__routeEvidenceReads;
  }
});

test("penilaian dua permohonan milik pengguna yang sama hanya memakai bukti masing-masing", async () => {
  globalThis.__routeUserId = "same-owner";
  globalThis.__routeCaseRows = [81, 82].map((id) => ({
    id,
    ownerId: "same-owner",
    companyName: `Perusahaan ${id}`,
    requestType: "baru",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  }));
  globalThis.__routeEvidenceRows = [
    { id: 21, caseId: 81, code: "legalitas", title: "Legalitas",
      note: "Bukti permohonan pertama", updatedAt: new Date("2026-02-02T00:00:00Z") },
    { id: 22, caseId: 81, code: "smap_cert", title: "Sertifikat SMAP",
      note: "Sertifikat permohonan pertama", updatedAt: new Date("2026-02-02T00:00:00Z") },
    { id: 23, caseId: 82, code: "penjualan", title: "Penjualan",
      note: "Bukti permohonan kedua", updatedAt: new Date("2026-02-02T00:00:00Z") },
    { id: 24, caseId: 82, code: "smap_commitment", title: "Komitmen SMAP",
      note: "Komitmen permohonan kedua", updatedAt: new Date("2026-02-02T00:00:00Z") },
  ];
  globalThis.__routeEvidenceReads = 0;
  const server = app.listen(0);
  try {
    for (const { id, expected, recordedCount, smapDetail } of [
      {
        id: 81,
        expected: { legalitas: "tercatat", penjualan: "perlu_bukti", smap: "tercatat" },
        recordedCount: 2,
        smapDetail: /Jalur sertifikat\/PANCEK telah dicatat/,
      },
      {
        id: 82,
        expected: { legalitas: "perlu_bukti", penjualan: "tercatat", smap: "perlu_tinjauan" },
        recordedCount: 1,
        smapDetail: /Surat komitmen hanya dapat dipertimbangkan/,
      },
    ]) {
      const { status, body, raw } = await request(server, `/api/cases/${id}/assessment`);
      assert.equal(status, 200, raw);
      assert.equal(body.caseId, id);
      assert.equal(body.recordedCount, recordedCount, `jumlah bukti tercatat permohonan ${id}`);
      assert.equal(body.requiredCount, 6);
      for (const [code, expectedStatus] of Object.entries(expected)) {
        const finding = body.findings.find((item) => item.code === code);
        assert.ok(finding, `temuan ${code} harus ada pada permohonan ${id}`);
        assert.equal(finding.status, expectedStatus, `temuan ${code} permohonan ${id} tidak boleh memakai bukti permohonan lain`);
      }
      assert.match(body.findings.find((item) => item.code === "smap").detail, smapDetail);
    }
    assert.equal(globalThis.__routeEvidenceReads, 2, "bukti harus dibaca untuk kedua penilaian");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeUserId;
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

test("pengunjung tanpa sesi tidak dapat mengubah atau menghapus kasus, tetapi pemilik dapat melakukannya", async () => {
  globalThis.__routeCaseRows = [{
    id: 56,
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
  globalThis.__routeUserId = null;
  const server = app.listen(0);
  const casePath = "/api/cases/56";
  const patch = (companyName) => ({
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyName }),
  });
  try {
    const original = structuredClone(globalThis.__routeCaseRows);
    for (const { method, options } of [
      { method: "PATCH", options: patch("Diubah Pengunjung") },
      { method: "DELETE", options: { method: "DELETE" } },
    ]) {
      const response = await request(server, casePath, options);
      assert.equal(response.status, 401, `${method}: ${response.raw}`);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." }, method);
      assert.doesNotMatch(response.raw, /Perusahaan Privat|case-owner|gedung/,
        `${method}: respons tidak boleh membocorkan data kasus`);
      assert.deepEqual(globalThis.__routeCaseRows, original, `${method}: kasus harus tetap utuh`);
    }

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

test("pengunjung tanpa sesi tidak dapat membaca atau mengubah bukti", async () => {
  const privateNote = "Isi bukti hanya untuk pemilik";
  globalThis.__routeUserId = null;
  globalThis.__routeCaseRows = [{ id: 55, ownerId: "case-owner" }];
  globalThis.__routeEvidenceRows = [{
    id: 8, caseId: 55, code: "legalitas", title: "Bukti privat",
    note: privateNote, updatedAt: new Date("2026-02-02T00:00:00Z"),
  }];
  globalThis.__routeEvidenceReads = 0;
  globalThis.__routeEvidenceWrites = 0;
  const server = app.listen(0);
  const evidencePath = "/api/cases/55/evidence";
  const json = (method, data) => ({
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  });
  try {
    const snapshot = structuredClone(globalThis.__routeEvidenceRows);
    const operations = [
      { method: "GET", path: "", options: undefined },
      { method: "POST", path: "", options: json("POST", { code: "pajak", title: "Pajak", note: "Catatan baru" }) },
      { method: "PATCH", path: "/8", options: json("PATCH", { note: "Diganti pengunjung" }) },
      { method: "DELETE", path: "/8", options: { method: "DELETE" } },
    ];
    for (const { method, path, options } of operations) {
      const response = await request(server, evidencePath + path, options);
      assert.equal(response.status, 401, `${method}: ${response.raw}`);
      assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." }, method);
      assert.doesNotMatch(response.raw, /Isi bukti hanya untuk pemilik|Bukti privat|legalitas|caseId|updatedAt/, method);
      assert.equal(globalThis.__routeEvidenceReads, 0, `${method}: bukti tidak boleh dibaca`);
      assert.equal(globalThis.__routeEvidenceWrites, 0, `${method}: bukti tidak boleh ditulis`);
      assert.deepEqual(globalThis.__routeEvidenceRows, snapshot, `${method}: bukti tidak boleh berubah`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeEvidenceWrites;
  }
});

test("kategori bukti yang sama dapat dicatat di dua permohonan, tetapi duplikat dalam satu permohonan ditolak", async () => {
  globalThis.__routeUserId = "same-owner";
  globalThis.__routeCaseRows = [
    { id: 63, ownerId: "same-owner" },
    { id: 64, ownerId: "same-owner" },
  ];
  globalThis.__routeEvidenceRows = [];
  globalThis.__routeEvidenceReads = 0;
  globalThis.__routeEvidenceWrites = 0;
  const server = app.listen(0);
  const json = (data) => ({
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  });
  try {
    const first = await request(server, "/api/cases/63/evidence",
      json({ code: "legalitas", title: "Legalitas pertama", note: "Catatan pertama" }));
    assert.equal(first.status, 201, first.raw);
    assert.equal(first.body.caseId, 63);
    assert.equal(first.body.code, "legalitas");

    const second = await request(server, "/api/cases/64/evidence",
      json({ code: "legalitas", title: "Legalitas kedua", note: "Catatan kedua" }));
    assert.equal(second.status, 201, second.raw);
    assert.equal(second.body.caseId, 64);
    assert.equal(second.body.code, "legalitas");
    assert.notEqual(first.body.id, second.body.id, "kedua permohonan harus memiliki bukti terpisah");
    assert.deepEqual(globalThis.__routeEvidenceRows.map(({ caseId, code, note }) => ({ caseId, code, note })),
      [
        { caseId: 63, code: "legalitas", note: "Catatan pertama" },
        { caseId: 64, code: "legalitas", note: "Catatan kedua" },
      ]);

    const snapshot = structuredClone(globalThis.__routeEvidenceRows);
    for (const id of [63, 64]) {
      const duplicate = await request(server, `/api/cases/${id}/evidence`,
        json({ code: "legalitas", title: "Duplikat", note: "Tidak boleh mengganti catatan" }));
      assert.equal(duplicate.status, 409, duplicate.raw);
      assert.deepEqual(duplicate.body, { error: "Kategori bukti sudah dicatat. Edit catatan sebelumnya." });
      assert.deepEqual(globalThis.__routeEvidenceRows, snapshot,
        `duplikat di permohonan ${id} tidak boleh menambah atau mengubah bukti mana pun`);
    }

    for (const [id, expected] of [[63, first.body], [64, second.body]]) {
      const listed = await request(server, `/api/cases/${id}/evidence`);
      assert.equal(listed.status, 200, listed.raw);
      assert.deepEqual(listed.body, [expected], `daftar permohonan ${id} hanya memuat buktinya sendiri`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeEvidenceWrites;
    delete globalThis.__routeUserId;
  }
});

test("ID bukti dari permohonan lain milik pengguna yang sama tidak dapat diubah atau dihapus", async () => {
  globalThis.__routeUserId = "same-owner";
  globalThis.__routeCaseRows = [
    { id: 61, ownerId: "same-owner" },
    { id: 62, ownerId: "same-owner" },
  ];
  globalThis.__routeEvidenceRows = [
    { id: 11, caseId: 61, code: "legalitas", title: "Bukti pertama",
      note: "Catatan pertama", updatedAt: new Date("2026-02-02T00:00:00Z") },
    { id: 12, caseId: 62, code: "pajak", title: "Bukti kedua",
      note: "Catatan kedua", updatedAt: new Date("2026-02-03T00:00:00Z") },
  ];
  globalThis.__routeEvidenceReads = 0;
  globalThis.__routeEvidenceWrites = 0;
  const server = app.listen(0);
  const json = (method, data) => ({
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  });
  try {
    const original = structuredClone(globalThis.__routeEvidenceRows);
    for (const path of ["/api/cases/61/evidence/12", "/api/cases/62/evidence/11"]) {
      const patch = await request(server, path, json("PATCH", { note: "Catatan salah" }));
      assert.equal(patch.status, 404, patch.raw);
      assert.deepEqual(patch.body, { error: "Catatan bukti tidak ditemukan." });
      assert.deepEqual(globalThis.__routeEvidenceRows, original, "PATCH lintas permohonan tidak mengubah bukti");

      const deletion = await request(server, path, { method: "DELETE" });
      assert.equal(deletion.status, 404, deletion.raw);
      assert.deepEqual(deletion.body, { error: "Catatan bukti tidak ditemukan." });
      assert.deepEqual(globalThis.__routeEvidenceRows, original, "DELETE lintas permohonan tidak menghapus bukti");
    }

    const updated = await request(server, "/api/cases/61/evidence/11",
      json("PATCH", { note: "Catatan pertama diperbarui" }));
    assert.equal(updated.status, 200, updated.raw);
    assert.equal(updated.body.note, "Catatan pertama diperbarui");
    assert.equal(globalThis.__routeEvidenceRows[0].note, "Catatan pertama diperbarui");
    assert.deepEqual(globalThis.__routeEvidenceRows[1], original[1], "bukti permohonan kedua tetap utuh");

    const removed = await request(server, "/api/cases/62/evidence/12", { method: "DELETE" });
    assert.equal(removed.status, 204, removed.raw);
    assert.deepEqual(globalThis.__routeEvidenceRows.map((item) => item.id), [11]);
    const remaining = await request(server, "/api/cases/61/evidence");
    assert.equal(remaining.status, 200, remaining.raw);
    assert.deepEqual(remaining.body.map((item) => item.id), [11]);
    assert.equal(remaining.body[0].note, "Catatan pertama diperbarui");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeEvidenceWrites;
    delete globalThis.__routeUserId;
  }
});