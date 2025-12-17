import { supabase } from '../../db/client';
import { createLogger } from '../../utils/logger';
import { normalizeCompanyName } from '../../utils/text-utils';
import {
  HunterLead,
  HunterLeadSignal,
  HunterSignal,
  LeadExtraction,
  ScoringResult,
} from '../../types';

const logger = createLogger('lead-manager');

export interface LeadUpdateResult {
  leadsCreated: number;
  leadsUpdated: number;
  signalsLinked: number;
}

export class LeadManager {
  /**
   * Create or update a lead based on extraction and scoring
   */
  async upsertLead(
    extraction: LeadExtraction,
    scoring: ScoringResult,
    signal: HunterSignal
  ): Promise<{ lead: HunterLead; isNew: boolean }> {
    const normalizedName = normalizeCompanyName(extraction.concept_name);

    // Check for existing lead by normalized name
    const { data: existingLead, error: findError } = await supabase
      .from('hunter_lead')
      .select('*')
      .eq('normalized_name', normalizedName)
      .limit(1)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw new Error(`Failed to check existing lead: ${findError.message}`);
    }

    if (existingLead) {
      // Update existing lead if new signal is stronger
      const updatedLead = await this.updateLead(existingLead, extraction, scoring, signal);
      return { lead: updatedLead, isNew: false };
    } else {
      // Create new lead
      const newLead = await this.createLead(extraction, scoring, normalizedName);
      return { lead: newLead, isNew: true };
    }
  }

  /**
   * Create a new lead
   */
  private async createLead(
    extraction: LeadExtraction,
    scoring: ScoringResult,
    normalizedName: string
  ): Promise<HunterLead> {
    // Check if this concept exists in OVIS contacts/clients
    const { existingContactId, existingClientId } = await this.checkOvisExistence(normalizedName);

    const leadData: Omit<HunterLead, 'id' | 'created_at' | 'updated_at' | 'first_seen_at' | 'last_signal_at'> = {
      concept_name: extraction.concept_name,
      normalized_name: normalizedName,
      website: null,
      industry_segment: extraction.industry_segment,
      signal_strength: scoring.strength,
      score_reasoning: scoring.reasoning,
      target_geography: extraction.mentioned_geography,
      geo_relevance: scoring.geoRelevance,
      key_person_name: extraction.key_person_name || null,
      key_person_title: extraction.key_person_title || null,
      status: existingContactId ? 'ready' : 'new',
      existing_contact_id: existingContactId,
      existing_client_id: existingClientId,
      news_only: false,
    };

    const { data: lead, error } = await supabase
      .from('hunter_lead')
      .insert(leadData)
      .select()
      .single();

    if (error || !lead) {
      throw new Error(`Failed to create lead: ${error?.message}`);
    }

    logger.info(`Created new lead: ${extraction.concept_name} (${scoring.strength})`);

    return lead;
  }

  /**
   * Update an existing lead with new signal information
   */
  private async updateLead(
    existingLead: HunterLead,
    extraction: LeadExtraction,
    scoring: ScoringResult,
    _signal: HunterSignal
  ): Promise<HunterLead> {
    const updates: Partial<HunterLead> = {
      last_signal_at: new Date().toISOString(),
    };

    // Upgrade signal strength if new signal is stronger
    const strengthOrder: Record<string, number> = { HOT: 4, 'WARM+': 3, WARM: 2, COOL: 1 };
    if (strengthOrder[scoring.strength] > strengthOrder[existingLead.signal_strength]) {
      updates.signal_strength = scoring.strength;
      updates.score_reasoning = scoring.reasoning;
      updates.geo_relevance = scoring.geoRelevance;
      logger.info(`Upgraded ${existingLead.concept_name} from ${existingLead.signal_strength} to ${scoring.strength}`);
    }

    // Update key person if we found one and didn't have one
    if (extraction.key_person_name && !existingLead.key_person_name) {
      updates.key_person_name = extraction.key_person_name;
      updates.key_person_title = extraction.key_person_title || null;
    }

    // Merge geography
    if (extraction.mentioned_geography.length > 0) {
      const existingGeo = existingLead.target_geography || [];
      const newGeo = [...new Set([...existingGeo, ...extraction.mentioned_geography])];
      if (newGeo.length > existingGeo.length) {
        updates.target_geography = newGeo;
      }
    }

    const { data: updatedLead, error } = await supabase
      .from('hunter_lead')
      .update(updates)
      .eq('id', existingLead.id)
      .select()
      .single();

    if (error || !updatedLead) {
      throw new Error(`Failed to update lead: ${error?.message}`);
    }

    logger.debug(`Updated lead: ${existingLead.concept_name}`);

    return updatedLead;
  }

  /**
   * Link a signal to a lead
   */
  async linkSignalToLead(
    leadId: string,
    signal: HunterSignal,
    extraction: LeadExtraction
  ): Promise<void> {
    const linkData: Omit<HunterLeadSignal, 'id' | 'created_at'> = {
      lead_id: leadId,
      signal_id: signal.id!,
      extracted_summary: extraction.signal_summary,
      mentioned_geography: extraction.mentioned_geography,
      mentioned_person: extraction.key_person_name || null,
    };

    const { error } = await supabase.from('hunter_lead_signal').insert(linkData);

    if (error) {
      // Ignore duplicate key errors (signal already linked)
      if (!error.message.includes('duplicate')) {
        logger.warn(`Failed to link signal to lead: ${error.message}`);
      }
    }
  }

  /**
   * Mark a signal as processed
   */
  async markSignalProcessed(signalId: string): Promise<void> {
    const { error } = await supabase
      .from('hunter_signal')
      .update({
        is_processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq('id', signalId);

    if (error) {
      logger.warn(`Failed to mark signal as processed: ${error.message}`);
    }
  }

  /**
   * Check if a company exists in OVIS contacts or clients
   */
  private async checkOvisExistence(
    normalizedName: string
  ): Promise<{ existingContactId: string | null; existingClientId: string | null }> {
    let existingContactId: string | null = null;
    let existingClientId: string | null = null;

    // Check contacts table
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, client_id')
      .or(`company.ilike.%${normalizedName}%,company.ilike.%${normalizedName.replace(/[^a-z0-9]/g, '%')}%`)
      .limit(1)
      .single();

    if (contact) {
      existingContactId = contact.id;
      existingClientId = contact.client_id;
      logger.debug(`Found existing OVIS contact for ${normalizedName}`);
    }

    // If no contact, check clients table
    if (!existingClientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .or(`name.ilike.%${normalizedName}%,name.ilike.%${normalizedName.replace(/[^a-z0-9]/g, '%')}%`)
        .limit(1)
        .single();

      if (client) {
        existingClientId = client.id;
        logger.debug(`Found existing OVIS client for ${normalizedName}`);
      }
    }

    return { existingContactId, existingClientId };
  }
}

export default LeadManager;
