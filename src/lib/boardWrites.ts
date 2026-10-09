// Shared write helpers for the Starbucks board. Keeps note-insertion and
// deal_activity_state writes identical across the slide-over, triage queue,
// Pass / Mark lost, Park, Urgent and the agenda star.
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

// Insert a narrative note against a card (note + polymorphic note_object_link):
// on the deal when there is one, else on the site_submit. The link-insert fires
// the reset-clock trigger; mirrors NoteFormModal.
export async function insertBoardNote(s: BoardSubject, body: string): Promise<void> {
  if (s.dealId) return insertDealNote(s.dealId, body);
  if (!s.siteSubmitId) throw new Error('Board card has neither a deal nor a site submit');
  const { id: noteId, stamp } = await insertNote(body);
  const { error: linkErr } = await supabase.from('note_object_link').insert({
    note_id: noteId,
    sf_content_document_link_id: `${stamp}_site_submit`,
    object_type: 'site_submit',
    object_id: s.siteSubmitId,
    site_submit_id: s.siteSubmitId,
  });
  if (linkErr) throw linkErr;
}

// Insert a narrative note against a deal.
export async function insertDealNote(dealId: string, body: string): Promise<void> {
  const { id: noteId, stamp } = await insertNote(body);
  const { error: linkErr } = await supabase.from('note_object_link').insert({
    note_id: noteId,
    sf_content_document_link_id: `${stamp}_deal`,
    object_type: 'deal',
    object_id: dealId,
    deal_id: dealId,
  });
  if (linkErr) throw linkErr;
}

async function insertNote(body: string): Promise<{ id: string; stamp: string }> {
  const stamp = `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const title = body.length > 60 ? `${body.slice(0, 57)}…` : body;
  const { data: note, error: noteErr } = await supabase
    .from('note')
    .insert({
      sf_content_note_id: stamp,
      title,
      body,
      content_size: body.length,
      share_type: 'V',
      visibility: 'AllUsers',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (noteErr) throw noteErr;
  return { id: note!.id, stamp };
}

// Filter column for reads of a card's notes / tasks / activity.
export function touchFilter(s: BoardSubject): { column: 'deal_id' | 'site_submit_id'; value: string } {
  return stateKey(s);
}
