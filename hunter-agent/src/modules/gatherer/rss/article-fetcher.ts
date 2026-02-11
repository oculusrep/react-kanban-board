import Parser from 'rss-parser';
import axios from 'axios';
import { HunterSource, HunterSignal } from '../../../types';
import { generateContentHash } from '../../../utils/text-utils';
import { createLogger } from '../../../utils/logger';

// HunterSource is used in articlesToSignals

const logger = createLogger('article-fetcher');

export interface FetchedArticle {
  title: string;
  content: string;
  url: string;
  publishedAt: Date | null;
}

/**
 * RSS-based article fetcher for sources that don't require authentication.
 * Uses RSS feeds + simple HTTP fetching instead of Playwright to save memory.
 */
export class ArticleFetcher {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['dc:creator', 'creator'],
        ],
      },
    });
  }

  /**
   * Fetch articles from an RSS feed
   */
  async fetchFromRSS(rssUrl: string): Promise<FetchedArticle[]> {
    try {
      logger.info(`Fetching RSS feed: ${rssUrl}`);
      const feed = await this.parser.parseURL(rssUrl);

      logger.info(`Found ${feed.items.length} items in RSS feed`);

      const articles: FetchedArticle[] = [];

      for (const item of feed.items.slice(0, 20)) {
        // Get content from RSS (many feeds include full content)
        let content = '';
        if ((item as any).contentEncoded) {
          content = this.stripHtml((item as any).contentEncoded);
        } else if (item.content) {
          content = this.stripHtml(item.content);
        } else if (item.contentSnippet) {
          content = item.contentSnippet;
        }

        // If content is too short, try to fetch full article
        if (content.length < 200 && item.link) {
          try {
            const fullContent = await this.fetchArticleContent(item.link);
            if (fullContent && fullContent.length > content.length) {
              content = fullContent;
            }
          } catch (err) {
            // Use RSS content as fallback
            logger.debug(`Could not fetch full article, using RSS content: ${item.link}`);
          }
        }

        if (content.length >= 100) {
          articles.push({
            title: item.title || 'Untitled',
            content,
            url: item.link || '',
            publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          });
        }
      }

      logger.info(`Processed ${articles.length} articles from RSS`);
      return articles;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch RSS feed: ${message}`);
      return [];
    }
  }

  /**
   * Fetch article content from URL using simple HTTP request
   */
  private async fetchArticleContent(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      const html = response.data as string;

      // Extract article content using common patterns
      const articleMatch = html.match(
        /<article[^>]*>([\s\S]*?)<\/article>|class="(?:article-content|entry-content|post-content|article-body)"[^>]*>([\s\S]*?)<\/div>/i
      );

      if (articleMatch) {
        return this.stripHtml(articleMatch[1] || articleMatch[2] || '');
      }

      // Fallback: extract from body, removing scripts and styles
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        let body = bodyMatch[1];
        // Remove scripts, styles, nav, footer, header
        body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
        body = body.replace(/<style[\s\S]*?<\/style>/gi, '');
        body = body.replace(/<nav[\s\S]*?<\/nav>/gi, '');
        body = body.replace(/<footer[\s\S]*?<\/footer>/gi, '');
        body = body.replace(/<header[\s\S]*?<\/header>/gi, '');
        return this.stripHtml(body).substring(0, 5000);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Strip HTML tags and clean up text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Convert fetched articles to signals
   */
  articlesToSignals(source: HunterSource, articles: FetchedArticle[]): Omit<HunterSignal, 'id'>[] {
    return articles.map((article) => ({
      source_id: source.id,
      source_url: article.url,
      source_title: article.title,
      source_published_at: article.publishedAt?.toISOString() || null,
      content_type: 'article' as const,
      raw_content: article.content,
      content_hash: generateContentHash(article.url + article.content),
    }));
  }
}

// Known RSS feeds for sources
export const RSS_FEEDS: Record<string, string> = {
  qsr: 'https://www.qsrmagazine.com/rss.xml',
  'franchise-times': 'https://www.franchisetimes.com/search/?f=rss&t=article&l=50&s=start_time&sd=desc',
};

export default ArticleFetcher;
