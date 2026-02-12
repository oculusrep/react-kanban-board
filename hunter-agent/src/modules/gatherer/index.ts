import { supabase } from '../../db/client';
import { HunterSource, HunterSignal, RunError } from '../../types';
import { createLogger } from '../../utils/logger';
import { BrowserManager } from './playwright-browser';
import { BaseScraper } from './scrapers/base-scraper';
import { NRNScraper } from './scrapers/nrn-scraper';
import { QSRScraper } from './scrapers/qsr-scraper';
import { FranchiseTimesScraper } from './scrapers/franchise-times-scraper';
import { BizJournalsScraper } from './scrapers/bizjournals-scraper';
import { RSSFetcher } from './rss/rss-fetcher';
import { ArticleFetcher, RSS_FEEDS } from './rss/article-fetcher';
import { WhisperClient } from './transcription/whisper-client';
import { generateContentHash } from '../../utils/text-utils';

const logger = createLogger('gatherer');

export interface GathererResult {
  sourcesScraped: number;
  signalsCollected: number;
  errors: RunError[];
}

/**
 * Gatherer module optimized for low memory usage.
 *
 * Memory optimization strategy:
 * 1. Use RSS feeds for no-auth sources (no Playwright needed)
 * 2. For auth-required sources, create/destroy browser for each source
 * 3. Process sources sequentially to avoid memory spikes
 * 4. Force garbage collection hints between sources
 */
export class Gatherer {
  private rssFetcher = new RSSFetcher();
  private articleFetcher = new ArticleFetcher();
  private whisperClient = new WhisperClient();

  /**
   * Run the full gathering process with memory optimization
   */
  async run(): Promise<GathererResult> {
    const result: GathererResult = {
      sourcesScraped: 0,
      signalsCollected: 0,
      errors: [],
    };

    // Get all active sources
    const { data: sources, error: sourcesError } = await supabase
      .from('hunter_source')
      .select('*')
      .eq('is_active', true);

    if (sourcesError || !sources) {
      throw new Error(`Failed to fetch sources: ${sourcesError?.message}`);
    }

    logger.info(`Found ${sources.length} active sources`);

    // Separate sources by type for processing
    const rssOnlySources = sources.filter(
      (s) => s.source_type === 'rss' || s.source_type === 'podcast'
    );
    const noAuthWebsites = sources.filter(
      (s) => s.source_type === 'website' && !s.requires_auth && RSS_FEEDS[s.slug]
    );
    const authWebsites = sources.filter(
      (s) => s.source_type === 'website' && s.requires_auth && !s.scrape_locally_only
    );
    const noRssNoAuthWebsites = sources.filter(
      (s) => s.source_type === 'website' && !s.requires_auth && !RSS_FEEDS[s.slug]
    );
    const localOnlySources = sources.filter((s) => s.scrape_locally_only);

    logger.info(
      `Source breakdown: ${rssOnlySources.length} RSS/podcast, ` +
      `${noAuthWebsites.length} no-auth with RSS, ` +
      `${authWebsites.length} auth-required, ` +
      `${noRssNoAuthWebsites.length} no-auth without RSS`
    );

    if (localOnlySources.length > 0) {
      logger.info(
        `Skipping ${localOnlySources.length} local-only sources (run from Mac): ` +
        localOnlySources.map(s => s.name).join(', ')
      );
    }

    // Phase 1: Process RSS-only sources (podcasts) - NO PLAYWRIGHT
    for (const source of rssOnlySources) {
      try {
        logger.info(`[RSS] Processing: ${source.name}`);
        const signals = await this.processPodcast(source);

        if (signals.length > 0) {
          const storedCount = await this.storeSignals(signals);
          result.signalsCollected += storedCount;
          logger.info(`[RSS] Stored ${storedCount} signals from ${source.name}`);
        }

        await this.markSourceSuccess(source);
        result.sourcesScraped++;
      } catch (error) {
        await this.handleSourceError(source, error, result);
      }

      this.triggerGC();
    }

    // Phase 2: Process no-auth websites via RSS - NO PLAYWRIGHT
    for (const source of noAuthWebsites) {
      try {
        logger.info(`[RSS-Article] Processing: ${source.name}`);
        const rssUrl = RSS_FEEDS[source.slug];
        const articles = await this.articleFetcher.fetchFromRSS(rssUrl);
        const signals = this.articleFetcher.articlesToSignals(source, articles);

        if (signals.length > 0) {
          const storedCount = await this.storeSignals(signals);
          result.signalsCollected += storedCount;
          logger.info(`[RSS-Article] Stored ${storedCount} signals from ${source.name}`);
        }

        await this.markSourceSuccess(source);
        result.sourcesScraped++;
      } catch (error) {
        await this.handleSourceError(source, error, result);
      }

      this.triggerGC();
    }

    // Phase 3: Process auth-required websites with Playwright
    // Create/destroy browser for EACH source to minimize memory
    for (const source of authWebsites) {
      let browserManager: BrowserManager | null = null;

      try {
        logger.info(`[Browser] Processing auth-required source: ${source.name}`);

        // Create fresh browser for this source
        browserManager = new BrowserManager();
        await browserManager.initialize();

        const context = await browserManager.getContext(source.slug);
        const signals = await this.scrapeWithBrowser(source, context);

        if (signals.length > 0) {
          const storedCount = await this.storeSignals(signals);
          result.signalsCollected += storedCount;
          logger.info(`[Browser] Stored ${storedCount} signals from ${source.name}`);
        }

        await this.markSourceSuccess(source);
        result.sourcesScraped++;
      } catch (error) {
        await this.handleSourceError(source, error, result);
      } finally {
        // CRITICAL: Close browser after each source to free memory
        if (browserManager) {
          logger.info(`[Browser] Closing browser for ${source.name}`);
          await browserManager.close();
          browserManager = null;
        }

        this.triggerGC();

        // Small delay between browser sources to let memory settle
        await this.delay(2000);
      }
    }

    // Phase 4: Process no-auth websites without RSS (still need Playwright)
    for (const source of noRssNoAuthWebsites) {
      let browserManager: BrowserManager | null = null;

      try {
        logger.info(`[Browser] Processing no-auth source: ${source.name}`);

        browserManager = new BrowserManager();
        await browserManager.initialize();

        const context = await browserManager.getContext(source.slug);
        const signals = await this.scrapeWithBrowser(source, context);

        if (signals.length > 0) {
          const storedCount = await this.storeSignals(signals);
          result.signalsCollected += storedCount;
          logger.info(`[Browser] Stored ${storedCount} signals from ${source.name}`);
        }

        await this.markSourceSuccess(source);
        result.sourcesScraped++;
      } catch (error) {
        await this.handleSourceError(source, error, result);
      } finally {
        if (browserManager) {
          logger.info(`[Browser] Closing browser for ${source.name}`);
          await browserManager.close();
          browserManager = null;
        }

        this.triggerGC();
        await this.delay(2000);
      }
    }

    logger.info(
      `Gatherer complete: ${result.sourcesScraped} sources, ` +
      `${result.signalsCollected} signals, ${result.errors.length} errors`
    );

    return result;
  }

  /**
   * Scrape a website using Playwright browser
   */
  private async scrapeWithBrowser(
    source: HunterSource,
    context: import('playwright').BrowserContext
  ): Promise<Omit<HunterSignal, 'id'>[]> {
    let scraper: BaseScraper;

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
      const shouldTranscribe = this.rssFetcher.shouldTranscribe(
        episode,
        config.transcribe_keywords || []
      );

      if (shouldTranscribe && episode.audioUrl) {
        logger.info(`Transcribing episode: ${episode.title}`);

        const episodeId = generateContentHash(episode.url).substring(0, 12);
        const transcript = await this.whisperClient.transcribeEpisode(
          episode.audioUrl,
          episodeId
        );

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

  /**
   * Mark source as successfully scraped
   */
  private async markSourceSuccess(source: HunterSource): Promise<void> {
    await supabase
      .from('hunter_source')
      .update({
        last_scraped_at: new Date().toISOString(),
        last_error: null,
        consecutive_failures: 0,
      })
      .eq('id', source.id);
  }

  /**
   * Handle source error and record it
   */
  private async handleSourceError(
    source: HunterSource,
    error: unknown,
    result: GathererResult
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to process source ${source.name}: ${message}`);

    result.errors.push({
      source: source.name,
      module: 'gatherer',
      message,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from('hunter_source')
      .update({
        last_error: message,
        consecutive_failures: (source.consecutive_failures || 0) + 1,
      })
      .eq('id', source.id);
  }

  /**
   * Trigger garbage collection hint
   */
  private triggerGC(): void {
    if (global.gc) {
      logger.debug('Triggering garbage collection');
      global.gc();
    }
  }

  /**
   * Simple delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default Gatherer;
