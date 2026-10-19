/**
 * Watermark boundary tests.
 *
 * The bug these guard: gmail-sync advanced last_history_id to the newest id
 * Gmail reported, while only ever processing the first MAX_MESSAGES_PER_SYNC
 * messages of a single history page. Anything past either limit was stepped
 * over and could never be fetched again.
 *
 * Run: deno test supabase/functions/_shared/gmail_watermark_test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { lastFullyConsumedHistoryId } from './gmail.ts';

const m = (historyId: string) => ({ historyId });

Deno.test('nothing processed -> watermark must not move', () => {
  assertEquals(lastFullyConsumedHistoryId([m('1'), m('2')], 0), null);
});

Deno.test('cut lands on a record boundary -> advance to that record', () => {
  // records: 1,1,2,2 | processed 2 -> record 1 is complete, record 2 untouched
  const msgs = [m('1'), m('1'), m('2'), m('2')];
  assertEquals(lastFullyConsumedHistoryId(msgs, 2), '1');
});

Deno.test('cut straddles a record -> fall back to the previous boundary', () => {
  // records: 1,2,2,2 | processed 2 -> record 2 is half consumed, so only 1 is safe
  const msgs = [m('1'), m('2'), m('2'), m('2')];
  assertEquals(lastFullyConsumedHistoryId(msgs, 2), '1');
});

Deno.test('cut straddles the only record -> watermark must not move', () => {
  // Every message shares one record: advancing would skip the remainder.
  const msgs = [m('7'), m('7'), m('7')];
  assertEquals(lastFullyConsumedHistoryId(msgs, 2), null);
});

Deno.test('one message per record -> advance to the last one processed', () => {
  const msgs = [m('1'), m('2'), m('3'), m('4')];
  assertEquals(lastFullyConsumedHistoryId(msgs, 3), '3');
});

Deno.test('processed the whole feed -> last record is safe', () => {
  const msgs = [m('1'), m('2')];
  assertEquals(lastFullyConsumedHistoryId(msgs, 2), '2');
});

Deno.test('full-sync refs carry no history id -> watermark must not move', () => {
  // syncEmailsForConnection maps full-sync results to historyId: ''.
  const msgs = [m(''), m('')];
  assertEquals(lastFullyConsumedHistoryId(msgs, 2), null);
});

Deno.test('progress is guaranteed across successive capped runs', () => {
  // 5 records of 2 messages, cap of 3: each run must advance past >=1 record,
  // otherwise the sync live-locks on the same messages forever.
  const msgs = [m('1'), m('1'), m('2'), m('2'), m('3'), m('3'), m('4'), m('4'), m('5'), m('5')];
  const cap = 3;
  let start = 0;
  const seen: string[] = [];
  for (let run = 0; run < 5 && start < msgs.length; run++) {
    const remaining = msgs.slice(start);
    const processed = Math.min(cap, remaining.length);
    const wm = lastFullyConsumedHistoryId(remaining, processed);
    assertEquals(wm !== null, true, `run ${run} made no progress`);
    seen.push(wm!);
    // next run resumes after the record the watermark names
    const resumeAt = remaining.findIndex((x) => x.historyId > wm!);
    start += resumeAt === -1 ? remaining.length : resumeAt;
  }
  assertEquals(seen, ['1', '2', '3', '4', '5']);
});
