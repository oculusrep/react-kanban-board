/**
 * Anchored-suffix tests for the ladder-B domain match.
 *
 * The bug being guarded: substring matching. 'Atlanta' inside
 * 'atlantaspeechschool.org' is the same shape as the searchRules collision that
 * demoted 184 real deal emails in September.
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { matchesPersonalDomain } from './tier1.ts';

Deno.test('exact domain matches', () => {
  for (const d of ['cobbk12.org', 'atlantaspeechschool.org', 'pikmykid.com', 'playupward.org']) {
    assertEquals(matchesPersonalDomain(d), true, d);
  }
});

Deno.test('subdomain matches at the boundary', () => {
  assertEquals(matchesPersonalDomain('mail.playupward.org'), true);
  assertEquals(matchesPersonalDomain('onlineservices.mail.playupward.org'), true);
});

Deno.test('lookalike domains do NOT match', () => {
  // the whole reason this is a suffix test and not a substring test
  assertEquals(matchesPersonalDomain('notplayupward.org'), false);
  assertEquals(matchesPersonalDomain('playupward.org.evil.com'), false);
  assertEquals(matchesPersonalDomain('xcobbk12.org'), false);
  assertEquals(matchesPersonalDomain('atlantaspeechschool.org.uk'), false);
});

Deno.test('unrelated domains with shared words do NOT match', () => {
  assertEquals(matchesPersonalDomain('atlanta.com'), false);
  assertEquals(matchesPersonalDomain('starbucks.com'), false);
  assertEquals(matchesPersonalDomain('cobbcountyrealty.com'), false);
});

Deno.test('case and whitespace are normalised', () => {
  assertEquals(matchesPersonalDomain('  Mail.PlayUpward.ORG '), true);
});

Deno.test('empty is not a match', () => {
  assertEquals(matchesPersonalDomain(''), false);
});
