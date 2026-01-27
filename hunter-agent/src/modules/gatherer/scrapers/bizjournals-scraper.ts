import { BrowserContext } from 'playwright';
import { BaseScraper, ScrapedArticle } from './base-scraper';
import { HunterSource } from '../../../types';
import { config } from '../../../config';

interface BizJournalsScrapeConfig {
  target_paths: string[];
  article_selector: string;
  title_selector: string;
  body_selector: string;
}

export class BizJournalsScraper extends BaseScraper {
  private scrapeConfig: BizJournalsScrapeConfig;

  constructor(source: HunterSource, context: BrowserContext) {
    super(source, context);
    this.scrapeConfig = source.scrape_config as unknown as BizJournalsScrapeConfig;
  }

  async login(): Promise<boolean> {
    if (!this.page) {
      await this.initPage();
    }

    const { username, password } = config.sources.bizjournals;
    if (!username || !password) {
      this.logger.error('BizJournals credentials not configured');
      return false;
    }

    try {
      this.logger.info(`Step 1/8: Navigating to BizJournals login page: ${this.source.login_url}`);
      await this.page!.goto(this.source.login_url!, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.randomDelay(2000, 4000);

      this.logger.info(`Step 2/8: Page loaded, current URL: ${this.page!.url()}`);

      // BizJournals uses multi-step login: email first, then password field appears
      // Step 1: Check for email field
      const emailField = await this.page!.$('input[name="email"], input[type="email"], #email');
      this.logger.info(`Step 3/8: Email field found: ${!!emailField}`);

      if (!emailField) {
        const pageContent = await this.page!.content();
        this.logger.error(`Login form not found. Page title: ${await this.page!.title()}`);
        this.logger.debug(`Page HTML snippet: ${pageContent.substring(0, 1000)}`);
        return false;
      }

      // Fill in email first
      this.logger.info('Step 4/8: Filling email field...');
      await this.page!.fill('input[name="email"], input[type="email"], #email', username);
      await this.randomDelay(500, 1000);

      // Click "Next" or "Continue" button (or submit if it's there)
      this.logger.info('Step 5/8: Looking for Next/Continue button...');
      const nextButtonSelectors = [
        'button[type="submit"]',
        'button:has-text("Next")',
        'button:has-text("Continue")',
        'input[type="submit"]',
        '.login-button'
      ];

      let clickedNext = false;
      for (const selector of nextButtonSelectors) {
        try {
          const button = await this.page!.$(selector);
          if (button) {
            await button.click();
            this.logger.info(`  ✓ Clicked: ${selector}`);
            clickedNext = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (clickedNext) {
        // Wait for password field to appear
        this.logger.info('Step 6/8: Waiting for password field to appear...');
        await this.randomDelay(2000, 4000);
      }

      // Now check for password field (it may have appeared after clicking Next)
      this.logger.info('Step 7/8: Looking for password field...');
      let passwordField = null;
      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        '#password'
      ];

      for (const selector of passwordSelectors) {
        passwordField = await this.page!.$(selector);
        if (passwordField) {
          this.logger.info(`  ✓ Password field found: ${selector}`);
          break;
        }
      }

      if (!passwordField) {
        // Try waiting a bit longer and checking again
        this.logger.info('Password field not immediately visible, waiting...');
        await this.randomDelay(2000, 3000);

        for (const selector of passwordSelectors) {
          passwordField = await this.page!.$(selector);
          if (passwordField) {
            this.logger.info(`  ✓ Password field appeared: ${selector}`);
            break;
          }
        }
      }

      if (!passwordField) {
        this.logger.error('Password field never appeared - multi-step login may have changed');
        return false;
      }

      // Fill in password
      this.logger.info('Step 8/8: Filling password and submitting...');
      await this.page!.fill('input[name="password"], input[type="password"], #password', password);
      await this.randomDelay(500, 1000);

      // Submit the login form
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        '.login-button',
        'button:has-text("Log in")',
        'button:has-text("Sign in")'
      ];

      for (const selector of submitSelectors) {
        try {
          const button = await this.page!.$(selector);
          if (button) {
            await button.click();
            this.logger.info(`  ✓ Clicked submit: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }

      // Wait for navigation
      await this.page!.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await this.randomDelay(3000, 5000);

      // Check if login was successful
      const currentUrl = this.page!.url();
      this.logger.info(`Post-login URL: ${currentUrl}`);

      const isLoggedIn = !currentUrl.includes('/login') && !currentUrl.includes('/sign-in');

      if (isLoggedIn) {
        this.logger.info('BizJournals login successful - redirected away from login page');
        return true;
      } else {
        // Check for error messages on the page
        const errorMsg = await this.page!.$eval('.error, .alert-error, .error-message, [class*="error"]',
          el => el.textContent?.trim() || ''
        ).catch(() => '');

        this.logger.warn(`BizJournals login failed - still on login page. Error message: "${errorMsg || 'none found'}"`);
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : '';
      this.logger.error(`BizJournals login failed: ${message}`);
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

        // Get all article links - BizJournals specific selectors
        const articleLinks = await this.page!.$$eval(
          '.item a[href*="/news/"], article a[href*="/news/"], .story a[href*="/news/"]',
          (links) =>
            links
              .map((a) => ({
                url: (a as HTMLAnchorElement).href,
                title: a.textContent?.trim() || '',
              }))
              .filter((l) => l.url && l.title && l.title.length > 10)
        );

        this.logger.info(`Found ${articleLinks.length} article links on ${path}`);

        // Scrape each article
        for (const link of articleLinks.slice(0, 10)) {
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

          await this.randomDelay(2000, 4000); // BizJournals may be rate-sensitive
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
      await this.randomDelay(1500, 2500);

      // Check for paywall/subscriber-only content
      const isPaywalled = await this.page!.$('.paywall, .subscriber-only, .premium-content');
      if (isPaywalled) {
        this.logger.debug(`Paywalled article, attempting to read available content: ${url}`);
      }

      // Extract title
      const title = await this.page!.$eval(
        'h1, .headline, .article-title',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      if (!title) {
        this.logger.warn(`No title found for ${url}`);
        return null;
      }

      // Extract article body - try multiple selectors
      let content = '';
      const contentSelectors = [
        '.content, .article-body, .story-body',
        '.article__body',
        'article p',
        '.body-copy',
      ];

      for (const selector of contentSelectors) {
        try {
          content = await this.page!.$eval(selector, (el) => el.textContent?.trim() || '');
          if (content && content.length > 100) break;
        } catch {
          continue;
        }
      }

      // If still no content, try getting all paragraphs
      if (!content || content.length < 100) {
        content = await this.page!.$$eval('article p, .content p', (paragraphs) =>
          paragraphs.map((p) => p.textContent?.trim()).join(' ')
        ).catch(() => '');
      }

      if (!content || content.length < 50) {
        this.logger.warn(`Insufficient content for ${url}`);
        return null;
      }

      // Extract publish date
      let publishedAt: Date | null = null;
      const dateStr = await this.page!.$eval(
        'time[datetime], .date, .timestamp, .article-date',
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

export default BizJournalsScraper;
