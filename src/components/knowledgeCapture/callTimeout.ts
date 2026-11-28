// A time limit for browser calls to ovis-knowledge-capture. supabase-js's
// functions.invoke (functions-js 2.4.x) takes no AbortSignal, so this races the
// call: on timeout the caller's button resets and it says so, while the request
// itself may still finish on the server. No imports, so it is unit tested with
// deno: supabase/functions/_shared/knowledge-capture/callTimeout_test.ts.

export const CALL_TIMEOUT_MS = 30_000;
export const TIMED_OUT_MESSAGE = 'Timed out, try again.';

export class CallTimeoutError extends Error {
  constructor() {
    super(TIMED_OUT_MESSAGE);
    this.name = 'CallTimeoutError';
  }
}

export function isCallTimeout(e: unknown): e is CallTimeoutError {
  return e instanceof CallTimeoutError;
}

/** `work`, or a CallTimeoutError once `ms` passes first. The timer never outlives the race. */
export function withTimeout<T>(work: Promise<T>, ms: number = CALL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CallTimeoutError()), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
