import Parser from 'rss-parser';
import { HunterSource, HunterSignal } from '../../../types';
import { generateContentHash } from '../../../utils/text-utils';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('rss-fetcher');

export interface PodcastEpisode {
  title: string;
  description: string;
  url: string;
  audioUrl: string | null;
  publishedAt: Date | null;
  duration: string | null;
}

interface PodcastScrapeConfig {
  rss_url: string | null;
  transcribe_keywords: string[];
}

export class RSSFetcher {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['itunes:duration', 'duration'],
          ['enclosure', 'enclosure'],
        ],
      },
    });
  }

  /**
   * Fetch and parse podcast episodes from RSS feed
   */
  async fetchPodcastEpisodes(source: HunterSource): Promise<PodcastEpisode[]> {
    const config = source.scrape_config as unknown as PodcastScrapeConfig;

    if (!config.rss_url) {
      logger.warn(`No RSS URL configured for ${source.name}`);
      return [];
    }

    try {
      logger.info(`Fetching RSS feed: ${config.rss_url}`);
      const feed = await this.parser.parseURL(config.rss_url);

      logger.info(`Found ${feed.items.length} episodes in ${source.name}`);

      const episodes: PodcastEpisode[] = feed.items.map((item) => {
        // Get audio URL from enclosure
        let audioUrl: string | null = null;
        if (item.enclosure?.url) {
          audioUrl = item.enclosure.url;
        }

        return {
          title: item.title || 'Untitled Episode',
          description: item.contentSnippet || item.content || item.description || '',
          url: item.link || '',
          audioUrl,
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          duration: (item as any).duration || null,
        };
      });

      return episodes;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch RSS feed for ${source.name}: ${message}`);
      return [];
    }
  }

  /**
   * Check if an episode should be transcribed based on keyword matching
   */
  shouldTranscribe(episode: PodcastEpisode, keywords: string[]): boolean {
    const text = `${episode.title} ${episode.description}`.toLowerCase();

    // Check for expansion/growth keywords
    const matched = keywords.some((keyword) => text.includes(keyword.toLowerCase()));

    if (matched) {
      logger.debug(`Episode matches transcription keywords: ${episode.title}`);
    }

    return matched;
  }

  /**
   * Convert episodes to signals (metadata only, not transcribed)
   */
  episodesToSignals(source: HunterSource, episodes: PodcastEpisode[]): Omit<HunterSignal, 'id'>[] {
    return episodes.map((episode) => ({
      source_id: source.id,
      source_url: episode.url,
      source_title: episode.title,
      source_published_at: episode.publishedAt?.toISOString() || null,
      content_type: 'podcast_metadata' as const,
      raw_content: episode.description,
      content_hash: generateContentHash(episode.url + episode.title),
    }));
  }

  /**
   * Get recent episodes (within last N days)
   */
  filterRecentEpisodes(episodes: PodcastEpisode[], daysBack: number = 30): PodcastEpisode[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    return episodes.filter((episode) => {
      if (!episode.publishedAt) return true; // Include if no date
      return episode.publishedAt >= cutoff;
    });
  }
}

export default RSSFetcher;
