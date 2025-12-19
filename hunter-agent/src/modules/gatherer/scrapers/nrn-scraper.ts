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
      this.logger.info(`Step 1/6: Navigating to NRN login page: ${this.source.login_url}`);
      await this.page!.goto(this.source.login_url!, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.randomDelay(2000, 4000);

      this.logger.info(`Step 2/6: Page loaded, current URL: ${this.page!.url()}`);

      // Check what form fields are available
      const usernameField = await this.page!.$('input[name="name"], input#edit-name');
      const passwordField = await this.page!.$('input[name="pass"], input#edit-pass');
      this.logger.info(`Step 3/6: Form fields found - username: ${!!usernameField}, password: ${!!passwordField}`);

      if (!usernameField || !passwordField) {
        // Log the page content to help debug
        const pageContent = await this.page!.content();
        this.logger.error(`Login form not found. Page title: ${await this.page!.title()}`);
        this.logger.debug(`Page HTML snippet: ${pageContent.substring(0, 1000)}`);
        return false;
      }

      // Fill in the login form
      this.logger.info('Step 4/6: Filling username field...');
      await this.page!.fill('input[name="name"], input#edit-name', username);
      await this.randomDelay(500, 1000);

      this.logger.info('Step 5/6: Filling password field...');
      await this.page!.fill('input[name="pass"], input#edit-pass', password);
      await this.randomDelay(500, 1000);

      // Submit the form
      this.logger.info('Step 6/6: Clicking submit button...');
      await this.page!.click('input[type="submit"], button[type="submit"]');

      // Wait for navigation
      await this.page!.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await this.randomDelay(2000, 3000);

      // Verify login success - check if we're redirected away from login page
      const currentUrl = this.page!.url();
      this.logger.info(`Post-login URL: ${currentUrl}`);

      const isLoggedIn = !currentUrl.includes('/user/login') && !currentUrl.includes('/login');

      if (isLoggedIn) {
        this.logger.info('NRN login successful - redirected away from login page');
        return true;
      } else {
        // Check for error messages on the page
        const errorMsg = await this.page!.$eval('.messages--error, .error-message, .alert-danger',
          el => el.textContent?.trim() || ''
        ).catch(() => '');

        this.logger.warn(`NRN login failed - still on login page. Error message: "${errorMsg || 'none found'}"`);
        return false;
      }
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
