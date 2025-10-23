const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function generateDiagnosticReport() {
  console.log('='.repeat(100));
  console.log('DIAGNOSTIC REPORT: Payment Splits Analysis (BEFORE FIX)');
  console.log('='.repeat(100));
  console.log('\nThis report compares:');
  console.log('1. Current database values (what we have now)');
  console.log('2. Expected values based on AGCI formula');
  console.log('3. Salesforce values (from sf_payment_info field)\n');

  // Get all deals with payments and splits
  const { data: deals, error: dealsError } = await supabase
    .from('deal')
    .select('id, deal_name, fee, agci, origination_percent, site_percent, deal_percent, referral_fee_percent')
    .order('deal_name');

  if (dealsError) {
    console.error('Error fetching deals:', dealsError);
    return;
  }

  let totalSplits = 0;
  let totalMismatches = 0;
  let totalSalesforceMatches = 0;
  let totalSalesforceMismatches = 0;

  const reportData = [];

  for (const deal of deals) {
    // Get payments for this deal
    const { data: payments } = await supabase
      .from('payment')
      .select('id, payment_sequence, payment_amount, agci, amount_override')
      .eq('deal_id', deal.id)
      .order('payment_sequence');

    if (!payments || payments.length === 0) continue;

    for (const payment of payments) {
      // Get payment splits
      const { data: splits } = await supabase
        .from('payment_split')
        .select('*, broker:broker_id(name)')
        .eq('payment_id', payment.id);

      if (!splits || splits.length === 0) continue;

      for (const split of splits) {
        totalSplits++;

        // Calculate expected values based on AGCI formula
        const paymentOrig = (deal.origination_percent / 100) * payment.agci;
        const paymentSite = (deal.site_percent / 100) * payment.agci;
        const paymentDeal = (deal.deal_percent / 100) * payment.agci;

        const expectedOrig = paymentOrig * (split.split_origination_percent / 100);
        const expectedSite = paymentSite * (split.split_site_percent / 100);
        const expectedDeal = paymentDeal * (split.split_deal_percent / 100);
        const expectedTotal = expectedOrig + expectedSite + expectedDeal;

        // Parse Salesforce payment info if available
        let sfOrig = null, sfSite = null, sfDeal = null;
        if (split.sf_payment_info) {
          const origMatch = split.sf_payment_info.match(/Origination:\s*\$?([\d,]+\.?\d*)/);
          const siteMatch = split.sf_payment_info.match(/Site:\s*\$?([\d,]+\.?\d*)/);
          const dealMatch = split.sf_payment_info.match(/Deal:\s*\$?([\d,]+\.?\d*)/);

          if (origMatch) sfOrig = parseFloat(origMatch[1].replace(/,/g, ''));
          if (siteMatch) sfSite = parseFloat(siteMatch[1].replace(/,/g, ''));
          if (dealMatch) sfDeal = parseFloat(dealMatch[1].replace(/,/g, ''));
        }

        // Check if values match (within 1 cent tolerance)
        const origMatch = Math.abs(split.split_origination_usd - expectedOrig) < 0.01;
        const siteMatch = Math.abs(split.split_site_usd - expectedSite) < 0.01;
        const dealMatch = Math.abs(split.split_deal_usd - expectedDeal) < 0.01;
        const totalMatch = Math.abs(split.split_broker_total - expectedTotal) < 0.01;
        const allMatch = origMatch && siteMatch && dealMatch && totalMatch;

        if (!allMatch) totalMismatches++;

        // Check Salesforce match
        let sfMatch = null;
        if (sfOrig !== null) {
          sfMatch = Math.abs(expectedOrig - sfOrig) < 0.01 &&
                    Math.abs(expectedSite - sfSite) < 0.01 &&
                    Math.abs(expectedDeal - sfDeal) < 0.01;
          if (sfMatch) {
            totalSalesforceMatches++;
          } else {
            totalSalesforceMismatches++;
          }
        }

        reportData.push({
          dealName: deal.deal_name,
          paymentSeq: payment.payment_sequence,
          paymentAmount: payment.payment_amount,
          paymentAGCI: payment.agci,
          isOverride: payment.amount_override,
          brokerName: split.broker?.name || 'Unknown',
          dealCategories: {
            orig: deal.origination_percent,
            site: deal.site_percent,
            deal: deal.deal_percent
          },
          brokerSplits: {
            orig: split.split_origination_percent,
            site: split.split_site_percent,
            deal: split.split_deal_percent
          },
          current: {
            orig: split.split_origination_usd,
            site: split.split_site_usd,
            deal: split.split_deal_usd,
            total: split.split_broker_total
          },
          expected: {
            orig: expectedOrig,
            site: expectedSite,
            deal: expectedDeal,
            total: expectedTotal
          },
          salesforce: {
            orig: sfOrig,
            site: sfSite,
            deal: sfDeal
          },
          match: allMatch,
          sfMatch: sfMatch
        });
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total Payment Splits: ${totalSplits}`);
  console.log(`Matches Expected Formula: ${totalSplits - totalMismatches} (${((totalSplits - totalMismatches) / totalSplits * 100).toFixed(1)}%)`);
  console.log(`Mismatches: ${totalMismatches} (${(totalMismatches / totalSplits * 100).toFixed(1)}%)`);

  if (totalSalesforceMatches + totalSalesforceMismatches > 0) {
    console.log(`\nSalesforce Comparison (where data available):`);
    console.log(`  Expected formula matches Salesforce: ${totalSalesforceMatches}`);
    console.log(`  Expected formula differs from Salesforce: ${totalSalesforceMismatches}`);
  }

  // Show mismatches
  if (totalMismatches > 0) {
    console.log('\n' + '='.repeat(100));
    console.log('MISMATCHES (First 20):');
    console.log('='.repeat(100));

    const mismatches = reportData.filter(r => !r.match).slice(0, 20);

    mismatches.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.dealName} - Payment ${item.paymentSeq}${item.isOverride ? ' (OVERRIDDEN)' : ''}`);
      console.log(`   Broker: ${item.brokerName}`);
      console.log(`   Payment Amount: $${item.paymentAmount.toLocaleString()} | AGCI: $${item.paymentAGCI.toLocaleString()}`);
      console.log(`   Deal Categories: Orig ${item.dealCategories.orig}%, Site ${item.dealCategories.site}%, Deal ${item.dealCategories.deal}%`);
      console.log(`   Broker Splits: Orig ${item.brokerSplits.orig}%, Site ${item.brokerSplits.site}%, Deal ${item.brokerSplits.deal}%`);
      console.log('   ');
      console.log('   Current DB:  Orig $' + item.current.orig.toFixed(2) + ', Site $' + item.current.site.toFixed(2) + ', Deal $' + item.current.deal.toFixed(2) + ', Total $' + item.current.total.toFixed(2));
      console.log('   Expected:    Orig $' + item.expected.orig.toFixed(2) + ', Site $' + item.expected.site.toFixed(2) + ', Deal $' + item.expected.deal.toFixed(2) + ', Total $' + item.expected.total.toFixed(2));

      if (item.salesforce.orig !== null) {
        console.log('   Salesforce:  Orig $' + item.salesforce.orig.toFixed(2) + ', Site $' + item.salesforce.site.toFixed(2) + ', Deal $' + item.salesforce.deal.toFixed(2));
        console.log(`   SF Match: ${item.sfMatch ? '✅ Expected matches SF' : '❌ Expected differs from SF'}`);
      }

      const diff = item.expected.total - item.current.total;
      console.log(`   Difference: $${diff.toFixed(2)} (${diff > 0 ? 'underpaid' : 'overpaid'})`);
    });

    if (totalMismatches > 20) {
      console.log(`\n... and ${totalMismatches - 20} more mismatches`);
    }
  }

  // Calculate total financial impact
  const totalDifference = reportData.reduce((sum, item) => {
    return sum + (item.expected.total - item.current.total);
  }, 0);

  console.log('\n' + '='.repeat(100));
  console.log('FINANCIAL IMPACT');
  console.log('='.repeat(100));
  console.log(`Total Difference Across All Splits: $${totalDifference.toFixed(2)}`);
  console.log(`Average Difference Per Split: $${(totalDifference / totalSplits).toFixed(2)}`);

  // Show a few correct examples
  const correct = reportData.filter(r => r.match).slice(0, 3);
  if (correct.length > 0) {
    console.log('\n' + '='.repeat(100));
    console.log('EXAMPLES OF CORRECT SPLITS (First 3):');
    console.log('='.repeat(100));

    correct.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.dealName} - Payment ${item.paymentSeq}`);
      console.log(`   Broker: ${item.brokerName}`);
      console.log(`   AGCI: $${item.paymentAGCI.toFixed(2)}`);
      console.log('   Split Total: $' + item.current.total.toFixed(2) + ' ✅ Correct');
    });
  }

  console.log('\n' + '='.repeat(100));
  console.log('RECOMMENDATION');
  console.log('='.repeat(100));
  if (totalMismatches === 0) {
    console.log('✅ All splits are correct! No migration needed.');
  } else {
    console.log(`⚠️  Found ${totalMismatches} incorrect splits that need to be fixed.`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Review the mismatches above');
    console.log('2. If Salesforce data differs, investigate which is correct');
    console.log('3. Run migration: 20251023_fix_existing_splits_data.sql');
    console.log('4. Run validation: node validate-all-splits.js');
  }
  console.log('='.repeat(100));
}

generateDiagnosticReport();
