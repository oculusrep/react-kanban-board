import { supabase } from '../../db/client';
import { createLogger } from '../../utils/logger';
import { HunterLead, HunterContactEnrichment, RunError } from '../../types';
import { getBrowserManager } from '../gatherer/playwright-browser';
import { ICSCScraper } from '../gatherer/scrapers/icsc-scraper';
import { generateLinkedInSearchUrl } from '../../utils/text-utils';

const logger = createLogger('enricher');

export interface EnricherResult {
  contactsEnriched: number;
  errors: RunError[];
}

export class Enricher {
  private browserManager = getBrowserManager();
  private icscScraper: ICSCScraper | null = null;

  /**
   * Run the enrichment process on leads that need contact info
   */
  async run(): Promise<EnricherResult> {
    const result: EnricherResult = {
      contactsEnriched: 0,
      errors: [],
    };

    try {
      // Get leads that need enrichment (new or enriching status, no existing contact)
      const { data: leads, error: fetchError } = await supabase
        .from('hunter_lead')
        .select('*')
        .in('status', ['new', 'enriching'])
        .is('existing_contact_id', null)
        .in('signal_strength', ['HOT', 'WARM+', 'WARM'])
        .order('signal_strength', { ascending: true }) // HOT first
        .limit(20); // Process batch at a time

      if (fetchError) {
        throw new Error(`Failed to fetch leads: ${fetchError.message}`);
      }

      if (!leads || leads.length === 0) {
        logger.info('No leads need enrichment');
        return result;
      }

      logger.info(`Found ${leads.length} leads to enrich`);

      // Initialize browser for ICSC
      await this.browserManager.initialize();
      const context = await this.browserManager.getContext('icsc');

      // Create ICSC scraper
      this.icscScraper = new ICSCScraper(context);

      // Enrich each lead
      for (const lead of leads) {
        try {
          // Mark as enriching
          await supabase
            .from('hunter_lead')
            .update({ status: 'enriching' })
            .eq('id', lead.id);

          const enrichedCount = await this.enrichLead(lead);
          result.contactsEnriched += enrichedCount;

          // Update status based on enrichment result
          const newStatus = enrichedCount > 0 ? 'ready' : 'new';
          await supabase
            .from('hunter_lead')
            .update({ status: newStatus })
            .eq('id', lead.id);

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to enrich lead ${lead.concept_name}: ${message}`);

          result.errors.push({
            module: 'enricher',
            message: `Lead ${lead.concept_name}: ${message}`,
            timestamp: new Date().toISOString(),
          });

          // Reset to new status on failure
          await supabase
            .from('hunter_lead')
            .update({ status: 'new' })
            .eq('id', lead.id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Enricher run failed: ${message}`);

      result.errors.push({
        module: 'enricher',
        message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      await this.browserManager.close();
    }

    logger.info(
      `Enricher complete: ${result.contactsEnriched} contacts enriched, ${result.errors.length} errors`
    );

    return result;
  }

  /**
   * Enrich a single lead with contact information
   */
  private async enrichLead(lead: HunterLead): Promise<number> {
    logger.info(`Enriching lead: ${lead.concept_name}`);
    let contactsAdded = 0;

    // Strategy 1: Check if we already have contacts from article extraction
    if (lead.key_person_name) {
      const existing = await this.checkExistingEnrichment(lead.id!, lead.key_person_name);
      if (!existing) {
        // Add the key person from article as a contact
        await this.addEnrichment(lead.id!, {
          person_name: lead.key_person_name,
          title: lead.key_person_title || null,
          email: null,
          phone: null,
          linkedin_url: generateLinkedInSearchUrl(lead.key_person_name, lead.concept_name, lead.key_person_title || undefined),
          enrichment_source: 'article',
          source_url: null,
          confidence_score: 0.6,
          is_verified: false,
          is_primary: true,
        });
        contactsAdded++;
        logger.debug(`Added key person from article: ${lead.key_person_name}`);
      }
    }

    // Strategy 2: Search ICSC directory
    if (this.icscScraper) {
      try {
        // First try company search
        const companyContacts = await this.icscScraper.searchCompany(lead.concept_name);

        for (const contact of companyContacts.slice(0, 3)) { // Limit to top 3
          const existing = await this.checkExistingEnrichment(lead.id!, contact.name);
          if (!existing) {
            await this.addEnrichment(lead.id!, {
              person_name: contact.name,
              title: contact.title || null,
              email: contact.email || null,
              phone: contact.phone || null,
              linkedin_url: generateLinkedInSearchUrl(contact.name, contact.company || lead.concept_name, contact.title || undefined),
              enrichment_source: 'icsc',
              source_url: contact.profileUrl || null,
              confidence_score: contact.email ? 0.9 : 0.7,
              is_verified: false,
              is_primary: contactsAdded === 0, // First contact is primary
            });
            contactsAdded++;
            logger.debug(`Added ICSC contact: ${contact.name}`);
          }
        }

        // If no company results and we have a key person, search by person name
        if (companyContacts.length === 0 && lead.key_person_name) {
          const personContacts = await this.icscScraper.searchPerson(
            lead.key_person_name,
            lead.concept_name
          );

          for (const contact of personContacts.slice(0, 2)) {
            const existing = await this.checkExistingEnrichment(lead.id!, contact.name);
            if (!existing) {
              await this.addEnrichment(lead.id!, {
                person_name: contact.name,
                title: contact.title || null,
                email: contact.email || null,
                phone: contact.phone || null,
                linkedin_url: generateLinkedInSearchUrl(contact.name, contact.company || lead.concept_name, contact.title || undefined),
                enrichment_source: 'icsc',
                source_url: contact.profileUrl || null,
                confidence_score: contact.email ? 0.85 : 0.65,
                is_verified: false,
                is_primary: contactsAdded === 0,
              });
              contactsAdded++;
              logger.debug(`Added ICSC person: ${contact.name}`);
            }
          }
        }
      } catch (icscError) {
        const message = icscError instanceof Error ? icscError.message : 'Unknown error';
        logger.warn(`ICSC search failed for ${lead.concept_name}: ${message}`);
      }
    }

    // Small delay between leads
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return contactsAdded;
  }

  /**
   * Check if we already have enrichment for this person
   */
  private async checkExistingEnrichment(leadId: string, personName: string): Promise<boolean> {
    const { data } = await supabase
      .from('hunter_contact_enrichment')
      .select('id')
      .eq('lead_id', leadId)
      .ilike('person_name', `%${personName}%`)
      .limit(1);

    return !!(data && data.length > 0);
  }

  /**
   * Add a contact enrichment record
   */
  private async addEnrichment(
    leadId: string,
    enrichment: Omit<HunterContactEnrichment, 'id' | 'lead_id' | 'created_at' | 'updated_at'>
  ): Promise<void> {
    const { error } = await supabase.from('hunter_contact_enrichment').insert({
      lead_id: leadId,
      ...enrichment,
    });

    if (error) {
      throw new Error(`Failed to add enrichment: ${error.message}`);
    }
  }
}

export default Enricher;
