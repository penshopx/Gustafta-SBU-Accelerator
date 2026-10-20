import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeFailure } from './failure.mjs';
import { publishReport } from './report.mjs';

const sensitive = {
  token: 'synthetic-token-DO-NOT-REPORT',
  email: 'synthetic-privacy@example.invalid',
  cookie: '__session=synthetic-cookie-DO-NOT-REPORT',
  url: 'https://example.invalid/sign-in?ticket=synthetic-ticket-DO-NOT-REPORT',
  unknownCode: 'unrecognized_provider_code_DO_NOT_REPORT',
};
const payload = Object.values(sensitive).join(' ');
const providerCodes = [
  'form_param_format_invalid', 'form_identifier_exists', 'resource_not_found',
  'authentication_invalid', 'rate_limit_exceeded', 'session_exists',
];
const fixedCodes = [
  'TEST_CLERK_KEYS_REQUIRED', 'BUILD_FAILED', 'BFCACHE_DISABLED_BY_LAUNCH',
  'BFCACHE_INACTIVE', 'FIRST_RESTORED_FRAME_MISSING', 'PRIVATE_SURFACE_LEAK',
  'IDENTITY_RESPONSE_ORDER_NOT_PROVEN', 'SHELL_OPENED_ON_VERIFICATION_FAILURE',
  'PENDING_VERIFICATION_NOT_CONCEALED', 'UNEXPECTED_API_ROUTE', 'FIXTURE_OWNER_MISMATCH',
  'ME_RESPONSE_MISSING', 'A_CASE_NOT_DENIED', 'PRODUCTION_BUNDLE_REQUIRED',
  'ME_FAILURE_NOT_PROVEN',
];

const poisoned = (name) => Object.assign(new Error(payload), sensitive, {
  name, stack: payload, cause: { message: payload, ...sensitive },
  headers: { authorization: `Bearer ${sensitive.token}`, cookie: sensitive.cookie },
  response: { body: payload, url: sensitive.url },
  stage: payload, code: sensitive.unknownCode, status: 429,
  errors: [
    ...providerCodes.map((code) => ({ code, message: payload, longMessage: payload, meta: sensitive })),
    ...Object.values(sensitive).map((code) => ({ code, message: payload })),
  ],
  toJSON() { throw new Error('Raw dependency error must never be serialized'); },
});

function assertPrivate(json) {
  for (const value of Object.values(sensitive)) assert.ok(!json.includes(value));
}

test('provider and browser errors publish only runner stage, fixed code, HTTP status and allowlisted codes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bfcache-sanitization-'));
  try {
    for (const [name, stage, code] of [
      ['ClerkAPIResponseError', 'create-test-users', 'RUNNER_STAGE_FAILED'],
      ['TimeoutError', 'dashboard-back/sign-in-A', 'BROWSER_TIMEOUT'],
      [payload, 'dashboard-forward/restore', 'RUNNER_STAGE_FAILED'],
    ]) {
      const error = poisoned(name);
      const expected = { stage, code, httpStatus: 429, providerCodes };
      const report = { status: 'failed', failure: sanitizeFailure(stage, error) };
      assert.deepEqual(report.failure, expected);
      assertPrivate(JSON.stringify(report));
      const path = await publishReport(directory, report);
      const json = await readFile(join(directory, path), 'utf8');
      assert.deepEqual(JSON.parse(json), { status: 'failed', failure: expected });
      assertPrivate(json);
      assertPrivate(await readFile(join(directory, 'latest.json'), 'utf8'));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('only exact runner failure messages are retained, never sensitive suffixes or prefixes', () => {
  for (const code of fixedCodes) {
    assert.deepEqual(sanitizeFailure('preflight', new Error(code)), { stage: 'preflight', code });
    for (const message of [`${code}: ${payload}`, `${payload} ${code}`]) {
      assert.deepEqual(sanitizeFailure('preflight', { message }), {
        stage: 'preflight', code: 'RUNNER_STAGE_FAILED',
      });
    }
  }
});

test('changed dependency error shapes fail closed without serializing or coercing unknown values', () => {
  const explosive = {
    toString() { throw new Error('must not coerce'); },
    toJSON() { throw new Error('must not serialize'); },
  };
  const throwing = Object.defineProperties({}, Object.fromEntries(
    ['message', 'name', 'status', 'errors', 'code'].map((key) => [key, {
      get() { throw new Error(payload); },
    }]),
  ));
  for (const error of [
    undefined, null, payload, 42, explosive, throwing,
    ...[null, payload, {}, { map: payload }, [null, undefined, payload, {}, explosive, throwing]]
      .map((errors) => ({ message: payload, errors })),
    { message: explosive, name: explosive, status: explosive, errors: [{ code: explosive }] },
  ]) {
    const failure = sanitizeFailure('create-test-users', error);
    assert.deepEqual(failure, { stage: 'create-test-users', code: 'RUNNER_STAGE_FAILED' });
    assertPrivate(JSON.stringify(failure));
  }
});

test('HTTP status must be a numeric HTTP code, not a token-bearing string or unrelated number', () => {
  for (const status of [undefined, null, payload, '429', 99, 600, 123456789, 429.5, NaN, Infinity]) {
    assert.deepEqual(sanitizeFailure('preflight', { status }), {
      stage: 'preflight', code: 'RUNNER_STAGE_FAILED',
    });
  }
  for (const status of [100, 401, 429, 503, 599]) {
    assert.equal(sanitizeFailure('preflight', { status }).httpStatus, status);
  }
});

test('provider codes use exact allowlist matches and tolerate null or mixed error entries', () => {
  const errors = [null, undefined, payload, {}, ...providerCodes.flatMap((code) => [
    { code }, { code: `${code} ${payload}` }, { code: `${payload} ${code}` },
    { code: code.toUpperCase() },
  ])];
  assert.deepEqual(sanitizeFailure('create-test-users', { errors }), {
    stage: 'create-test-users', code: 'RUNNER_STAGE_FAILED', providerCodes,
  });
});
