/**
 * Admin Login As User Script
 *
 * This script generates a magic link to log in as any portal user.
 * Used for debugging user-specific issues without needing their password.
 *
 * Usage:
 *   npx ts-node scripts/admin-login-as-user.ts "user@example.com"
 *
 * Or with bun:
 *   bun scripts/admin-login-as-user.ts "user@example.com"
 *
 * Requirements:
 *   - VITE_SUPABASE_URL in .env
 *   - SUPABASE_SERVICE_ROLE_KEY in .env (NOT the anon key - needs admin privileges)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing required environment variables:');
  if (!supabaseUrl) console.error('   - VITE_SUPABASE_URL');
  if (!serviceRoleKey) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nMake sure these are set in your .env file.');
  process.exit(1);
}

// Create admin client with service role key
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function generateLoginLink(email: string) {
  console.log(`\n🔍 Looking up user: ${email}\n`);

  // First, find the user in auth.users
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();

  if (userError) {
    console.error('❌ Error fetching users:', userError.message);
    process.exit(1);
  }

  const user = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    console.error(`❌ No user found with email: ${email}`);
    console.log('\nAvailable portal users (showing first 10):');
    userData.users
      .filter(u => u.email)
      .slice(0, 10)
      .forEach(u => console.log(`   - ${u.email}`));
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);
  console.log(`   Created: ${user.created_at}`);
  console.log(`   Last sign in: ${user.last_sign_in_at || 'Never'}`);

  // Generate a magic link for the user
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email!,
    options: {
      redirectTo: `${process.env.VITE_APP_URL || 'http://localhost:5173'}/portal`,
    },
  });

  if (linkError) {
    console.error('❌ Error generating magic link:', linkError.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🔐 ADMIN LOGIN LINK GENERATED');
  console.log('='.repeat(60));
  console.log('\nOpen this link in an incognito/private browser window:');
  console.log('\n' + linkData.properties.action_link);
  console.log('\n⚠️  This link expires in 1 hour.');
  console.log('⚠️  Use an incognito window to avoid logging out your current session.');
  console.log('='.repeat(60) + '\n');
}

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.error('Usage: npx ts-node scripts/admin-login-as-user.ts "user@example.com"');
  process.exit(1);
}

generateLoginLink(email);
