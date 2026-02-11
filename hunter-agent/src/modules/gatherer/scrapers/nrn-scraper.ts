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
      await this.page!.goto(this.source.base_url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.randomDelay(2000, 3000);

      this.logger.info(`Step 2/8: Page loaded, current URL: ${this.page!.url()}`);

      // NRN shows cookie consent banner - accept it first
      this.logger.info('Step 3/8: Checking for cookie consent...');
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
            this.logger.info(`  Accepting cookies: ${selector}`);
            await cookieBtn.click();
            await this.randomDelay(1000, 1500);
            break;
          }
        } catch {
          continue;
        }
      }

      // NRN often shows a flash/popup - try to dismiss it
      this.logger.info('Step 4/8: Checking for interstitial popup...');
      const dismissSelectors = [
        'button:has-text("Close")',
        'button:has-text("×")',
        '[aria-label="Close"]',
        '.modal-close',
        '[class*="close"]'
      ];

      for (const selector of dismissSelectors) {
        try {
          const closeBtn = await this.page!.$(selector);
          if (closeBtn && await closeBtn.isVisible()) {
            this.logger.info(`  Dismissing popup: ${selector}`);
            await closeBtn.click();
            await this.randomDelay(1000, 1500);
            break;
          }
        } catch {
          continue;
        }
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

    for (const path of this.scrapeConfig.target_paths) {
      try {
        const fullUrl = `${this.source.base_url}${path}`;
        this.logger.info(`Scraping listing: ${fullUrl}`);

        await this.page!.goto(fullUrl, { waitUntil: 'domcontentloaded' });
        await this.randomDelay(2000, 4000);

        // Get all article links
        const articleLinks = await this.page!.$$eval(
          'article a[href*="/article/"], .node-article a[href*="/article/"], .views-row a[href*="/article/"]',
          (links) =>
            links
              .map((a) => ({
                url: (a as HTMLAnchorElement).href,
                title: a.textContent?.trim() || '',
              }))
              .filter((l) => l.url && l.title)
        );

        this.logger.info(`Found ${articleLinks.length} article links on ${path}`);

        // Scrape each article (limit to 15 per path to avoid overloading)
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
      } catch (error) {
        this.logger.warn(`Failed to scrape path: ${path}`);
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

      // Extract article body
      const content = await this.page!.$eval(
        '.article-body, .field--name-body, .node__content, article .content',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

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
