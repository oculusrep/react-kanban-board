import { generateContent } from '../../utils/gemini-client';
import { createLogger } from '../../utils/logger';
import { HunterLead, HunterContactEnrichment } from '../../types';

const logger = createLogger('email-drafter');

export interface DraftedEmail {
  subject: string;
  body: string;
  reasoning: string;
}

export interface DraftedVoicemail {
  script: string;
  reasoning: string;
}

const EMAIL_PROMPT = `You are writing a prospecting email for a commercial real estate broker who specializes in restaurant and retail tenant representation in the Southeast US.

The broker helps expanding restaurant and retail brands find ideal locations for their new stores. He offers services like site selection, lease negotiation, and market analysis.

CONTEXT:
Brand: {brand_name}
Industry: {industry}
Signal Strength: {signal_strength}
Contact: {contact_name} ({contact_title})
Recent News: {signal_summary}
Geographic Focus: {geography}

GUIDELINES:
- Be professional but personable
- Reference the specific news/signal that prompted outreach
- Highlight relevance to the Southeast market (if applicable)
- Keep it concise (under 150 words)
- Include a clear call to action (suggest a call)
- Don't be pushy or overly salesy
- Don't use generic phrases like "I hope this email finds you well"
- Sound like a knowledgeable industry professional

Write a short prospecting email with a compelling subject line.

Format your response as:
SUBJECT: [subject line]
BODY:
[email body]
REASONING: [1 sentence explaining your approach]`;

const VOICEMAIL_PROMPT = `You are writing a voicemail script for a commercial real estate broker who specializes in restaurant and retail tenant representation in the Southeast US.

CONTEXT:
Brand: {brand_name}
Industry: {industry}
Contact: {contact_name}
Recent News: {signal_summary}

GUIDELINES:
- Keep it under 30 seconds when spoken (about 75 words)
- Sound natural and conversational
- Reference the specific news that prompted the call
- Leave a clear call to action
- Include broker's name (Mike) and phone number placeholder [PHONE]

Format your response as:
SCRIPT:
[voicemail script]
REASONING: [1 sentence explaining your approach]`;

export class EmailDrafter {
  /**
   * Draft a prospecting email for a lead
   */
  async draftEmail(
    lead: HunterLead,
    contact: HunterContactEnrichment,
    signalSummary: string
  ): Promise<DraftedEmail> {
    const prompt = EMAIL_PROMPT
      .replace('{brand_name}', lead.concept_name)
      .replace('{industry}', lead.industry_segment || 'Restaurant')
      .replace('{signal_strength}', lead.signal_strength)
      .replace('{contact_name}', contact.person_name)
      .replace('{contact_title}', contact.title || 'Real Estate')
      .replace('{signal_summary}', signalSummary)
      .replace('{geography}', (lead.target_geography || []).join(', ') || 'Southeast US');

    try {
      const response = await generateContent(prompt, { temperature: 0.7 });
      return this.parseEmailResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to draft email for ${lead.concept_name}: ${message}`);
      throw error;
    }
  }

  /**
   * Draft a voicemail script for a lead
   */
  async draftVoicemail(
    lead: HunterLead,
    contact: HunterContactEnrichment,
    signalSummary: string
  ): Promise<DraftedVoicemail> {
    const prompt = VOICEMAIL_PROMPT
      .replace('{brand_name}', lead.concept_name)
      .replace('{industry}', lead.industry_segment || 'Restaurant')
      .replace('{contact_name}', contact.person_name)
      .replace('{signal_summary}', signalSummary);

    try {
      const response = await generateContent(prompt, { temperature: 0.7 });
      return this.parseVoicemailResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to draft voicemail for ${lead.concept_name}: ${message}`);
      throw error;
    }
  }

  /**
   * Parse email response from Gemini
   */
  private parseEmailResponse(response: string): DraftedEmail {
    const subjectMatch = response.match(/SUBJECT:\s*(.+?)(?:\n|BODY)/s);
    const bodyMatch = response.match(/BODY:\s*([\s\S]+?)(?:REASONING|$)/);
    const reasoningMatch = response.match(/REASONING:\s*(.+)/);

    const subject = subjectMatch?.[1]?.trim() || 'Regarding Your Expansion Plans';
    const body = bodyMatch?.[1]?.trim() || response;
    const reasoning = reasoningMatch?.[1]?.trim() || 'AI-generated prospecting email';

    return { subject, body, reasoning };
  }

  /**
   * Parse voicemail response from Gemini
   */
  private parseVoicemailResponse(response: string): DraftedVoicemail {
    const scriptMatch = response.match(/SCRIPT:\s*([\s\S]+?)(?:REASONING|$)/);
    const reasoningMatch = response.match(/REASONING:\s*(.+)/);

    const script = scriptMatch?.[1]?.trim() || response;
    const reasoning = reasoningMatch?.[1]?.trim() || 'AI-generated voicemail script';

    return { script, reasoning };
  }
}

export default EmailDrafter;
