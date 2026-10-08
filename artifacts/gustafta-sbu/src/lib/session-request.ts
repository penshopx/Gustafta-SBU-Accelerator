export class SessionVerificationTimeout extends Error {
  readonly code = 'session_verification_timeout';
  constructor() {
    super('Session verification timed out');
  }
}

// The race bounds the wait even if an SDK-wrapped request ignores cancellation.
export async function withSessionDeadline<T>(
  request: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  if (parentSignal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const controller = new AbortController();
  let expired = false;
  let cancel!: () => void;
  let timer!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DOMException('Request cancelled', 'AbortError'));
    };
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      reject(new SessionVerificationTimeout());
    }, timeoutMs);
  });
  parentSignal?.addEventListener('abort', cancel, { once: true });
  try {
    return await Promise.race([request(controller.signal), deadline]);
  } catch (error) {
    if (expired) throw new SessionVerificationTimeout();
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', cancel);
  }
}

export function retrySessionCheck(failureCount: number, error: unknown): boolean {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return status !== 401 && status !== 403 && code !== 'session_verification_timeout' && failureCount < 1;
}
