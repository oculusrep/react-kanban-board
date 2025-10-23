const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function generateEnhancedDiagnostic() {
  console.log('='.repeat(100));
  console.log('ENHANCED DIAGNOSTIC REPORT: Payment Splits Analysis');
  console.log('='.repeat(100));
  console.log('\nFiltering logic:');
  console.log('- Rounding errors: Difference < $0.10 (acceptable)');
  console.log('- Minor issues: $0.10 - $1.00 (review)');
  console.log('- Major issues: > $1.00 (needs fixing)\n');

  const { data: deals } = await supabase
    .from('deal')
    .select('id, deal_name, fee, agci, origination_percent, site_percent, deal_percent, referral_fee_percent')
    .order('deal_name');

  if (!deals) return;

  let totalSplits = 0;
  let roundingErrors = 0;
  let minorIssues = 0;
  let majorIssues = 0;
  let salesforceMatches = 0;
  let salesforceMismatches = 0;

  const issuesByCategory = {
    rounding: [],
    minor: [],
    major: []
  };

  for (const deal of deals) {
    const { data: payments } = await supabase
      .from('payment')
      .select('id, payment_sequence, payment_amount, agci, amount_override')
      .eq('deal_id', deal.id)
      .order('payment_sequence');

    if (!payments || payments.length === 0) continue;

    for (const payment of payments) {
      const { data: splits } = await supabase
        .from('payment_split')
        .select('*, broker:broker_id(name)')
        .eq('payment_id', payment.id);

      if (!splits || splits.length === 0) continue;

      for (const split of splits) {
        totalSplits++;

        // Calculate expected values
        const paymentOrig = (deal.origination_percent / 100) * payment.agci;
        const paymentSite = (deal.site_percent / 100) * payment.agci;
        const paymentDeal = (deal.deal_percent / 100) * payment.agci;

        const expectedOrig = paymentOrig * (split.split_origination_percent / 100);
        const expectedSite = paymentSite * (split.split_site_percent / 100);
        const expectedDeal = paymentDeal * (split.split_deal_percent / 100);
        const expectedTotal = expectedOrig + expectedSite + expectedDeal;

        const difference = Math.abs(expectedTotal - split.split_broker_total);

        // Parse Salesforce data
        let sfOrig = null, sfSite = null, sfDeal = null;
        if (split.sf_payment_info) {
          const origMatch = split.sf_payment_info.match(/Origination:\s*\$?([\d,]+\.?\d*)/);
          const siteMatch = split.sf_payment_info.match(/Site:\s*\$?([\d,]+\.?\d*)/);
          const dealMatch = split.sf_payment_info.match(/Deal:\s*\$?([\d,]+\.?\d*)/);

          if (origMatch) sfOrig = parseFloat(origMatch[1].replace(/,/g, ''));
          if (siteMatch) sfSite = parseFloat(siteMatch[1].replace(/,/g, ''));
          if (dealMatch) sfDeal = parseFloat(dealMatch[1].replace(/,/g, ''));
        }

        // Check SF match
        let sfMatch = null;
        if (sfOrig !== null) {
          sfMatch = Math.abs(expectedOrig - sfOrig) < 0.01 &&
                    Math.abs(expectedSite - sfSite) < 0.01 &&
                    Math.abs(expectedDeal - sfDeal) < 0.01;
          if (sfMatch) {
            salesforceMatches++;
          } else {
            salesforceMismatches++;
          }
        }

        // Categorize by severity
        const issue = {
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
          difference,
          sfMatch
        };

        if (difference < 0.10) {
          roundingErrors++;
          issuesByCategory.rounding.push(issue);
        } else if (difference < 1.00) {
          minorIssues++;
          issuesByCategory.minor.push(issue);
        } else {
          majorIssues++;
          issuesByCategory.major.push(issue);
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY BY SEVERITY');
  console.log('='.repeat(100));
  console.log(`Total Payment Splits: ${totalSplits}`);
  console.log(`\n✅ Acceptable (< $0.10 difference): ${roundingErrors} (${(roundingErrors/totalSplits*100).toFixed(1)}%)`);
  console.log(`⚠️  Minor Issues ($0.10 - $1.00): ${minorIssues} (${(minorIssues/totalSplits*100).toFixed(1)}%)`);
  console.log(`❌ Major Issues (> $1.00): ${majorIssues} (${(majorIssues/totalSplits*100).toFixed(1)}%)`);

  if (salesforceMatches + salesforceMismatches > 0) {
    console.log(`\n📊 Salesforce Comparison:`);
    console.log(`   Matches: ${salesforceMatches}`);
    console.log(`   Differs: ${salesforceMismatches}`);
  }

  // Show major issues first
  if (majorIssues > 0) {
    console.log('\n' + '='.repeat(100));
    console.log('❌ MAJOR ISSUES (> $1.00 difference):');
    console.log('='.repeat(100));

    issuesByCategory.major.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.dealName} - Payment ${item.paymentSeq}${item.isOverride ? ' (OVERRIDDEN)' : ''}`);
      console.log(`   Broker: ${item.brokerName}`);
      console.log(`   AGCI: $${item.paymentAGCI.toFixed(2)}`);
      console.log(`   Deal Categories: Orig ${item.dealCategories.orig}%, Site ${item.dealCategories.site}%, Deal ${item.dealCategories.deal}%`);
      console.log(`   Broker Splits: Orig ${item.brokerSplits.orig}%, Site ${item.brokerSplits.site}%, Deal ${item.brokerSplits.deal}%`);
      console.log('   Current:  $' + item.current.total.toFixed(2) + ' (Orig $' + item.current.orig.toFixed(2) + ', Site $' + item.current.site.toFixed(2) + ', Deal $' + item.current.deal.toFixed(2) + ')');
      console.log('   Expected: $' + item.expected.total.toFixed(2) + ' (Orig $' + item.expected.orig.toFixed(2) + ', Site $' + item.expected.site.toFixed(2) + ', Deal $' + item.expected.deal.toFixed(2) + ')');
      console.log(`   ⚠️  DIFFERENCE: $${item.difference.toFixed(2)}`);
      if (item.salesforce.orig !== null) {
        console.log('   Salesforce: Orig $' + item.salesforce.orig.toFixed(2) + ', Site $' + item.salesforce.site.toFixed(2) + ', Deal $' + item.salesforce.deal.toFixed(2));
        console.log(`   SF Match: ${item.sfMatch ? '✅' : '❌'}`);
      }
    });
  }

  // Show minor issues
  if (minorIssues > 0) {
    console.log('\n' + '='.repeat(100));
    console.log(`⚠️  MINOR ISSUES ($0.10 - $1.00 difference): ${minorIssues} found`);
    console.log('='.repeat(100));
    console.log('(Showing first 5)');

    issuesByCategory.minor.slice(0, 5).forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.dealName} - Payment ${item.paymentSeq}`);
      console.log(`   Current: $${item.current.total.toFixed(2)} | Expected: $${item.expected.total.toFixed(2)} | Diff: $${item.difference.toFixed(2)}`);
    });
  }

  // Show rounding errors summary
  console.log('\n' + '='.repeat(100));
  console.log(`✅ ROUNDING ERRORS (< $0.10 difference): ${roundingErrors} found`);
  console.log('='.repeat(100));
  console.log('These are acceptable and do not require fixing.');
  console.log(`Average difference: $${(issuesByCategory.rounding.reduce((sum, i) => sum + i.difference, 0) / roundingErrors).toFixed(4)}`);

  // Financial impact
  const totalRoundingDiff = issuesByCategory.rounding.reduce((sum, i) => sum + i.difference, 0);
  const totalMinorDiff = issuesByCategory.minor.reduce((sum, i) => sum + i.difference, 0);
  const totalMajorDiff = issuesByCategory.major.reduce((sum, i) => sum + i.difference, 0);

  console.log('\n' + '='.repeat(100));
  console.log('FINANCIAL IMPACT');
  console.log('='.repeat(100));
  console.log(`Rounding errors total: $${totalRoundingDiff.toFixed(2)} (acceptable)`);
  console.log(`Minor issues total: $${totalMinorDiff.toFixed(2)}`);
  console.log(`Major issues total: $${totalMajorDiff.toFixed(2)}`);
  console.log(`TOTAL: $${(totalRoundingDiff + totalMinorDiff + totalMajorDiff).toFixed(2)}`);

  // Recommendations
  console.log('\n' + '='.repeat(100));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(100));
  if (majorIssues === 0 && minorIssues === 0) {
    console.log('✅ All splits are within acceptable tolerance (< $0.10)');
    console.log('   NO ACTION NEEDED - System is working correctly!');
  } else if (majorIssues > 0) {
    console.log('❌ CRITICAL: ' + majorIssues + ' splits have major calculation errors (> $1.00)');
    console.log('   ACTION REQUIRED: Investigate these deals immediately');
    console.log('   Run migration: 20251023_fix_existing_splits_data.sql');
  } else if (minorIssues > 0) {
    console.log('⚠️  WARNING: ' + minorIssues + ' splits have minor issues ($0.10 - $1.00)');
    console.log('   REVIEW RECOMMENDED: Check if these warrant fixing');
  }
  console.log('='.repeat(100));
}

generateEnhancedDiagnostic();
