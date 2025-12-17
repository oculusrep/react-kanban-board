import { Page, BrowserContext } from 'playwright';
import { HunterSource, HunterSignal } from '../../../types';
import { generateContentHash } from '../../../utils/text-utils';
import { createLogger, Logger } from '../../../utils/logger';

export interface ScrapedArticle {
  url: string;
  title: string;
  content: string;
  publishedAt: Date | null;
}

export abstract class BaseScraper {
  protected source: HunterSource;
  protected context: BrowserContext;
  protected page: Page | null = null;
  protected logger: Logger;

  constructor(source: HunterSource, context: BrowserContext) {
    this.source = source;
    this.context = context;
    this.logger = createLogger(`scraper:${source.slug}`);
  }

  /**
   * Initialize a new page for scraping
   */
  async initPage(): Promise<Page> {
    if (this.page) {
      await this.page.close();
    }
    this.page = await this.context.newPage();

    // Set up request interception to block unnecessary resources
    await this.page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    return this.page;
  }

  /**
   * Login to the source (override in authenticated scrapers)
   */
  async login(): Promise<boolean> {
    // Default: no login needed
    return true;
  }

  /**
   * Scrape articles from the source
   */
  abstract scrapeArticles(): Promise<ScrapedArticle[]>;

  /**
   * Convert scraped articles to HunterSignal format
   */
  articlesToSignals(articles: ScrapedArticle[]): Omit<HunterSignal, 'id'>[] {
    return articles.map((article) => ({
      source_id: this.source.id,
      source_url: article.url,
      source_title: article.title,
      source_published_at: article.publishedAt?.toISOString() || null,
      content_type: 'article' as const,
      raw_content: article.content,
      content_hash: generateContentHash(article.url + article.content),
    }));
  }

  /**
   * Run the full scraping process
   */
  async run(): Promise<Omit<HunterSignal, 'id'>[]> {
    this.logger.info('Starting scrape');

    try {
      await this.initPage();

      // Login if required
      if (this.source.requires_auth) {
        this.logger.info('Logging in...');
        const loggedIn = await this.login();
        if (!loggedIn) {
          this.logger.error('Login failed');
          throw new Error(`Login failed for ${this.source.name}`);
        }
        this.logger.info('Login successful');
      }

      // Scrape articles
      const articles = await this.scrapeArticles();
      this.logger.info(`Scraped ${articles.length} articles`);

      // Convert to signals
      const signals = this.articlesToSignals(articles);

      return signals;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Scrape failed: ${message}`);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }

  /**
   * Wait with random delay (to appear more human-like)
   */
  protected async randomDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs) + minMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Safe click with wait
   */
  protected async safeClick(selector: string, options?: { timeout?: number }): Promise<boolean> {
    try {
      await this.page!.waitForSelector(selector, { timeout: options?.timeout || 10000 });
      await this.page!.click(selector);
      await this.randomDelay(500, 1500);
      return true;
    } catch {
      this.logger.warn(`Failed to click: ${selector}`);
      return false;
    }
  }

  /**
   * Safe text extraction
   */
  protected async safeTextContent(selector: string): Promise<string | null> {
    try {
      const element = await this.page!.$(selector);
      if (element) {
        return await element.textContent();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract article links from a listing page
   */
  protected async extractArticleLinks(
    articleSelector: string,
    linkSelector: string
  ): Promise<{ url: string; title: string }[]> {
    return await this.page!.$$eval(
      `${articleSelector} ${linkSelector}`,
      (links) =>
        links.map((a) => ({
          url: (a as HTMLAnchorElement).href,
          title: a.textContent?.trim() || '',
        }))
    );
  }
}

export default BaseScraper;
