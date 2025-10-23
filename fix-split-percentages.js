const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function fixSplitPercentages() {
  const dealId = 'be4b7d08-15ba-43cc-8743-65edec3fc4f8';

  console.log('Fetching payment splits with incorrect percentages...\n');

  // Get all payment_splits for this deal
  const { data: payments } = await supabase
    .from('payment')
    .select('id, payment_sequence')
    .eq('deal_id', dealId)
    .order('payment_sequence');

  for (const payment of payments) {
    const { data: splits } = await supabase
      .from('payment_split')
      .select('*')
      .eq('payment_id', payment.id);

    console.log('Payment ' + payment.payment_sequence + ':');

    for (const split of splits) {
      console.log('  Current: ' + split.split_origination_percent + '% / ' + split.split_site_percent + '% / ' + split.split_deal_percent + '%');
      console.log('  Dollar amounts: $' + split.split_origination_usd + ' / $' + split.split_site_usd + ' / $' + split.split_deal_usd);
      console.log('  Total: $' + split.split_broker_total);

      // Fix the percentages to match the dollar amounts
      // The percentages should be: 13.75% / 6.875% / 6.875%
      const { data, error } = await supabase
        .from('payment_split')
        .update({
          split_origination_percent: 13.75,
          split_site_percent: 6.875,
          split_deal_percent: 6.875
        })
        .eq('id', split.id)
        .select();

      if (error) {
        console.log('  ❌ Error:', error.message);
      } else {
        console.log('  ✅ Fixed percentages to 13.75% / 6.875% / 6.875%');
      }
    }
  }

  console.log('\nNow triggering recalculation of dollar amounts based on correct percentages...\n');

  // Trigger recalculation by touching the payments
  for (const payment of payments) {
    const { error } = await supabase
      .from('payment')
      .update({ override_at: new Date().toISOString() })
      .eq('id', payment.id);

    if (!error) {
      console.log('✅ Recalculated payment ' + payment.payment_sequence);
    }
  }

  console.log('\nVerifying results...\n');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check the results
  for (const payment of payments) {
    const { data: splits } = await supabase
      .from('payment_split')
      .select('*')
      .eq('payment_id', payment.id);

    const { data: paymentData } = await supabase
      .from('payment')
      .select('payment_amount, agci')
      .eq('id', payment.id)
      .single();

    console.log('Payment ' + payment.payment_sequence + ' ($' + paymentData.payment_amount + ', AGCI: $' + paymentData.agci + '):');
    splits.forEach(s => {
      console.log('  Split: $' + s.split_origination_usd + ' + $' + s.split_site_usd + ' + $' + s.split_deal_usd + ' = $' + s.split_broker_total);
    });
  }
}

fixSplitPercentages();
