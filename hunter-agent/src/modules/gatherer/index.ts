import { supabase } from '../../db/client';
import { HunterSource, HunterSignal, RunError } from '../../types';
import { createLogger } from '../../utils/logger';
import { getBrowserManager } from './playwright-browser';
import { BaseScraper } from './scrapers/base-scraper';
import { NRNScraper } from './scrapers/nrn-scraper';
import { QSRScraper } from './scrapers/qsr-scraper';
import { FranchiseTimesScraper } from './scrapers/franchise-times-scraper';
import { BizJournalsScraper } from './scrapers/bizjournals-scraper';
import { RSSFetcher } from './rss/rss-fetcher';
import { WhisperClient } from './transcription/whisper-client';
import { generateContentHash } from '../../utils/text-utils';

const logger = createLogger('gatherer');

export interface GathererResult {
  sourcesScraped: number;
  signalsCollected: number;
  errors: RunError[];
}

export class Gatherer {
  private browserManager = getBrowserManager();
  private rssFetcher = new RSSFetcher();
  private whisperClient = new WhisperClient();

  /**
   * Run the full gathering process
   */
  async run(): Promise<GathererResult> {
    const result: GathererResult = {
      sourcesScraped: 0,
      signalsCollected: 0,
      errors: [],
    };

    try {
      // Initialize browser
      await this.browserManager.initialize();

      // Get all active sources
      const { data: sources, error: sourcesError } = await supabase
        .from('hunter_source')
        .select('*')
        .eq('is_active', true);

      if (sourcesError || !sources) {
        throw new Error(`Failed to fetch sources: ${sourcesError?.message}`);
      }

      logger.info(`Found ${sources.length} active sources`);

      // Process each source
      for (const source of sources) {
        try {
          logger.info(`Processing source: ${source.name}`);

          let signals: Omit<HunterSignal, 'id'>[] = [];

          if (source.source_type === 'website') {
            signals = await this.scrapeWebsite(source);
          } else if (source.source_type === 'podcast' || source.source_type === 'rss') {
            signals = await this.processPodcast(source);
          }

          // Store signals
          if (signals.length > 0) {
            const storedCount = await this.storeSignals(signals);
            result.signalsCollected += storedCount;
            logger.info(`Stored ${storedCount} new signals from ${source.name}`);
          }

          // Update source last_scraped_at
          await supabase
            .from('hunter_source')
            .update({
              last_scraped_at: new Date().toISOString(),
              last_error: null,
              consecutive_failures: 0,
            })
            .eq('id', source.id);

          result.sourcesScraped++;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to process source ${source.name}: ${message}`);

          result.errors.push({
            source: source.name,
            module: 'gatherer',
            message,
            timestamp: new Date().toISOString(),
          });

          // Update source with error
          await supabase
            .from('hunter_source')
            .update({
              last_error: message,
              consecutive_failures: (source.consecutive_failures || 0) + 1,
            })
            .eq('id', source.id);
        }
      }
    } finally {
      // Always clean up browser
      await this.browserManager.close();
    }

    logger.info(
      `Gatherer complete: ${result.sourcesScraped} sources, ${result.signalsCollected} signals, ${result.errors.length} errors`
    );

    return result;
  }

  /**
   * Scrape a website source
   */
  private async scrapeWebsite(source: HunterSource): Promise<Omit<HunterSignal, 'id'>[]> {
    const context = await this.browserManager.getContext(source.slug);
    let scraper: BaseScraper;

    // Get the appropriate scraper for this source
    switch (source.slug) {
      case 'nrn':
        scraper = new NRNScraper(source, context);
        break;
      case 'qsr':
        scraper = new QSRScraper(source, context);
        break;
      case 'franchise-times':
        scraper = new FranchiseTimesScraper(source, context);
        break;
      case 'bizjournals-atl':
        scraper = new BizJournalsScraper(source, context);
        break;
      default:
        logger.warn(`No scraper implemented for ${source.slug}`);
        return [];
    }

    return await scraper.run();
  }

  /**
   * Process a podcast source (RSS + optional transcription)
   */
  private async processPodcast(source: HunterSource): Promise<Omit<HunterSignal, 'id'>[]> {
    const signals: Omit<HunterSignal, 'id'>[] = [];
    const config = source.scrape_config as {
      rss_url: string | null;
      transcribe_keywords: string[];
    };

    if (!config.rss_url) {
      logger.warn(`No RSS URL for ${source.name}`);
      return [];
    }

    // Fetch episodes
    const episodes = await this.rssFetcher.fetchPodcastEpisodes(source);
    const recentEpisodes = this.rssFetcher.filterRecentEpisodes(episodes, 30);

    logger.info(`Found ${recentEpisodes.length} recent episodes for ${source.name}`);

    for (const episode of recentEpisodes) {
      // Add metadata signal
      signals.push({
        source_id: source.id,
        source_url: episode.url,
        source_title: episode.title,
        source_published_at: episode.publishedAt?.toISOString() || null,
        content_type: 'podcast_metadata',
        raw_content: episode.description,
        content_hash: generateContentHash(episode.url + episode.title),
      });

      // Check if we should transcribe
      const shouldTranscribe = this.rssFetcher.shouldTranscribe(episode, config.transcribe_keywords || []);

      if (shouldTranscribe && episode.audioUrl) {
        logger.info(`Transcribing episode: ${episode.title}`);

        // Generate a unique ID for this episode
        const episodeId = generateContentHash(episode.url).substring(0, 12);

        const transcript = await this.whisperClient.transcribeEpisode(episode.audioUrl, episodeId);

        if (transcript) {
          signals.push({
            source_id: source.id,
            source_url: episode.url,
            source_title: `[Transcript] ${episode.title}`,
            source_published_at: episode.publishedAt?.toISOString() || null,
            content_type: 'podcast_transcript',
            raw_content: transcript,
            content_hash: generateContentHash(episode.url + 'transcript'),
          });

          logger.info(`Transcription added for: ${episode.title}`);
        }
      }
    }

    return signals;
  }

  /**
   * Store signals in database, handling duplicates
   */
  private async storeSignals(signals: Omit<HunterSignal, 'id'>[]): Promise<number> {
    let storedCount = 0;

    for (const signal of signals) {
      // Check if signal already exists (by content hash)
      const { data: existing } = await supabase
        .from('hunter_signal')
        .select('id')
        .eq('content_hash', signal.content_hash)
        .limit(1);

      if (existing && existing.length > 0) {
        logger.debug(`Signal already exists: ${signal.source_title?.substring(0, 50)}...`);
        continue;
      }

      // Insert new signal
      const { error } = await supabase.from('hunter_signal').insert(signal);

      if (error) {
        logger.warn(`Failed to store signal: ${error.message}`);
      } else {
        storedCount++;
      }
    }

    return storedCount;
  }
}

export default Gatherer;
