/**
 * Quick DB sanity check for a single merchant brand.
 * Usage: bun scripts/checkBrand.ts "A&W"
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const brandName = process.argv[2];
if (!brandName) {
  console.error('Usage: bun scripts/checkBrand.ts "Brand Name"');
  process.exit(1);
}

const { data, error } = await supabase
  .from('merchant_brand')
  .select('name, brandfetch_domain, logo_url, logo_fetched_at')
  .eq('name', brandName)
  .single();

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
