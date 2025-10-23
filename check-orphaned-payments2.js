const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use new secret key if available, fallback to legacy service role key, then anon key
const supabaseKey = process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  supabaseKey
);

(async () => {
  try {
    // Get stage IDs
    const { data: stages } = await supabase
      .from('deal_stage')
      .select('id, label');

    console.log('Stages:', stages?.map(s => s.label));

    const lostStage = stages?.find(s => s.label === 'Lost');
    const closedPaidStage = stages?.find(s => s.label === 'Closed Paid');
    const excludedStageIds = [lostStage?.id, closedPaidStage?.id].filter(Boolean);

    console.log('Excluded stage IDs:', excludedStageIds);

    // Get ALL active OVIS payments first
    const { data: allOvisPayments } = await supabase
      .from('payment')
      .select('id, sf_id, deal!inner(id, deal_name, stage_id)')
      .eq('is_active', true);

    console.log('Total active OVIS payments:', allOvisPayments?.length || 0);

    // Filter in memory
    const filteredPayments = allOvisPayments?.filter(p =>
      !excludedStageIds.includes(p.deal.stage_id)
    ) || [];

    console.log('After excluding Lost/Closed Paid:', filteredPayments.length);

    // Count OVIS payments without SF ID
    const ovisWithoutSf = filteredPayments.filter(p => !p.sf_id);
    console.log('OVIS payments without SF link:', ovisWithoutSf.length);

    console.log('\nFirst 20 OVIS payments without SF link:');
    ovisWithoutSf.slice(0, 20).forEach(p => {
      console.log('  -', p.deal.deal_name);
    });

  } catch (error) {
    console.error('Error:', error);
  }
})();
