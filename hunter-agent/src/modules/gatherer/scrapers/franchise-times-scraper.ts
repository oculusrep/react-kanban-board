import { BrowserContext } from 'playwright';
import { BaseScraper, ScrapedArticle } from './base-scraper';
import { HunterSource } from '../../../types';

interface FranchiseTimesScrapeConfig {
  target_paths: string[];
  article_selector: string;
  title_selector: string;
  body_selector: string;
}

export class FranchiseTimesScraper extends BaseScraper {
  private scrapeConfig: FranchiseTimesScrapeConfig;

  constructor(source: HunterSource, context: BrowserContext) {
    super(source, context);
    this.scrapeConfig = source.scrape_config as unknown as FranchiseTimesScrapeConfig;
  }

  // Franchise Times is free - no login needed

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
          'article a[href], .post a[href], .entry a[href], .article-item a[href]',
          (links, baseUrl) =>
            links
              .map((a) => {
                const href = (a as HTMLAnchorElement).href;
                // Only include internal article links
                if (href.startsWith(baseUrl) && !href.includes('/category/') && !href.includes('/tag/')) {
                  return {
                    url: href,
                    title: a.textContent?.trim() || '',
                  };
                }
                return null;
              })
              .filter((l): l is { url: string; title: string } => l !== null && l.url !== '' && l.title !== ''),
          this.source.base_url
        );

        this.logger.info(`Found ${articleLinks.length} article links on ${path}`);

        // Scrape each article
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
        'h1.entry-title, h1.post-title, h1, .article-title',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      if (!title) {
        this.logger.warn(`No title found for ${url}`);
        return null;
      }

      // Extract article body
      const content = await this.page!.$eval(
        '.entry-content, .post-content, .article-body, article .content',
        (el) => el.textContent?.trim() || ''
      ).catch(() => '');

      if (!content || content.length < 100) {
        this.logger.warn(`No content found for ${url}`);
        return null;
      }

      // Extract publish date
      let publishedAt: Date | null = null;
      const dateStr = await this.page!.$eval(
        'time[datetime], .entry-date, .post-date, .published',
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

export default FranchiseTimesScraper;
