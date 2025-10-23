const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function validateAllSplits() {
  console.log('Validating all payment splits across all deals...\n');

  // Get all deals with payments
  const { data: deals, error: dealsError } = await supabase
    .from('deal')
    .select('id, deal_name, origination_percent, site_percent, deal_percent')
    .order('deal_name');

  if (dealsError) {
    console.error('Error fetching deals:', dealsError);
    return;
  }

  console.log(`Found ${deals.length} deals to validate\n`);

  let totalIssues = 0;
  let totalValidated = 0;
  const issuesByDeal = [];

  for (const deal of deals) {
    // Get payments for this deal
    const { data: payments, error: paymentsError } = await supabase
      .from('payment')
      .select('id, payment_sequence, payment_amount, agci')
      .eq('deal_id', deal.id)
      .order('payment_sequence');

    if (paymentsError || !payments || payments.length === 0) {
      continue;
    }

    for (const payment of payments) {
      // Get payment splits
      const { data: splits, error: splitsError } = await supabase
        .from('payment_split')
        .select('*')
        .eq('payment_id', payment.id);

      if (splitsError || !splits || splits.length === 0) {
        continue;
      }

      for (const split of splits) {
        totalValidated++;

        // Calculate expected values based on AGCI
        const paymentOrigination = (deal.origination_percent / 100) * payment.agci;
        const paymentSite = (deal.site_percent / 100) * payment.agci;
        const paymentDeal = (deal.deal_percent / 100) * payment.agci;

        const expectedOrig = paymentOrigination * (split.split_origination_percent / 100);
        const expectedSite = paymentSite * (split.split_site_percent / 100);
        const expectedDeal = paymentDeal * (split.split_deal_percent / 100);
        const expectedTotal = expectedOrig + expectedSite + expectedDeal;

        // Check if values are correct (within 1 cent tolerance for rounding)
        const origMatch = Math.abs(split.split_origination_usd - expectedOrig) < 0.01;
        const siteMatch = Math.abs(split.split_site_usd - expectedSite) < 0.01;
        const dealMatch = Math.abs(split.split_deal_usd - expectedDeal) < 0.01;
        const totalMatch = Math.abs(split.split_broker_total - expectedTotal) < 0.01;

        if (!origMatch || !siteMatch || !dealMatch || !totalMatch) {
          totalIssues++;
          issuesByDeal.push({
            dealName: deal.deal_name,
            paymentSeq: payment.payment_sequence,
            paymentAGCI: payment.agci,
            actual: {
              orig: split.split_origination_usd,
              site: split.split_site_usd,
              deal: split.split_deal_usd,
              total: split.split_broker_total
            },
            expected: {
              orig: expectedOrig.toFixed(2),
              site: expectedSite.toFixed(2),
              deal: expectedDeal.toFixed(2),
              total: expectedTotal.toFixed(2)
            }
          });
        }
      }
    }
  }

  console.log('='.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Payment Splits Validated: ${totalValidated}`);
  console.log(`Issues Found: ${totalIssues}`);
  console.log(`Success Rate: ${((totalValidated - totalIssues) / totalValidated * 100).toFixed(2)}%`);

  if (totalIssues > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('ISSUES DETAILS (First 10):');
    console.log('='.repeat(80));
    issuesByDeal.slice(0, 10).forEach((issue, idx) => {
      console.log(`\n${idx + 1}. ${issue.dealName} - Payment ${issue.paymentSeq} (AGCI: $${issue.paymentAGCI})`);
      console.log('   Actual:   Orig $' + issue.actual.orig + ', Site $' + issue.actual.site + ', Deal $' + issue.actual.deal + ', Total $' + issue.actual.total);
      console.log('   Expected: Orig $' + issue.expected.orig + ', Site $' + issue.expected.site + ', Deal $' + issue.expected.deal + ', Total $' + issue.expected.total);
    });

    if (totalIssues > 10) {
      console.log(`\n... and ${totalIssues - 10} more issues`);
    }
  } else {
    console.log('\n✅ All payment splits are correct!');
  }
}

validateAllSplits();
