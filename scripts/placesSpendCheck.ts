/**
 * Quick report on Places API spend.
 * Usage: bun scripts/placesSpendCheck.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);
const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);
const startOfHour = new Date();
startOfHour.setMinutes(0, 0, 0);

async function fetchAll(sinceIso: string) {
  const PAGE = 1000;
  let offset = 0;
  let all: Array<{
    request_type: string;
    request_count: number;
    estimated_cost_cents: number;
    results_count: number;
    created_at: string;
  }> = [];
  while (true) {
    const { data, error } = await supabase
      .from('google_places_api_log')
      .select('request_type, request_count, estimated_cost_cents, results_count, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function summarize(label: string, rows: Awaited<ReturnType<typeof fetchAll>>) {
  const totalRequests = rows.reduce((s, r) => s + (r.request_count ?? 1), 0);
  const totalCost = rows.reduce((s, r) => s + (r.estimated_cost_cents ?? 0), 0);
  const totalResults = rows.reduce((s, r) => s + (r.results_count ?? 0), 0);

  const byType = new Map<string, { count: number; cost: number; results: number }>();
  for (const r of rows) {
    const cur = byType.get(r.request_type) ?? { count: 0, cost: 0, results: 0 };
    cur.count += r.request_count ?? 1;
    cur.cost += r.estimated_cost_cents ?? 0;
    cur.results += r.results_count ?? 0;
    byType.set(r.request_type, cur);
  }

  console.log(`\n${label}`);
  console.log('-'.repeat(label.length));
  console.log(`  Entries:  ${rows.length}`);
  console.log(`  Requests: ${totalRequests}`);
  console.log(`  Results:  ${totalResults}`);
  console.log(`  Cost:     ${fmt(totalCost)}`);
  if (byType.size > 1) {
    console.log('  By type:');
    for (const [type, v] of byType.entries()) {
      console.log(`    ${type.padEnd(28)} ${String(v.count).padStart(6)} req  ${String(v.results).padStart(6)} res  ${fmt(v.cost)}`);
    }
  }
}

async function main() {
  const monthRows = await fetchAll(startOfMonth.toISOString());
  const todayRows = monthRows.filter((r) => r.created_at >= startOfToday.toISOString());
  const hourRows = monthRows.filter((r) => r.created_at >= startOfHour.toISOString());

  summarize(`Last hour (since ${startOfHour.toLocaleTimeString()})`, hourRows);
  summarize(`Today (since ${startOfToday.toLocaleDateString()})`, todayRows);
  summarize(`Month-to-date (since ${startOfMonth.toLocaleDateString()})`, monthRows);

  // Budget note
  console.log('');
  console.log('(Google Maps Platform gives $200/month in credit across all Maps APIs.)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
