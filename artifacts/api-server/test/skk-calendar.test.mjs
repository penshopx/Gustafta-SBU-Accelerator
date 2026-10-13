import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

test("SKK date indicators use valid calendar days and Jakarta inclusive expiry, not viewer timezone or verification", async () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const temp = await mkdtemp(join(dir, ".skk-calendar-test-"));
  try {
    await build({ entryPoints: [join(dir, "../src/lib/skk-calendar.ts")], outfile: join(temp, "calendar.mjs"), bundle: true, platform: "node", format: "esm" });
    const { jakartaToday, validCalendarDay, declaredDateStatus } = await import(join(temp, "calendar.mjs"));
    assert.equal(jakartaToday(new Date("2026-12-31T17:30:00Z")), "2027-01-01");
    assert.equal(jakartaToday(new Date("2026-12-31T16:59:59Z")), "2026-12-31");
    for (const invalid of ["2025-02-29", "2026-04-31", "0000-01-01", "2026-13-01", "2026-01-01T00:00:00Z", ""]) {
      assert.equal(validCalendarDay(invalid), false, invalid);
    }
    assert.equal(validCalendarDay("2028-02-29"), true);
    assert.equal(validCalendarDay(null), true);
    assert.deepEqual(declaredDateStatus(null, "2027-01-01", "2027-01-01"), { dateStatus: "expiring", daysRemaining: 0 });
    assert.deepEqual(declaredDateStatus(null, "2026-12-31", "2027-01-01"), { dateStatus: "expired", daysRemaining: -1 });
    assert.deepEqual(declaredDateStatus(null, "2027-01-31", "2027-01-01"), { dateStatus: "expiring", daysRemaining: 30 });
    assert.deepEqual(declaredDateStatus(null, "2027-02-01", "2027-01-01"), { dateStatus: "active_declared", daysRemaining: 31 });
    assert.deepEqual(declaredDateStatus(null, null, "2027-01-01"), { dateStatus: "unknown", daysRemaining: null });
    assert.equal(declaredDateStatus("2027-01-02", "2027-02-01", "2027-01-01").dateStatus, "not_yet_effective");
  } finally { await rm(temp, { recursive: true, force: true }); }
});
