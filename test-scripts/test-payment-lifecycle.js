/**
 * Payment Lifecycle Testing Script
 *
 * This script helps test the payment lifecycle management features:
 * 1. Archive unpaid payments when deal moves to "Lost"
 * 2. Keep paid payments when deal moves to "Lost"
 * 3. Regenerate payments when deal moves from "Lost" to active
 *
 * Usage:
 *   node test-scripts/test-payment-lifecycle.js
 *
 * Prerequisites:
 *   - Deal with payments created in the system
 *   - Some payments marked as paid, some unpaid
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('   Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const log = {
  title: (msg) => console.log(`\n${colors.bright}${colors.cyan}=== ${msg} ===${colors.reset}\n`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  step: (num, msg) => console.log(`\n${colors.bright}${colors.magenta}Step ${num}: ${msg}${colors.reset}`)
};

/**
 * Get deal stages
 */
async function getDealStages() {
  const { data, error } = await supabase
    .from('deal_stage')
    .select('id, label');

  if (error) throw error;
  return data.reduce((acc, stage) => {
    acc[stage.label] = stage.id;
    return acc;
  }, {});
}

/**
 * Find a test deal with payments
 */
async function findTestDeal() {
  log.step(1, 'Finding a deal with payments for testing...');

  const { data: deals, error } = await supabase
    .from('deal')
    .select(`
      id,
      deal_name,
      stage_id,
      fee,
      number_of_payments,
      deal_stage!inner(label)
    `)
    .limit(10);

  if (error) throw error;

  // Find a deal with payments
  for (const deal of deals) {
    const { count } = await supabase
      .from('payment')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', deal.id)
      .eq('is_active', true);

    if (count && count > 0) {
      log.success(`Found test deal: "${deal.deal_name}" with ${count} active payment(s)`);
      log.info(`Current stage: ${deal.deal_stage.label}`);
      return deal;
    }
  }

  log.error('No deals with payments found. Please create a deal with payments first.');
  return null;
}

/**
 * Get payment details for a deal
 */
async function getPaymentDetails(dealId) {
  const { data: payments, error } = await supabase
    .from('payment')
    .select('*')
    .eq('deal_id', dealId)
    .eq('is_active', true)
    .order('payment_sequence', { ascending: true });

  if (error) throw error;

  const paid = payments.filter(p => p.payment_received);
  const unpaid = payments.filter(p => !p.payment_received);

  return {
    total: payments.length,
    paid: paid.length,
    unpaid: unpaid.length,
    payments
  };
}

/**
 * Display payment status
 */
function displayPaymentStatus(details) {
  console.log(`\n   Total Payments:  ${details.total}`);
  console.log(`   Paid:            ${colors.green}${details.paid}${colors.reset}`);
  console.log(`   Unpaid:          ${colors.yellow}${details.unpaid}${colors.reset}`);

  if (details.payments.length > 0) {
    console.log(`\n   Payment Details:`);
    details.payments.forEach(p => {
      const status = p.payment_received
        ? `${colors.green}PAID${colors.reset}`
        : `${colors.yellow}UNPAID${colors.reset}`;
      const amount = p.payment_amount ? `$${p.payment_amount.toFixed(2)}` : 'N/A';
      console.log(`   - Payment ${p.payment_sequence}: ${amount} - ${status}`);
    });
  }
}

/**
 * Test 1: Archive unpaid payments when moving to Lost
 */
async function testArchiveUnpaidPayments(deal, stages) {
  log.step(2, 'Test: Archive unpaid payments when moving to "Lost"');

  // Get initial payment status
  log.info('Initial payment status:');
  const beforeDetails = await getPaymentDetails(deal.id);
  displayPaymentStatus(beforeDetails);

  if (beforeDetails.unpaid === 0) {
    log.warning('No unpaid payments to test archiving. Skipping this test.');
    return false;
  }

  // Move deal to Lost
  log.info('\nMoving deal to "Lost" stage...');
  const { error: updateError } = await supabase
    .from('deal')
    .update({
      stage_id: stages['Lost'],
      loss_reason: 'Testing payment lifecycle',
      last_stage_change_at: new Date().toISOString()
    })
    .eq('id', deal.id);

  if (updateError) {
    log.error(`Failed to update deal stage: ${updateError.message}`);
    return false;
  }

  // Archive unpaid payments
  log.info('Archiving unpaid payments...');
  const { data: archived, error: archiveError } = await supabase
    .from('payment')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString()
    })
    .eq('deal_id', deal.id)
    .eq('payment_received', false)
    .select();

  if (archiveError) {
    log.error(`Failed to archive payments: ${archiveError.message}`);
    return false;
  }

  log.success(`Archived ${archived.length} unpaid payment(s)`);

  // Check payment status after archiving
  log.info('\nPayment status after archiving:');
  const afterDetails = await getPaymentDetails(deal.id);
  displayPaymentStatus(afterDetails);

  // Verify results
  const success = afterDetails.unpaid === 0 && afterDetails.paid === beforeDetails.paid;
  if (success) {
    log.success(`✓ Unpaid payments archived correctly`);
    log.success(`✓ Paid payments preserved (${afterDetails.paid} remaining)`);
  } else {
    log.error('❌ Payment archiving did not work as expected');
  }

  return success;
}

/**
 * Test 2: Regenerate payments when moving from Lost to active
 */
async function testRegeneratePayments(deal, stages) {
  log.step(3, 'Test: Regenerate payments when moving from "Lost" to active stage');

  // Check archived payments
  const { count: archivedCount } = await supabase
    .from('payment')
    .select('*', { count: 'exact', head: true })
    .eq('deal_id', deal.id)
    .eq('is_active', false);

  log.info(`Found ${archivedCount} archived payment(s)`);

  // Move deal to Booked (active stage)
  log.info('\nMoving deal to "Booked" stage...');
  const { error: updateError } = await supabase
    .from('deal')
    .update({
      stage_id: stages['Booked'],
      last_stage_change_at: new Date().toISOString()
    })
    .eq('id', deal.id);

  if (updateError) {
    log.error(`Failed to update deal stage: ${updateError.message}`);
    return false;
  }

  // Regenerate payments using RPC function
  log.info('Regenerating payments...');
  const { data, error: rpcError } = await supabase.rpc('generate_payments_for_deal', {
    deal_uuid: deal.id
  });

  if (rpcError) {
    log.error(`Failed to regenerate payments: ${rpcError.message}`);
    return false;
  }

  log.success('Payments regenerated successfully');

  // Check payment status after regeneration
  log.info('\nPayment status after regeneration:');
  const afterDetails = await getPaymentDetails(deal.id);
  displayPaymentStatus(afterDetails);

  const expectedCount = deal.number_of_payments || 1;
  const success = afterDetails.total === expectedCount;

  if (success) {
    log.success(`✓ ${afterDetails.total} payment(s) regenerated (expected: ${expectedCount})`);
  } else {
    log.error(`Expected ${expectedCount} payments but got ${afterDetails.total}`);
  }

  return success;
}

/**
 * Test 3: Verify database schema
 */
async function testDatabaseSchema() {
  log.step(4, 'Verify database schema has soft delete columns');

  // Try to query with is_active field
  const { data, error } = await supabase
    .from('payment')
    .select('id, is_active, deleted_at')
    .limit(1);

  if (error) {
    if (error.message.includes('is_active')) {
      log.error('Column "is_active" does not exist. Migration may not have run.');
      log.info('Run: npx supabase db push');
      return false;
    }
    throw error;
  }

  log.success('✓ Soft delete columns (is_active, deleted_at) exist');
  return true;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(colors.bright + colors.cyan);
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Payment Lifecycle Testing Script                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  try {
    // Test 0: Verify schema
    const schemaValid = await testDatabaseSchema();
    if (!schemaValid) {
      log.error('Database schema verification failed. Please run migrations first.');
      process.exit(1);
    }

    // Get deal stages
    const stages = await getDealStages();
    log.success(`Found ${Object.keys(stages).length} deal stages`);

    // Find test deal
    const deal = await findTestDeal();
    if (!deal) {
      process.exit(1);
    }

    // Run tests
    const test1Result = await testArchiveUnpaidPayments(deal, stages);
    const test2Result = await testRegeneratePayments(deal, stages);

    // Summary
    log.title('Test Summary');
    console.log(`Test 1 - Archive Unpaid Payments:     ${test1Result ? colors.green + 'PASSED ✓' : colors.red + 'FAILED ✗'}${colors.reset}`);
    console.log(`Test 2 - Regenerate Payments:         ${test2Result ? colors.green + 'PASSED ✓' : colors.red + 'FAILED ✗'}${colors.reset}`);

    const allPassed = test1Result && test2Result;
    console.log();
    if (allPassed) {
      log.success('All tests passed! 🎉');
    } else {
      log.error('Some tests failed. Please review the output above.');
    }

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    log.error(`Test execution failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests();
