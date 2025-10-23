const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://qwdccexnsqmswrwbbqoy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3ZGNjZXhuc3Ftc3dyd2JicW95Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTI5OTc3MCwiZXhwIjoyMDQwODc1NzcwfQ.gN1_zQSchEC2VcLWRzw6c-RFP5MAUIbzlf-5cBpI'
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
