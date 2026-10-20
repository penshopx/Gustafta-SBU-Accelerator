import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./sbu-assessment-clerk.test.mjs", import.meta.url));
const mutation = fileURLToPath(new URL("./helpers/sbu-clerk-without-azp.mjs", import.meta.url));
const syntheticTest = "penjaga fixture menolak peringatan kompatibilitas, bukan peringatan development";
const middlewareTest = "formulir akun lama ditolak untuk semua mutasi dengan cookie Clerk akun baru, sebelum akses data";

function runFixture(withoutAzp) {
  const env = { ...process.env };
  // A nested runner must really execute tests, and must not inherit workspace
  // credentials or user-supplied Node preloads. The suite creates local keys.
  for (const key of Object.keys(env)) {
    if (/CLERK/i.test(key) || key === "NODE_TEST_CONTEXT" || key === "NODE_OPTIONS") delete env[key];
  }
  const result = spawnSync(process.execPath, [
    ...(withoutAzp ? ["--import", mutation] : []),
    "--test", "--test-reporter=tap",
    // Include the early synthetic test to catch teardown running during async
    // setup. Use a real cookie request without the positive control's explicit
    // azp assertion, so only the compatibility guard can fail the mutated run.
    `--test-name-pattern=^(?:${syntheticTest}|${middlewareTest})$`,
    fixture,
  ], { env, encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
  const output = stripVTControlCharacters(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  assert.ifError(result.error);
  assert.equal(result.signal, null, output);
  assert.match(output, new RegExp(`ok \\d+ - ${syntheticTest}`), output);
  assert.match(output, new RegExp(`ok \\d+ - ${middlewareTest}`), output);
  assert.match(output, /^# pass 2$/m, output);
  assert.doesNotMatch(output, /Unexpected outbound request|Fixture tidak boleh menghubungi layanan luar/);
  return { ...result, output };
}

test("fixture RSA lokal lengkap lulus sampai teardown middleware Clerk", () => {
  const result = runFixture(false);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /^# fail 0$/m);
  assert.doesNotMatch(result.output, /Fixture sesi Clerk perlu diperbarui/);
});

test("JWT tanpa azp menggagalkan proses lewat diagnosis kompatibilitas Clerk nyata", () => {
  const result = runFixture(true);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /^# fail 1$/m);
  assert.match(result.output, /failureType: 'hookFailed'/);
  assert.match(result.output, /Fixture sesi Clerk perlu diperbarui:[\s\S]*Clerk:[^\n]*[Ss]ession token[^\n]*missing the azp claim/);
  assert.doesNotMatch(result.output, /origin aplikasi harus tercantum dalam token sah/);
});
