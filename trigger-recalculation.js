const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function triggerRecalculation() {
  const dealId = 'be4b7d08-15ba-43cc-8743-65edec3fc4f8';

  console.log('Fetching payments with overrides...\n');

  // Get all payments with amount_override = true
  const { data: payments, error: paymentError } = await supabase
    .from('payment')
    .select('*')
    .eq('deal_id', dealId)
    .eq('amount_override', true);

  if (paymentError) {
    console.error('Error fetching payments:', paymentError);
    return;
  }

  console.log('Found ' + payments.length + ' payment(s) with overrides\n');

  for (const payment of payments) {
    console.log('Processing payment ' + payment.payment_sequence + '...');
    console.log('  Current amount: ' + payment.payment_amount);
    console.log('  Current AGCI: ' + payment.agci);

    // Trigger recalculation by updating the payment (touch it with same override_at value)
    // This will fire the BEFORE UPDATE triggers which recalculate AGCI
    // and the AFTER UPDATE trigger which recalculates splits
    const { data, error } = await supabase
      .from('payment')
      .update({
        override_at: new Date().toISOString()
      })
      .eq('id', payment.id)
      .select();

    if (error) {
      console.error('  ❌ Error updating payment:', error);
    } else {
      console.log('  ✅ Triggered recalculation');
      if (data && data[0]) {
        console.log('  New AGCI: ' + data[0].agci);
      }
    }
  }

  console.log('\nRecalculation triggered. Verifying results...\n');

  // Wait a moment for triggers to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Verify the results
  const { data: updatedPayment } = await supabase
    .from('payment')
    .select('*, payment_split(*)')
    .eq('deal_id', dealId)
    .eq('amount_override', true)
    .order('payment_sequence')
    .limit(1)
    .single();

  if (updatedPayment) {
    console.log('Updated Payment:');
    console.log('  Payment Amount:', updatedPayment.payment_amount);
    console.log('  AGCI:', updatedPayment.agci);
    console.log('  Splits:', updatedPayment.payment_split.map(s => s.split_broker_total));
  }
}

triggerRecalculation();
