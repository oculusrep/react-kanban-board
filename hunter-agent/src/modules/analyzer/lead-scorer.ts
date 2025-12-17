import { config } from '../../config';
import { createLogger } from '../../utils/logger';
import { LeadExtraction, SignalStrength, GeoRelevance, ScoringResult } from '../../types';

const logger = createLogger('lead-scorer');

export class LeadScorer {
  private hotMarkets: Set<string>;
  private warmPlusMarkets: Set<string>;
  private regionalTerms: Set<string>;

  constructor() {
    // Convert to lowercase sets for case-insensitive matching
    this.hotMarkets = new Set(config.scoring.hotMarkets.map((m) => m.toLowerCase()));
    this.warmPlusMarkets = new Set(config.scoring.warmPlusMarkets.map((m) => m.toLowerCase()));
    this.regionalTerms = new Set(config.scoring.regionalTerms.map((m) => m.toLowerCase()));
  }

  /**
   * Score a lead extraction based on geographic relevance and expansion indicators
   */
  scoreLead(extraction: LeadExtraction): ScoringResult {
    const geography = extraction.mentioned_geography.map((g) => g.toLowerCase());
    const summary = extraction.signal_summary.toLowerCase();
    const indicators = extraction.expansion_indicators.map((i) => i.toLowerCase());

    // Determine geographic relevance
    const geoResult = this.assessGeography(geography, summary);

    // Determine signal strength based on geo + indicators
    const strength = this.assessStrength(geoResult.relevance, indicators, extraction);

    // Build reasoning
    const reasoning = this.buildReasoning(geoResult, strength, extraction);

    logger.debug(`Scored ${extraction.concept_name}: ${strength} (${geoResult.relevance})`);

    return {
      strength,
      reasoning,
      geoRelevance: geoResult.relevance,
    };
  }

  /**
   * Assess geographic relevance of a lead
   */
  private assessGeography(
    geography: string[],
    summary: string
  ): { relevance: GeoRelevance; matchedTerms: string[] } {
    const matchedHot: string[] = [];
    const matchedWarmPlus: string[] = [];
    const matchedRegional: string[] = [];

    // Check geography array
    for (const geo of geography) {
      if (this.hotMarkets.has(geo)) {
        matchedHot.push(geo);
      } else if (this.warmPlusMarkets.has(geo)) {
        matchedWarmPlus.push(geo);
      }

      // Check for partial matches (e.g., "Atlanta area")
      for (const hotMarket of this.hotMarkets) {
        if (geo.includes(hotMarket) || hotMarket.includes(geo)) {
          if (!matchedHot.includes(hotMarket)) matchedHot.push(hotMarket);
        }
      }

      for (const warmMarket of this.warmPlusMarkets) {
        if (geo.includes(warmMarket) || warmMarket.includes(geo)) {
          if (!matchedWarmPlus.includes(warmMarket)) matchedWarmPlus.push(warmMarket);
        }
      }
    }

    // Check summary for regional terms
    for (const term of this.regionalTerms) {
      if (summary.includes(term)) {
        matchedRegional.push(term);
      }
    }

    // Also check summary for direct market mentions
    for (const hotMarket of this.hotMarkets) {
      if (summary.includes(hotMarket) && !matchedHot.includes(hotMarket)) {
        matchedHot.push(hotMarket);
      }
    }

    // Determine relevance level
    let relevance: GeoRelevance;
    let matchedTerms: string[] = [];

    if (matchedHot.length > 0) {
      relevance = 'primary';
      matchedTerms = matchedHot;
    } else if (matchedWarmPlus.length > 0) {
      relevance = 'secondary';
      matchedTerms = matchedWarmPlus;
    } else if (matchedRegional.length > 0 || this.isNationalExpansion(summary)) {
      relevance = 'national';
      matchedTerms = matchedRegional.length > 0 ? matchedRegional : ['national expansion'];
    } else {
      relevance = 'other';
      matchedTerms = geography.slice(0, 3);
    }

    return { relevance, matchedTerms };
  }

  /**
   * Check if the signal indicates national expansion
   */
  private isNationalExpansion(summary: string): boolean {
    const nationalTerms = [
      'nationwide',
      'national expansion',
      'across the country',
      'multiple states',
      'coast to coast',
      'u.s. expansion',
      'domestic expansion',
      'national footprint',
      'aggressive expansion',
      'rapid expansion',
    ];

    return nationalTerms.some((term) => summary.includes(term));
  }

  /**
   * Assess signal strength based on geographic relevance and expansion indicators
   */
  private assessStrength(
    geoRelevance: GeoRelevance,
    indicators: string[],
    extraction: LeadExtraction
  ): SignalStrength {
    // Strong expansion indicators
    const strongIndicators = [
      'opening',
      'signed lease',
      'signed',
      'groundbreaking',
      'under construction',
      'development deal',
      'franchise agreement',
      'new market',
      'expansion plans',
      'growth strategy',
      'vp real estate',
      'vp of real estate',
      'director of real estate',
      'real estate director',
      'franchise development',
    ];

    // Count strong indicator matches
    const indicatorText = indicators.join(' ').toLowerCase();
    const summaryText = extraction.signal_summary.toLowerCase();
    const combinedText = indicatorText + ' ' + summaryText;

    const strongMatches = strongIndicators.filter((ind) => combinedText.includes(ind)).length;
    const hasKeyPerson = !!extraction.key_person_name;
    const hasSpecificGeo = extraction.mentioned_geography.length > 0;

    // Scoring matrix
    if (geoRelevance === 'primary') {
      // SE US market - our priority
      if (strongMatches >= 2 || (strongMatches >= 1 && hasKeyPerson)) {
        return 'HOT';
      } else if (strongMatches >= 1 || hasSpecificGeo) {
        return 'WARM+';
      } else {
        return 'WARM';
      }
    } else if (geoRelevance === 'secondary') {
      // TX, OH, IL - secondary markets
      if (strongMatches >= 2 && hasKeyPerson) {
        return 'WARM+';
      } else if (strongMatches >= 1) {
        return 'WARM';
      } else {
        return 'COOL';
      }
    } else if (geoRelevance === 'national') {
      // National expansion - could come to SE
      if (strongMatches >= 2 || hasKeyPerson) {
        return 'WARM';
      } else {
        return 'COOL';
      }
    } else {
      // Other markets
      if (strongMatches >= 3 && hasKeyPerson) {
        return 'WARM';
      } else {
        return 'COOL';
      }
    }
  }

  /**
   * Build human-readable reasoning for the score
   */
  private buildReasoning(
    geoResult: { relevance: GeoRelevance; matchedTerms: string[] },
    _strength: SignalStrength,
    extraction: LeadExtraction
  ): string {
    const parts: string[] = [];

    // Geographic reasoning
    switch (geoResult.relevance) {
      case 'primary':
        parts.push(`Primary market match: ${geoResult.matchedTerms.join(', ')}`);
        break;
      case 'secondary':
        parts.push(`Secondary market: ${geoResult.matchedTerms.join(', ')}`);
        break;
      case 'national':
        parts.push('National expansion potential');
        break;
      default:
        parts.push(`Other market: ${geoResult.matchedTerms.join(', ') || 'unspecified'}`);
    }

    // Key person
    if (extraction.key_person_name) {
      parts.push(`Key contact: ${extraction.key_person_name}${extraction.key_person_title ? ` (${extraction.key_person_title})` : ''}`);
    }

    // Indicators
    if (extraction.expansion_indicators.length > 0) {
      parts.push(`Signals: ${extraction.expansion_indicators.slice(0, 3).join(', ')}`);
    }

    return parts.join('. ');
  }
}

export default LeadScorer;
