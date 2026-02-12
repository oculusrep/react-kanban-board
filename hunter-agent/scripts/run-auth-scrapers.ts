#!/usr/bin/env npx ts-node --transpile-only
/**
 * Run Auth-Required Scrapers Only
 *
 * This script runs just the BizJournals and NRN scrapers that require login.
 * Designed to run from a local Mac where residential IP avoids bot detection.
 *
 * Usage:
 *   cd hunter-agent && npx ts-node --transpile-only scripts/run-auth-scrapers.ts
 *
 * Or double-click the run-auth-scrapers.command file in Finder
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Add stealth plugin
chromium.use(StealthPlugin());

// Load environment variables from root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface ScrapedSignal {
  source_id: string;
  source_url: string;
  source_title: string;
  source_published_at: string;
  content_type: string;
  raw_content: string;
  content_hash: string;
}

function generateHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

async function scrapeNRN(): Promise<ScrapedSignal[]> {
  console.log('\n========================================');
  console.log('Scraping Nation\'s Restaurant News');
  console.log('========================================\n');

  const signals: ScrapedSignal[] = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  try {
    const username = process.env.NRN_USERNAME;
    const password = process.env.NRN_PASSWORD;

    if (!username || !password) {
      console.error('  NRN credentials not configured');
      return signals;
    }

    // Get source ID from database
    const { data: source } = await supabase
      .from('hunter_source')
      .select('id')
      .eq('slug', 'nrn')
      .single();

    if (!source) {
      console.error('  NRN source not found in database');
      return signals;
    }

    console.log('  [1/5] Navigating to NRN...');
    await page.goto('https://www.nrn.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Handle cookie consent
    try {
      const cookieBtn = await page.$('#onetrust-accept-btn-handler');
      if (cookieBtn && await cookieBtn.isVisible()) {
        await cookieBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* ignore */ }

    // Handle popup
    try {
      const closeBtn = await page.$('[class*="close"]');
      if (closeBtn && await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* ignore */ }

    console.log('  [2/5] Logging in...');
    const signInBtn = await page.$('button:has-text("Sign in")');
    if (signInBtn) {
      await signInBtn.click();
      await page.waitForTimeout(2000);
    }

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('  [3/5] Navigating to emerging chains...');
    await page.goto('https://www.nrn.com/emerging-chains', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('  [4/5] Collecting articles...');
    const articles = await page.$$eval('article a[href*="/emerging"]', (links) => {
      return links.slice(0, 10).map(a => ({
        url: (a as HTMLAnchorElement).href,
        title: a.textContent?.trim() || ''
      }));
    });

    console.log(`  Found ${articles.length} articles`);

    console.log('  [5/5] Scraping article content...');
    for (const article of articles) {
      try {
        await page.goto(article.url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        const content = await page.$eval('article', el => el.textContent?.trim() || '').catch(() => '');

        if (content.length > 100) {
          signals.push({
            source_id: source.id,
            source_url: article.url,
            source_title: article.title.substring(0, 255),
            source_published_at: new Date().toISOString(),
            content_type: 'article',
            raw_content: content.substring(0, 50000),
            content_hash: generateHash(content)
          });
          console.log(`    ✓ ${article.title.substring(0, 50)}...`);
        }
      } catch (err) {
        console.log(`    ✗ Failed: ${article.title.substring(0, 30)}...`);
      }
    }

    console.log(`\n  ✅ NRN complete: ${signals.length} signals collected`);
  } catch (error) {
    console.error('  ❌ NRN scrape failed:', error instanceof Error ? error.message : error);
  } finally {
    await browser.close();
  }

  return signals;
}

async function scrapeBizJournals(): Promise<ScrapedSignal[]> {
  console.log('\n========================================');
  console.log('Scraping Atlanta Business Chronicle');
  console.log('========================================\n');

  const signals: ScrapedSignal[] = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const username = process.env.BIZJOURNALS_USERNAME;
    const password = process.env.BIZJOURNALS_PASSWORD;

    if (!username || !password) {
      console.error('  BizJournals credentials not configured');
      return signals;
    }

    // Get source ID from database
    const { data: source } = await supabase
      .from('hunter_source')
      .select('id')
      .eq('slug', 'bizjournals-atl')
      .single();

    if (!source) {
      console.error('  BizJournals source not found in database');
      return signals;
    }

    console.log('  [1/5] Navigating to login...');
    await page.goto('https://www.bizjournals.com/atlanta/login#/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('  [2/5] Logging in...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.error('  ❌ Login failed - still on login page');
      return signals;
    }

    console.log('  [3/5] Navigating to restaurant news...');
    await page.goto('https://www.bizjournals.com/atlanta/news/restaurant', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('  [4/5] Collecting articles...');
    const articles = await page.$$eval('a[href*="/news/"]', (links) => {
      const seen = new Set<string>();
      return links
        .filter(a => {
          const href = (a as HTMLAnchorElement).href;
          if (seen.has(href) || !href.includes('/atlanta/news/')) return false;
          seen.add(href);
          return true;
        })
        .slice(0, 10)
        .map(a => ({
          url: (a as HTMLAnchorElement).href,
          title: a.textContent?.trim() || ''
        }));
    });

    console.log(`  Found ${articles.length} articles`);

    console.log('  [5/5] Scraping article content...');
    for (const article of articles) {
      try {
        await page.goto(article.url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        const content = await page.$eval('article, .article-content, .story-content',
          el => el.textContent?.trim() || ''
        ).catch(() => '');

        if (content.length > 100) {
          signals.push({
            source_id: source.id,
            source_url: article.url,
            source_title: article.title.substring(0, 255),
            source_published_at: new Date().toISOString(),
            content_type: 'article',
            raw_content: content.substring(0, 50000),
            content_hash: generateHash(content)
          });
          console.log(`    ✓ ${article.title.substring(0, 50)}...`);
        }
      } catch (err) {
        console.log(`    ✗ Failed: ${article.title.substring(0, 30)}...`);
      }
    }

    console.log(`\n  ✅ BizJournals complete: ${signals.length} signals collected`);
  } catch (error) {
    console.error('  ❌ BizJournals scrape failed:', error instanceof Error ? error.message : error);
  } finally {
    await browser.close();
  }

  return signals;
}

async function storeSignals(signals: ScrapedSignal[]): Promise<number> {
  let stored = 0;

  for (const signal of signals) {
    // Check for duplicate
    const { data: existing } = await supabase
      .from('hunter_signal')
      .select('id')
      .eq('content_hash', signal.content_hash)
      .limit(1);

    if (existing && existing.length > 0) {
      continue; // Skip duplicate
    }

    const { error } = await supabase
      .from('hunter_signal')
      .insert(signal);

    if (!error) {
      stored++;
    }
  }

  return stored;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Hunter - Auth-Required Scrapers (Local Mac Runner)    ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\nStarted at: ${new Date().toLocaleString()}\n`);

  // Check credentials
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }

  const allSignals: ScrapedSignal[] = [];

  // Run scrapers
  const nrnSignals = await scrapeNRN();
  allSignals.push(...nrnSignals);

  const bizSignals = await scrapeBizJournals();
  allSignals.push(...bizSignals);

  // Store signals
  console.log('\n========================================');
  console.log('Storing signals to database');
  console.log('========================================\n');

  const stored = await storeSignals(allSignals);
  console.log(`  Stored ${stored} new signals (${allSignals.length - stored} duplicates skipped)`);

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  Summary                                                ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`  NRN:         ${nrnSignals.length} signals`);
  console.log(`  BizJournals: ${bizSignals.length} signals`);
  console.log(`  Total New:   ${stored} stored to database`);
  console.log(`\nCompleted at: ${new Date().toLocaleString()}`);
  console.log('\nNote: Signals will be analyzed on the next Hunter run on Render.\n');
}

main().catch(console.error);
