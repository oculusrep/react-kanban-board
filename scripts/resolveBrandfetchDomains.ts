/**
 * Resolve Brandfetch Domains for Merchant Brands
 *
 * One-time (and re-runnable) script that walks merchant_brand rows where
 * brandfetch_domain IS NULL and:
 *   1. Queries Brandfetch's Search API with the brand name.
 *   2. Picks the top match (prefer "claimed" brands, then highest quality score).
 *   3. Builds the Brandfetch CDN URL and writes brandfetch_domain + logo_url
 *      + logo_fetched_at to the row.
 *
 * Per Brandfetch ToS, we HOT-LINK logos via the CDN URL at render time.
 * We do NOT download the image files. See docs/MERCHANTS_LAYER_SPEC.md §5.
 *
 * Usage:
 *   bun scripts/resolveBrandfetchDomains.ts
 *   bun scripts/resolveBrandfetchDomains.ts --limit=10            # test with 10 brands
 *   bun scripts/resolveBrandfetchDomains.ts --force               # re-resolve all, even if already set
 *   bun scripts/resolveBrandfetchDomains.ts --only=Starbucks,Kroger   # specific brands only
 *
 * Or with npm script: npm run brandfetch:resolve
 *
 * Requires in .env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_BRANDFETCH_CLIENT_ID
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const brandfetchClientId = process.env.VITE_BRANDFETCH_CLIENT_ID;

if (!supabaseUrl || !serviceRoleKey || !brandfetchClientId) {
  console.error('Missing required environment variables:');
  if (!supabaseUrl) console.error('  - VITE_SUPABASE_URL');
  if (!serviceRoleKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  if (!brandfetchClientId) console.error('  - VITE_BRANDFETCH_CLIENT_ID');
  console.error('\nSet these in your .env file. See .env.example for the full list.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface BrandfetchSearchResult {
  brandId: string;
  claimed: boolean;
  name: string;
  domain: string;
  icon?: string;
  qualityScore?: number;
}

interface Brand {
  id: string;
  name: string;
}

interface ResolutionResult {
  brand: Brand;
  status: 'matched' | 'unclaimed' | 'no_match' | 'error';
  domain?: string;
  logoUrl?: string;
  note?: string;
}

// ---------- Brandfetch API ----------

async function searchBrandfetch(brandName: string): Promise<BrandfetchSearchResult[]> {
  const url = `https://api.brandfetch.io/v2/search/${encodeURIComponent(brandName)}?c=${brandfetchClientId}`;
  const response = await fetch(url);
  if (response.status === 429) {
    throw new Error('RATE_LIMIT');
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  return (await response.json()) as BrandfetchSearchResult[];
}

function pickBestMatch(results: BrandfetchSearchResult[]): BrandfetchSearchResult | null {
  if (!results || results.length === 0) return null;

  const claimed = results.filter((r) => r.claimed);
  if (claimed.length > 0) {
    claimed.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
    return claimed[0];
  }

  const sorted = [...results].sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
  return sorted[0];
}

function buildLogoUrl(domain: string): string {
  // Width/height generous; actual render size controlled by CSS (spec §8).
  return `https://cdn.brandfetch.io/${domain}/w/128/h/128?c=${brandfetchClientId}`;
}

// ---------- DB helpers ----------

async function loadBrandsToProcess(opts: {
  force: boolean;
  limit: number;
  only: string[] | null;
}): Promise<Brand[]> {
  let query = supabase.from('merchant_brand').select('id, name').order('name');

  if (!opts.force) {
    query = query.is('brandfetch_domain', null);
  }
  if (opts.only) {
    query = query.in('name', opts.only);
  }
  if (opts.limit < Infinity) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return (data ?? []) as Brand[];
}

async function updateBrand(
  id: string,
  domain: string,
  logoUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from('merchant_brand')
    .update({
      brandfetch_domain: domain,
      logo_url: logoUrl,
      logo_fetched_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(`Update failed for ${id}: ${error.message}`);
}

// ---------- Main ----------

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()) : null;
  return { force, limit, only };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processOne(brand: Brand): Promise<ResolutionResult> {
  try {
    const results = await searchBrandfetch(brand.name);
    const best = pickBestMatch(results);
    if (!best) {
      return { brand, status: 'no_match' };
    }

    const logoUrl = buildLogoUrl(best.domain);
    await updateBrand(brand.id, best.domain, logoUrl);

    return {
      brand,
      status: best.claimed ? 'matched' : 'unclaimed',
      domain: best.domain,
      logoUrl,
    };
  } catch (err) {
    return {
      brand,
      status: 'error',
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const { force, limit, only } = parseArgs();

  console.log('\nResolving Brandfetch domains for merchant brands');
  console.log(`  force=${force}  limit=${limit === Infinity ? 'all' : limit}  only=${only ? only.join(',') : 'none'}\n`);

  const brands = await loadBrandsToProcess({ force, limit, only });
  console.log(`Found ${brands.length} brand(s) to process.\n`);

  if (brands.length === 0) {
    console.log('Nothing to do. Exiting.');
    return;
  }

  const results: ResolutionResult[] = [];
  let rateLimitPause = 0;

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    const progress = `[${i + 1}/${brands.length}]`;

    // Brandfetch's rate limit is 1000/5min per IP. ~200ms pacing stays far below.
    // If we hit a 429 we retry after a longer pause.
    if (rateLimitPause > 0) {
      console.log(`${progress} rate-limit cool-down: sleeping ${rateLimitPause}s...`);
      await sleep(rateLimitPause * 1000);
      rateLimitPause = 0;
    }

    const result = await processOne(brand);
    results.push(result);

    const icon = {
      matched: '✓',
      unclaimed: '?',
      no_match: '-',
      error: '!',
    }[result.status];

    const extra =
      result.status === 'matched' || result.status === 'unclaimed'
        ? ` -> ${result.domain}`
        : result.status === 'error'
        ? `  ERROR: ${result.note}`
        : '';

    console.log(`${progress} ${icon} ${brand.name}${extra}`);

    if (result.status === 'error' && result.note === 'RATE_LIMIT') {
      rateLimitPause = 60; // 1 minute cooldown
      i--; // retry this brand
      continue;
    }

    await sleep(200);
  }

  // Summary
  const matched = results.filter((r) => r.status === 'matched').length;
  const unclaimed = results.filter((r) => r.status === 'unclaimed').length;
  const noMatch = results.filter((r) => r.status === 'no_match').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  Matched (claimed):     ${matched}`);
  console.log(`  Matched (unclaimed):   ${unclaimed}    <- review in admin before trusting`);
  console.log(`  No match:              ${noMatch}    <- needs manual brandfetch_domain`);
  console.log(`  Errors:                ${errors}`);
  console.log('');

  const needsReview = results.filter((r) => r.status === 'unclaimed');
  if (needsReview.length > 0) {
    console.log('Unclaimed brands to review:');
    needsReview.forEach((r) => console.log(`  - ${r.brand.name} -> ${r.domain}`));
    console.log('');
  }

  const failed = results.filter((r) => r.status === 'no_match' || r.status === 'error');
  if (failed.length > 0) {
    console.log('Brands needing manual domain assignment:');
    failed.forEach((r) => {
      const reason = r.status === 'error' ? `(error: ${r.note})` : '(no Brandfetch match)';
      console.log(`  - ${r.brand.name} ${reason}`);
    });
    console.log('');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
