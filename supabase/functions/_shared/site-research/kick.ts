/**
 * Start (or continue) a background research run by calling ovis-site-research-worker.
 *
 * The worker answers 202 immediately and runs the iteration in the background, so this
 * resolves in well under a second. A failed kick is never fatal: the per-minute tick
 * finds any queued/released run whose heartbeat is older than a minute and kicks it.
 */
export async function kickWorker(runId: string, secret: string): Promise<void> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ovis-site-research-worker`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'X-Worker-Secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'advance_run', run_id: runId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (resp.status !== 202) {
    throw new Error(`worker kick for run ${runId} returned ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  await resp.body?.cancel();
}
