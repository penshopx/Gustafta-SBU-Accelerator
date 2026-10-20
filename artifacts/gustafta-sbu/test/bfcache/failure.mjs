const knownFailures = new Set([
  'TEST_CLERK_KEYS_REQUIRED', 'BUILD_FAILED', 'BFCACHE_DISABLED_BY_LAUNCH',
  'BFCACHE_INACTIVE', 'FIRST_RESTORED_FRAME_MISSING', 'PRIVATE_SURFACE_LEAK',
  'IDENTITY_RESPONSE_ORDER_NOT_PROVEN', 'SHELL_OPENED_ON_VERIFICATION_FAILURE',
  'PENDING_VERIFICATION_NOT_CONCEALED', 'UNEXPECTED_API_ROUTE', 'FIXTURE_OWNER_MISMATCH',
  'ME_RESPONSE_MISSING', 'A_CASE_NOT_DENIED', 'PRODUCTION_BUNDLE_REQUIRED',
  'ME_FAILURE_NOT_PROVEN',
]);
const safeProviderCodes = new Set([
  'form_param_format_invalid', 'form_identifier_exists', 'resource_not_found',
  'authentication_invalid', 'rate_limit_exceeded', 'session_exists',
]);

// Dependency errors can be plain objects, primitives, or expose throwing getters.
// Never stringify/coerce them or copy their fields into a report.
const read = (value, key) => {
  try { return value?.[key]; }
  catch { return undefined; }
};

// stage is runner-owned, never taken from a dependency exception.
export function sanitizeFailure(stage, error) {
  const message = read(error, 'message');
  const failure = {
    stage,
    code: knownFailures.has(message) ? message :
      read(error, 'name') === 'TimeoutError' ? 'BROWSER_TIMEOUT' : 'RUNNER_STAGE_FAILED',
  };
  const status = read(error, 'status');
  if (Number.isInteger(status) && status >= 100 && status <= 599) failure.httpStatus = status;
  const errors = read(error, 'errors');
  if (Array.isArray(errors)) {
    const codes = [];
    for (const item of errors) {
      const code = read(item, 'code');
      if (safeProviderCodes.has(code)) codes.push(code);
    }
    if (codes.length) failure.providerCodes = codes;
  }
  return failure;
}
