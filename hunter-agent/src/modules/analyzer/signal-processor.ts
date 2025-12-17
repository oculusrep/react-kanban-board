import { generateJSON } from '../../utils/gemini-client';
import { createLogger } from '../../utils/logger';
import { HunterSignal, LeadExtraction } from '../../types';

const logger = createLogger('signal-processor');

/**
 * Gemini prompt for extracting lead information from article content
 */
const EXTRACTION_PROMPT = `You are an AI assistant for a commercial real estate broker who specializes in restaurant and retail tenant representation.

Analyze this article and extract information about restaurant/retail brands that are:
- Expanding to new markets
- Opening new locations
- Growing their franchise network
- Raising capital for growth
- Entering the Southeast US market

For EACH brand mentioned that is relevant, extract:
1. concept_name: The exact brand/restaurant name
2. industry_segment: (QSR, Fast Casual, Casual Dining, Fine Dining, Coffee/Beverage, Retail, C-Store, Other)
3. signal_summary: A 1-2 sentence summary of the expansion signal
4. mentioned_geography: Array of specific states, cities, or regions mentioned
5. key_person_name: Name of a key decision maker if mentioned (CEO, VP Real Estate, etc.)
6. key_person_title: Their title if mentioned
7. expansion_indicators: Array of key phrases that indicate expansion intent

Return a JSON array of extractions. If no relevant brands are found, return an empty array.
Only include brands with CLEAR expansion signals - do not include general news about brands.

Article:
---
Title: {title}

Content:
{content}
---

Respond ONLY with valid JSON array, no markdown or explanation:`;

export interface ProcessedSignal {
  signal: HunterSignal;
  extractions: LeadExtraction[];
}

export class SignalProcessor {
  /**
   * Process a single signal and extract lead information
   */
  async processSignal(signal: HunterSignal): Promise<ProcessedSignal> {
    if (!signal.raw_content || signal.raw_content.length < 100) {
      logger.debug(`Signal ${signal.id} has insufficient content, skipping`);
      return { signal, extractions: [] };
    }

    try {
      // Truncate content if too long (Gemini context limits)
      const content =
        signal.raw_content.length > 15000
          ? signal.raw_content.substring(0, 15000) + '...[truncated]'
          : signal.raw_content;

      const prompt = EXTRACTION_PROMPT.replace('{title}', signal.source_title || 'Untitled').replace(
        '{content}',
        content
      );

      const extractions = await generateJSON<LeadExtraction[]>(prompt, { temperature: 0.2 });

      logger.info(`Extracted ${extractions.length} leads from signal: ${signal.source_title?.substring(0, 50)}`);

      return { signal, extractions };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to process signal ${signal.id}: ${message}`);
      return { signal, extractions: [] };
    }
  }

  /**
   * Batch process multiple signals
   */
  async processSignals(signals: HunterSignal[]): Promise<ProcessedSignal[]> {
    const results: ProcessedSignal[] = [];

    for (const signal of signals) {
      const result = await this.processSignal(signal);
      results.push(result);

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  }
}

export default SignalProcessor;
