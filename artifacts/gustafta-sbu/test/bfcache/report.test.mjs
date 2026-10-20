import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishReport } from './report.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('two independent writers retain all reports and publish complete latest pointers without Clerk', { timeout: 20_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bfcache-reports-'));
  const children = [];
  try {
    const seed = { status: 'failed', scenarios: [], failure: { code: 'TEST_CLERK_KEYS_REQUIRED' } };
    const initial = await publishReport(directory, seed);
    const moduleUrl = new URL('./report.mjs', import.meta.url).href;
    // No runner import, browser, network or Clerk environment in either child.
    const source = `
      import { publishReport } from ${JSON.stringify(moduleUrl)};
      process.send('ready');
      process.once('message', async ({ directory, status }) => {
        for (let sequence = 0; sequence < 12; sequence++) {
          await publishReport(directory, { status, sequence, scenarios: Array(100).fill({ persisted: true }) });
        }
        process.disconnect();
      });
    `;
    const writers = ['passed', 'failed'].map((status) => {
      const child = fork('--eval', [source], {
        execArgv: ['--input-type=module'], env: {}, silent: true,
      });
      children.push(child);
      const ready = once(child, 'message');
      const exited = once(child, 'exit').then(([code, signal]) => {
        assert.equal(signal, null);
        assert.equal(code, 0);
      });
      return { child, ready, exited, status };
    });
    await Promise.all(writers.map(({ ready }) => ready));
    let finished = false;
    const done = Promise.all(writers.map(({ exited }) => exited)).finally(() => { finished = true; });
    for (const { child, status } of writers) child.send({ directory, status });
    let observations = 0;
    do {
      const pointer = await readJson(join(directory, 'latest.json'));
      assert.deepEqual(Object.keys(pointer), ['report']);
      assert.match(pointer.report, /^run-[A-Za-z0-9]+\/report\.json$/);
      const report = await readJson(join(directory, pointer.report));
      assert.ok(['passed', 'failed'].includes(report.status));
      observations++;
    } while (!finished);
    await done;
    assert.ok(observations > 0);
    const entries = await readdir(directory);
    const runs = entries.filter((name) => name.startsWith('run-'));
    assert.equal(runs.length, 25);
    assert.equal(entries.length, 26); // 24 child reports + seed + pointer.
    assert.deepEqual(await readJson(join(directory, initial)), seed);
    const sequences = { passed: [], failed: [] };
    for (const run of runs) {
      assert.deepEqual(await readdir(join(directory, run)), ['report.json']);
      const path = join(directory, run, 'report.json');
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      if (`${run}/report.json` === initial) continue;
      const report = await readJson(path);
      assert.equal(report.scenarios.length, 100);
      sequences[report.status].push(report.sequence);
    }
    for (const values of Object.values(sequences)) {
      assert.deepEqual(values.sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i));
    }
    const latest = await readJson(join(directory, 'latest.json'));
    assert.equal((await readJson(join(directory, latest.report))).sequence, 11);
    assert.equal((await stat(join(directory, 'latest.json'))).mode & 0o777, 0o600);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test('serialization failure preserves the last published report and pointer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bfcache-reports-'));
  try {
    const report = { status: 'passed' };
    const path = await publishReport(directory, report);
    const before = await readFile(join(directory, 'latest.json'), 'utf8');
    await assert.rejects(publishReport(directory, { invalid: 1n }), TypeError);
    assert.equal(await readFile(join(directory, 'latest.json'), 'utf8'), before);
    assert.deepEqual(await readJson(join(directory, path)), report);
    assert.equal((await readdir(directory)).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
