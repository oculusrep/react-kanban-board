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
      this.logger.info(`Step 1/8: Navigating to NRN login page: ${this.source.login_url}`);
      await this.page!.goto(this.source.login_url!, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.randomDelay(2000, 4000);

      this.logger.info(`Step 2/8: Page loaded, current URL: ${this.page!.url()}`);

      // NRN now uses an Iris authentication widget
      // Click the login button to open the login modal/iframe
      this.logger.info('Step 3/8: Looking for Iris login button...');
      const irisLoginBtn = await this.page!.$('button#irisLoginBtn, input#irisLoginBtn');

      if (irisLoginBtn) {
        this.logger.info('Step 4/8: Clicking Iris login button...');
        await irisLoginBtn.click();
        await this.randomDelay(3000, 5000); // Wait for modal/iframe to load
      } else {
        this.logger.warn('Iris login button not found, attempting direct form login');
      }

      // Wait for iframe or modal to appear
      this.logger.info('Step 5/8: Waiting for login form to appear...');
      await this.page!.waitForTimeout(3000);

      // Check if there's an iframe (common with authentication widgets)
      const frames = this.page!.frames();
      this.logger.info(`Found ${frames.length} frames on page`);

      // Try to find login fields in main page or iframes
      let loginFrame: any = this.page!;
      for (const frame of frames) {
        const hasEmailField = await frame.$('input[type="email"], input[name="email"], input[name="username"]').catch(() => null);
        if (hasEmailField) {
          this.logger.info(`Found login form in iframe: ${frame.url()}`);
          loginFrame = frame;
          break;
        }
      }

      // Fill in the login form
      this.logger.info('Step 6/8: Filling username/email field...');
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[name="name"]',
        'input#edit-name'
      ];

      let filled = false;
      for (const selector of emailSelectors) {
        try {
          await loginFrame.fill(selector, username, { timeout: 3000 });
          this.logger.info(`  ✓ Filled username: ${selector}`);
          filled = true;
          break;
        } catch {
          continue;
        }
      }

      if (!filled) {
        this.logger.error('Could not find username/email field');
        return false;
      }

      await this.randomDelay(500, 1000);

      // Fill password
      this.logger.info('Step 7/8: Filling password field...');
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[name="pass"]',
        'input#edit-pass'
      ];

      filled = false;
      for (const selector of passwordSelectors) {
        try {
          await loginFrame.fill(selector, password, { timeout: 3000 });
          this.logger.info(`  ✓ Filled password: ${selector}`);
          filled = true;
          break;
        } catch {
          continue;
        }
      }

      if (!filled) {
        this.logger.error('Could not find password field');
        return false;
      }

      await this.randomDelay(500, 1000);

      // Submit the form
      this.logger.info('Step 8/8: Submitting login form...');
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        'button:has-text("Login")'
      ];

      for (const selector of submitSelectors) {
        try {
          await loginFrame.click(selector, { timeout: 3000 });
          this.logger.info(`  ✓ Clicked submit: ${selector}`);
          break;
        } catch {
          continue;
        }
      }

      // Wait for navigation/modal to close
      await this.page!.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await this.randomDelay(3000, 5000);

      // Verify login success - check if we're redirected away from login page
      const currentUrl = this.page!.url();
      this.logger.info(`Post-login URL: ${currentUrl}`);

      const isLoggedIn = !currentUrl.includes('/user/login') && !currentUrl.includes('/login');

      if (isLoggedIn) {
        this.logger.info('NRN login successful - redirected away from login page');
        return true;
      }

      // Alternative: Check for logout button or user profile indicator
      const logoutBtn = await this.page!.$('button#irisLogoutBtn, input#irisLogoutBtn, .user-logout, a[href*="logout"]').catch(() => null);
      if (logoutBtn) {
        this.logger.info('NRN login successful - logout button found');
        return true;
      }

      // Check for error messages
      const errorMsg = await this.page!.$eval('.messages--error, .error-message, .alert-danger, .error',
        el => el.textContent?.trim() || ''
      ).catch(() => '');

      this.logger.warn(`NRN login failed - still on login page. Error message: "${errorMsg || 'none found'}"`);
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
