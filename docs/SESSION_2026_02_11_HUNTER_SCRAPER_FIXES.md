# Session Notes: Hunter Agent Scraper Fixes - February 11, 2026

## Overview

Fixed login issues for two news source scrapers in Hunter Agent:
1. NRN (Nation's Restaurant News) - login URL changed, password truncation
2. BizJournals-ATL (Atlanta Business Chronicle) - multi-step login flow, bot detection

## Issues Diagnosed

### NRN (Nation's Restaurant News)

**Problem 1: Login URL 404**
- Old URL `/user/login` now returns 404
- NRN migrated to Iris authentication system with modal-based login

**Problem 2: Password Truncation**
- Password in `.env` file contained `#` character: `NRN_PASSWORD=7ryLdZb3#`
- The `#` was being treated as a comment delimiter, truncating the password to `7ryLdZb3`

**Problem 3: Cookie Consent & Popups**
- NRN shows cookie consent banner on first visit
- Often displays interstitial popup that blocks the Sign in button

### BizJournals-ATL (Atlanta Business Chronicle)

**Problem 1: Multi-step Login Flow**
- Base `/login` URL shows "Create or Sign in" chooser page
- Requires email validation before showing password field

**Problem 2: Cloudflare Bot Detection**
- Standard Playwright requests were being blocked with "Just a moment..." challenge page

## Fixes Applied

### 1. NRN Password in `.env`

Wrapped password in quotes to preserve the `#` character:

```bash
# Before (broken)
NRN_PASSWORD=7ryLdZb3#

# After (fixed)
NRN_PASSWORD="7ryLdZb3#"
```

### 2. NRN Scraper (`nrn-scraper.ts`)

Changed login flow from direct URL navigation to homepage → Sign in button approach:

```typescript
// Navigate to homepage instead of the old /user/login URL (which is now 404)
this.logger.info(`Step 1/6: Navigating to NRN homepage: ${this.source.base_url}`);
await this.page!.goto(this.source.base_url, { waitUntil: 'networkidle', timeout: 30000 });

// NRN shows cookie consent banner - accept it first
const cookieSelectors = [
  'button:has-text("Accept all")',
  'button:has-text("Accept")',
  'button:has-text("I Accept")',
  '#onetrust-accept-btn-handler'
];

for (const selector of cookieSelectors) {
  try {
    const cookieBtn = await this.page!.$(selector);
    if (cookieBtn && await cookieBtn.isVisible()) {
      await cookieBtn.click();
      break;
    }
  } catch {
    continue;
  }
}

// NRN often shows a flash/popup - try to dismiss it
const dismissSelectors = [
  'button:has-text("Close")',
  'button:has-text("×")',
  '[aria-label="Close"]',
  '.modal-close',
  '[class*="close"]'
];

// Click the "Sign in" button in the header to open the login modal
let signInElement = await this.page!.$('button:has-text("Sign in")');
await signInElement.click();

// Wait for Iris login form and fill credentials
await this.page!.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
await this.page!.fill('input[name="email"], input[type="email"]', username);
await this.page!.fill('input[name="password"], input[type="password"]', password);
await this.page!.click('button[type="submit"]');
```

### 3. BizJournals Scraper (`bizjournals-scraper.ts`)

Changed to use direct sign-in URL that shows both fields immediately:

```typescript
// Use direct sign-in URL which shows both email and password fields
// (the base login URL shows a "Create or Sign in" page that requires email validation first)
const signInUrl = this.source.login_url!.replace('/login', '/login#/sign-in');
await this.page!.goto(signInUrl, { waitUntil: 'networkidle', timeout: 30000 });
```

### 4. Browser Manager - Stealth Plugin (`playwright-browser.ts`)

Added `playwright-extra` with stealth plugin to bypass Cloudflare bot detection:

```typescript
import { chromium } from 'playwright-extra';
import { Browser, BrowserContext } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to avoid bot detection (Cloudflare, etc.)
chromium.use(StealthPlugin());
```

### 5. Test Script Updates (`test-login.ts`)

Updated test script with:
- Stealth plugin integration
- Cookie consent handling for NRN
- Popup dismissal logic
- Direct sign-in URL for BizJournals
- Better login verification logic

## Files Modified

| File | Change |
|------|--------|
| `.env` | Wrapped NRN_PASSWORD in quotes |
| `hunter-agent/src/modules/gatherer/scrapers/nrn-scraper.ts` | New login flow with cookie/popup handling |
| `hunter-agent/src/modules/gatherer/scrapers/bizjournals-scraper.ts` | Direct sign-in URL |
| `hunter-agent/src/modules/gatherer/playwright-browser.ts` | Added stealth plugin |
| `hunter-agent/scripts/test-login.ts` | Updated test script |

## Dependencies Added

The stealth plugin requires these packages (already installed):
- `playwright-extra`
- `puppeteer-extra-plugin-stealth`

## Testing

Run the login test script:

```bash
cd hunter-agent
npx ts-node --transpile-only scripts/test-login.ts
```

Expected output:
```
NRN:          ✅ PASS
BizJournals:  ✅ PASS
```

### 5. Franchise Times RSS Feed Fix

**Problem:** Franchise Times was producing 0 signals because the RSS feed URL was returning 404.

**Root Cause:** The old RSS URL `https://www.franchisetimes.com/feed/` no longer exists. The site migrated to a search-based RSS feed.

**Fix:** Updated `article-fetcher.ts` with the correct RSS URL:

```typescript
export const RSS_FEEDS: Record<string, string> = {
  qsr: 'https://www.qsrmagazine.com/rss.xml',
  'franchise-times': 'https://www.franchisetimes.com/search/?f=rss&t=article&l=50&s=start_time&sd=desc',
};
```

**Additional Fix:** Deactivated the "Franchise Times Dealmakers" source in the database - it was incorrectly configured as a podcast but is actually an awards/editorial section covered by the main Franchise Times source.

## Files Modified

| File | Change |
|------|--------|
| `.env` | Wrapped NRN_PASSWORD in quotes |
| `hunter-agent/src/modules/gatherer/scrapers/nrn-scraper.ts` | New login flow with cookie/popup handling |
| `hunter-agent/src/modules/gatherer/scrapers/bizjournals-scraper.ts` | Direct sign-in URL |
| `hunter-agent/src/modules/gatherer/playwright-browser.ts` | Added stealth plugin |
| `hunter-agent/src/modules/gatherer/rss/article-fetcher.ts` | Fixed Franchise Times RSS URL |
| `hunter-agent/scripts/test-login.ts` | Updated test script |

## Database Changes

- Deactivated `hunter_source` with slug `ft-dealmakers` (not a podcast, content covered by main source)

## Key Learnings

1. **`.env` files and special characters**: The `#` character starts a comment in `.env` files. Always quote values containing `#`, `$`, or other special characters.

2. **Website login changes**: News sites frequently change their authentication flows. The NRN migration from direct URL to Iris modal-based auth is a common pattern.

3. **Bot detection**: Modern sites use Cloudflare and similar services. The `playwright-extra` stealth plugin helps bypass these checks by making the browser appear more human-like.

4. **Cookie consent**: GDPR/CCPA compliance means most sites now show cookie banners. Scrapers need to handle these before interacting with other page elements.

5. **RSS feed URLs change**: Websites frequently restructure and RSS feeds move. The Franchise Times migration from `/feed/` to a search-based RSS is common with CMS updates.

---

## Part 2: Article Scraping Fixes (Later Same Day)

After fixing login issues, the Gatherer was completing with **0 signals** despite successful logins. Investigation revealed two more issues:

### Problem: Article Selectors Not Matching

Both scrapers were finding 0 articles because:

1. **BizJournals**: The configured `target_paths` (`/news/retail`, `/news/restaurant`) return 404 - these pages don't exist. Articles are only on the homepage.

2. **NRN**: Article link selectors used `/article/` in the URL pattern, but NRN URLs don't contain `/article/` - they use paths like `/fast-casual/article-slug`.

3. **NRN**: Article body selectors (`.article-body`, `.field--name-body`) don't match NRN's actual structure which uses `[class*="body"]`.

4. **Timeout issues**: Using `waitUntil: 'networkidle'` caused 30+ second timeouts due to Cloudflare/ad networks. Cookie consent loops were also causing 30-second delays per selector.

### Fixes Applied

#### BizJournals Scraper (`bizjournals-scraper.ts`)

```typescript
// Changed waitUntil to avoid Cloudflare timeout
await this.page!.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Use Enter key for submission (button selector wasn't matching)
await this.page!.keyboard.press('Enter');

// Wait for redirect with explicit URL check
await this.page!.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });

// Scrape from homepage first (where articles actually are)
const pagesToScrape = [
  this.source.base_url, // Homepage has the latest articles
  ...this.scrapeConfig.target_paths.map((p) => `${this.source.base_url}${p}`),
];

// Fixed article selector - look for date-based URLs
const articleLinks = await this.page!.$$eval(
  'a[href*="/news/"]',
  (links) =>
    links.filter((a) => {
      const href = (a as HTMLAnchorElement).href;
      const text = a.textContent?.trim() || '';
      // Only include actual articles (date-based URLs like /news/2026/02/10/slug.html)
      return href.includes('/202') && href.includes('.html') && text.length > 20;
    })
    // ... mapping and deduping
);
```

#### NRN Scraper (`nrn-scraper.ts`)

```typescript
// Changed waitUntil to avoid timeout
await this.page!.goto(this.source.base_url, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Reduced cookie consent timeout from 30s to 3s
try {
  const cookieBtn = await this.page!.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
  if (cookieBtn) {
    await cookieBtn.click();
  }
} catch {
  // No cookie banner - continue
}

// Reduced popup timeout to 2s
try {
  const closeBtn = await this.page!.waitForSelector('[class*="close"]:visible', { timeout: 2000 });
  if (closeBtn) await closeBtn.click();
} catch {
  // No popup - continue
}

// Fixed article selector - NRN uses ContentPreview cards, URLs don't have /article/
const articleLinks = await this.page!.$$eval(
  '[class*="ContentPreview"] a, [class*="card"] a',
  (links, baseUrl) =>
    links.filter((a) => {
      const href = (a as HTMLAnchorElement).href;
      const text = a.textContent?.trim() || '';
      return (
        href.startsWith(baseUrl) &&
        text.length > 20 &&
        !href.includes('/author/') &&
        !href.includes('/restaurant-segments/') &&
        href.split('/').filter(Boolean).length >= 4  // Has slug after category
      );
    })
    // ... mapping and deduping
  , this.source.base_url
);

// Fixed article body selector - NRN uses [class*="body"]
const contentSelectors = [
  '[class*="ArticleBody"]',
  '[class*="article-body"]',
  '[class*="body"]',
  'article p',
  'main p',
];
```

### Results After Fixes

```
Gatherer complete: 5 sources, 16 signals, 0 errors

DONE: {
  "sourcesScraped": 5,
  "signalsCollected": 16,
  "errors": []
}
```

- **BizJournals**: Found 26 article links, scraped 10 articles
- **NRN**: Found 25 article links, scraped 15 articles
- **Total signals stored**: 16 (some were duplicates already in DB)

### Files Modified (Part 2)

| File | Change |
|------|--------|
| `hunter-agent/src/modules/gatherer/scrapers/bizjournals-scraper.ts` | Fixed `waitUntil`, Enter key submission, homepage scraping, date-based URL selector |
| `hunter-agent/src/modules/gatherer/scrapers/nrn-scraper.ts` | Fixed `waitUntil`, reduced timeouts, ContentPreview selector, `[class*="body"]` content selector |

### Key Learnings (Part 2)

6. **`networkidle` vs `domcontentloaded`**: Using `waitUntil: 'networkidle'` can cause timeouts on sites with ad networks, analytics, or Cloudflare. Use `domcontentloaded` and add explicit waits where needed.

7. **Scrape from homepage first**: News sites often have broken or missing category pages. The homepage typically has the latest articles and is most reliable.

8. **URL patterns change**: Don't assume article URLs contain `/article/`. Many modern sites use category-based paths like `/fast-casual/article-slug`.

9. **Test selectors in browser DevTools**: Before writing selectors, inspect the actual page structure. NRN uses `ContentPreview` cards, not traditional `article` elements.

10. **Short timeouts for optional elements**: Cookie banners and popups should use 2-3 second timeouts, not 30 seconds. If they're not there, move on quickly.
