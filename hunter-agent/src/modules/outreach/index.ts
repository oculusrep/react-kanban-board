import { supabase } from '../../db/client';
import { createLogger } from '../../utils/logger';
import { HunterLead, HunterContactEnrichment, HunterOutreachDraft, RunError } from '../../types';
import { EmailDrafter } from './email-drafter';

const logger = createLogger('outreach');

export interface OutreachResult {
  draftedCount: number;
  errors: RunError[];
}

export class OutreachDrafter {
  private emailDrafter = new EmailDrafter();

  /**
   * Run the outreach drafting process for HOT and WARM+ leads
   */
  async run(): Promise<OutreachResult> {
    const result: OutreachResult = {
      draftedCount: 0,
      errors: [],
    };

    try {
      // Get leads ready for outreach (ready status, HOT or WARM+, with contacts)
      const { data: leads, error: fetchError } = await supabase
        .from('hunter_lead')
        .select(`
          *,
          hunter_contact_enrichment!inner(*)
        `)
        .eq('status', 'ready')
        .in('signal_strength', ['HOT', 'WARM+'])
        .eq('news_only', false)
        .limit(10);

      if (fetchError) {
        throw new Error(`Failed to fetch leads: ${fetchError.message}`);
      }

      if (!leads || leads.length === 0) {
        logger.info('No leads ready for outreach drafting');
        return result;
      }

      logger.info(`Found ${leads.length} leads for outreach drafting`);

      for (const leadData of leads) {
        try {
          const lead = leadData as HunterLead & { hunter_contact_enrichment: HunterContactEnrichment[] };
          const primaryContact = lead.hunter_contact_enrichment.find(c => c.is_primary) || lead.hunter_contact_enrichment[0];

          if (!primaryContact) {
            logger.warn(`No contact found for lead ${lead.concept_name}`);
            continue;
          }

          // Check if we already have a draft for this lead/contact
          const { data: existingDraft } = await supabase
            .from('hunter_outreach_draft')
            .select('id')
            .eq('lead_id', lead.id)
            .eq('enrichment_id', primaryContact.id)
            .eq('status', 'draft')
            .limit(1);

          if (existingDraft && existingDraft.length > 0) {
            logger.debug(`Draft already exists for ${lead.concept_name}`);
            continue;
          }

          // Get signal summary for context
          const signalSummary = await this.getLatestSignalSummary(lead.id!);

          // Draft email
          const emailDrafted = await this.draftEmailOutreach(lead, primaryContact, signalSummary);
          if (emailDrafted) result.draftedCount++;

          // Draft voicemail if we have a phone number
          if (primaryContact.phone) {
            const vmDrafted = await this.draftVoicemailOutreach(lead, primaryContact, signalSummary);
            if (vmDrafted) result.draftedCount++;
          }

          // Update lead status
          await supabase
            .from('hunter_lead')
            .update({ status: 'outreach_drafted' })
            .eq('id', lead.id);

          logger.info(`Drafted outreach for ${lead.concept_name}`);

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to draft outreach for lead: ${message}`);

          result.errors.push({
            module: 'outreach',
            message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Outreach run failed: ${message}`);

      result.errors.push({
        module: 'outreach',
        message,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `Outreach complete: ${result.draftedCount} drafts created, ${result.errors.length} errors`
    );

    return result;
  }

  /**
   * Get the latest signal summary for a lead
   */
  private async getLatestSignalSummary(leadId: string): Promise<string> {
    const { data } = await supabase
      .from('hunter_lead_signal')
      .select('extracted_summary')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data?.extracted_summary || 'Expansion plans announced';
  }

  /**
   * Draft and store an email outreach
   */
  private async draftEmailOutreach(
    lead: HunterLead,
    contact: HunterContactEnrichment,
    signalSummary: string
  ): Promise<boolean> {
    try {
      const email = await this.emailDrafter.draftEmail(lead, contact, signalSummary);

      // Get source URL from latest signal
      const { data: latestSignal } = await supabase
        .from('hunter_lead_signal')
        .select('signal_id, hunter_signal!inner(source_url)')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const sourceUrl = (latestSignal as any)?.hunter_signal?.source_url || null;

      const draft: Omit<HunterOutreachDraft, 'id' | 'created_at' | 'updated_at'> = {
        lead_id: lead.id!,
        enrichment_id: contact.id || null,
        outreach_type: 'email',
        contact_name: contact.person_name,
        contact_email: contact.email,
        contact_phone: contact.phone,
        subject: email.subject,
        body: email.body,
        ai_reasoning: email.reasoning,
        signal_summary: signalSummary,
        source_url: sourceUrl,
        status: 'draft',
        user_edited_subject: null,
        user_edited_body: null,
        sent_at: null,
        sent_email_id: null,
        gmail_message_id: null,
        gmail_thread_id: null,
        sent_by_user_email: null,
        error_message: null,
      };

      const { error } = await supabase.from('hunter_outreach_draft').insert(draft);

      if (error) {
        throw new Error(`Failed to store email draft: ${error.message}`);
      }

      logger.debug(`Created email draft for ${lead.concept_name}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to draft email for ${lead.concept_name}: ${message}`);
      return false;
    }
  }

  /**
   * Draft and store a voicemail script
   */
  private async draftVoicemailOutreach(
    lead: HunterLead,
    contact: HunterContactEnrichment,
    signalSummary: string
  ): Promise<boolean> {
    try {
      const voicemail = await this.emailDrafter.draftVoicemail(lead, contact, signalSummary);

      const draft: Omit<HunterOutreachDraft, 'id' | 'created_at' | 'updated_at'> = {
        lead_id: lead.id!,
        enrichment_id: contact.id || null,
        outreach_type: 'voicemail_script',
        contact_name: contact.person_name,
        contact_email: contact.email,
        contact_phone: contact.phone,
        subject: null,
        body: voicemail.script,
        ai_reasoning: voicemail.reasoning,
        signal_summary: signalSummary,
        source_url: null,
        status: 'draft',
        user_edited_subject: null,
        user_edited_body: null,
        sent_at: null,
        sent_email_id: null,
        gmail_message_id: null,
        gmail_thread_id: null,
        sent_by_user_email: null,
        error_message: null,
      };

      const { error } = await supabase.from('hunter_outreach_draft').insert(draft);

      if (error) {
        throw new Error(`Failed to store voicemail draft: ${error.message}`);
      }

      logger.debug(`Created voicemail draft for ${lead.concept_name}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to draft voicemail for ${lead.concept_name}: ${message}`);
      return false;
    }
  }
}

export default OutreachDrafter;
