import { assertEquals } from 'jsr:@std/assert@1';
import {
  finalDecision, scanForInState, normalizeState, pickBody, htmlToText, evidenceInSource, backoffMinutes,
  type ModelOutput,
} from './classify.ts';

const m = (o: Partial<ModelOutput>): ModelOutput =>
  ({ is_listing: true, properties: [], decision: 'unknown', evidence: '', ...o });

Deno.test('not a listing', () => {
  assertEquals(finalDecision(m({ is_listing: false }), 'x').decision, 'not_listing');
});

Deno.test('any GA/SC property keeps it, at any confidence', () => {
  const r = finalDecision(m({
    properties: [
      { address: '1 Main', city: 'Dallas', state: 'TX', confidence: 'high' },
      { address: null, city: 'Macon', state: 'Georgia', confidence: 'low' },
    ],
    decision: 'out_of_state',
  }), 'Dallas, TX 75201');
  assertEquals(r.decision, 'in_state');
  assertEquals(r.states_found, ['GA', 'TX']);
});

Deno.test('certain out-of-state', () => {
  const src = 'Now leasing: 100 Elm St, Columbus, OH 43215. 2,400 SF end cap.';
  const r = finalDecision(m({
    properties: [{ address: '100 Elm St', city: 'Columbus', state: 'OH', confidence: 'high' }],
    decision: 'out_of_state', evidence: '100 Elm St, Columbus, OH 43215',
  }), src);
  assertEquals(r.decision, 'out_of_state');
});

Deno.test('medium confidence -> unknown, recorded as downgrade', () => {
  const src = '100 Elm St, Columbus, OH 43215';
  const r = finalDecision(m({
    properties: [{ address: '100 Elm St', city: 'Columbus', state: 'OH', confidence: 'medium' }],
    decision: 'out_of_state', evidence: src,
  }), src);
  assertEquals(r.decision, 'unknown');
  assertEquals(r.downgrade_reason, 'low_confidence_property');
});

Deno.test('evidence not in source -> unknown', () => {
  const r = finalDecision(m({
    properties: [{ address: null, city: 'Austin', state: 'TX', confidence: 'high' }],
    decision: 'out_of_state', evidence: 'Austin, TX 78701',
  }), 'A great pad site in Austin.');
  assertEquals(r.decision, 'unknown');
  assertEquals(r.downgrade_reason, 'evidence_not_in_source');
});

Deno.test('GA signal in text blocks out_of_state even if the model missed it', () => {
  const src = 'Austin, TX 78701. Also available: Savannah, GA 31401.';
  const r = finalDecision(m({
    properties: [{ address: null, city: 'Austin', state: 'TX', confidence: 'high' }],
    decision: 'out_of_state', evidence: 'Austin, TX 78701',
  }), src);
  assertEquals(r.decision, 'unknown');
  assertEquals(r.downgrade_reason, 'ga_sc_signal_in_text');
});

Deno.test('scan: sizes are not ZIPs, real ZIPs and names are', () => {
  assertEquals(scanForInState('30,000 SF and 31000 SF, 29500 VPD'), []);
  assertEquals(scanForInState('Atlanta 30303').length, 1);
  assertEquals(scanForInState('Greenville, South Carolina').length, 1);
  assertEquals(scanForInState('we ga ther').length, 0);
});

Deno.test('normalizeState', () => {
  assertEquals(normalizeState('ga'), 'GA');
  assertEquals(normalizeState('South Carolina'), 'SC');
  assertEquals(normalizeState('Ontario'), null);
  assertEquals(normalizeState('S.C.'), 'SC');
});

Deno.test('pickBody falls back to HTML, caps the head', () => {
  const b = pickBody('short', '<p>Hello&nbsp;<b>world</b></p><script>x</script>');
  assertEquals(b.source, 'body_html');
  assertEquals(b.text, 'Hello world');
  const long = pickBody('a'.repeat(13000), null);
  assertEquals(long.truncated, true);
  assertEquals(long.text.length, 12000);
  assertEquals(htmlToText('A&amp;B'), 'A&B');
});

Deno.test('evidence match ignores case and whitespace', () => {
  assertEquals(evidenceInSource('columbus,  OH', 'In Columbus, oh today'), true);
});

Deno.test('backoff', () => {
  assertEquals([1, 2, 3, 4].map(backoffMinutes), [5, 30, 120, 120]);
});
