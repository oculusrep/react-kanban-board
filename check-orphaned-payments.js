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

    const lostStageId = stages?.find(s => s.label === 'Lost')?.id;
    const closedPaidStageId = stages?.find(s => s.label === 'Closed Paid')?.id;

    // Get active OVIS payments (excluding Lost and Closed Paid)
    const { data: ovisPayments } = await supabase
      .from('payment')
      .select('id, sf_id, deal!inner(id, deal_name, stage_id)')
      .eq('is_active', true)
      .neq('deal.stage_id', lostStageId)
      .neq('deal.stage_id', closedPaidStageId);

    console.log('Active OVIS payments (excl Lost/Closed Paid):', ovisPayments?.length || 0);

    // Count OVIS payments without SF ID
    const ovisWithoutSf = ovisPayments?.filter(p => !p.sf_id) || [];
    console.log('OVIS payments without SF link:', ovisWithoutSf.length);

    // Count OVIS payments with SF ID
    const ovisWithSf = ovisPayments?.filter(p => p.sf_id) || [];
    console.log('OVIS payments with SF link:', ovisWithSf.length);

    console.log('\nFirst 10 OVIS payments without SF link:');
    ovisWithoutSf.slice(0, 10).forEach(p => {
      console.log('  -', p.deal.deal_name);
    });

    // Check unique deals
    const uniqueDeals = new Set(ovisWithoutSf.map(p => p.deal.deal_name));
    console.log('\nUnique deals with OVIS-only payments:', uniqueDeals.size);

  } catch (error) {
    console.error('Error:', error.message);
  }
})();
