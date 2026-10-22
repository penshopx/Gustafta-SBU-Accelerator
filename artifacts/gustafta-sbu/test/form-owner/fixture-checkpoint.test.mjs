// All identities, browser methods, Clerk calls and SQL here are local doubles.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runMissedNotificationsRegression as run } from "./missed-notifications.browser.mjs";

const recipe = fs.readFileSync(new URL("./missed-notifications.notebook.md", import.meta.url), "utf8");
const adapterSource = recipe.match(/```js\n(const checkpointFixtures =[\s\S]*?)\n```/)[1];
const cleanupShell = recipe.match(/```sh\n([\s\S]*?)\n```/)[1];
const helperSource = fs.readFileSync(new URL(
  "../../../api-server/test/helpers/cleanup-form-owner-browser-fixtures.mjs", import.meta.url,
), "utf8").replace(/^import .*;\n/gm, "");
const clone = value => JSON.parse(JSON.stringify(value));

function fakeBrowser({ closeError } = {}) {
  let owner;
  const events = [];
  const context = {
    async newPage() {
      return {
        async addInitScript() {},
        async route() {},
        async goto() {},
        async waitForFunction() {},
        async evaluate(_callback, input) {
          if (!input) return owner;
          events.push([input.method, input.path, input.owner]);
          if (input.method === "PATCH" && owner === "local-a") throw new Error("stop after A checkpoint");
          return { status: 200, data: input.path === "/api/me" ? { userId: owner } : { id: "local-row" } };
        },
      };
    },
    async cookies() {
      return [{ name: "__session", value: `header.${Buffer.from(JSON.stringify({ sub: owner })).toString("base64url")}.sig` }];
    },
    async close() {
      events.push("closed");
      if (closeError) throw closeError;
    },
  };
  // Each page gets the shared jar, just as in the real two-tab setup.
  const newPage = context.newPage;
  context.newPage = async () => ({ ...await newPage(), context: () => context });
  return {
    browser: { async newContext() { events.push("context"); return context; } },
    async signInClerkUser(person) {
      owner = person.email.startsWith("draft-a-") ? "local-a" : "local-b";
      return "/local-sign-in";
    },
    events,
  };
}

test("checkpoint callback and scenario selection fail closed before opening a context", async () => {
  const fake = fakeBrowser();
  const options = { ...fake, snapshotOwners() {}, cleanupOwners() {} };
  await assert.rejects(run(options), /private fixture checkpoint/);
  for (const scenarios of [[], ["unknown"], ["profile", "profile"], "profile"]) {
    await assert.rejects(run({ ...options, checkpointFixtures() {}, scenarios }), /Invalid scenario/);
  }
  assert.deepEqual(fake.events, []);
});

for (const scenario of ["profile", "case-create", "evidence-create", "evidence-edit"]) {
  test(`${scenario}: exact emails checkpointed before sign-in can fail`, async () => {
    const fake = fakeBrowser();
    let staged, final, signIns = 0;
    const failure = new Error("sign-in interrupted after creation");
    await assert.rejects(run({
      ...fake, scenarios: [scenario], snapshotOwners() {},
      async checkpointFixtures(fixtures) { staged = clone(fixtures); },
      async signInClerkUser(person) {
        signIns++;
        assert.equal(staged.length, 1);
        assert.equal(staged[0].emails.length, 2);
        assert.ok(staged[0].emails.includes(person.email));
        assert.ok(staged[0].emails.every(email => email.includes(`-${scenario}-`)));
        assert.deepEqual(staged[0].owners, []);
        throw failure;
      },
      async cleanupOwners(fixtures) { final = clone(fixtures); },
    }), error => error === failure);
    assert.equal(signIns, 1);
    assert.deepEqual(final, staged);
    assert.equal(fake.events.at(-1), "closed");
  });
}

test("B and A owner discovery each refresh the checkpoint before fixture writes", async () => {
  const fake = fakeBrowser();
  const stages = [];
  let final;
  await assert.rejects(run({
    ...fake, scenarios: ["evidence-edit"], snapshotOwners() {},
    async checkpointFixtures(fixtures) { stages.push(clone(fixtures)); },
    async cleanupOwners(fixtures) { final = clone(fixtures); },
  }), /stop after A checkpoint/);
  assert.deepEqual(stages.map(rows => rows[0].owners), [[], ["local-b"], ["local-b", "local-a"]]);
  assert.deepEqual(final, stages.at(-1));
  assert.equal(stages[2][0].names.length, 2);
});

test("checkpoint failure prevents sign-in; primary, close and final staging errors all survive", async () => {
  const primary = new Error("private checkpoint failed");
  const closing = new Error("close failed");
  const cleanup = new Error("final staging failed");
  const fake = fakeBrowser({ closeError: closing });
  let signIns = 0;
  await assert.rejects(run({
    ...fake, scenarios: ["profile"], snapshotOwners() {},
    async signInClerkUser() { signIns++; },
    async checkpointFixtures() { throw primary; },
    async cleanupOwners() { throw cleanup; },
  }), error => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors[0].errors, [primary, closing]);
    assert.equal(error.errors[1], cleanup);
    return true;
  });
  assert.equal(signIns, 0);
});

test("recipe checkpoint is private and atomic; failed replacement keeps the last valid payload", async () => {
  const directory = await fs.promises.mkdtemp(join(tmpdir(), "checkpoint-unit-"));
  const fixtureFile = join(directory, "fixtures.json");
  try {
    const checkpoint = new Function("fs", "fixtureFile", `${adapterSource}\nreturn checkpointFixtures;`)(fs, fixtureFile);
    await checkpoint([{ owners: [], emails: ["local-only"] }]);
    assert.equal((await fs.promises.stat(fixtureFile)).mode & 0o777, 0o600);
    const original = await fs.promises.readFile(fixtureFile, "utf8");
    const brokenFs = { promises: { ...fs.promises, rename: async () => { throw new Error("rename interrupted"); } } };
    const broken = new Function("fs", "fixtureFile", `${adapterSource}\nreturn checkpointFixtures;`)(brokenFs, fixtureFile);
    await assert.rejects(broken([{ owners: ["local-b"] }]), /rename interrupted/);
    assert.equal(await fs.promises.readFile(fixtureFile, "utf8"), original);
    assert.equal((await fs.promises.stat(`${fixtureFile}.pending`)).mode & 0o777, 0o600);
    await assert.rejects(checkpoint([]), { code: "EEXIST" });
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test("hard worker exit skips finally but leaves the pre-sign-in email checkpoint recoverable", async () => {
  const directory = await fs.promises.mkdtemp(join(tmpdir(), "checkpoint-reset-"));
  const fixtureFile = join(directory, "fixtures.json");
  try {
    const worker = `
      import fs from "node:fs";
      import { runMissedNotificationsRegression as run } from ${JSON.stringify(new URL("./missed-notifications.browser.mjs", import.meta.url).href)};
      const fixtureFile = ${JSON.stringify(fixtureFile)};
      ${adapterSource}
      const page = { async addInitScript(){}, async route(){} };
      await run({
        browser: { async newContext() { return {
          async newPage(){ return page; }, async close(){ throw new Error("must not reach close"); }
        }; } },
        scenarios: ["profile"], snapshotOwners(){}, checkpointFixtures,
        async cleanupOwners(){ throw new Error("must not reach finally"); },
        async signInClerkUser(){ process.exit(73); }
      });
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", worker], { encoding: "utf8" });
    assert.equal(result.status, 73, result.stderr);
    const staged = JSON.parse(await fs.promises.readFile(fixtureFile, "utf8"));
    assert.equal(staged.length, 1);
    assert.equal(staged[0].emails.length, 2);
    assert.deepEqual(staged[0].owners, []);
    // Run the actual CLI branch with in-memory Clerk/SQL, using that payload.
    const cli = runLocalCli(staged, [{ id: "local-created-before-reset", email: staged[0].emails[1] }]);
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), { cleaned: true, accounts: 1, remainingProfiles: 0 });
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

// Self-contained so the same doubles can be injected into an isolated CLI.
function cleanupDoubles(accounts = [], documents = false) {
  const users = new Map(accounts.map(user => [user.id, {
    id: user.id, emailAddresses: [{ emailAddress: user.email }],
  }]));
  const calls = [];
  return {
    calls,
    clerkClient: { users: {
      async getUserList({ emailAddress }) {
        const data = [...users.values()].filter(user => user.emailAddresses.some(address => emailAddress.includes(address.emailAddress)));
        return { totalCount: data.length, data };
      },
      async getUser(id) { if (!users.has(id)) throw new Error("Unknown local user"); return users.get(id); },
      async deleteUser(id) { calls.push(["deleteUser", id]); users.delete(id); },
    } },
    pool: {
      async end() {},
      async connect() {
        calls.push(["connect"]);
        return {
          async query(sql, args) {
            calls.push([sql, args]);
            return { rowCount: documents && sql.startsWith("SELECT 1 FROM sbu_documents") ? 1 : 0, rows: [{ n: 0 }] };
          },
          release() {},
        };
      },
    },
    documentStorage: { async remove() { throw new Error("Document deletion is forbidden"); } },
  };
}

function runLocalCli(fixtures, accounts) {
  const source = `const {clerkClient,pool,documentStorage} = (${cleanupDoubles.toString()})(${JSON.stringify(accounts)});\n${helperSource}`;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source, "--", "--stdin"], {
    input: JSON.stringify(fixtures), encoding: "utf8",
  });
}

test("scoped CLI handles email-only/partial fixtures without widening cleanup authority", async () => {
  const emailA = "draft-a-123-profile-unit@example.com";
  const emailB = "draft-b-123-profile-unit@example.com";
  for (const owners of [[], ["local-b"]]) {
    const result = runLocalCli([{ owners, emails: [emailA, emailB] }], [{ id: "local-b", email: emailB }]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { cleaned: true, accounts: 1, remainingProfiles: 0 });
    assert.ok(!result.stdout.includes(emailB));
    assert.ok(!result.stdout.includes("local-b"));
  }
  const load = new Function("clerkClient", "pool", "documentStorage",
    `${helperSource.split("// Deliberately opt-in:")[0].replace("export async function", "async function")}\nreturn cleanupFormOwnerFixtures;`);
  for (const [fixture, accounts, documents, expected] of [
    [{ owners: [], emails: ["real@example.com"] }, [], false, /non-synthetic/],
    [{ owners: ["unrelated"], emails: [emailA] }, [{ id: "unrelated", email: emailB }], false, /unrelated owner/],
    [{ owners: [], emails: [emailB] }, [{ id: "local-b", email: emailB }], true, /Unexpected document/],
  ]) {
    const mocks = cleanupDoubles(accounts, documents);
    const cleanup = load(mocks.clerkClient, mocks.pool, mocks.documentStorage);
    await assert.rejects(cleanup([fixture]), expected);
    assert.ok(!mocks.calls.some(([operation]) => operation === "deleteUser" || operation.startsWith("DELETE")));
  }
});

test("recipe shell retains payload on cleanup failure and deletes it only on success", async () => {
  const directory = await fs.promises.mkdtemp(join(tmpdir(), "checkpoint-shell-"));
  const fixtureDir = join(directory, "private");
  const fixtureFile = join(fixtureDir, "fixtures.json");
  try {
    await fs.promises.mkdir(fixtureDir, { mode: 0o700 });
    await fs.promises.writeFile(fixtureFile, "[]", { mode: 0o600 });
    await fs.promises.writeFile(`${fixtureFile}.pending`, "[]", { mode: 0o600 });
    // Replace only the CLI executable via PATH, not the recipe's status handling.
    await fs.promises.writeFile(join(directory, "pnpm"), "#!/bin/sh\ncat >/dev/null\nexit \"$CLEANUP_STATUS\"\n", { mode: 0o700 });
    const execute = status => spawnSync("sh", ["-c", cleanupShell], {
      encoding: "utf8", env: { PATH: `${directory}:${process.env.PATH}`, FIXTURE_FILE: fixtureFile, CLEANUP_STATUS: String(status) },
    });
    assert.equal(execute(7).status, 7);
    assert.equal(await fs.promises.readFile(fixtureFile, "utf8"), "[]");
    assert.ok(fs.existsSync(`${fixtureFile}.pending`));
    assert.equal(execute(0).status, 0);
    assert.ok(!fs.existsSync(fixtureDir));
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});
