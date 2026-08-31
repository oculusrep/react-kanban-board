// Shared write helpers for the Starbucks board. Keeps note-insertion identical
// across the slide-over's "Log a note", the Pass action, and Mark lost.

import { supabase } from './supabaseClient';

// Insert a narrative note against a deal (note + polymorphic note_object_link).
// The link-insert fires the reset-clock trigger; mirrors NoteFormModal.
export async function insertDealNote(dealId: string, body: string): Promise<void> {
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

  const { error: linkErr } = await supabase.from('note_object_link').insert({
    note_id: note!.id,
    sf_content_document_link_id: `${stamp}_deal`,
    object_type: 'deal',
    object_id: dealId,
    deal_id: dealId,
  });
  if (linkErr) throw linkErr;
}
