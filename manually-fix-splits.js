const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function manuallyFixSplits() {
  const dealId = 'be4b7d08-15ba-43cc-8743-65edec3fc4f8';

  console.log('Fetching deal and payments...\n');

  // Get deal
  const { data: deal } = await supabase
    .from('deal')
    .select('*')
    .eq('id', dealId)
    .single();

  // Get all payments for this deal
  const { data: payments } = await supabase
    .from('payment')
    .select('*')
    .eq('deal_id', dealId)
    .order('payment_sequence');

  console.log('Deal Category Percentages:');
  console.log('  Origination:', deal.origination_percent + '%');
  console.log('  Site:', deal.site_percent + '%');
  console.log('  Deal:', deal.deal_percent + '%');

  for (const payment of payments) {
    console.log('\n' + '='.repeat(60));
    console.log('Payment', payment.payment_sequence);
    console.log('  Amount:', payment.payment_amount);
    console.log('  AGCI:', payment.agci);
    console.log('  Override:', payment.amount_override);

    // Calculate payment category amounts
    const paymentOrig = (deal.origination_percent / 100) * payment.agci;
    const paymentSite = (deal.site_percent / 100) * payment.agci;
    const paymentDeal = (deal.deal_percent / 100) * payment.agci;

    console.log('  Payment Categories (from AGCI):');
    console.log('    Origination:', paymentOrig.toFixed(2));
    console.log('    Site:', paymentSite.toFixed(2));
    console.log('    Deal:', paymentDeal.toFixed(2));

    // Get payment splits
    const { data: splits } = await supabase
      .from('payment_split')
      .select('*')
      .eq('payment_id', payment.id);

    for (const split of splits) {
      console.log('\n  Updating split for payment', payment.payment_sequence + '...');
      console.log('    Current: Orig $' + split.split_origination_usd + ', Site $' + split.split_site_usd + ', Deal $' + split.split_deal_usd + ', Total $' + split.split_broker_total);

      // Calculate new split amounts
      const newOrig = paymentOrig * (split.split_origination_percent / 100);
      const newSite = paymentSite * (split.split_site_percent / 100);
      const newDeal = paymentDeal * (split.split_deal_percent / 100);
      const newTotal = newOrig + newSite + newDeal;

      console.log('    Expected: Orig $' + newOrig.toFixed(2) + ', Site $' + newSite.toFixed(2) + ', Deal $' + newDeal.toFixed(2) + ', Total $' + newTotal.toFixed(2));

      // Update the split
      const { error } = await supabase
        .from('payment_split')
        .update({
          split_origination_usd: newOrig,
          split_site_usd: newSite,
          split_deal_usd: newDeal,
          split_broker_total: newTotal
        })
        .eq('id', split.id);

      if (error) {
        console.log('    ❌ Error:', error.message);
      } else {
        console.log('    ✅ Updated successfully');
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Verification:\n');

  // Verify the results
  for (const payment of payments) {
    const { data: splits } = await supabase
      .from('payment_split')
      .select('*')
      .eq('payment_id', payment.id);

    console.log('Payment', payment.payment_sequence + ':');
    splits.forEach(s => {
      console.log('  Split Total: $' + s.split_broker_total + ' (AGCI: $' + payment.agci + ')');
    });
  }
}

manuallyFixSplits();
