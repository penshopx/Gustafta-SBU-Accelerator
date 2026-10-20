import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Mutate only the fixture as Node loads it; never edit the checked-in suite or
// replace Clerk, its logger, the RSA signer, or the suite's instrumentation.
const fixtureUrl = new URL("../sbu-assessment-clerk.test.mjs", import.meta.url).href;
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== fixtureUrl) return loaded;
    const source = String(loaded.source);
    const claim = "    azp: testOrigin,";
    assert.equal(source.split(claim).length - 1, 1,
      "Mutasi harus menghapus tepat satu deklarasi azp dari fixture JWT");
    return { ...loaded, source: source.replace(claim, "") };
  },
});
