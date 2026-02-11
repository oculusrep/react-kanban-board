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
