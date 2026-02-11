import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from parent directory (react-kanban-board root)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSignals() {
  // Get ABC source ID
  const { data: source } = await supabase
    .from('hunter_source')
    .select('id, name, slug')
    .eq('slug', 'bizjournals-atl')
    .single();

  console.log('Source:', source);

  if (!source) {
    console.log('Source not found');
    return;
  }

  // Count signals by is_processed status
  const { data: signalCounts } = await supabase
    .from('hunter_signal')
    .select('is_processed')
    .eq('source_id', source.id);

  const processed = signalCounts?.filter(s => s.is_processed).length || 0;
  const unprocessed = signalCounts?.filter(s => !s.is_processed).length || 0;

  console.log('\nSignal counts:');
  console.log('  Processed:', processed);
  console.log('  Unprocessed:', unprocessed);
  console.log('  Total:', processed + unprocessed);

  // Check how many signals are linked to leads
  const { data: linkedSignals } = await supabase
    .from('hunter_lead_signal')
    .select('signal_id, hunter_signal!inner(source_id)')
    .eq('hunter_signal.source_id', source.id);

  console.log('\nSignals linked to leads:', linkedSignals?.length || 0);

  // Get recent signals to see their titles
  const { data: recentSignals } = await supabase
    .from('hunter_signal')
    .select('source_title, is_processed, created_at')
    .eq('source_id', source.id)
    .order('created_at', { ascending: false })
    .limit(14);

  console.log('\nRecent signals from ABC:');
  recentSignals?.forEach((s, i) => {
    const status = s.is_processed ? 'PROCESSED' : 'PENDING';
    const title = s.source_title?.substring(0, 70) || 'No title';
    console.log(`  ${i+1}. [${status}] ${title}...`);
  });

  // If there are linked signals, show what leads they created
  if (linkedSignals && linkedSignals.length > 0) {
    const signalIds = linkedSignals.map(ls => ls.signal_id);

    const { data: leadDetails } = await supabase
      .from('hunter_lead_signal')
      .select(`
        signal_id,
        hunter_lead!inner(concept_name, signal_strength, status)
      `)
      .in('signal_id', signalIds);

    console.log('\nLeads created from ABC signals:');
    leadDetails?.forEach((ld: any, i) => {
      const lead = ld.hunter_lead;
      console.log(`  ${i+1}. ${lead.concept_name} [${lead.signal_strength}] - ${lead.status}`);
    });
  }
}

checkSignals().catch(console.error);
