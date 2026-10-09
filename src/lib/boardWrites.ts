// Shared write helpers for the Starbucks board. Keeps note-insertion and
// deal_activity_state writes identical across the slide-over, triage queue,
// Pass / Mark lost, Park, Urgent and the agenda star. Notes go into the card's
// chat thread; court / blocker / park history is posted there by a DB trigger.
//
// A board card is a site_submit, with deal data joined in when a deal exists
// (decisions §2.27). deal_activity_state is dual-keyed: a deal-backed card's
// state is keyed by deal_id, a site_submit-only card's by site_submit_id.

import { supabase } from './supabaseClient';

// The subject a board write targets.
export interface BoardSubject {
  dealId: string | null;
  siteSubmitId: string | null;
}

// Which deal_activity_state key a card writes through. Deal wins when one
// exists — its row is the card's row (the attach trigger moved any
// site_submit-only row onto it when the deal was linked).
function stateKey(s: BoardSubject): { column: 'deal_id' | 'site_submit_id'; value: string } {
  if (s.dealId) return { column: 'deal_id', value: s.dealId };
  if (s.siteSubmitId) return { column: 'site_submit_id', value: s.siteSubmitId };
  throw new Error('Board card has neither a deal nor a site submit');
}

// Upsert board state for a card (court / blocker / clock / park). The patch
// must not include deal_id or site_submit_id — the key is added here.
export async function upsertBoardState(s: BoardSubject, patch: Record<string, unknown>): Promise<void> {
  const key = stateKey(s);
  const { error } = await supabase
    .from('deal_activity_state')
    .upsert({ ...patch, [key.column]: key.value }, { onConflict: key.column });
  if (error) throw error;
}

// Update a field that is NOT a touch (urgent, agenda). If the card has no state
// row yet, one is created as seeded_fallback so it stays "no history" — marking
// urgent or starring must not start a clock (§1.4).
export async function updateBoardState(s: BoardSubject, patch: Record<string, unknown>): Promise<void> {
  const key = stateKey(s);
  const { error: insErr } = await supabase
    .from('deal_activity_state')
    .upsert({ [key.column]: key.value, seeded_fallback: true }, { onConflict: key.column, ignoreDuplicates: true });
  if (insErr) throw insErr;
  const { error } = await supabase.from('deal_activity_state').update(patch).eq(key.column, key.value);
  if (error) throw error;
}

// Insert a note against a card — into the card's chat thread
// (site_submit_comment), the same thread the deal and site-submit sidebars
// show (decisions §5, 2026-10-09). Always internal: origin = 'board_note', and
// a CHECK keeps board rows internal. Keyed on the site_submit when the card has
// one (the deal sidebar reads the site's thread), else on the deal. The
// comment trigger resets the card's clock — once.
export async function insertBoardNote(s: BoardSubject, body: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const authorId = auth.user?.id;
  if (!authorId) throw new Error('Not signed in');
  const target = s.siteSubmitId ? { site_submit_id: s.siteSubmitId } : s.dealId ? { deal_id: s.dealId } : null;
  if (!target) throw new Error('Board card has neither a deal nor a site submit');
  const { error } = await supabase.from('site_submit_comment').insert({
    ...target,
    author_id: authorId,
    content: body,
    visibility: 'internal',
    origin: 'board_note',
  });
  if (error) throw error;
}

export interface ThreadEntry {
  id: string;
  content: string;
  visibility: 'internal' | 'client';
  origin: 'board_note' | 'board_history' | null;
  created_at: string;
}

// The card's chat thread, newest first: rows on its site_submit plus rows keyed
// only to its deal — the same thread PortalChatTab shows on both sidebars.
export async function loadBoardThread(s: BoardSubject, limit: number): Promise<ThreadEntry[]> {
  const ors = [
    s.siteSubmitId ? `site_submit_id.eq.${s.siteSubmitId}` : null,
    s.dealId ? `deal_id.eq.${s.dealId}` : null,
  ].filter(Boolean);
  if (ors.length === 0) return [];
  const { data, error } = await supabase
    .from('site_submit_comment')
    .select('id, content, visibility, origin, created_at')
    .or(ors.join(','))
    .is('parent_comment_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ThreadEntry[]) ?? [];
}

// Filter column for reads of a card's notes / tasks / activity.
export function touchFilter(s: BoardSubject): { column: 'deal_id' | 'site_submit_id'; value: string } {
  return stateKey(s);
}
