import { BrowserContext } from 'playwright';
import { BaseScraper, ScrapedArticle } from './base-scraper';
import { HunterSource } from '../../../types';
import { config } from '../../../config';

interface NRNScrapeConfig {
  target_paths: string[];
  article_selector: string;
  title_selector: string;
  body_selector: string;
}

export class NRNScraper extends BaseScraper {
  private scrapeConfig: NRNScrapeConfig;

  constructor(source: HunterSource, context: BrowserContext) {
    super(source, context);
    this.scrapeConfig = source.scrape_config as unknown as NRNScrapeConfig;
  }

  async login(): Promise<boolean> {
    if (!this.page) {
      await this.initPage();
    }

    const { username, password } = config.sources.nrn;
    if (!username || !password) {
      this.logger.error('NRN credentials not configured');
      return false;
    }

    try {
      // Navigate to homepage instead of the old /user/login URL (which is now 404)
      this.logger.info(`Step 1/6: Navigating to NRN homepage: ${this.source.base_url}`);
      // Use domcontentloaded instead of networkidle to avoid timeout
      await this.page!.goto(this.source.base_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.randomDelay(3000, 4000); // Extra time for JS to load

      this.logger.info(`Step 2/8: Page loaded, current URL: ${this.page!.url()}`);

      // NRN shows cookie consent banner - accept it first (use short timeout)
      this.logger.info('Step 3/8: Checking for cookie consent...');
      try {
        // OneTrust cookie banner is most common
        const cookieBtn = await this.page!.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
        if (cookieBtn) {
          await cookieBtn.click();
          this.logger.info('  Accepted cookies via OneTrust');
          await this.randomDelay(500, 1000);
        }
      } catch {
        // No cookie banner or already accepted - continue
        this.logger.debug('  No cookie banner found');
      }

      // NRN often shows a flash/popup - try to dismiss it quickly
      this.logger.info('Step 4/8: Checking for interstitial popup...');
      try {
        const closeBtn = await this.page!.waitForSelector('[class*="close"]:visible, [aria-label="Close"]:visible', { timeout: 2000 });
        if (closeBtn) {
          await closeBtn.click();
          this.logger.info('  Dismissed popup');
          await this.randomDelay(500, 1000);
        }
      } catch {
        // No popup - continue
        this.logger.debug('  No popup found');
      }

      // Click the "Sign in" button in the header to open the login modal
      this.logger.info('Step 4/7: Looking for Sign in button in header...');
      // Try button first (NRN uses a button with span inside)
      let signInElement = await this.page!.$('button:has-text("Sign in")');
      if (!signInElement) {
        signInElement = await this.page!.$('text=/Sign in/i');
      }

      if (!signInElement) {
        this.logger.error('Could not find Sign in button');
        return false;
      }

      const isVisible = await signInElement.isVisible();
      if (!isVisible) {
        this.logger.error('Sign in button found but not visible');
        return false;
      }

      this.logger.info('Step 5/7: Clicking Sign in to open login modal...');
      await signInElement.click();
      await this.randomDelay(2000, 3000);

      // Wait for login form fields to appear
      this.logger.info('Step 6/7: Waiting for login form...');
      try {
        await this.page!.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
      } catch {
        this.logger.error('Login form did not appear after clicking Sign in');
        return false;
      }

      // Fill in email
      this.logger.info('  Filling email field...');
      await this.page!.fill('input[name="email"], input[type="email"]', username);
      await this.randomDelay(500, 1000);

      // Fill in password
      this.logger.info('  Filling password field...');
      await this.page!.fill('input[name="password"], input[type="password"]', password);
      await this.randomDelay(500, 1000);

      // Submit the form
      this.logger.info('Step 7/7: Submitting login form...');
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        'button:has-text("Login")'
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          await this.page!.click(selector, { timeout: 3000 });
          this.logger.info(`  ✓ Clicked submit: ${selector}`);
          submitted = true;
          break;
        } catch {
          continue;
        }
      }

      if (!submitted) {
        // Try pressing Enter as fallback
        await this.page!.keyboard.press('Enter');
        this.logger.info('  ✓ Pressed Enter to submit');
      }

      // Wait for login to complete
      await this.randomDelay(3000, 5000);

      // Verify login success - check for logout button visibility
      const logoutBtn = await this.page!.$('#irisLogoutBtn');
      if (logoutBtn) {
        const logoutVisible = await logoutBtn.isVisible();
        if (logoutVisible) {
          this.logger.info('NRN login successful - logout button now visible');
          return true;
        }
      }

      // Alternative: Check if Sign in is still visible (it should be replaced by account info)
      const signInStillVisible = await this.page!.$('text=/Sign in/i');
      if (!signInStillVisible || !(await signInStillVisible.isVisible())) {
        this.logger.info('NRN login successful - Sign in link no longer visible');
        return true;
      }

      // Check for error messages
      const errorMsg = await this.page!.$eval('.error, .alert-error, .error-message, [class*="error"]',
        el => el.textContent?.trim() || ''
      ).catch(() => '');

      this.logger.warn(`NRN login may have failed. Error message: "${errorMsg || 'none found'}"`);
      return false;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : '';
      this.logger.error(`NRN login failed: ${message}`);
      this.logger.debug(`Stack trace: ${stack}`);
      return false;
    }
  }

  async scrapeArticles(): Promise<ScrapedArticle[]> {
    if (!this.page) {
      await this.initPage();
    }

    const articles: ScrapedArticle[] = [];
    const seenUrls = new Set<string>();

    // NRN articles are on the homepage and category pages
    // Articles use ContentPreview cards with URLs like /fast-casual/article-slug
    const pagesToScrape = [
      this.source.base_url, // Homepage has the latest articles
      ...this.scrapeConfig.target_paths.map((p) => `${this.source.base_url}${p}`),
    ];

    for (const fullUrl of pagesToScrape) {
      try {
        this.logger.info(`Scraping listing: ${fullUrl}`);

        await this.page!.goto(fullUrl, { waitUntil: 'domcontentloaded' });
        await this.randomDelay(2000, 4000);

        // NRN uses ContentPreview cards for articles
        // Articles have URLs like /fast-casual/article-slug (no /article/ in path)
        const articleLinks = await this.page!.$$eval(
          '[class*="ContentPreview"] a, [class*="card"] a',
          (links, baseUrl) =>
            links
              .filter((a) => {
                const href = (a as HTMLAnchorElement).href;
                const text = a.textContent?.trim() || '';
                // Only include NRN articles with meaningful titles
                // Exclude navigation links, author pages, category pages
                return (
                  href.startsWith(baseUrl) &&
                  text.length > 20 &&
                  !href.includes('/author/') &&
                  !href.includes('/about') &&
                  !href.includes('/subscription') &&
                  !href.includes('/restaurant-segments/') &&
                  !href.includes('/restaurant-operations/') &&
                  // Has a slug after the category (e.g., /fast-casual/article-title)
                  href.split('/').filter(Boolean).length >= 4
                );
              })
              .map((a) => ({
                url: (a as HTMLAnchorElement).href,
                title: a.textContent?.trim() || '',
              }))
              // Dedupe by URL
              .filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i),
          this.source.base_url
        );

        this.logger.info(`Found ${articleLinks.length} article links on ${fullUrl}`);

        // Scrape each article (limit to 15 per page to avoid overloading)
        for (const link of articleLinks.slice(0, 15)) {
          if (seenUrls.has(link.url)) continue;
          seenUrls.add(link.url);

          try {
            const article = await this.scrapeArticle(link.url);
            if (article) {
              articles.push(article);
            }
          } catch (error) {
            this.logger.warn(`Failed to scrape article: ${link.url}`);
          }

          await this.randomDelay(1500, 3000);
        }

        // If we found articles on homepage, we're good
        if (fullUrl === this.source.base_url && articleLinks.length > 0) {
          break;
        }
      } catch (error) {
        this.logger.warn(`Failed to scrape: ${fullUrl}`);
      }
    }

    return articles;
  }

  private async scrapeArticle(url: string): Promise<ScrapedArticle | null> {
    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
      await this.randomDelay(1000, 2000);

      // Extract title
      const title = await this.page!.$eval(
        'h1, .article-title, .page-title',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      if (!title) {
        this.logger.warn(`No title found for ${url}`);
        return null;
      }

      // Extract article body - NRN uses [class*="body"] for article content
      // Try multiple selectors in order of specificity
      let content = '';
      const contentSelectors = [
        '[class*="ArticleBody"]',
        '[class*="article-body"]',
        '[class*="body"]',
        'article p',
        'main p',
      ];

      for (const selector of contentSelectors) {
        try {
          if (selector.includes(' p')) {
            // For paragraph selectors, combine all paragraph text
            content = await this.page!.$$eval(selector, (ps) =>
              ps.map((p) => p.textContent?.trim()).filter(Boolean).join(' ')
            );
          } else {
            content = await this.page!.$eval(selector, (el) => el.textContent?.trim() || '');
          }
          if (content && content.length > 100) break;
        } catch {
          continue;
        }
      }

      if (!content || content.length < 100) {
        this.logger.warn(`No content found for ${url}`);
        return null;
      }

      // Extract publish date
      let publishedAt: Date | null = null;
      const dateStr = await this.page!.$eval(
        'time[datetime], .article-date, .node__meta time, .posted-on time',
        (el) => el.getAttribute('datetime') || el.textContent?.trim() || ''
      ).catch(() => '');

      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          publishedAt = parsed;
        }
      }

      this.logger.debug(`Scraped: ${title.substring(0, 50)}...`);

      return {
        url,
        title,
        content,
        publishedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Error scraping article ${url}: ${message}`);
      return null;
    }
  }
}

export default NRNScraper;
