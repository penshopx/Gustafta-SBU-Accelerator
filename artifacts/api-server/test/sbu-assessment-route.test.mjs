import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { build } from "esbuild";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

const testDir = fileURLToPath(new URL(".", import.meta.url));
// Read the source contract, independently of generated Zod schemas and fixtures.
const openapi = parse(await readFile(join(testDir, "../../../lib/api-spec/openapi.yaml"), "utf8"));
const profileRef = "#/components/schemas/Profile";
const dashboardRef = "#/components/schemas/Dashboard";
function createResponseValidator(schemaRef, schemas = openapi.components.schemas) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  for (const [name, schema] of Object.entries(schemas)) {
    ajv.addSchema(schema, `#/components/schemas/${name}`);
  }
  return { ajv, validate: ajv.compile({ $ref: schemaRef }) };
}
const createProfileValidator = (schemas) => createResponseValidator(profileRef, schemas);
const { ajv: profileAjv, validate: validateProfile } = createProfileValidator();
const { ajv: dashboardAjv, validate: validateDashboard } = createResponseValidator(dashboardRef);
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
  external: ["express", "@google-cloud/*"],
  plugins: [{
    name: "test-data",
    setup(build) {
      build.onResolve({ filter: /\/workspace-context$/ }, () => ({
        path: join(testDir, "helpers/workspace-context-fixture.mjs"),
      }));
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
               const verificationRows = () => globalThis.__routeVerificationRows ?? [];
            export const db = {
              transaction(callback) { return callback(this); },
              select() {
                return {
                  from(table) {
                     return Object.assign(Promise.resolve(table === transitionVerificationsTable ? verificationRows() : []), {
                      where(predicate) {
                         if (table === casesTable) globalThis.__routeCaseReads = (globalThis.__routeCaseReads ?? 0) + 1;
                        if (table === evidenceTable) globalThis.__routeEvidenceReads++;
                        if (table === profilesTable) globalThis.__routeProfileReads = (globalThis.__routeProfileReads ?? 0) + 1;
                         const rows = table === casesTable ? caseRows() :
                            table === profilesTable ? profileRows() : evidenceRows();
                         const result = rows.filter((row) => row && predicate(row));
                          return Object.assign(Promise.resolve(result), {
                             orderBy: (...orders) => {
                               if (orders.length < 1 || orders.length > 2 ||
                                   orders[0].direction !== "desc" || orders[0].column !== "updatedAt" ||
                                    (orders[1] && (table !== casesTable && table !== evidenceTable ||
                                    orders[1].direction !== "desc" || orders[1].column !== "id")))
                                throw new Error("unexpected orderBy");
                               return Promise.resolve([...result].sort((a, b) => {
                                 const byTime = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                                 return byTime || (orders[1] ? b.id - a.id : 0);
                               }));
                            },
                          });
                      }
                     });
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
                               profileRows().push({ role: "belum_dipilih", displayName: "", organizationName: "", ...input });
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
                       if (table === transitionVerificationsTable) {
                         return {
                           onConflictDoUpdate({ target, set }) {
                             if (target !== transitionVerificationsTable.track) throw new Error("unexpected verification conflict target");
                             return {
                               returning() {
                                 let item = verificationRows().find((row) => row.track === input.track);
                                 if (item) Object.assign(item, set);
                                 else {
                                   item = { ...input };
                                   verificationRows().push(item);
                                 }
                                 return Promise.resolve([item]);
                               }
                             };
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
                              if (table === casesTable) globalThis.__routeCaseWrites = (globalThis.__routeCaseWrites ?? 0) + 1;
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
             export const casesTable = { id: "id", ownerId: "ownerId", updatedAt: "updatedAt" };
              export const evidenceTable = { id: "id", caseId: "caseId", updatedAt: "updatedAt" };
               export const transitionVerificationsTable = { track: "track" };
             export const profilesTable = { userId: "userId" };
             export const companyProfilesTable = {};
             export const documentsTable = {};
             export const documentAnalysesTable = {};
             export const consultationsTable = {};
             export const personnelTable = {};
             export const skkCertificatesTable = {};
             export const workroomItemsTable = {};
             export const workroomReviewsTable = {};
          `,
           "@clerk/express": `export const getAuth = () => ({ userId: globalThis.__routeUserId === undefined ? "test-user" : globalThis.__routeUserId });`,
          "drizzle-orm": `
            export const eq = (column, value) => (row) => row[column] === value;
            export const and = (...predicates) => (row) => predicates.every((predicate) => predicate(row));
             export const desc = (column) => ({ column, direction: "desc" });
             export const ilike = () => { throw new Error("unexpected vault query"); };
             export const or = () => { throw new Error("unexpected vault query"); };
             export const sql = (strings) => {
               // These locks are declared at module load, not executed here.
               if (strings.length === 1 && [
                 "SELECT pg_advisory_xact_lock_shared(137, 1)",
                 "SELECT pg_try_advisory_xact_lock(137, 1) AS acquired",
               ].includes(strings[0])) return Object.freeze({ text: strings[0] });
               throw new Error("unexpected document query");
             };
             export const getTableColumns = () => { throw new Error("unexpected personnel query"); };
             export const asc = () => { throw new Error("unexpected workroom query"); };
             export const inArray = () => { throw new Error("unexpected workroom query"); };
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
  const sessionOwner = globalThis.__routeUserId === undefined ? "test-user" : globalThis.__routeUserId;
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: {
      "X-SBU-Form-Owner": globalThis.__routeUserId === undefined ? "test-user" : globalThis.__routeUserId ?? "",
      ...options?.headers,
    },
  });
  const raw = await response.text();
  const body = raw && response.headers.get("content-type")?.includes("application/json") ? JSON.parse(raw) : null;
  if (path === "/api/dashboard" && (options?.method ?? "GET").toUpperCase() === "GET" && response.status === 200) {
    assert.equal(openapi.paths["/dashboard"].get.responses["200"].content["application/json"].schema.$ref,
      dashboardRef, "GET /api/dashboard harus menggunakan kontrak Dashboard");
    assert.ok(validateDashboard(body),
      `GET /api/dashboard tidak sesuai OpenAPI Dashboard: ${dashboardAjv.errorsText(validateDashboard.errors)}`);
  }
  if (path === "/api/me" && response.status === 200) {
    const method = (options?.method ?? "GET").toLowerCase();
    assert.equal(openapi.paths["/me"][method].responses["200"].content["application/json"].schema.$ref,
      profileRef, `${method.toUpperCase()} /api/me harus menggunakan kontrak Profile`);
    assert.ok(validateProfile(body),
      `${method.toUpperCase()} /api/me tidak sesuai OpenAPI Profile: ${profileAjv.errorsText(validateProfile.errors)}`);
    // Schema validity alone cannot prove that a response belongs to this session.
    assert.equal(body.userId, sessionOwner, "respons profil harus milik pemilik sesi");
  }
  return { status: response.status, body, raw, headers: response.headers };
}

test("validasi Profile dari OpenAPI menangkap field wajib, tipe, enum dan perubahan kontrak", () => {
  const valid = {
    userId: "contract-owner", role: "belum_dipilih", displayName: "", organizationName: "",
  };
  assert.ok(validateProfile(valid), profileAjv.errorsText(validateProfile.errors));
  assert.equal(validateProfile(null), false, "respons null bukan Profile");
  assert.equal(validateProfile([]), false, "respons array bukan Profile");

  for (const field of openapi.components.schemas.Profile.required) {
    const missing = structuredClone(valid);
    delete missing[field];
    assert.equal(validateProfile(missing), false, `field wajib ${field} tidak boleh hilang`);
    assert.ok(validateProfile.errors.some((error) =>
      error.keyword === "required" && error.params.missingProperty === field));
  }
  for (const [field, schema] of Object.entries(openapi.components.schemas.Profile.properties)) {
    if (schema.type !== "string") continue;
    for (const wrongType of [null, 123, true, [], {}]) {
      assert.equal(validateProfile({ ...valid, [field]: wrongType }), false,
        `${field} tidak boleh menerima ${JSON.stringify(wrongType)}`);
      assert.ok(validateProfile.errors.some((error) =>
        error.keyword === "type" && error.instancePath === `/${field}`));
    }
  }
  assert.equal(validateProfile({ ...valid, role: "peran-tidak-dikenal" }), false);
  assert.ok(validateProfile.errors.some((error) => error.keyword === "enum"));

  // A newly required field or changed type must fail even if generated code and
  // manually maintained HTTP expectations still describe the previous contract.
  const addedField = structuredClone(openapi.components.schemas);
  addedField.Profile.required.push("contractRevision");
  addedField.Profile.properties.contractRevision = { type: "integer" };
  const addedValidator = createProfileValidator(addedField).validate;
  assert.equal(addedValidator(valid), false, "field wajib baru harus terdeteksi");
  assert.ok(addedValidator({ ...valid, contractRevision: 1 }));

  const changedType = structuredClone(openapi.components.schemas);
  changedType.Profile.properties.organizationName = { type: "integer" };
  const changedValidator = createProfileValidator(changedType).validate;
  assert.equal(changedValidator(valid), false, "perubahan tipe dalam spesifikasi harus terdeteksi");
  assert.ok(changedValidator({ ...valid, organizationName: 1 }));
});

test("ringkasan privat memeriksa pemilik, mengambil snapshot terbaru dan tidak menyalin klaim tenggat dari catatan", async () => {
  globalThis.__routeUserId = "summary-owner";
  globalThis.__routeCaseRows = [{
    id: 901, ownerId: "summary-owner", companyName: 'Usaha <script>alert("x")</script>',
    requestType: "perpanjangan", qualification: "kecil", classification: "gedung",
    status: "draf", existingSbuExpiresOn: "2029-01-01",
    createdAt: new Date("2026-01-01Z"), updatedAt: new Date("2026-02-01Z"),
  }];
  globalThis.__routeEvidenceRows = [{
    id: 902, caseId: 901, code: "legalitas", title: "rahasia-judul",
    note: "rahasia-catatan tenggat 2026-10-10 https://private.invalid",
    updatedAt: new Date("2026-02-02Z"),
  }];
  globalThis.__routeVerificationRows = [];
  globalThis.__routeEvidenceReads = 0;
  const server = app.listen(0);
  const path = "/api/cases/901/preparation-summary";
  try {
    globalThis.__routeUserId = null;
    assert.equal((await request(server, path)).status, 401);
    globalThis.__routeUserId = "other-account";
    assert.equal((await request(server, path)).status, 404);
    assert.equal(globalThis.__routeEvidenceReads, 0);
    globalThis.__routeUserId = "summary-owner";
    assert.equal((await request(server, path, { headers: { "X-SBU-Form-Owner": "old-account" } })).status, 409);
    assert.equal((await request(server, "/api/cases/invalid/preparation-summary")).status, 400);
    const first = await request(server, path);
    assert.equal(first.status, 200, first.raw);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    assert.match(first.headers.get("content-disposition"), /attachment; filename="ringkasan-persiapan-sbu.html"/);
    assert.match(first.raw, /Data adalah deklarasi pengguna, bukan verifikasi dokumen, penetapan kelayakan, atau keputusan LSBU/);
    assert.match(first.raw, /thead\{display:table-header-group/);
    assert.match(first.raw, /<thead><tr><td><div class="page-notice">Data adalah deklarasi pengguna/);
    assert.match(first.raw, /Usaha &lt;script&gt;/);
    assert.match(first.raw, /legalitas — 1 catatan deklarasi/);
    // The legitimate snapshot timestamp may fall on the injected deadline.
    // Exclude only that timestamp, not the preparation content being checked.
    const withoutSnapshotTime = raw => raw
      .replace(/Dibuat: [^<]+ \(UTC\)\./, "Dibuat: (UTC).")
      .replace(/Snapshot [^<]+ \(UTC\)/, "Snapshot (UTC)");
    assert.doesNotMatch(withoutSnapshotTime(first.raw), /<script|rahasia-judul|rahasia-catatan|private.invalid|2026-10-10|summary-owner/);
    globalThis.__routeCaseRows[0].companyName = "Perusahaan terbaru";
    globalThis.__routeEvidenceRows = [];
    globalThis.__routeVerificationRows = [{
      track: "transisi_konversi", publisher: "Penerbit", sourceUrl: "https://pu.go.id/surat",
      documentNumber: "Nomor sumber terkini", signatory: "Penandatangan", issuedOn: "2026-04-10",
      scope: "Konversi SBU", documentStatus: "berlaku", sourceVerified: true,
      expertName: "Ahli", expertOrganization: "LSBU", expertReview: "Disetujui sesuai cakupan",
      expertReviewedOn: "2026-04-11", expertApproved: true, verifiedBy: "reviewer",
      updatedAt: new Date("2026-04-11Z"),
    }];
    const updated = await request(server, path);
    assert.match(updated.raw, /Perusahaan terbaru/);
    assert.match(updated.raw, /Belum ada catatan bukti/);
    assert.match(updated.raw, /Nomor sumber terkini/);
    assert.match(updated.raw, /Tanggal transisi dari sumber terverifikasi: 2026-10-10/);
    globalThis.__routeVerificationRows[0].documentStatus = "dicabut";
    const revoked = await request(server, path);
    assert.doesNotMatch(withoutSnapshotTime(revoked.raw), /2026-10-10|Nomor sumber terkini|Tanggal transisi dari sumber terverifikasi/);
    globalThis.__routeCaseRows = [];
    assert.equal((await request(server, path)).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const key of ["__routeUserId", "__routeCaseRows", "__routeEvidenceRows", "__routeVerificationRows", "__routeEvidenceReads"]) delete globalThis[key];
  }
});

test("formulir tertunda akun A tidak menulis profil, kasus, atau bukti akun B walau sesi sudah B", async () => {
  const now = new Date("2026-02-01T00:00:00Z");
  globalThis.__routeUserId = "owner-b";
  globalThis.__routeProfileRows = [
    { userId: "owner-a", role: "kontraktor", displayName: "Profil A", organizationName: "Organisasi A" },
    { userId: "owner-b", role: "kontraktor", displayName: "Profil B", organizationName: "Organisasi B" },
  ];
  globalThis.__routeCaseRows = [{
    id: 34, ownerId: "owner-b", companyName: "Perusahaan B", requestType: "baru",
    qualification: "kecil", classification: "gedung", status: "draf",
    existingSbuExpiresOn: null, createdAt: now, updatedAt: now,
  }];
  globalThis.__routeEvidenceRows = [{
    id: 1, caseId: 34, code: "legalitas", title: "Bukti B", note: "", createdAt: now, updatedAt: now,
  }];
  globalThis.__routeProfileWrites = 0;
  globalThis.__routeCaseWrites = 0;
  globalThis.__routeEvidenceWrites = 0;
  const before = structuredClone([
    globalThis.__routeProfileRows, globalThis.__routeCaseRows, globalThis.__routeEvidenceRows,
  ]);
  const server = app.listen(0);
  try {
    const writes = [
      ["PATCH", "/api/me", { role: "kontraktor", displayName: "Draf lama A", organizationName: "Organisasi A" }],
      ["POST", "/api/cases", { companyName: "Draf lama A", requestType: "baru", qualification: "kecil", classification: "gedung" }],
      ["PATCH", "/api/cases/34", { companyName: "Draf lama A" }],
      ["DELETE", "/api/cases/34", undefined],
      ["POST", "/api/cases/34/evidence", { code: "tenaga", title: "Draf lama A", note: "" }],
      ["PATCH", "/api/cases/34/evidence/1", { title: "Draf lama A" }],
      ["DELETE", "/api/cases/34/evidence/1", undefined],
    ];
    for (const [method, path, data] of writes) {
      const stale = await request(server, path, {
        method,
        headers: { "content-type": "application/json", "X-SBU-Form-Owner": "owner-a" },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      assert.equal(stale.status, 409, `${method} ${path}: ${stale.raw}`);
      assert.match(stale.body.error, /Muat ulang/);
      assert.deepEqual([
        globalThis.__routeProfileRows, globalThis.__routeCaseRows, globalThis.__routeEvidenceRows,
      ], before, "penolakan tidak mengubah data akun A maupun B");
    }
    assert.equal(globalThis.__routeProfileWrites, 0);
    assert.equal(globalThis.__routeCaseWrites, 0);
    assert.equal(globalThis.__routeEvidenceWrites, 0);
    // Matching B forms still work, with ownership derived from auth, not the header/body.
    const freshProfile = await request(server, "/api/me", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "konsultan", displayName: "Profil B baru", organizationName: "Organisasi B" }),
    });
    assert.equal(freshProfile.status, 200, freshProfile.raw);
    assert.equal(freshProfile.body.userId, "owner-b");
    assert.deepEqual(globalThis.__routeProfileRows[0], before[0][0], "profil akun A tidak tersentuh");
    const freshCase = await request(server, "/api/cases", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName: "Kasus B baru", requestType: "baru", qualification: "kecil", classification: "gedung" }),
    });
    assert.equal(freshCase.status, 201, freshCase.raw);
    assert.equal(globalThis.__routeCaseRows.find(row => row.id === freshCase.body.id).ownerId, "owner-b");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    for (const key of [
      "__routeUserId", "__routeProfileRows", "__routeCaseRows", "__routeEvidenceRows",
      "__routeProfileWrites", "__routeCaseWrites", "__routeEvidenceWrites",
    ]) delete globalThis[key];
  }
});

test("respons daftar regulasi memuat temuan terpisah tanpa tenggat yang belum terverifikasi", async () => {
  const server = app.listen(0);
  try {
    const { status, body, raw } = await request(server, "/api/regulations");
    assert.equal(status, 200, raw);
    assert.ok(Array.isArray(body), "respons harus berupa daftar regulasi");
    assert.deepEqual(body.map((regulation) => regulation.id).sort(),
      ["kepdirjen-281-2026", "permen-6-2025"]);

    for (const regulation of body) {
      assert.equal(regulation.effectiveStatus, "unverified",
        `${regulation.id} tidak boleh menayangkan tenggat resmi sebelum verifikasi`);
      assert.deepEqual(Object.keys(regulation).sort(),
        ["detail", "effectiveStatus", "id", "source", "title", "transitionFindings"].sort(),
        `${regulation.id} tidak boleh memiliki kolom tanggal/hitung mundur tambahan`);
      assert.ok(regulation.transitionFindings.length > 0);
      assert.ok(regulation.transitionFindings.every((finding) =>
        finding.status === "perlu_tinjauan" && !("transitionDate" in finding)));
    }
    assert.doesNotMatch(raw, /\b20\d{2}-\d{2}-\d{2}\b/,
      "tanggal transisi tidak boleh muncul di JSON, termasuk dalam teks rujukan");
    assert.doesNotMatch(raw, /"(?:[^"]*(?:deadline|countdown|dueDate|conversionDate|remainingDays|daysLeft|transitionDate|effectiveDate|tenggatKonversi|hitungMundur)[^"]*)"\s*:/i,
      "JSON tidak boleh memuat kolom tanggal transisi atau hitung mundur");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("respons penilaian perpanjangan tidak menghitung tenggat dari tanggal kedaluwarsa SBU", async () => {
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

    // Tanggal SBU lama berubah, tetapi pemicu tiga alur transisi tetap belum terverifikasi.
    const otherExpiry = "2028-11-30";
    globalThis.__routeCase.existingSbuExpiresOn = otherExpiry;
    const otherCaseResponse = await request(server, "/api/cases/12");
    assert.equal(otherCaseResponse.status, 200, otherCaseResponse.raw);
    assert.equal(otherCaseResponse.body.existingSbuExpiresOn.slice(0, 10), otherExpiry);
    const otherAssessment = await request(server, "/api/cases/12/assessment");
    assert.equal(otherAssessment.status, 200, otherAssessment.raw);
    assert.deepEqual(otherAssessment.body, assessment,
      "mengubah tanggal SBU lama tidak boleh mengubah tiga temuan transisi atau menghitung tenggat");
    assert.doesNotMatch(otherAssessment.raw, /2028-11-30|30[/.]11[/.]2028|30 November 2028/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidence;
    delete globalThis.__routeEvidenceReads;
  }
});

test("klaim terbit dan tanggal surat dalam catatan bukti tidak membuka tenggat transisi", async () => {
  globalThis.__routeCase = {
    id: 13,
    ownerId: "test-user",
    companyName: "Perpanjangan Contoh",
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: "2027-04-15",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidence = {
    id: 2,
    caseId: 13,
    code: "legalitas",
    title: "Legalitas",
    note: "Catatan dokumen legalitas",
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidenceReads = 0;
  const server = app.listen(0);
  try {
    const path = "/api/cases/13/assessment";
    const baseline = await request(server, path);
    assert.equal(baseline.status, 200, baseline.raw);
    assert.equal(baseline.body.caseId, 13);

    const transitionCodes = ["transisi", "transisi_operasional", "transisi_konversi"];
    const notes = [
      "Surat Pasal 20 ayat (2) sudah terbit dan berlaku; konversi SBU bisa dimulai.",
      "Surat Pasal 20 ayat (2) terbit 2026-04-10, tenggat konversi 2026-10-10.",
      "Surat Pasal 20 ayat (2) tertanggal 10 April 2026, batas konversi 10 Oktober 2026; 180 hari tersisa.",
    ];
    for (const note of notes) {
      globalThis.__routeEvidence.note = note;
      const { status, body, raw } = await request(server, path);
      assert.equal(status, 200, raw);
      assert.deepEqual(body, baseline.body,
        `catatan bebas tidak boleh mengubah penilaian transisi: ${note}`);
      for (const code of transitionCodes) {
        const finding = body.findings.find((item) => item.code === code);
        assert.ok(finding, `${code} harus ada pada permohonan perpanjangan`);
        assert.equal(finding.status, "perlu_tinjauan", `${code} belum diverifikasi resmi`);
      }
      assert.doesNotMatch(raw, /2026-04-10|2026-10-10|10 April 2026|10 Oktober 2026|180 hari tersisa/i,
        "tanggal dan hitung mundur dari catatan tidak boleh muncul pada penilaian");
      assert.doesNotMatch(raw, /"(?:[^"]*(?:deadline|countdown|dueDate|conversionDate|remainingDays|daysLeft|transitionDate|effectiveDate|tenggatKonversi|hitungMundur)[^"]*)"\s*:/i,
        "penilaian tidak boleh menambah kolom tenggat atau hitung mundur");
    }
    assert.equal(globalThis.__routeEvidenceReads, notes.length + 1,
      "setiap penilaian harus membaca catatan bukti yang sedang diuji");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidence;
    delete globalThis.__routeEvidenceReads;
  }
});

test("hanya verifikasi resmi per alur dengan telaah ahli membuka tanggal; penarikan persetujuan menutupnya lagi", async () => {
  const oldAllowlist = process.env.SBU_VERIFIER_USER_IDS;
  globalThis.__routeVerificationRows = [];
  globalThis.__routeCase = {
    id: 66, ownerId: "test-user", companyName: "Perpanjangan",
    requestType: "perpanjangan", qualification: "kecil", classification: "gedung",
    status: "draf", existingSbuExpiresOn: "2029-01-01",
    createdAt: new Date("2026-02-01T00:00:00Z"), updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidence = {
    id: 66, caseId: 66, code: "legalitas", title: "Surat klaim",
    note: "Surat Pasal 20 ayat (2) berlaku 2026-04-30; tenggat 2026-10-30",
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidenceReads = 0;
  const server = app.listen(0);
  const assessmentPath = "/api/cases/66/assessment";
  const verificationPath = "/api/transition-verifications/transisi_konversi";
  const input = {
    publisher: "Ditjen Bina Konstruksi", sourceUrl: "https://pu.go.id/surat/contoh",
    documentNumber: "Surat 20/2", signatory: "Direktur Jenderal",
    issuedOn: "2026-04-30", scope: "Pemberlakuan skema dan konversi SBU eksisting",
    documentStatus: "berlaku", sourceVerified: false,
    expertName: "Penelaah Skema", expertOrganization: "LSBU Teridentifikasi",
    expertReview: "Pasal 21 ayat (7) dan cakupan konversi telah ditelaah.",
    expertReviewedOn: "2026-05-01", expertApproved: true,
  };
  const put = (data, track = "transisi_konversi") => request(server,
    `/api/transition-verifications/${track}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
    });
  try {
    let assessment = await request(server, assessmentPath);
    assert.equal(assessment.status, 200, assessment.raw);
    assert.ok(assessment.body.findings.filter((f) => f.code.startsWith("transisi"))
      .every((f) => f.status === "perlu_tinjauan" && !("transitionDate" in f)));
    assert.doesNotMatch(assessment.raw, /2026-04-30|2026-10-30/);
    assert.equal((await put({ ...input, sourceVerified: true })).status, 403,
      "pemohon tidak boleh menaikkan catatannya menjadi verifikasi");
    assert.equal((await request(server, "/api/transition-verifications")).status, 403);
    process.env.SBU_VERIFIER_USER_IDS = "trusted-reviewer";
    globalThis.__routeUserId = "trusted-reviewer";
    assert.equal((await put({ ...input, sourceVerified: true, issuedOn: "2026-02-30" })).status, 400);
    assert.equal((await put({ ...input, sourceVerified: true, sourceUrl: "http://example.com" })).status, 400);
    assert.equal((await put(input, "other")).status, 400);
    let saved = await put(input);
    assert.equal(saved.status, 200, saved.raw);
    globalThis.__routeUserId = "test-user";
    assessment = await request(server, assessmentPath);
    assert.equal(assessment.body.findings.find((f) => f.code === "transisi_konversi").status, "perlu_tinjauan");
    assert.doesNotMatch(assessment.raw, /2026-04-30|2026-10-30/);

    globalThis.__routeUserId = "trusted-reviewer";
    saved = await put({ ...input, sourceVerified: true, expertApproved: false });
    assert.equal(saved.status, 200, saved.raw);
    globalThis.__routeUserId = "test-user";
    assessment = await request(server, assessmentPath);
    assert.doesNotMatch(assessment.raw, /2026-10-30/);

    globalThis.__routeUserId = "trusted-reviewer";
    saved = await put({ ...input, sourceVerified: true });
    assert.equal(saved.status, 200, saved.raw);
    assert.equal(saved.body.verifiedBy, "trusted-reviewer");
    assert.equal((await request(server, "/api/transition-verifications")).body.length, 1);
    globalThis.__routeUserId = "test-user";
    assessment = await request(server, assessmentPath);
    const findings = assessment.body.findings.filter((f) => f.code.startsWith("transisi"));
    assert.equal(findings.find((f) => f.code === "transisi_konversi").transitionDate.slice(0, 10), "2026-10-30");
    assert.equal(findings.find((f) => f.code === "transisi_konversi").status, "tercatat");
    assert.ok(findings.filter((f) => f.code !== "transisi_konversi")
      .every((f) => f.status === "perlu_tinjauan" && !("transitionDate" in f)));

    globalThis.__routeUserId = "trusted-reviewer";
    assert.equal((await put({ ...input, issuedOn: "2026-03-31", sourceVerified: true }, "transisi")).status, 200);
    assert.equal((await put({ ...input, sourceVerified: true }, "transisi_operasional")).status, 200);
    globalThis.__routeUserId = "test-user";
    assessment = await request(server, assessmentPath);
    assert.equal(assessment.body.findings.find((f) => f.code === "transisi").transitionDate.slice(0, 10), "2026-09-30",
      "enam bulan dari tanggal penetapan memakai batas akhir bulan kalender");
    assert.equal(assessment.body.findings.find((f) => f.code === "transisi_operasional").transitionDate.slice(0, 10), "2026-04-30");
    assert.equal(assessment.body.findings.find((f) => f.code === "transisi_konversi").transitionDate.slice(0, 10), "2026-10-30");

    globalThis.__routeUserId = "trusted-reviewer";
    assert.equal((await put({ ...input, sourceVerified: true, documentStatus: "dicabut" })).status, 400);
    assert.equal((await put({ ...input, documentStatus: "dicabut" })).status, 200);
    globalThis.__routeUserId = "test-user";
    assessment = await request(server, assessmentPath);
    assert.equal(assessment.body.findings.find((f) => f.code === "transisi").status, "tercatat",
      "pencabutan satu alur tidak membatalkan verifikasi alur lain");
    assert.equal(assessment.body.findings.find((f) => f.code === "transisi_konversi").status, "perlu_tinjauan");
    assert.doesNotMatch(assessment.raw, /2026-10-30/);
    globalThis.__routeUserId = "trusted-reviewer";
    assert.equal((await put({ ...input, issuedOn: "2026-03-31", documentStatus: "dicabut" }, "transisi")).status, 200);
    assert.equal((await put({ ...input, documentStatus: "dicabut" }, "transisi_operasional")).status, 200);
    globalThis.__routeUserId = "test-user";
    assessment = await request(server, assessmentPath);
    assert.ok(assessment.body.findings.filter((f) => f.code.startsWith("transisi"))
      .every((f) => f.status === "perlu_tinjauan" && !("transitionDate" in f)));
    assert.doesNotMatch(assessment.raw, /2026-04-30|2026-10-30/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (oldAllowlist === undefined) delete process.env.SBU_VERIFIER_USER_IDS;
    else process.env.SBU_VERIFIER_USER_IDS = oldAllowlist;
    delete globalThis.__routeUserId;
    delete globalThis.__routeVerificationRows;
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidence;
    delete globalThis.__routeEvidenceReads;
  }
});

test("GET regulasi membaca status terbaru, aman, dan identik dengan temuan penilaian", async () => {
  const records = [];
  globalThis.__routeVerificationRows = records;
  globalThis.__routeCase = {
    id: 86, ownerId: "test-user", companyName: "Contoh Perpanjangan",
    requestType: "perpanjangan", qualification: "kecil", classification: "gedung",
    status: "draf", existingSbuExpiresOn: "2030-12-31",
    createdAt: new Date("2026-02-01T00:00:00Z"), updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidence = {
    id: 86, caseId: 86, code: "legalitas", title: "Catatan pemohon",
    note: "Klaim surat 2026-05-01 dan tenggat 2026-11-01",
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeEvidenceReads = 0;
  const server = app.listen(0);
  const assessmentPath = "/api/cases/86/assessment";
  const regulationsPath = "/api/regulations";
  const buildVerification = (track, overrides = {}) => ({
    track,
    publisher: "Ditjen Bina Konstruksi",
    sourceUrl: "https://pu.go.id/surat/contoh",
    documentNumber: `Surat ${track}`,
    signatory: "Direktur Jenderal",
    issuedOn: track === "transisi" ? "2026-03-31" : "2026-04-30",
    scope: "Pemberlakuan dan cakupan skema SBU",
    documentStatus: "berlaku",
    sourceVerified: true,
    expertName: "Penelaah Skema",
    expertOrganization: "LSBU Teridentifikasi",
    expertReview: "Cakupan dan pemicu alur telah ditelaah.",
    expertReviewedOn: "2026-05-01",
    expertApproved: true,
    verifiedBy: "private-reviewer-id",
    reviewerPrivateNote: "SHOULD_NEVER_BE_EXPOSED",
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  });
  async function assertParity(expectedStatuses) {
    const [regulations, assessment] = await Promise.all([
      request(server, regulationsPath),
      request(server, assessmentPath),
    ]);
    assert.equal(regulations.status, 200, regulations.raw);
    assert.equal(assessment.status, 200, assessment.raw);
    const byId = Object.fromEntries(regulations.body.map((item) => [item.id, item]));
    assert.equal(byId["kepdirjen-281-2026"].effectiveStatus, expectedStatuses.kepdirjen);
    assert.equal(byId["permen-6-2025"].effectiveStatus, expectedStatuses.permen);
    for (const regulation of regulations.body) {
      for (const finding of regulation.transitionFindings) {
        assert.deepEqual(finding, assessment.body.findings.find((item) => item.code === finding.code),
          `${finding.code} harus memakai logika dan tanggal yang sama pada kedua endpoint`);
      }
    }
    assert.ok(regulations.body.find((item) => item.id === "kepdirjen-281-2026")
      .transitionFindings.every((item) => item.code === "transisi"));
    assert.ok(byId["permen-6-2025"].transitionFindings.every((item) =>
      ["transisi_operasional", "transisi_konversi"].includes(item.code)));
    assert.doesNotMatch(regulations.raw, /private-reviewer-id|SHOULD_NEVER_BE_EXPOSED|2030-12-31|2026-05-01|2026-11-01/);
    return regulations.body;
  }

  try {
    await assertParity({ kepdirjen: "unverified", permen: "unverified" });
    records.push(buildVerification("transisi"));
    let regulations = await assertParity({ kepdirjen: "verified", permen: "unverified" });
    assert.equal(regulations.find((item) => item.id === "kepdirjen-281-2026")
      .transitionFindings[0].transitionDate.slice(0, 10), "2026-09-30");

    records.push(buildVerification("transisi_operasional"));
    await assertParity({ kepdirjen: "verified", permen: "partial" });
    records.push(buildVerification("transisi_konversi"));
    regulations = await assertParity({ kepdirjen: "verified", permen: "verified" });
    assert.deepEqual(regulations.find((item) => item.id === "permen-6-2025")
      .transitionFindings.map((finding) => finding.transitionDate.slice(0, 10)), ["2026-04-30", "2026-10-30"]);

    Object.assign(records.find((row) => row.track === "transisi"), { documentStatus: "dicabut" });
    await assertParity({ kepdirjen: "unverified", permen: "verified" });
    Object.assign(records.find((row) => row.track === "transisi_operasional"), { expertApproved: false });
    await assertParity({ kepdirjen: "unverified", permen: "partial" });
    Object.assign(records.find((row) => row.track === "transisi_konversi"), { expertReview: "" });
    regulations = await assertParity({ kepdirjen: "unverified", permen: "unverified" });
    assert.ok(regulations.flatMap((item) => item.transitionFindings)
      .every((finding) => finding.status === "perlu_tinjauan" && !("transitionDate" in finding)));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeVerificationRows;
    delete globalThis.__routeCase;
    delete globalThis.__routeEvidence;
    delete globalThis.__routeEvidenceReads;
  }
});

test("tanggal kalender SBU tersimpan utuh setelah buat, ubah, dan muat ulang kasus di kedua sisi UTC", async () => {
  const previousTZ = process.env.TZ;
  const server = app.listen(0);
  globalThis.__routeUserId = "test-user";
  globalThis.__routeProfileRows = [{
    userId: "test-user", role: "kontraktor", displayName: "Penguji", organizationName: "",
  }];
  try {
    for (const tz of ["America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      globalThis.__routeCaseRows = [];
      const input = {
        companyName: "Perpanjangan Contoh",
        requestType: "perpanjangan",
        qualification: "kecil",
        classification: "gedung",
        existingSbuExpiresOn: "2027-01-01",
      };
      const created = await request(server, "/api/cases", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      assert.equal(created.status, 201, `${tz}: ${created.raw}`);
      const id = created.body.id;
      const checkDate = (response, expected) => {
        assert.equal(response.status, 200, `${tz}: ${response.raw}`);
        assert.equal(response.body.existingSbuExpiresOn, `${expected}T00:00:00.000Z`,
          `${tz}: tanggal API harus tetap hari kalender yang dipilih`);
      };
      assert.equal(globalThis.__routeCaseRows[0].existingSbuExpiresOn, input.existingSbuExpiresOn,
        `${tz}: penyimpanan harus menggunakan tanggal saja, bukan timestamp`);
      // Rehydrate the persistence stub between requests, rather than returning the
      // same in-memory object from the write as if it were a fresh database read.
      globalThis.__routeCaseRows = structuredClone(globalThis.__routeCaseRows);
      checkDate(await request(server, `/api/cases/${id}`), input.existingSbuExpiresOn);

      const changedDate = "2027-04-15";
      const updated = await request(server, `/api/cases/${id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, existingSbuExpiresOn: changedDate }),
      });
      checkDate(updated, changedDate);
      assert.equal(globalThis.__routeCaseRows[0].existingSbuExpiresOn, changedDate,
        `${tz}: perubahan disimpan sebagai tanggal saja`);
      globalThis.__routeCaseRows = structuredClone(globalThis.__routeCaseRows);
      checkDate(await request(server, `/api/cases/${id}`), changedDate);
      const list = await request(server, "/api/cases");
      assert.equal(list.status, 200, `${tz}: ${list.raw}`);
      assert.equal(list.body.find((item) => item.id === id)?.existingSbuExpiresOn,
        `${changedDate}T00:00:00.000Z`, `${tz}: daftar kasus juga harus memuat tanggal yang sama`);
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeUserId;
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
    assert.deepEqual(firstList.body.map((item) => item.id), [73, 71]);
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

test("GET /api/cases menampilkan pembaruan terbaru lebih dulu, bukan urutan penyimpanan", async () => {
  const caseData = (id, day) => ({
    id,
    ownerId: "test-user",
    companyName: `Perusahaan ${id}`,
    requestType: "baru",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date(`2026-03-${String(day).padStart(2, "0")}T00:00:00Z`),
  });
  globalThis.__routeCaseRows = [
    caseData(81, 3), caseData(82, 1), caseData(83, 5), caseData(84, 2),
  ];
  const server = app.listen(0);
  try {
    const { status, body, raw } = await request(server, "/api/cases");
    assert.equal(status, 200, raw);
    assert.deepEqual(body.map((item) => item.id), [83, 81, 84, 82],
      "semua permohonan harus diurutkan menurun menurut updatedAt");
    assert.deepEqual(body.map((item) => item.updatedAt), [
      "2026-03-05T00:00:00.000Z",
      "2026-03-03T00:00:00.000Z",
      "2026-03-02T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
  }
});

test("GET /api/cases mempertahankan urutan ID untuk waktu pembaruan yang sama", async () => {
  const caseData = (id, day) => ({
    id,
    ownerId: "test-user",
    companyName: `Perusahaan ${id}`,
    requestType: "baru",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date(`2026-03-0${day}T00:00:00Z`),
  });
  globalThis.__routeCaseRows = [
    caseData(92, 2), caseData(95, 3), caseData(91, 2),
    caseData(94, 2), caseData(93, 1),
  ];
  const server = app.listen(0);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { status, body, raw } = await request(server, "/api/cases");
      assert.equal(status, 200, raw);
      assert.deepEqual(body.map((item) => item.id), [95, 94, 92, 91, 93],
        "tanggal terbaru lebih dulu; pada tanggal sama ID terbesar lebih dulu");
      globalThis.__routeCaseRows.reverse();
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
  }
});

test("validasi Dashboard dari OpenAPI menolak field hilang, tipe salah dan struktur recent rusak", async () => {
  globalThis.__routeCaseRows = [{
    id: 401, ownerId: "test-user", companyName: "Kontrak Dashboard",
    requestType: "perpanjangan", qualification: "kecil", classification: "gedung",
    status: "draf", existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  }];
  const server = app.listen(0);
  try {
    // Mutate actual HTTP JSON, not a duplicate of the generated response schema.
    const { status, body, raw } = await request(server, "/api/dashboard");
    assert.equal(status, 200, raw);
    assert.equal(body.recent.length, 1);
    const rejects = (value, keyword, instancePath, missingProperty) => {
      assert.equal(validateDashboard(value), false, `harus menolak ${JSON.stringify(value)}`);
      assert.ok(validateDashboard.errors.some((error) =>
        error.keyword === keyword && error.instancePath === instancePath &&
        (missingProperty === undefined || error.params.missingProperty === missingProperty)),
      dashboardAjv.errorsText(validateDashboard.errors));
    };
    for (const value of [null, [], "dashboard"]) rejects(value, "type", "");
    for (const field of openapi.components.schemas.Dashboard.required) {
      const missing = structuredClone(body);
      delete missing[field];
      rejects(missing, "required", "", field);
    }
    for (const field of ["total", "draft", "reviewing", "prepared"]) {
      for (const value of ["1", null, true, [], {}, 1.5]) {
        rejects({ ...body, [field]: value }, "type", `/${field}`);
      }
    }
    for (const value of [null, {}, "recent", 1]) {
      rejects({ ...body, recent: value }, "type", "/recent");
    }
    for (const value of [null, [], "case", 1]) {
      rejects({ ...body, recent: [value] }, "type", "/recent/0");
    }
    const item = body.recent[0];
    for (const field of openapi.components.schemas.SbuCase.required) {
      const missing = structuredClone(item);
      delete missing[field];
      rejects({ ...body, recent: [missing] }, "required", "/recent/0", field);
    }
    for (const field of Object.keys(openapi.components.schemas.SbuCase.properties)) {
      // An object is invalid for every scalar field, including optional clientId
      // and nullable existingSbuExpiresOn.
      rejects({ ...body, recent: [{ ...item, [field]: {} }] }, "type", `/recent/0/${field}`);
    }
    rejects({ ...body, recent: [{ ...item, id: "401" }] }, "type", "/recent/0/id");
    for (const field of ["requestType", "qualification", "status"]) {
      rejects({ ...body, recent: [{ ...item, [field]: "tidak-dikenal" }] }, "enum", `/recent/0/${field}`);
    }
    for (const field of ["createdAt", "updatedAt", "existingSbuExpiresOn"]) {
      rejects({ ...body, recent: [{ ...item, [field]: "bukan-tanggal" }] }, "format", `/recent/0/${field}`);
    }
    assert.ok(validateDashboard({ ...body, recent: [{ ...item, existingSbuExpiresOn: null }] }),
      dashboardAjv.errorsText(validateDashboard.errors));
    assert.ok(validateDashboard({ ...body, recent: [{ ...item, existingSbuExpiresOn: "2027-04-15" }] }),
      dashboardAjv.errorsText(validateDashboard.errors));

    // Specification drift must fail even while generated code and manual count
    // assertions still agree with the old response.
    const addedField = structuredClone(openapi.components.schemas);
    addedField.Dashboard.required.push("contractRevision");
    addedField.Dashboard.properties.contractRevision = { type: "integer" };
    const addedValidator = createResponseValidator(dashboardRef, addedField).validate;
    assert.equal(addedValidator(body), false, "field wajib baru Dashboard harus terdeteksi");
    assert.ok(addedValidator({ ...body, contractRevision: 1 }));

    const changedType = structuredClone(openapi.components.schemas);
    changedType.Dashboard.properties.total = { type: "string" };
    const changedValidator = createResponseValidator(dashboardRef, changedType).validate;
    assert.equal(changedValidator(body), false, "perubahan tipe Dashboard harus terdeteksi");
    assert.ok(changedValidator({ ...body, total: String(body.total) }));

    const changedItem = structuredClone(openapi.components.schemas);
    changedItem.SbuCase.required.push("contractRevision");
    changedItem.SbuCase.properties.contractRevision = { type: "integer" };
    const itemValidator = createResponseValidator(dashboardRef, changedItem).validate;
    assert.equal(itemValidator(body), false, "perubahan kontrak item recent harus terdeteksi melalui $ref");
    assert.ok(itemValidator({ ...body, recent: [{ ...item, contractRevision: 1 }] }));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
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
    assert.deepEqual(first.body.recent.map((item) => item.id), [98, 97, 96, 95, 93],
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
    assert.deepEqual(second.body.recent.map((item) => item.id), [94, 92]);
    assert.doesNotMatch(second.raw, /Pertama 9|first-owner|"id":91|"id":93|"id":95|"id":96|"id":97|"id":98/,
      "dashboard pemilik kedua tidak boleh memuat data pemilik pertama");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
  }
});

test("dashboard pengguna baru tetap kosong meski ada permohonan milik pengguna lain", async () => {
  globalThis.__routeUserId = "new-owner";
  globalThis.__routeCaseRows = [
    { id: 111, ownerId: "other-owner", companyName: "Rahasia Draf", status: "draf" },
    { id: 112, ownerId: "another-owner", companyName: "Rahasia Tinjau", status: "ditinjau" },
    { id: 113, ownerId: "other-owner", companyName: "Rahasia Siap", status: "selesai_persiapan" },
  ].map((item) => ({
    requestType: "baru",
    qualification: "kecil",
    classification: "gedung",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
    ...item,
  }));
  const server = app.listen(0);
  try {
    const { status, body, raw } = await request(server, "/api/dashboard");
    assert.equal(status, 200, raw);
    assert.deepEqual(
      { total: body.total, draft: body.draft, reviewing: body.reviewing, prepared: body.prepared },
      { total: 0, draft: 0, reviewing: 0, prepared: 0 },
    );
    assert.deepEqual(body.recent, []);
    assert.doesNotMatch(raw, /Rahasia|other-owner|another-owner|"id":11[123]/,
      "dashboard pengguna baru tidak boleh membocorkan data pemilik lain");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
  }
});

test("dashboard menampilkan lima permohonan terbaru menurut updatedAt, bukan urutan input", async () => {
  const caseData = (id, day) => ({
    id,
    ownerId: "test-user",
    companyName: `Perusahaan ${id}`,
    requestType: "baru",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date(`2026-03-${String(day).padStart(2, "0")}T00:00:00Z`),
  });
  globalThis.__routeCaseRows = [
    caseData(201, 2), caseData(202, 7), caseData(203, 1),
    caseData(204, 5), caseData(205, 3), caseData(206, 6), caseData(207, 4),
  ];
  const server = app.listen(0);
  try {
    const { status, body, raw } = await request(server, "/api/dashboard");
    assert.equal(status, 200, raw);
    assert.equal(body.total, 7);
    assert.deepEqual(body.recent.map((item) => item.id), [202, 206, 204, 207, 205],
      "recent harus memuat lima updatedAt terbesar dalam urutan menurun");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
  }
});

test("dashboard mempertahankan lima permohonan terbaru saat waktu pembaruan sama", async () => {
  const caseData = (id, day, status) => ({
    id,
    ownerId: "test-user",
    companyName: `Perusahaan ${id}`,
    requestType: "baru",
    qualification: "kecil",
    classification: "gedung",
    status,
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date(`2026-03-0${day}T00:00:00Z`),
  });
  globalThis.__routeCaseRows = [
    caseData(302, 2, "ditinjau"),
    caseData(299, 1, "ditinjau"),
    caseData(306, 2, "draf"),
    caseData(300, 3, "selesai_persiapan"),
    caseData(301, 2, "draf"),
    caseData(304, 2, "draf"),
    caseData(303, 2, "selesai_persiapan"),
    caseData(305, 2, "ditinjau"),
  ];
  const server = app.listen(0);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { status, body, raw } = await request(server, "/api/dashboard");
      assert.equal(status, 200, raw);
      assert.deepEqual(body.recent.map((item) => item.id), [300, 306, 305, 304, 303],
        "waktu terbaru lebih dulu; pada waktu sama ID terbesar menentukan lima teratas");
      assert.deepEqual(
        { total: body.total, draft: body.draft, reviewing: body.reviewing, prepared: body.prepared },
        { total: 8, draft: 3, reviewing: 3, prepared: 2 },
        "hitungan status tetap berasal dari seluruh permohonan, bukan lima teratas",
      );
      globalThis.__routeCaseRows.reverse();
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
  }
});

test("pengunjung tanpa sesi tidak dapat membaca ringkasan permohonan", async () => {
  globalThis.__routeUserId = null;
  globalThis.__routeCaseRows = [{
    id: 99,
    ownerId: "pemilik-rahasia",
    companyName: "Perusahaan Rahasia Dashboard",
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
    const response = await request(server, "/api/dashboard");
    assert.equal(response.status, 401, response.raw);
    assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
    assert.doesNotMatch(response.raw,
      /total|draft|reviewing|prepared|recent|Perusahaan Rahasia Dashboard|pemilik-rahasia|gedung-privat|2027-04-15|"id":99|ownerId|companyName/i,
      "ringkasan tidak boleh memuat jumlah atau data permohonan privat");
    assert.equal(globalThis.__routeCaseReads, 0, "tabel kasus tidak boleh dibaca sebelum masuk");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeCaseReads;
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

test("GET /api/me tanpa sesi menolak akses tanpa membaca atau membuat profil", async () => {
  const privateProfile = {
    userId: "pemilik-profil-rahasia",
    role: "kontraktor",
    displayName: "Nama Profil Rahasia",
    organizationName: "Organisasi Privat",
  };
  globalThis.__routeUserId = null;
  globalThis.__routeProfileRows = [structuredClone(privateProfile)];
  globalThis.__routeProfileReads = 0;
  globalThis.__routeProfileWrites = 0;

  const server = app.listen(0);
  try {
    const response = await request(server, "/api/me");
    assert.equal(response.status, 401, response.raw);
    assert.deepEqual(response.body, { error: "Silakan masuk untuk melanjutkan." });
    assert.doesNotMatch(response.raw,
      /pemilik-profil-rahasia|Nama Profil Rahasia|Organisasi Privat|userId|role|displayName|organizationName/,
      "respons tidak boleh memuat data profil");
    assert.equal(globalThis.__routeProfileReads, 0, "profil tidak boleh dibaca sebelum masuk");
    assert.equal(globalThis.__routeProfileWrites, 0, "profil tidak boleh dibuat sebelum masuk");
    assert.deepEqual(globalThis.__routeProfileRows, [privateProfile], "profil yang ada tidak boleh berubah");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeProfileReads;
    delete globalThis.__routeProfileWrites;
  }
});

test("GET /api/me membuat satu profil awal hanya untuk pemilik sesi baru", async () => {
  const otherProfile = {
    userId: "pemilik-profil-lain",
    role: "konsultan",
    displayName: "Nama Privat",
    organizationName: "Organisasi Privat",
  };
  const userId = "pengguna-baru";
  const initialProfile = {
    userId,
    role: "belum_dipilih",
    displayName: "",
    organizationName: "",
  };
  const expectedResponse = {
    userId,
    role: initialProfile.role,
    displayName: initialProfile.displayName,
    organizationName: initialProfile.organizationName,
  };
  globalThis.__routeUserId = userId;
  globalThis.__routeProfileRows = [structuredClone(otherProfile)];

  const server = app.listen(0);
  try {
    const first = await request(server, "/api/me");
    assert.equal(first.status, 200, first.raw);
    assert.deepEqual(first.body, expectedResponse, "respons hanya memuat nilai baku sesuai kontrak");
    assert.deepEqual(globalThis.__routeProfileRows, [otherProfile, initialProfile],
      "hanya profil ID sesi yang dibuat, tanpa mengubah profil orang lain");

    const second = await request(server, "/api/me");
    assert.equal(second.status, 200, second.raw);
    assert.deepEqual(second.body, expectedResponse, "respons tetap sama pada permintaan kedua");
    assert.deepEqual(globalThis.__routeProfileRows, [otherProfile, initialProfile],
      "permintaan kedua tidak boleh menggandakan atau mengubah profil");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
  }
});

test("GET /api/me hanya menampilkan profil pengguna yang masuk", async () => {
  const firstProfile = {
    userId: "pemilik-profil-pertama",
    role: "kontraktor",
    displayName: "Nama Pertama Privat",
    organizationName: "Organisasi Pertama Privat",
  };
  const secondProfile = {
    userId: "pemilik-profil-kedua",
    role: "konsultan",
    displayName: "Nama Kedua Rahasia",
    organizationName: "Organisasi Kedua Rahasia",
  };
  globalThis.__routeProfileRows = [structuredClone(firstProfile), structuredClone(secondProfile)];
  const server = app.listen(0);
  try {
    for (const [current, other] of [[firstProfile, secondProfile], [secondProfile, firstProfile]]) {
      globalThis.__routeUserId = current.userId;
      const response = await request(server, "/api/me");
      assert.equal(response.status, 200, response.raw);
      assert.deepEqual(response.body, {
        userId: current.userId,
        role: current.role,
        displayName: current.displayName,
        organizationName: current.organizationName,
      }, `respons harus berisi profil ${current.userId} saja`);
      for (const value of [other.userId, other.displayName, other.organizationName]) {
        assert.ok(!response.raw.includes(value), `respons ${current.userId} tidak boleh memuat ${value}`);
      }
    }
    assert.deepEqual(globalThis.__routeProfileRows, [firstProfile, secondProfile],
      "membaca profil tidak boleh mengubah data pengguna lain");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
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

test("POST /api/cases mengabaikan ownerId orang lain dalam body dan menyimpan pemilik dari sesi", async () => {
  const sessionOwner = "owner-sesi";
  const forgedOwner = "owner-orang-lain";
  globalThis.__routeUserId = sessionOwner;
  globalThis.__routeProfileRows = [
    { userId: sessionOwner, role: "kontraktor" },
    { userId: forgedOwner, role: "konsultan" },
  ];
  globalThis.__routeCaseRows = [];
  globalThis.__routeCaseWrites = 0;
  const server = app.listen(0);
  try {
    const created = await request(server, "/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerId: forgedOwner,
        companyName: "Permohonan Pemilik Sesi",
        requestType: "baru",
        qualification: "kecil",
        classification: "gedung",
        existingSbuExpiresOn: null,
      }),
    });
    assert.equal(created.status, 201, created.raw);
    assert.equal(created.body.companyName, "Permohonan Pemilik Sesi");
    assert.equal(created.body.status, "draf");
    assert.equal(created.body.ownerId, undefined, "respons tidak mengungkap ownerId di luar kontrak");
    assert.doesNotMatch(created.raw, /owner-orang-lain/, "respons tidak boleh memakai identitas palsu");
    assert.equal(globalThis.__routeCaseWrites, 1, "hanya satu permohonan dibuat");
    assert.equal(globalThis.__routeCaseRows.length, 1);
    assert.equal(globalThis.__routeCaseRows[0].id, created.body.id);
    assert.equal(globalThis.__routeCaseRows[0].ownerId, sessionOwner,
      "baris tersimpan harus dimiliki pengguna dari sesi, bukan dari body");
    assert.ok(!globalThis.__routeCaseRows.some((item) => item.ownerId === forgedOwner));

    const ownDetail = await request(server, `/api/cases/${created.body.id}`);
    assert.equal(ownDetail.status, 200, ownDetail.raw);
    assert.equal(ownDetail.body.companyName, created.body.companyName);
    globalThis.__routeUserId = forgedOwner;
    const otherDetail = await request(server, `/api/cases/${created.body.id}`);
    assert.equal(otherDetail.status, 404, otherDetail.raw);
    assert.deepEqual(otherDetail.body, { error: "Permohonan tidak ditemukan." });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeCaseWrites;
  }
});

test("POST /api/cases dengan sesi sah menolak data tidak valid sebelum membuat profil atau permohonan", async () => {
  globalThis.__routeUserId = "owner-baru";
  globalThis.__routeProfileRows = [];
  globalThis.__routeCaseRows = [];
  globalThis.__routeProfileWrites = 0;
  globalThis.__routeCaseWrites = 0;
  const server = app.listen(0);
  try {
    const response = await request(server, "/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        companyName: "", requestType: "baru", qualification: "kecil",
        classification: "gedung", existingSbuExpiresOn: null,
      }),
    });
    assert.equal(response.status, 400, response.raw);
    assert.equal(response.body.error, "Data permohonan tidak valid.");
    assert.equal(globalThis.__routeProfileWrites, 0, "validasi harus mendahului pembuatan profil");
    assert.equal(globalThis.__routeCaseWrites, 0, "permohonan tidak boleh ditulis");
    assert.deepEqual(globalThis.__routeProfileRows, [], "profil baru tidak boleh dibuat");
    assert.deepEqual(globalThis.__routeCaseRows, [], "permohonan baru tidak boleh dibuat");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeProfileWrites;
    delete globalThis.__routeCaseWrites;
  }
});

test("POST /api/cases menolak peran selain kontraktor dan konsultan tanpa menulis permohonan", async () => {
  globalThis.__routeCaseRows = [];
  globalThis.__routeProfileRows = [
    { userId: "owner-profesional", role: "profesional" },
    { userId: "owner-asosiasi", role: "asosiasi" },
    { userId: "owner-belum_dipilih", role: "belum_dipilih" },
  ];
  globalThis.__routeCaseWrites = 0;
  const server = app.listen(0);
  try {
    for (const role of ["profesional", "asosiasi", "belum_dipilih"]) {
      globalThis.__routeUserId = `owner-${role}`;
      const response = await request(server, "/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: `Permohonan ${role}`,
          requestType: "baru",
          qualification: "kecil",
          classification: "gedung",
          existingSbuExpiresOn: null,
        }),
      });
      assert.equal(response.status, 403, `${role}: ${response.raw}`);
      assert.deepEqual(response.body,
        { error: "Ruang kerja SBU saat ini tersedia untuk peran kontraktor dan konsultan." });
      assert.equal(globalThis.__routeCaseWrites, 0, `${role} tidak boleh mencoba menulis permohonan`);
      assert.deepEqual(globalThis.__routeCaseRows, [], `${role} tidak boleh membuat permohonan`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeCaseWrites;
  }
});

test("PATCH /api/me dengan sesi sah menolak profil tidak valid tanpa menulis atau mengubah profil awal", async () => {
  const original = {
    userId: "profile-owner", role: "kontraktor",
    displayName: "Nama Asli", organizationName: "Perusahaan Asli",
  };
  globalThis.__routeUserId = original.userId;
  globalThis.__routeProfileRows = [structuredClone(original)];
  globalThis.__routeProfileWrites = 0;
  const server = app.listen(0);
  try {
    for (const body of [
      { role: "peran-tidak-dikenal", displayName: "Nama Baru", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: "", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: "   ", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: "\t \n\u00a0", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: "\u200b", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: " \u200b\u200c\u200d\u2060\ufeff\t", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: "\u00ad\u034f\u061c\u202e", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: "\u0600\u06dd\u070f\ufff9", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: " \u{e0001}\u{e0020}\u{e007f} ", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: "\ufe0f", organizationName: "Perusahaan Baru" },
      { role: "konsultan", displayName: " \u{e0100}\ufe0f\u200d ", organizationName: "Perusahaan Baru" },
    ]) {
      const response = await request(server, "/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, response.raw);
      assert.equal(response.body.error, "Profil tidak valid.");
      assert.equal(globalThis.__routeProfileWrites, 0, "isi tidak valid tidak boleh mencoba menulis profil");
      assert.deepEqual(globalThis.__routeProfileRows, [original], "profil awal harus tetap utuh");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
    delete globalThis.__routeProfileWrites;
  }
});

test("PATCH /api/me menerima nama berbagai aksara termasuk joiner dalam nama yang terlihat", async () => {
  const original = {
    userId: "profile-owner", role: "kontraktor",
    displayName: "Nama Asli", organizationName: "Perusahaan Asli",
  };
  globalThis.__routeUserId = original.userId;
  globalThis.__routeProfileRows = [structuredClone(original)];
  globalThis.__routeProfileWrites = 0;
  const server = app.listen(0);
  try {
    for (const displayName of ["محمد", "李 小龍", "क\u200dिरण", "Élodie", "ᮃᮔ᮪ᮓᮤ", "Nama \ufe0f\u{e0100}"]) {
      const response = await request(server, "/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "konsultan", displayName, organizationName: "Perusahaan Baru" }),
      });
      assert.equal(response.status, 200, `${displayName}: ${response.raw}`);
      assert.equal(response.body.displayName, displayName);
      assert.equal(globalThis.__routeProfileRows[0].displayName, displayName);
    }
    assert.equal(globalThis.__routeProfileWrites, 6);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
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
      userId: original.userId,
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

test("GET /api/me menampilkan seluruh perubahan profil dari PATCH berikutnya tanpa mengubah profil pengguna lain", async () => {
  const ownId = "pemilik-profil-diperbarui";
  const otherProfile = {
    userId: "pemilik-profil-lain",
    role: "profesional",
    displayName: "Nama Pengguna Lain",
    organizationName: "Organisasi Pengguna Lain",
  };
  const changes = {
    role: "konsultan",
    displayName: "Nama Baru",
    organizationName: "Organisasi Baru",
  };
  globalThis.__routeUserId = ownId;
  globalThis.__routeProfileRows = [
    { userId: ownId, role: "kontraktor", displayName: "Nama Lama", organizationName: "Organisasi Lama" },
    structuredClone(otherProfile),
  ];
  const server = app.listen(0);
  try {
    const patched = await request(server, "/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(changes),
    });
    assert.equal(patched.status, 200, patched.raw);
    const expectedResponse = { userId: ownId, ...changes };
    assert.deepEqual(patched.body, expectedResponse);
    for (const value of [otherProfile.userId, otherProfile.displayName, otherProfile.organizationName]) {
      assert.ok(!patched.raw.includes(value), `PATCH tidak boleh membocorkan ${value}`);
    }

    const reopened = await request(server, "/api/me");
    assert.equal(reopened.status, 200, reopened.raw);
    assert.deepEqual(reopened.body, expectedResponse, "GET berikutnya harus membaca semua nilai profil yang tersimpan");
    assert.deepEqual(globalThis.__routeProfileRows, [
      { userId: ownId, ...changes },
      otherProfile,
    ], "membaca kembali tidak boleh mengubah profil pengguna lain");

    globalThis.__routeUserId = otherProfile.userId;
    const other = await request(server, "/api/me");
    assert.equal(other.status, 200, other.raw);
    assert.deepEqual(other.body, {
      userId: otherProfile.userId,
      role: otherProfile.role,
      displayName: otherProfile.displayName,
      organizationName: otherProfile.organizationName,
    }, "pengguna lain tetap membaca profil aslinya");
    assert.deepEqual(globalThis.__routeProfileRows[1], otherProfile);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeProfileRows;
  }
});

test("PATCH /api/me mengabaikan userId pihak lain dalam isi permintaan saat upsert profil", async () => {
  const ownId = "pengguna-masuk";
  const otherId = "pengguna-lain";
  const otherProfile = {
    userId: otherId, role: "profesional", displayName: "Nama Pengguna Lain",
    organizationName: "Organisasi Pengguna Lain",
  };
  const changes = {
    role: "konsultan", displayName: "Nama Pengguna Masuk",
    organizationName: "Organisasi Pengguna Masuk",
  };
  globalThis.__routeUserId = ownId;
  globalThis.__routeProfileRows = [];
  globalThis.__routeProfileWrites = 0;
  const server = app.listen(0);
  try {
    for (const { description, initialRows, targetId } of [
      {
        description: "memperbarui profil sendiri tanpa mengubah profil pihak lain",
        initialRows: [
          { userId: ownId, role: "kontraktor", displayName: "Nama Lama", organizationName: "Organisasi Lama" },
          structuredClone(otherProfile),
        ],
        targetId: otherId,
      },
      {
        description: "membuat profil sendiri tanpa membuat profil untuk ID pihak lain",
        initialRows: [],
        targetId: "pengguna-lain-belum-ada",
      },
    ]) {
      globalThis.__routeProfileRows = initialRows;
      const response = await request(server, "/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: targetId, ...changes }),
      });
      assert.equal(response.status, 200, `${description}: ${response.raw}`);
      assert.deepEqual(response.body, { userId: ownId, ...changes }, description);
      for (const value of [targetId, otherProfile.displayName, otherProfile.organizationName]) {
        assert.ok(!response.raw.includes(value), `${description}: respons tidak boleh membocorkan ${value}`);
      }
      assert.deepEqual(globalThis.__routeProfileRows, [
        { userId: ownId, ...changes },
        ...initialRows.filter((row) => row.userId === otherId),
      ], description);
      assert.equal(globalThis.__routeProfileRows.some((row) => row.userId === targetId),
        targetId === otherId, description);
      if (targetId === otherId) assert.deepEqual(globalThis.__routeProfileRows[1], otherProfile);
    }
    assert.equal(globalThis.__routeProfileWrites, 2, "kedua upsert hanya menulis profil pemilik sesi");
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

test("PATCH /api/cases/:id mengabaikan ownerId orang lain dan menjaga pemilik dari sesi", async () => {
  const sessionOwner = "owner-sesi";
  const forgedOwner = "owner-orang-lain";
  const original = {
    id: 59,
    ownerId: sessionOwner,
    companyName: "Perusahaan Awal",
    requestType: "baru",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: null,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeCaseRows = [structuredClone(original)];
  globalThis.__routeUserId = sessionOwner;
  globalThis.__routeCaseWrites = 0;
  const server = app.listen(0);
  const casePath = "/api/cases/59";
  try {
    const before = await request(server, casePath);
    assert.equal(before.status, 200, before.raw);

    const updated = await request(server, casePath, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerId: forgedOwner, companyName: "Perusahaan Baru" }),
    });
    assert.equal(updated.status, 200, updated.raw);
    assert.equal(globalThis.__routeCaseWrites, 1, "perubahan data yang sah harus disimpan");
    const saved = globalThis.__routeCaseRows[0];
    assert.equal(saved.ownerId, sessionOwner, "ownerId dari body tidak boleh mengganti pemilik");
    assert.deepEqual(saved, {
      ...original,
      companyName: "Perusahaan Baru",
      updatedAt: saved.updatedAt,
    });
    assert.ok(saved.updatedAt > original.updatedAt);
    assert.deepEqual(updated.body, {
      ...before.body,
      companyName: "Perusahaan Baru",
      updatedAt: saved.updatedAt.toISOString(),
    }, "respons PATCH harus mengikuti kontrak tanpa ownerId dan memuat perubahan sah");
    assert.equal(updated.body.ownerId, undefined);
    assert.doesNotMatch(updated.raw, /owner-orang-lain/);

    const ownDetail = await request(server, casePath);
    assert.equal(ownDetail.status, 200, ownDetail.raw);
    assert.deepEqual(ownDetail.body, updated.body);
    globalThis.__routeUserId = forgedOwner;
    const otherDetail = await request(server, casePath);
    assert.equal(otherDetail.status, 404, otherDetail.raw);
    assert.deepEqual(otherDetail.body, { error: "Permohonan tidak ditemukan." });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseWrites;
  }
});

test("PATCH satu kolom oleh pemilik mempertahankan semua isian permohonan yang tidak dikirim", async () => {
  const original = {
    id: 58,
    ownerId: "case-owner",
    companyName: "Perusahaan Awal",
    requestType: "perpanjangan",
    qualification: "menengah",
    classification: "instalasi mekanikal",
    status: "ditinjau",
    existingSbuExpiresOn: "2027-04-15",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeCaseRows = [structuredClone(original)];
  globalThis.__routeUserId = "case-owner";
  const server = app.listen(0);
  const casePath = "/api/cases/58";
  try {
    const before = await request(server, casePath);
    assert.equal(before.status, 200, before.raw);

    const updated = await request(server, casePath, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName: "Perusahaan Baru" }),
    });
    assert.equal(updated.status, 200, updated.raw);

    const saved = globalThis.__routeCaseRows[0];
    assert.ok(saved.updatedAt > original.updatedAt, "waktu pembaruan harus berubah");
    assert.deepEqual(saved, {
      ...original,
      companyName: "Perusahaan Baru",
      updatedAt: saved.updatedAt,
    }, "data tersimpan harus mempertahankan semua kolom yang tidak dikirim");

    const reopened = await request(server, casePath);
    assert.equal(reopened.status, 200, reopened.raw);
    assert.deepEqual(reopened.body, {
      ...before.body,
      companyName: "Perusahaan Baru",
      updatedAt: saved.updatedAt.toISOString(),
    }, "GET berikutnya harus menampilkan kolom yang diubah tanpa kehilangan isian lain");
    assert.deepEqual(updated.body, reopened.body, "respons PATCH harus sesuai dengan data tersimpan");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
  }
});

test("PATCH tanggal SBU dengan null mengosongkan tanggal tanpa mengubah kolom permohonan lain", async () => {
  const original = {
    id: 56,
    ownerId: "case-owner",
    companyName: "Perusahaan Awal",
    requestType: "perpanjangan",
    qualification: "menengah",
    classification: "instalasi mekanikal",
    status: "ditinjau",
    existingSbuExpiresOn: "2027-04-15",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeCaseRows = [structuredClone(original)];
  globalThis.__routeUserId = "case-owner";
  globalThis.__routeCaseWrites = 0;
  const server = app.listen(0);
  const casePath = "/api/cases/56";
  try {
    const before = await request(server, casePath);
    assert.equal(before.status, 200, before.raw);
    assert.equal(before.body.existingSbuExpiresOn, "2027-04-15T00:00:00.000Z");

    const updated = await request(server, casePath, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ existingSbuExpiresOn: null }),
    });
    assert.equal(updated.status, 200, updated.raw);
    assert.equal(globalThis.__routeCaseWrites, 1, "pengosongan tanggal harus disimpan");

    const saved = globalThis.__routeCaseRows[0];
    assert.ok(saved.updatedAt > original.updatedAt, "waktu pembaruan harus berubah");
    assert.deepEqual(saved, {
      ...original,
      existingSbuExpiresOn: null,
      updatedAt: saved.updatedAt,
    }, "hanya tanggal SBU dan waktu pembaruan yang boleh berubah di data tersimpan");
    assert.deepEqual(updated.body, {
      ...before.body,
      existingSbuExpiresOn: null,
      updatedAt: saved.updatedAt.toISOString(),
    }, "respons PATCH harus mempertahankan semua isian lain");

    globalThis.__routeCaseRows = structuredClone(globalThis.__routeCaseRows);
    const reopened = await request(server, casePath);
    assert.equal(reopened.status, 200, reopened.raw);
    assert.deepEqual(reopened.body, updated.body, "GET berikutnya harus memuat tanggal kosong dan isian lain tetap");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseWrites;
  }
});

test("PATCH /api/cases/:id menolak perubahan tidak valid atau kosong dari pemilik tanpa mengubah kasus", async () => {
  const original = {
    id: 57,
    ownerId: "case-owner",
    companyName: "Perusahaan Asli",
    requestType: "perpanjangan",
    qualification: "kecil",
    classification: "gedung",
    status: "draf",
    existingSbuExpiresOn: "2027-04-15",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  globalThis.__routeCaseRows = [structuredClone(original)];
  globalThis.__routeUserId = "case-owner";
  globalThis.__routeCaseWrites = 0;
  const server = app.listen(0);
  const casePath = "/api/cases/57";
  try {
    const before = await request(server, casePath);
    assert.equal(before.status, 200, before.raw);

    for (const { label, options } of [
      { label: "jenis permohonan tidak valid", options: {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName: "Perusahaan Baru", requestType: "tidak-dikenal" }),
      } },
      { label: "nama perusahaan terlalu pendek", options: {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName: "X" }),
      } },
      { label: "objek kosong", options: {
        method: "PATCH", headers: { "content-type": "application/json" }, body: "{}",
      } },
      { label: "tanpa isi", options: { method: "PATCH" } },
    ]) {
      const response = await request(server, casePath, options);
      assert.equal(response.status, 400, `${label}: ${response.raw}`);
      assert.deepEqual(response.body, { error: "Perubahan tidak valid." }, label);
      assert.equal(globalThis.__routeCaseWrites, 0, `${label}: tidak boleh mencoba menulis kasus`);
      assert.deepEqual(globalThis.__routeCaseRows, [original], `${label}: kasus tersimpan harus tetap utuh`);
      const after = await request(server, casePath);
      assert.equal(after.status, 200, `${label}: ${after.raw}`);
      assert.deepEqual(after.body, before.body, `${label}: detail kasus tidak boleh berubah`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseWrites;
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

test("daftar bukti menampilkan catatan paling baru diperbarui lebih dulu", async () => {
  globalThis.__routeUserId = "case-owner";
  globalThis.__routeCaseRows = [{ id: 43, ownerId: "case-owner" }];
  globalThis.__routeEvidenceRows = [
    { id: 1, caseId: 43, code: "legalitas", title: "Bukti tengah",
      note: "Diperbarui kedua", updatedAt: new Date("2026-02-02T00:00:00Z") },
    { id: 2, caseId: 43, code: "pajak", title: "Bukti lama",
      note: "Diperbarui pertama", updatedAt: new Date("2026-02-01T00:00:00Z") },
    { id: 3, caseId: 43, code: "personel", title: "Bukti terbaru",
      note: "Diperbarui terakhir", updatedAt: new Date("2026-02-03T00:00:00Z") },
  ];
  globalThis.__routeEvidenceReads = 0;
  const server = app.listen(0);
  try {
    const { status, body, raw } = await request(server, "/api/cases/43/evidence");
    assert.equal(status, 200, raw);
    assert.deepEqual(body.map((item) => item.id), [3, 1, 2],
      "urutan respons mengikuti updatedAt menurun, bukan urutan penyimpanan");
    assert.deepEqual(body.map((item) => item.updatedAt), [
      "2026-02-03T00:00:00.000Z",
      "2026-02-02T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
    ]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
  }
});

test("daftar bukti memakai ID menurun saat waktu pembaruan sama, tanpa bergantung urutan penyimpanan", async () => {
  globalThis.__routeUserId = "case-owner";
  globalThis.__routeCaseRows = [{ id: 43, ownerId: "case-owner" }];
  globalThis.__routeEvidenceRows = [
    { id: 2, caseId: 43, code: "legalitas", title: "Bukti dua",
      note: "Waktu terbaru sama", updatedAt: new Date("2026-02-03T00:00:00Z") },
    { id: 4, caseId: 43, code: "pajak", title: "Bukti empat",
      note: "Waktu lama sama", updatedAt: new Date("2026-02-01T00:00:00Z") },
    { id: 1, caseId: 43, code: "personel", title: "Bukti satu",
      note: "Waktu lama sama", updatedAt: new Date("2026-02-01T00:00:00Z") },
    { id: 7, caseId: 43, code: "pengalaman", title: "Bukti tujuh",
      note: "Waktu terbaru sama", updatedAt: new Date("2026-02-03T00:00:00Z") },
  ];
  globalThis.__routeEvidenceReads = 0;
  const server = app.listen(0);
  try {
    for (const rows of [
      globalThis.__routeEvidenceRows,
      [...globalThis.__routeEvidenceRows].reverse(),
    ]) {
      globalThis.__routeEvidenceRows = rows;
      const { status, body, raw } = await request(server, "/api/cases/43/evidence");
      assert.equal(status, 200, raw);
      assert.deepEqual(body.map((item) => item.id), [7, 2, 4, 1],
        "updatedAt tetap utama; ID menurun memutus seri tanpa bergantung urutan baris asal");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
  }
});

test("bukti yang diedit lewat PATCH naik ke urutan teratas pada GET berikutnya", async () => {
  globalThis.__routeUserId = "case-owner";
  globalThis.__routeCaseRows = [{ id: 46, ownerId: "case-owner" }];
  globalThis.__routeEvidenceRows = [
    { id: 1, caseId: 46, code: "legalitas", title: "Bukti tertua",
      note: "Sebelum edit", updatedAt: new Date("2020-01-01T00:00:00Z") },
    { id: 2, caseId: 46, code: "pajak", title: "Bukti terbaru",
      note: "Tetap", updatedAt: new Date("2020-03-01T00:00:00Z") },
    { id: 3, caseId: 46, code: "personel", title: "Bukti tengah",
      note: "Tetap", updatedAt: new Date("2020-02-01T00:00:00Z") },
  ];
  globalThis.__routeEvidenceReads = 0;
  globalThis.__routeEvidenceWrites = 0;
  const server = app.listen(0);
  const evidencePath = "/api/cases/46/evidence";
  try {
    const before = await request(server, evidencePath);
    assert.equal(before.status, 200, before.raw);
    assert.deepEqual(before.body.map((item) => item.id), [2, 3, 1]);
    const oldUpdatedAt = before.body[2].updatedAt;

    const patched = await request(server, `${evidencePath}/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "Sesudah edit" }),
    });
    assert.equal(patched.status, 200, patched.raw);
    assert.equal(patched.body.id, 1);
    assert.equal(patched.body.note, "Sesudah edit");
    assert.ok(new Date(patched.body.updatedAt).getTime() > new Date(oldUpdatedAt).getTime(),
      "PATCH harus memperbarui waktu catatan bukti");

    const after = await request(server, evidencePath);
    assert.equal(after.status, 200, after.raw);
    assert.deepEqual(after.body.map((item) => item.id), [1, 2, 3],
      "catatan yang diedit harus naik dari posisi terakhir ke teratas");
    assert.equal(after.body[0].note, "Sesudah edit");
    assert.equal(after.body[0].updatedAt, patched.body.updatedAt);
    assert.ok(new Date(after.body[0].updatedAt).getTime() >
      new Date(after.body[1].updatedAt).getTime());
    assert.equal(globalThis.__routeEvidenceWrites, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeEvidenceWrites;
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

test("caseId pada isi POST bukti tidak dapat mengalihkan catatan dari permohonan pada URL", async () => {
  globalThis.__routeUserId = "case-owner";
  globalThis.__routeCaseRows = [
    { id: 70, ownerId: "case-owner" },
    { id: 71, ownerId: "case-owner" },
    { id: 72, ownerId: "other-owner" },
  ];
  const existing = {
    id: 10, caseId: 72, code: "legalitas", title: "Bukti pemilik lain",
    note: "Tetap privat", updatedAt: new Date("2026-02-01T00:00:00Z"),
  };
  globalThis.__routeEvidenceRows = [structuredClone(existing)];
  globalThis.__routeEvidenceReads = 0;
  globalThis.__routeEvidenceWrites = 0;
  const server = app.listen(0);
  try {
    for (const [target, code] of [[71, "pajak"], [72, "personel"]]) {
      const response = await request(server, "/api/cases/70/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: target, code, title: `Bukti ${code}`, note: "Catatan baru" }),
      });
      assert.equal(response.status, 201, response.raw);
      assert.equal(response.body.caseId, 70, "respons harus mengikuti ID URL");
      assert.equal(response.body.code, code);
      const saved = globalThis.__routeEvidenceRows.find((row) => row.id === response.body.id);
      assert.equal(saved?.caseId, 70, "baris tersimpan harus mengikuti ID URL");
      assert.equal(saved?.note, "Catatan baru");
    }
    assert.equal(globalThis.__routeEvidenceWrites, 2);
    assert.deepEqual(globalThis.__routeEvidenceRows.filter((row) => row.caseId === 72), [existing],
      "catatan milik pengguna lain tidak boleh berubah");
    assert.deepEqual(globalThis.__routeEvidenceRows.filter((row) => row.caseId === 71), [],
      "permohonan lain milik pengguna yang sama tidak boleh menerima catatan");
    const source = await request(server, "/api/cases/70/evidence");
    const other = await request(server, "/api/cases/71/evidence");
    assert.equal(source.status, 200, source.raw);
    assert.deepEqual(source.body.map((row) => row.caseId), [70, 70]);
    assert.equal(other.status, 200, other.raw);
    assert.deepEqual(other.body, []);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeEvidenceWrites;
  }
});

test("caseId pada isi PATCH bukti tidak dapat memindahkan catatan dari permohonan pada URL", async () => {
  globalThis.__routeUserId = "case-owner";
  globalThis.__routeCaseRows = [
    { id: 70, ownerId: "case-owner" },
    { id: 71, ownerId: "case-owner" },
    { id: 72, ownerId: "other-owner" },
  ];
  const original = {
    id: 10, caseId: 70, code: "legalitas", title: "Bukti asal",
    note: "Catatan awal", updatedAt: new Date("2026-02-01T00:00:00Z"),
  };
  const sameOwnerTarget = {
    id: 11, caseId: 71, code: "pajak", title: "Bukti tujuan",
    note: "Tidak berubah", updatedAt: new Date("2026-02-02T00:00:00Z"),
  };
  const otherOwnerTarget = {
    id: 12, caseId: 72, code: "personel", title: "Bukti privat",
    note: "Tetap privat", updatedAt: new Date("2026-02-03T00:00:00Z"),
  };
  globalThis.__routeEvidenceRows = [
    structuredClone(original), structuredClone(sameOwnerTarget), structuredClone(otherOwnerTarget),
  ];
  globalThis.__routeEvidenceReads = 0;
  globalThis.__routeEvidenceWrites = 0;
  const server = app.listen(0);
  try {
    for (const target of [71, 72]) {
      const response = await request(server, "/api/cases/70/evidence/10", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: target, title: `Bukti terbaru ${target}`, note: `Edit ${target}` }),
      });
      assert.equal(response.status, 200, response.raw);
      assert.equal(response.body.id, 10);
      assert.equal(response.body.caseId, 70, "respons harus mengikuti ID URL");
      assert.equal(response.body.title, `Bukti terbaru ${target}`);
      assert.equal(response.body.note, `Edit ${target}`);
      assert.equal(globalThis.__routeEvidenceRows[0].caseId, 70,
        "baris tersimpan harus tetap di permohonan asal");
      assert.deepEqual(globalThis.__routeEvidenceRows[1], sameOwnerTarget,
        "permohonan tujuan milik pengguna yang sama tidak berubah");
      assert.deepEqual(globalThis.__routeEvidenceRows[2], otherOwnerTarget,
        "permohonan tujuan milik pengguna lain tidak berubah");
    }
    assert.equal(globalThis.__routeEvidenceWrites, 2);
    const source = await request(server, "/api/cases/70/evidence");
    const other = await request(server, "/api/cases/71/evidence");
    assert.equal(source.status, 200, source.raw);
    assert.deepEqual(source.body.map((row) => row.id), [10]);
    assert.equal(other.status, 200, other.raw);
    assert.deepEqual(other.body.map((row) => row.id), [11]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.__routeUserId;
    delete globalThis.__routeCaseRows;
    delete globalThis.__routeEvidenceRows;
    delete globalThis.__routeEvidenceReads;
    delete globalThis.__routeEvidenceWrites;
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