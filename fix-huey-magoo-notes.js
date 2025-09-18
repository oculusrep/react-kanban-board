#!/usr/bin/env node

/**
 * Fix Huey Magoo's Notes Mapping
 *
 * Problem: Notes are linked to wrong client or not linked at all
 * Solution: Map all Huey Magoo notes to correct client and remove duplicates
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://rqbvcvwbziilnycqtmnc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZjdndiemlpbG55Y3F0bW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyMzk5ODIsImV4cCI6MjA2NTgxNTk4Mn0.819LDXCnlu2dgCPw91oMbZIojeFom-UxqJn2hA5yjBM'
);

async function fixNotesMapping() {
  try {
    console.log('🔧 Analyzing all Huey Magoo notes mapping...\n');

    // Get all Huey Magoo clients first
    const { data: hueyClients, error: clientError } = await supabase
      .from('client')
      .select('id, client_name')
      .ilike('client_name', '%huey magoo%')
      .order('client_name');

    if (clientError) throw clientError;

    console.log('🏢 Found Huey Magoo clients:');
    hueyClients.forEach(client => {
      console.log(`   ${client.client_name} (${client.id})`);
    });

    const mainClientId = 'e2a9430e-5279-44e0-941a-c970b701ff8a'; // Huey Magoo's Chicken Tenders

    // Get all Huey Magoo related notes
    const { data: allHueyNotes, error: notesError } = await supabase
      .from('note')
      .select('id, title, client_id, sf_content_document_id, body')
      .or('title.ilike.%HUEY MAGOO%,title.ilike.%magoo%,body.ilike.%HUEY MAGOO%,body.ilike.%Huey Magoo%');

    if (notesError) throw notesError;

    console.log(`📊 Found ${allHueyNotes.length} Huey Magoo related notes`);

    // Group by ContentDocument ID to identify duplicates
    const contentDocGroups = {};
    allHueyNotes.forEach(note => {
      const docId = note.sf_content_document_id;
      if (!contentDocGroups[docId]) {
        contentDocGroups[docId] = [];
      }
      contentDocGroups[docId].push(note);
    });

    console.log(`📄 Found ${Object.keys(contentDocGroups).length} unique ContentDocuments\n`);

    for (const [docId, notes] of Object.entries(contentDocGroups)) {
      console.log(`📄 ContentDocument: ${docId}`);
      console.log(`📝 Notes: ${notes.length} copies`);

      if (notes.length > 1) {
        // Find the note with the most content
        const bestNote = notes.reduce((best, current) =>
          current.body.length > best.body.length ? current : best
        );

        console.log(`✅ Keeping note ${bestNote.id} (${bestNote.body.length} chars)`);

        // Update best note to main Huey Magoo's Chicken Tenders client
        const { error: updateError } = await supabase
          .from('note')
          .update({ client_id: mainClientId })
          .eq('id', bestNote.id);

        if (updateError) {
          console.error(`❌ Failed to update note ${bestNote.id}:`, updateError);
        } else {
          console.log(`✅ Updated note to correct client`);
        }

        // Delete duplicates
        const duplicateIds = notes.filter(n => n.id !== bestNote.id).map(n => n.id);
        if (duplicateIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('note')
            .delete()
            .in('id', duplicateIds);

          if (deleteError) {
            console.error(`❌ Failed to delete duplicates:`, deleteError);
          } else {
            console.log(`✅ Deleted ${duplicateIds.length} duplicate notes`);
          }
        }
      } else {
        // Single note - just update client mapping if needed
        const note = notes[0];
        if (note.client_id !== mainClientId) {
          const { error: updateError } = await supabase
            .from('note')
            .update({ client_id: mainClientId })
            .eq('id', note.id);

          if (updateError) {
            console.error(`❌ Failed to update note ${note.id}:`, updateError);
          } else {
            console.log(`✅ Updated note to correct client`);
          }
        }
      }
      console.log('---');
    }

    // Final verification
    const { data: finalNotes } = await supabase
      .from('note')
      .select('id, title, body')
      .eq('client_id', mainClientId);

    console.log(`\n🎉 Final result: ${finalNotes.length} notes now linked to Huey Magoo's Chicken Tenders`);
    finalNotes.forEach((note, i) => {
      console.log(`📝 ${i+1}. ${note.title} (${note.body.length} chars)`);
    });

  } catch (error) {
    console.error('💥 Script failed:', error.message);
  }
}

if (require.main === module) {
  fixNotesMapping();
}