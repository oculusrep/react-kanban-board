import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  CALL_TIMEOUT_MS, CallTimeoutError, isCallTimeout, TIMED_OUT_MESSAGE, withTimeout,
} from '../../../../src/components/knowledgeCapture/callTimeout.ts'

const after = <T>(ms: number, value: T) => new Promise<T>((r) => setTimeout(() => r(value), ms))

Deno.test('browser calls to ovis-knowledge-capture are limited to 30 seconds', () => {
  assertEquals(CALL_TIMEOUT_MS, 30_000)
  assertEquals(TIMED_OUT_MESSAGE, 'Timed out, try again.')
})

Deno.test('a call that answers in time passes its result through', async () => {
  assertEquals(await withTimeout(after(5, { ok: true }), 200), { ok: true })
})

Deno.test('a call that hangs rejects with "Timed out, try again."', async () => {
  const hung = new Promise<never>(() => {})
  const err = await assertRejects(() => withTimeout(hung, 20), CallTimeoutError, 'Timed out, try again.')
  assert(isCallTimeout(err))
})

Deno.test('the call\'s own error still comes through unchanged, and is not a timeout', async () => {
  const err = await assertRejects(() => withTimeout(Promise.reject(new Error('forbidden')), 200), Error, 'forbidden')
  assert(!isCallTimeout(err))
})

Deno.test('no timer is left running after the race (deno would flag a leak)', async () => {
  await withTimeout(after(1, 'x'), 60_000)
  await withTimeout(Promise.reject(new Error('e')), 60_000).catch(() => undefined)
})

Deno.test('a button wired like the Intel panel resets and shows the timeout message', async () => {
  // Same shape as IntelAsk.submit / PasteSignatureBox.fill / the delete confirm.
  let busy = false
  let shown: string | null = null
  const press = async () => {
    busy = true
    try {
      await withTimeout(new Promise<never>(() => {}), 20)
    } catch (e) {
      shown = e instanceof Error ? e.message : 'failed'
    } finally {
      busy = false
    }
  }
  await press()
  assertEquals(busy, false)
  assertEquals(shown, 'Timed out, try again.')
})
