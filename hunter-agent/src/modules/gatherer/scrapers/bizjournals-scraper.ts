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
      // Use direct sign-in URL which shows both email and password fields
      // (the base login URL shows a "Create or Sign in" page that requires email validation first)
      const signInUrl = this.source.login_url!.replace('/login', '/login#/sign-in');
      this.logger.info(`Step 1/5: Navigating to BizJournals sign-in page: ${signInUrl}`);
      await this.page!.goto(signInUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await this.randomDelay(2000, 3000);

      this.logger.info(`Step 2/5: Page loaded, current URL: ${this.page!.url()}`);

      // Wait for both email and password fields
      this.logger.info('Step 3/5: Waiting for login form...');
      try {
        await this.page!.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
        await this.page!.waitForSelector('input[name="password"], input[type="password"]', { timeout: 5000 });
      } catch {
        this.logger.error('Login form fields not found');
        return false;
      }

      // Type email with human-like delays
      this.logger.info('Step 4/5: Entering credentials...');
      await this.page!.click('input[name="email"], input[type="email"]');
      await this.randomDelay(200, 400);
      await this.page!.type('input[name="email"], input[type="email"]', username, { delay: 75 });
      await this.randomDelay(500, 800);

      // Type password
      await this.page!.click('input[name="password"], input[type="password"]');
      await this.randomDelay(200, 400);
      await this.page!.type('input[name="password"], input[type="password"]', password, { delay: 60 });
      await this.randomDelay(800, 1200);

      // Submit the login form
      this.logger.info('Step 5/5: Submitting login...');
      const submitBtn = await this.page!.$('button[type="submit"], button:has-text("Sign In"), button:has-text("Log in")');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await this.page!.keyboard.press('Enter');
      }

      // Wait for navigation
      await this.randomDelay(4000, 6000);

      // Check if login was successful
      const currentUrl = this.page!.url();
      this.logger.info(`Post-login URL: ${currentUrl}`);

      const isLoggedIn = !currentUrl.includes('/login') && !currentUrl.includes('/sign-in');

      if (isLoggedIn) {
        this.logger.info('BizJournals login successful - redirected away from login page');
        return true;
      } else {
        // Check for error messages on the page
        const finalError = await this.page!.$eval('.error, .alert-error, .error-message, [class*="error"]',
          el => el.textContent?.trim() || ''
        ).catch(() => '');

        this.logger.warn(`BizJournals login failed - still on login page. Error message: "${finalError || 'none found'}"`);
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
