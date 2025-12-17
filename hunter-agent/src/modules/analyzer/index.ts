import { supabase } from '../../db/client';
import { createLogger } from '../../utils/logger';
import { HunterSignal, RunError } from '../../types';
import { SignalProcessor } from './signal-processor';
import { LeadScorer } from './lead-scorer';
import { LeadManager } from './lead-manager';

const logger = createLogger('analyzer');

export interface AnalyzerResult {
  signalsProcessed: number;
  leadsCreated: number;
  leadsUpdated: number;
  errors: RunError[];
}

export class Analyzer {
  private signalProcessor = new SignalProcessor();
  private leadScorer = new LeadScorer();
  private leadManager = new LeadManager();

  /**
   * Run the full analysis process on unprocessed signals
   */
  async run(): Promise<AnalyzerResult> {
    const result: AnalyzerResult = {
      signalsProcessed: 0,
      leadsCreated: 0,
      leadsUpdated: 0,
      errors: [],
    };

    try {
      // Get all unprocessed signals
      const { data: signals, error: fetchError } = await supabase
        .from('hunter_signal')
        .select('*')
        .eq('is_processed', false)
        .order('scraped_at', { ascending: true });

      if (fetchError) {
        throw new Error(`Failed to fetch signals: ${fetchError.message}`);
      }

      if (!signals || signals.length === 0) {
        logger.info('No unprocessed signals to analyze');
        return result;
      }

      logger.info(`Found ${signals.length} unprocessed signals`);

      // Process each signal
      for (const signal of signals) {
        try {
          await this.processSignal(signal, result);
          result.signalsProcessed++;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to process signal ${signal.id}: ${message}`);

          result.errors.push({
            module: 'analyzer',
            message,
            timestamp: new Date().toISOString(),
          });

          // Mark signal as processed anyway to avoid infinite loops
          await this.leadManager.markSignalProcessed(signal.id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Analyzer run failed: ${message}`);

      result.errors.push({
        module: 'analyzer',
        message,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `Analyzer complete: ${result.signalsProcessed} signals, ${result.leadsCreated} created, ${result.leadsUpdated} updated, ${result.errors.length} errors`
    );

    return result;
  }

  /**
   * Process a single signal through the full pipeline
   */
  private async processSignal(signal: HunterSignal, result: AnalyzerResult): Promise<void> {
    logger.debug(`Processing signal: ${signal.source_title?.substring(0, 50) || signal.id}`);

    // Step 1: Extract lead information using Gemini
    const processed = await this.signalProcessor.processSignal(signal);

    if (processed.extractions.length === 0) {
      logger.debug(`No leads extracted from signal ${signal.id}`);
      await this.leadManager.markSignalProcessed(signal.id!);
      return;
    }

    // Step 2: Score and upsert each extracted lead
    for (const extraction of processed.extractions) {
      try {
        // Score the lead based on geography and indicators
        const scoring = this.leadScorer.scoreLead(extraction);

        // Skip COOL leads with no key person and non-primary geography
        if (scoring.strength === 'COOL' && scoring.geoRelevance !== 'primary' && !extraction.key_person_name) {
          logger.debug(`Skipping low-relevance lead: ${extraction.concept_name}`);
          continue;
        }

        // Create or update the lead
        const { lead, isNew } = await this.leadManager.upsertLead(extraction, scoring, signal);

        if (isNew) {
          result.leadsCreated++;
        } else {
          result.leadsUpdated++;
        }

        // Link the signal to the lead
        await this.leadManager.linkSignalToLead(lead.id!, signal, extraction);

        logger.info(
          `${isNew ? 'Created' : 'Updated'} lead: ${extraction.concept_name} (${scoring.strength})`
        );
      } catch (leadError) {
        const message = leadError instanceof Error ? leadError.message : 'Unknown error';
        logger.warn(`Failed to upsert lead ${extraction.concept_name}: ${message}`);
      }
    }

    // Step 3: Mark signal as processed
    await this.leadManager.markSignalProcessed(signal.id!);
  }
}

export default Analyzer;
