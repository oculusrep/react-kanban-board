/**
 * Gemini Autonomous Agent for OVIS CRM
 *
 * This is an autonomous agent that processes emails and links them to CRM objects.
 * The AI makes ALL decisions - this code only provides tools and orchestration.
 *
 * Tools available to the agent:
 * - search_deals: Search deals by name, address, city, or client
 * - search_contacts: Search contacts by name, email, or company
 * - search_clients: Search clients (companies) by name
 * - search_properties: Search properties by address or name
 * - get_deal_participants: Get all participants in a deal
 * - link_object: Link email to a CRM object with confidence score
 * - flag_for_review: Flag email for human review when uncertain
 * - done: Signal completion with summary
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface DealSearchResult {
  id: string;
  deal_name: string;
  address: string | null;
  status: string | null;
  client_name: string | null;
}

export interface ContactSearchResult {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

export interface ClientSearchResult {
  id: string;
  client_name: string;
  contact_count: number;
}

export interface PropertySearchResult {
  id: string;
  property_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

export interface DealParticipant {
  role: string;
  name: string;
  email: string | null;
  company: string | null;
  type: 'contact' | 'client';
}

export interface LinkResult {
  success: boolean;
  message: string;
}

export interface FlagResult {
  success: boolean;
  message: string;
}

export interface AgentRule {
  id: string;
  rule_text: string;
  rule_type: string;
  match_pattern: string | null;
  target_object_type: string | null;
  target_object_id: string | null;
  priority: number;
}

export interface PastCorrection {
  id: string;
  email_id: string;
  incorrect_object_type: string | null;
  incorrect_object_id: string | null;
  correct_object_type: string;
  correct_object_id: string;
  feedback_text: string | null;
  sender_email: string | null;
  email_subject: string | null;
  created_at: string;
  // Resolved names for display
  incorrect_object_name?: string;
  correct_object_name?: string;
}

// ============================================================================
// PUBLIC DOMAIN EXCLUSION LIST - For Active Learning
// ============================================================================

const PUBLIC_EMAIL_DOMAINS = new Set([
  // Major providers
  'gmail.com', 'googlemail.com', 'google.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'protonmail.com', 'proton.me',
  'zoho.com', 'zohomail.com',
  'mail.com', 'email.com',
  'gmx.com', 'gmx.net',
  'yandex.com', 'yandex.ru',
  'fastmail.com', 'fastmail.fm',
  'tutanota.com', 'tuta.io',
  // ISP providers
  'comcast.net', 'xfinity.com',
  'att.net', 'sbcglobal.net', 'bellsouth.net',
  'verizon.net',
  'charter.net', 'spectrum.net',
  'cox.net',
  'earthlink.net',
  // Regional/international
  'qq.com', '163.com', '126.com',
  'naver.com', 'daum.net',
  'web.de', 'freenet.de', 't-online.de',
  'libero.it', 'virgilio.it',
  'orange.fr', 'free.fr', 'laposte.net',
  'btinternet.com', 'sky.com', 'talktalk.net',
]);

/**
 * Our own domains. Excluded from domain-level correction learning: 31 of 63
 * corrections have mike@ or asantos@ as sender_email, so a domain match on
 * oculusrep.com pulled internal-thread corrections into every internal email
 * regardless of topic (962 of 2,703 emails over 30d matched by domain; 791 of
 * those were internal). Kept separate from PUBLIC_EMAIL_DOMAINS because these
 * are not public providers -- the reason for exclusion differs even though the
 * effect on the domain branch is the same.
 */
const INTERNAL_EMAIL_DOMAINS = new Set([
  'oculusrep.com',
]);

/**
 * Check if an email domain is a public/generic provider
 * Returns false for corporate/private domains that are safe for domain-level learning
 */
function isPublicEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return true; // Treat malformed as public (no domain learning)
  return PUBLIC_EMAIL_DOMAINS.has(domain);
}

/**
 * Domain-level correction learning is only meaningful when the domain
 * identifies an outside counterparty. Public providers say nothing about who
 * the sender is; our own domain says nothing about what the email is about.
 */
function isDomainLearnable(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !PUBLIC_EMAIL_DOMAINS.has(domain) && !INTERNAL_EMAIL_DOMAINS.has(domain);
}

// ============================================================================
// THREAD INHERITANCE TUNING
// ============================================================================

/** Marker written into email_object_link.reasoning_log for an inherited link.
 *  Also the discriminator that stops an inherited copy being used as a seed
 *  for the next email -- read before changing. */
const THREAD_INHERITANCE_PREFIX = 'Thread inheritance: ';

/** A seed below this is not relayed to the rest of the thread; the email goes
 *  to the model instead. 0.80 sits above the 0.70 link threshold, so a link
 *  that only barely qualified cannot propagate. */
const THREAD_INHERITANCE_MIN_SEED = 0.80;

/** Ceiling on an inherited link's confidence. Inheritance copies evidence and
 *  must never report more certainty than the seed it copied. */
const THREAD_INHERITANCE_MAX = 0.90;

/** Minimum seed confidence for an inherited classification to be trusted
 *  without a model call. Matches THREAD_INHERITANCE_MAX deliberately: only a
 *  link carrying the maximum inheritable confidence may skip the model. */
const MODEL_SKIP_MIN_SEED = 0.90;

// ============================================================================
// TOOL DEFINITIONS - Exposed to Gemini
// ============================================================================

export const OVIS_TOOLS = [
  {
    name: 'search_deals',
    description: 'Search for active deals in OVIS CRM. Returns deals matching the query by deal name, address, city, state, or client name. Deal names often contain location info (e.g., "JJ - Milledgeville - Amos").',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - can be deal name, address, city name, state, or client name',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_contacts',
    description: 'Search for contacts (people) in OVIS CRM by name, email address, or company name.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - name, email, or company',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_clients',
    description: 'Search for ACTIVE clients (companies/organizations) in OVIS CRM by company name. Only returns clients marked as active.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Company/client name to search for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_properties',
    description: 'Search for properties (real estate) in OVIS CRM by address, property name, city, or state.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Property address, name, city, or state to search for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_deal_participants',
    description: 'Get all participants involved in a specific deal - contacts, clients, team members. Use this to verify if the email sender is involved in a deal.',
    parameters: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'string',
          description: 'The UUID of the deal',
        },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'link_object',
    description: 'Link this email to a CRM object. Call this for EACH object the email should be associated with. Use confidence_score to indicate certainty (0.9+ = certain, 0.7-0.9 = likely, below 0.7 = flag for review instead).',
    parameters: {
      type: 'object',
      properties: {
        object_type: {
          type: 'string',
          enum: ['deal', 'contact', 'property', 'client'],
          description: 'The type of CRM object',
        },
        object_id: {
          type: 'string',
          description: 'The UUID of the CRM object to link',
        },
        confidence_score: {
          type: 'number',
          description: 'Confidence score 0.0-1.0. Only link if >= 0.7',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation for why this link was made',
        },
      },
      required: ['object_type', 'object_id', 'confidence_score', 'reasoning'],
    },
  },
  {
    name: 'flag_for_review',
    description: 'Flag this email for human review when uncertain about classification. Use when: sender unknown but email seems business-relevant, multiple possible matches, or confidence below 0.7.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why this email needs human review',
        },
        suggested_name: {
          type: 'string',
          description: 'If sender unknown, suggested contact name extracted from email',
        },
        suggested_company: {
          type: 'string',
          description: 'If sender unknown, suggested company name extracted from email',
        },
        possible_matches: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of possible CRM object IDs that might match',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'search_rules',
    description: 'Search for user-defined rules that apply to this email. ALWAYS call this before linking objects to check if the user has taught you specific logic for this sender, domain, or keyword.',
    parameters: {
      type: 'object',
      properties: {
        sender_email: {
          type: 'string',
          description: 'The sender email address to check for rules',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords from the email to check for matching rules',
        },
      },
      required: ['sender_email'],
    },
  },
  {
    name: 'done',
    description: 'Call when finished analyzing the email. Provide a brief summary of actions taken.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of what was found, linked, or flagged',
        },
        is_business_relevant: {
          type: 'boolean',
          description: 'Whether this email is business-relevant (false = spam/marketing/personal)',
        },
        action: {
          type: 'string',
          enum: ['keep', 'delete'],
          description: 'Action to take: "keep" for business emails, "delete" for spam/marketing/personal emails that should be removed from the database',
        },
      },
      required: ['summary', 'is_business_relevant', 'action'],
    },
  },
];

// ============================================================================
// TOOL IMPLEMENTATIONS - Execute database queries
// ============================================================================

/**
 * Search deals by query string
 */
export async function searchDeals(
  supabase: SupabaseClient,
  query: string
): Promise<DealSearchResult[]> {
  // Get active stage IDs.
  //
  // 2026-09-06: widened from 5 stages to 7 by adding Pre-Submittal and
  // Submitted-Reviewing. Those 26 deals were ALL created within the prior 180
  // days -- live work the matcher structurally could not see. Before: 69 of 771
  // deals visible. After: 95.
  //
  // Lost (514) and Closed Paid (133) stay excluded deliberately. Their names are
  // near-duplicates of live deals (same centres, same tenants, earlier attempts),
  // so admitting them would feed 647 extra near-collisions to an unranked ILIKE
  // on deal_name -- the same weakness that produced the Barrio Burrito ->
  // Poke House error. See docs/email-triage-spec.md 2(c) open items.
  //
  // .limit(10) below is deliberately UNCHANGED in this deploy so the coverage
  // effect of the stage widening can be isolated on real data (step 5 batch
  // retriage). 95 candidates against a 10-row unranked cap may displace matches;
  // that is the thing being measured.
  const { data: activeStages } = await supabase
    .from('deal_stage')
    .select('id, label')
    .in('label', [
      'Negotiating LOI',
      'At Lease/PSA',
      'Under Contract / Contingent',
      'Booked',
      'Executed Payable',
      'Pre-Submittal',
      'Submitted-Reviewing',
    ]);

  const activeStageIds = (activeStages || []).map((s: any) => s.id);

  if (activeStageIds.length === 0) {
    return [];
  }

  // Search by deal_name (contains location, client info usually)
  const { data: deals } = await supabase
    .from('deal')
    .select(`
      id,
      deal_name,
      sf_address,
      sf_city,
      sf_state,
      stage:stage_id(label),
      client:client_id(client_name)
    `)
    .in('stage_id', activeStageIds)
    .ilike('deal_name', `%${query}%`)
    .limit(10);

  return (deals || []).map((d: any) => ({
    id: d.id,
    deal_name: d.deal_name,
    address: d.sf_address || (d.sf_city && d.sf_state ? `${d.sf_city}, ${d.sf_state}` : null),
    status: d.stage?.label || null,
    client_name: d.client?.client_name || null,
  }));
}

/**
 * Search contacts by query string
 */
export async function searchContacts(
  supabase: SupabaseClient,
  query: string
): Promise<ContactSearchResult[]> {
  const { data: contacts } = await supabase
    .from('contact')
    .select('id, first_name, last_name, email, company')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%`)
    .limit(10);

  return (contacts || []).map((c: any) => ({
    id: c.id,
    name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
    email: c.email,
    company: c.company,
  }));
}

/**
 * Search clients (companies) by query string
 * Only returns active clients (is_active_client = true)
 */
export async function searchClients(
  supabase: SupabaseClient,
  query: string
): Promise<ClientSearchResult[]> {
  const { data: clients } = await supabase
    .from('client')
    .select('id, client_name, contact(id)')
    .ilike('client_name', `%${query}%`)
    .eq('is_active_client', true)
    .limit(10);

  return (clients || []).map((c: any) => ({
    id: c.id,
    client_name: c.client_name,
    contact_count: c.contact?.length || 0,
  }));
}

/**
 * Search properties by query string
 */
export async function searchProperties(
  supabase: SupabaseClient,
  query: string
): Promise<PropertySearchResult[]> {
  const { data: properties } = await supabase
    .from('property')
    .select('id, property_name, address, city, state')
    .or(`property_name.ilike.%${query}%,address.ilike.%${query}%,city.ilike.%${query}%`)
    .limit(10);

  return (properties || []).map((p: any) => ({
    id: p.id,
    property_name: p.property_name,
    address: p.address,
    city: p.city,
    state: p.state,
  }));
}

/**
 * Search for user-defined rules that match the email
 */
export async function searchRules(
  supabase: SupabaseClient,
  senderEmail: string,
  keywords: string[] = []
): Promise<AgentRule[]> {
  // Extract domain from sender email
  const domain = senderEmail.split('@')[1] || '';

  // Build search conditions
  const searchTerms = [senderEmail, domain, ...keywords].filter(Boolean);

  // Search for matching active rules
  const { data: rules } = await supabase
    .from('agent_rules')
    .select('id, rule_text, rule_type, match_pattern, target_object_type, target_object_id, priority')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (!rules || rules.length === 0) {
    return [];
  }

  // Filter rules that match any of our search terms
  const matchingRules = rules.filter((rule: any) => {
    // Check if rule_text mentions any of our terms
    const ruleTextLower = rule.rule_text.toLowerCase();
    const patternLower = (rule.match_pattern || '').toLowerCase();

    return searchTerms.some(term => {
      const termLower = term.toLowerCase();
      return ruleTextLower.includes(termLower) ||
             patternLower.includes(termLower) ||
             (rule.match_pattern && new RegExp(rule.match_pattern, 'i').test(term));
    });
  });

  return matchingRules.map((r: any) => ({
    id: r.id,
    rule_text: r.rule_text,
    rule_type: r.rule_type,
    match_pattern: r.match_pattern,
    target_object_type: r.target_object_type,
    target_object_id: r.target_object_id,
    priority: r.priority,
  }));
}

/**
 * ACTIVE LEARNING: Retrieve relevant past corrections from agent_corrections table
 *
 * Retrieval Priority:
 * 1. Exact sender email match (highest priority)
 * 2. Domain match (only for private/corporate domains, NOT gmail/yahoo/etc.)
 * 3. Subject keyword match (distinct terms like addresses, file numbers)
 *
 * Returns top 5 most recent relevant corrections to inject into the system prompt.
 */
export async function getRelevantCorrections(
  supabase: SupabaseClient,
  senderEmail: string,
  emailSubject: string
): Promise<PastCorrection[]> {
  const corrections: PastCorrection[] = [];
  const seenIds = new Set<string>();
  const MAX_CORRECTIONS = 5;

  // Extract domain for domain-level matching
  const senderDomain = senderEmail.split('@')[1]?.toLowerCase() || '';
  const domainLearnable = isDomainLearnable(senderEmail);

  // Extract distinct keywords from subject (3+ chars, exclude common words)
  const commonWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'will', 'your', 'from', 'they', 'this', 'that', 'with', 'what', 'there', 'about', 'would', 'their', 'which', 'could', 'other', 'these', 'then', 'than', 'some', 'into', 'them', 'just', 'only', 'come', 'made', 'find', 'here', 'know', 'take', 'want', 'does', 'going', 'thing']);
  const subjectKeywords = emailSubject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !commonWords.has(w));

  // ========================================================================
  // PRIORITY 1: Exact sender email match
  // ========================================================================
  const { data: senderMatches } = await supabase
    .from('agent_corrections')
    .select('*')
    .eq('sender_email', senderEmail.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(MAX_CORRECTIONS);

  if (senderMatches) {
    for (const c of senderMatches) {
      if (!seenIds.has(c.id) && corrections.length < MAX_CORRECTIONS) {
        seenIds.add(c.id);
        corrections.push(c);
      }
    }
  }

  // ========================================================================
  // PRIORITY 2: Domain match (external corporate domains only -- not public
  // providers, and not our own domain; see isDomainLearnable)
  // ========================================================================
  if (!domainLearnable) {
    console.log(`[Agent] Domain branch skipped for ${senderDomain} (public provider or our own domain)`);
  }
  if (domainLearnable && corrections.length < MAX_CORRECTIONS) {
    const { data: domainMatches } = await supabase
      .from('agent_corrections')
      .select('*')
      .ilike('sender_email', `%@${senderDomain}`)
      .order('created_at', { ascending: false })
      .limit(MAX_CORRECTIONS);

    if (domainMatches) {
      for (const c of domainMatches) {
        if (!seenIds.has(c.id) && corrections.length < MAX_CORRECTIONS) {
          seenIds.add(c.id);
          corrections.push(c);
        }
      }
    }
  }

  // ========================================================================
  // PRIORITY 3: Subject keyword match (distinct terms only)
  // ========================================================================
  if (subjectKeywords.length > 0 && corrections.length < MAX_CORRECTIONS) {
    // Only use distinctive keywords (likely proper nouns, addresses, file numbers)
    // Look for words that might be: city names, addresses, company names, file numbers
    const distinctiveKeywords = subjectKeywords.filter(kw =>
      // Capitalized in original (proper nouns)
      emailSubject.includes(kw.charAt(0).toUpperCase() + kw.slice(1)) ||
      // Contains numbers (file numbers, addresses)
      /\d/.test(kw) ||
      // Long enough to be distinctive
      kw.length >= 6
    );

    for (const keyword of distinctiveKeywords.slice(0, 3)) { // Only check top 3 keywords
      if (corrections.length >= MAX_CORRECTIONS) break;

      const { data: keywordMatches } = await supabase
        .from('agent_corrections')
        .select('*')
        .ilike('email_subject', `%${keyword}%`)
        .order('created_at', { ascending: false })
        .limit(MAX_CORRECTIONS - corrections.length);

      if (keywordMatches) {
        for (const c of keywordMatches) {
          if (!seenIds.has(c.id) && corrections.length < MAX_CORRECTIONS) {
            seenIds.add(c.id);
            corrections.push(c);
          }
        }
      }
    }
  }

  // ========================================================================
  // RESOLVE OBJECT NAMES for readable prompt injection
  // ========================================================================
  for (const correction of corrections) {
    // Resolve incorrect object name
    if (correction.incorrect_object_type && correction.incorrect_object_type !== 'none' && correction.incorrect_object_id) {
      const name = await resolveObjectName(supabase, correction.incorrect_object_type, correction.incorrect_object_id);
      correction.incorrect_object_name = name;
    }

    // Resolve correct object name
    if (correction.correct_object_type && correction.correct_object_type !== 'none' &&
        correction.correct_object_id !== '00000000-0000-0000-0000-000000000000') {
      const name = await resolveObjectName(supabase, correction.correct_object_type, correction.correct_object_id);
      correction.correct_object_name = name;
    }
  }

  return corrections;
}

/**
 * Helper to resolve a CRM object ID to a human-readable name
 */
async function resolveObjectName(
  supabase: SupabaseClient,
  objectType: string,
  objectId: string
): Promise<string> {
  try {
    switch (objectType) {
      case 'contact': {
        const { data } = await supabase
          .from('contact')
          .select('first_name, last_name')
          .eq('id', objectId)
          .single();
        return data ? `${data.first_name || ''} ${data.last_name || ''}`.trim() : objectId;
      }
      case 'deal': {
        const { data } = await supabase
          .from('deal')
          .select('deal_name')
          .eq('id', objectId)
          .single();
        return data?.deal_name || objectId;
      }
      case 'client': {
        const { data } = await supabase
          .from('client')
          .select('client_name')
          .eq('id', objectId)
          .single();
        return data?.client_name || objectId;
      }
      case 'property': {
        const { data } = await supabase
          .from('property')
          .select('property_name, address')
          .eq('id', objectId)
          .single();
        return data?.property_name || data?.address || objectId;
      }
      default:
        return objectId;
    }
  } catch {
    return objectId;
  }
}

/**
 * Format corrections for injection into the system prompt
 */
export function formatCorrectionsForPrompt(corrections: PastCorrection[]): string {
  if (corrections.length === 0) return '';

  const lines = corrections.map(c => {
    const date = new Date(c.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    const senderInfo = c.sender_email || 'unknown sender';
    const subjectSnippet = c.email_subject
      ? `"${c.email_subject.substring(0, 50)}${c.email_subject.length > 50 ? '...' : ''}"`
      : 'unknown subject';

    // Determine the type of correction
    if (c.correct_object_type === 'none') {
      // User removed an AI link (AI shouldn't have linked)
      const incorrectName = c.incorrect_object_name || c.incorrect_object_id;
      return `- On ${date}: User REMOVED link to ${c.incorrect_object_type} "${incorrectName}" for email from ${senderInfo}. ${c.feedback_text || 'AI should not have made this link.'}`;
    } else if (c.incorrect_object_type === 'none' || !c.incorrect_object_type) {
      // User added a link AI missed
      const correctName = c.correct_object_name || c.correct_object_id;
      return `- On ${date}: User ADDED link to ${c.correct_object_type} "${correctName}" for email from ${senderInfo} (subject: ${subjectSnippet}). ${c.feedback_text || 'AI missed this link.'}`;
    } else {
      // User corrected AI's choice to a different object
      const incorrectName = c.incorrect_object_name || c.incorrect_object_id;
      const correctName = c.correct_object_name || c.correct_object_id;
      return `- On ${date}: User CORRECTED ${c.incorrect_object_type} "${incorrectName}" → ${c.correct_object_type} "${correctName}" for ${senderInfo}. ${c.feedback_text || ''}`;
    }
  });

  return `### RELEVANT PAST CORRECTIONS (USER FEEDBACK)
The following are past mistakes you made that the user corrected. Learn from these to avoid repeating errors:

${lines.join('\n')}

IMPORTANT: Apply these corrections to similar emails. If the sender or context matches, use the user's preferred classification.`;
}

/**
 * Get all participants for a deal
 */
export async function getDealParticipants(
  supabase: SupabaseClient,
  dealId: string
): Promise<DealParticipant[]> {
  const participants: DealParticipant[] = [];

  // Get deal with related contacts
  const { data: deal } = await supabase
    .from('deal')
    .select(`
      id,
      contact:contact_id(id, first_name, last_name, email, company),
      client:client_id(
        id,
        client_name,
        contacts:contact(id, first_name, last_name, email, company)
      )
    `)
    .eq('id', dealId)
    .single();

  if (!deal) {
    return [];
  }

  // Primary contact
  if (deal.contact) {
    participants.push({
      role: 'Other',
      name: `${deal.contact.first_name || ''} ${deal.contact.last_name || ''}`.trim(),
      email: deal.contact.email,
      company: deal.contact.company,
    });
  }

  // Client contacts
  if (deal.client?.contacts) {
    for (const contact of deal.client.contacts) {
      participants.push({
        role: 'Other',
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        email: contact.email,
        company: deal.client.client_name,
      });
    }
  }

  // Get deal team members
  const { data: dealTeam } = await supabase
    .from('deal_team_member')
    .select(`
      role,
      contact:contact_id(id, first_name, last_name, email, company)
    `)
    .eq('deal_id', dealId);

  if (dealTeam) {
    for (const member of dealTeam) {
      if (member.contact) {
        participants.push({
          role: (member.role as any) || 'Other',
          name: `${member.contact.first_name || ''} ${member.contact.last_name || ''}`.trim(),
          email: member.contact.email,
          company: member.contact.company,
        });
      }
    }
  }

  return participants;
}

/**
 * Link an email to a CRM object
 */
export async function linkObject(
  supabase: SupabaseClient,
  emailId: string,
  objectType: 'deal' | 'contact' | 'property' | 'client',
  objectId: string,
  confidenceScore: number,
  reasoning: string
): Promise<LinkResult> {
  const { error } = await supabase.from('email_object_link').upsert(
    {
      email_id: emailId,
      object_type: objectType,
      object_id: objectId,
      link_source: 'ai_agent',
      confidence_score: confidenceScore,
      reasoning_log: reasoning, // Store the AI's reasoning
    },
    { onConflict: 'email_id,object_type,object_id' }
  );

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: `Linked to ${objectType} ${objectId} (confidence: ${confidenceScore})` };
}

/**
 * Flag an email for human review
 */
export async function flagForReview(
  supabase: SupabaseClient,
  emailId: string,
  senderEmail: string,
  reason: string,
  suggestedName?: string,
  suggestedCompany?: string,
  possibleMatches?: string[],
  gmailConnectionId?: string
): Promise<FlagResult> {
  // Get email details
  const { data: email } = await supabase
    .from('emails')
    .select('subject, snippet, received_at')
    .eq('id', emailId)
    .single();

  // Insert into unmatched_email_queue for human review
  // Include gmail_connection_id for RLS visibility
  const { error } = await supabase.from('unmatched_email_queue').upsert(
    {
      email_id: emailId,
      sender_email: senderEmail,
      subject: email?.subject,
      snippet: email?.snippet,
      received_at: email?.received_at,
      suggested_contact_name: suggestedName,
      suggested_company: suggestedCompany,
      match_reason: reason,
      status: 'pending',
      gmail_connection_id: gmailConnectionId,
    },
    { onConflict: 'email_id' }
  );

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: `Flagged for review: ${reason}` };
}

// ============================================================================
// TOOL EXECUTOR - Routes tool calls to implementations
// ============================================================================

export async function executeToolCall(
  supabase: SupabaseClient,
  emailId: string,
  senderEmail: string,
  toolName: string,
  args: Record<string, any>,
  gmailConnectionId?: string
): Promise<any> {
  switch (toolName) {
    case 'search_deals':
      return await searchDeals(supabase, args.query);

    case 'search_contacts':
      return await searchContacts(supabase, args.query);

    case 'search_clients':
      return await searchClients(supabase, args.query);

    case 'search_properties':
      return await searchProperties(supabase, args.query);

    case 'get_deal_participants':
      return await getDealParticipants(supabase, args.deal_id);

    case 'link_object':
      return await linkObject(
        supabase,
        emailId,
        args.object_type,
        args.object_id,
        args.confidence_score,
        args.reasoning || ''
      );

    case 'flag_for_review':
      return await flagForReview(
        supabase,
        emailId,
        senderEmail,
        args.reason,
        args.suggested_name,
        args.suggested_company,
        args.possible_matches,
        gmailConnectionId
      );

    case 'search_rules':
      return await searchRules(
        supabase,
        args.sender_email,
        args.keywords || []
      );

    case 'done':
      // Signal tool - return the args for the caller to handle
      return { acknowledged: true, ...args };

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ============================================================================
// AGENT RUNNER - Orchestrates the Gemini agent loop
// ============================================================================

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface AgentResult {
  links_created: number;
  flagged_for_review: boolean;
  is_relevant: boolean;
  action: 'keep' | 'delete';
  summary: string;
  tool_calls: number;
  rule_override: boolean;
  tags: Array<{
    object_type: string;
    object_id: string;
    confidence: number;
    /** How many links on this email came from thread inheritance. Step 5's
   *  model short-circuit is gated on this being > 0 AND
   *  min_inherited_seed_confidence >= 0.90 -- see docs/email-triage-spec.md 2(c). */
  inherited_links: number;
  /** Lowest seed confidence behind any inherited link on this email.
   *  Infinity when nothing was inherited. */
  min_inherited_seed_confidence: number;
  /** True when the Gemini loop was skipped entirely. Counted per run so the
   *  cost effect of the short-circuits is measurable, not assumed. */
  model_skipped: boolean;
  model_skip_reason: string | null;
}>;
}

export async function runEmailTriageAgent(
  supabase: SupabaseClient,
  email: {
    id: string;
    thread_id?: string | null;
    subject: string;
    body_text: string;
    snippet: string;
    sender_email: string;
    sender_name: string | null;
    direction: string;
    recipient_list?: Array<{ email: string; name: string | null; type: 'to' | 'cc' | 'bcc' }>;
    gmail_connection_id?: string;
  },
  apiKey: string,
  maxIterations: number = 5
): Promise<AgentResult> {
  const result: AgentResult = {
    links_created: 0,
    flagged_for_review: false,
    is_relevant: true,
    action: 'keep',
    summary: '',
    tool_calls: 0,
    rule_override: false,
    tags: [],
    inherited_links: 0,
    min_inherited_seed_confidence: Infinity,
    model_skipped: false,
    model_skip_reason: null,
  };

  // ========================================================================
  // RULE HARD-OVERRIDE: Check for matching rules BEFORE calling the AI
  // If a rule specifies a target object, link immediately and skip the agent
  // ========================================================================
  console.log(`[Agent] Checking rules for sender: ${email.sender_email}`);

  // Extract keywords from subject for rule matching
  const subjectKeywords = email.subject
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);

  const matchingRules = await searchRules(
    supabase,
    email.sender_email,
    subjectKeywords
  );

  if (matchingRules.length > 0) {
    console.log(`[Agent] Found ${matchingRules.length} matching rules`);

    // Process rules in priority order (already sorted)
    for (const rule of matchingRules) {
      // Check for exclusion rules first (rule_type = 'exclusion')
      if (rule.rule_type === 'exclusion') {
        console.log(`[Agent] RULE OVERRIDE: Exclusion rule matched - "${rule.rule_text}"`);
        result.is_relevant = false;
        result.action = 'delete';
        result.summary = `Rule override: ${rule.rule_text}`;
        result.rule_override = true;
        return result;
      }

      // Check if rule has a specific target object to link
      if (rule.target_object_type && rule.target_object_id) {
        console.log(`[Agent] RULE OVERRIDE: Linking to ${rule.target_object_type} ${rule.target_object_id}`);

        // Execute the link
        const linkResult = await linkObject(
          supabase,
          email.id,
          rule.target_object_type as 'deal' | 'contact' | 'property' | 'client',
          rule.target_object_id,
          1.0, // Rule matches are 100% confidence
          `Rule override: ${rule.rule_text}`
        );

        if (linkResult.success) {
          result.links_created++;
          result.tags.push({
            object_type: rule.target_object_type,
            object_id: rule.target_object_id,
            confidence: 1.0,
          });
        }

        result.summary = `Rule override: Linked to ${rule.target_object_type} via rule "${rule.rule_text}"`;
        result.rule_override = true;
        result.action = 'keep';
        return result;
      }
    }
  }

  // ========================================================================
  // THREAD INHERITANCE: If this email is part of a thread where other emails
  // have already been tagged, inherit those tags automatically
  // ========================================================================
  if (email.thread_id) {
    console.log(`[Agent] Checking thread ${email.thread_id} for existing tags`);

    // Find other emails in the same thread that have been tagged
    const { data: threadEmails } = await supabase
      .from('emails')
      .select('id')
      .eq('thread_id', email.thread_id)
      .neq('id', email.id);

    if (threadEmails && threadEmails.length > 0) {
      const threadEmailIds = threadEmails.map(e => e.id);

      // Get all tags from emails in this thread, with the evidence behind them.
      // reasoning_log distinguishes a model-derived seed from an earlier
      // inherited copy -- only a real seed may be inherited from, or a single
      // weak guess would relay itself down the thread at full strength.
      const { data: threadTags } = await supabase
        .from('email_object_link')
        .select('object_type, object_id, confidence_score, reasoning_log')
        .in('email_id', threadEmailIds);

      if (threadTags && threadTags.length > 0) {
        console.log(`[Agent] THREAD INHERITANCE: Found ${threadTags.length} tags from thread`);

        // Keep the strongest SEED per object. Inherited copies are excluded as
        // sources so confidence cannot ratchet up over a long thread.
        const uniqueTags = new Map<
          string,
          { object_type: string; object_id: string; seed_confidence: number }
        >();
        for (const tag of threadTags) {
          const isInheritedCopy = (tag.reasoning_log || '').startsWith(THREAD_INHERITANCE_PREFIX);
          if (isInheritedCopy) continue;

          const key = `${tag.object_type}:${tag.object_id}`;
          const seedConfidence = Number(tag.confidence_score ?? 0);
          const existing = uniqueTags.get(key);
          if (!existing || seedConfidence > existing.seed_confidence) {
            uniqueTags.set(key, {
              object_type: tag.object_type,
              object_id: tag.object_id,
              seed_confidence: seedConfidence,
            });
          }
        }

        // Apply each unique tag to this email
        for (const [key, tag] of uniqueTags) {
          // FLOOR: a seed the model was unsure about does not get relayed. The
          // Barrio Burrito -> Poke House error seeded at exactly 0.70 (the link
          // threshold) and inheritance promoted it to 0.95 on three further
          // emails. Across the corpus 276 of 305 inherited deal links came from
          // a seed >= 0.90 and only 13 from a seed < 0.80 -- this blocks those
          // 13 and leaves the rest untouched. Emails that fail the floor still
          // reach the model, which is the point: they need a real opinion.
          if (tag.seed_confidence < THREAD_INHERITANCE_MIN_SEED) {
            console.log(
              `[Agent] THREAD: NOT inheriting ${tag.object_type} ${tag.object_id} -- ` +
              `seed confidence ${tag.seed_confidence} below floor ${THREAD_INHERITANCE_MIN_SEED}`
            );
            continue;
          }

          // PROPAGATE, never manufacture: carry the seed's own confidence,
          // capped. Copying evidence must not create more of it.
          const inheritedConfidence = Math.min(tag.seed_confidence, THREAD_INHERITANCE_MAX);

          const linkResult = await linkObject(
            supabase,
            email.id,
            tag.object_type as 'deal' | 'contact' | 'property' | 'client',
            tag.object_id,
            inheritedConfidence,
            `${THREAD_INHERITANCE_PREFIX}Same conversation as tagged email ` +
            `(seed confidence ${tag.seed_confidence})`
          );

          if (linkResult.success) {
            result.links_created++;
            result.inherited_links++;
            result.min_inherited_seed_confidence = Math.min(
              result.min_inherited_seed_confidence,
              tag.seed_confidence
            );
            result.tags.push({
              object_type: tag.object_type as 'deal' | 'contact' | 'property' | 'client',
              object_id: tag.object_id,
              confidence: inheritedConfidence,
            });
            console.log(
              `[Agent] THREAD: Inherited ${tag.object_type} tag: ${tag.object_id} ` +
              `at ${inheritedConfidence} (seed ${tag.seed_confidence})`
            );
          }
        }

        if (result.links_created > 0) {
          console.log(`[Agent] Thread inheritance: Applied ${result.links_created} tags from thread`);
        }

        // ====================================================================
        // SHORT-CIRCUIT: skip the model when inheritance already settled it.
        //
        // Gated per the step-4 contract, NOT on "email is in a tagged thread".
        // Both conditions are required:
        //   inherited_links > 0                      inheritance actually fired
        //   min_inherited_seed_confidence >= 0.90     every seed was strong
        //
        // An email whose seed fell below the 0.80 floor inherits NOTHING, and
        // one seeded at 0.80-0.89 inherits but is not confident enough to go
        // unexamined -- both must still reach the model or they end up with no
        // real classification at all. 1,431 of 1,521 inherited links (94%)
        // clear this bar, which is where the saving comes from.
        // ====================================================================
        if (
          result.inherited_links > 0 &&
          result.min_inherited_seed_confidence >= MODEL_SKIP_MIN_SEED
        ) {
          result.summary =
            `Skipped model: inherited ${result.inherited_links} tag(s) from thread ` +
            `at seed confidence >= ${MODEL_SKIP_MIN_SEED}`;
          result.model_skipped = true;
          result.model_skip_reason = 'thread_inheritance_high_confidence';
          console.log(`[Agent] SHORT-CIRCUIT: ${result.summary}`);
          return result;
        }
      }
    }
  }

  // ========================================================================
  // AUTO-MATCH: Check if sender email exists in contacts BEFORE calling AI
  // This catches known contacts that the AI might miss
  // ========================================================================
  console.log(`[Agent] Checking for existing contact by email: ${email.sender_email}`);

  const { data: existingContact } = await supabase
    .from('contact')
    .select('id, first_name, last_name, email, company, client_id')
    .eq('email', email.sender_email.toLowerCase())
    .single();

  if (existingContact) {
    console.log(`[Agent] AUTO-MATCH: Found existing contact: ${existingContact.first_name} ${existingContact.last_name}`);

    // Link to the contact
    const contactLinkResult = await linkObject(
      supabase,
      email.id,
      'contact',
      existingContact.id,
      1.0,
      `Auto-matched by sender email: ${email.sender_email}`
    );

    if (contactLinkResult.success) {
      result.links_created++;
      result.tags.push({
        object_type: 'contact',
        object_id: existingContact.id,
        confidence: 1.0,
      });
    }

    // If contact has a client, link to that too
    if (existingContact.client_id) {
      const clientLinkResult = await linkObject(
        supabase,
        email.id,
        'client',
        existingContact.client_id,
        0.95,
        `Auto-linked via contact's company association`
      );

      if (clientLinkResult.success) {
        result.links_created++;
        result.tags.push({
          object_type: 'client',
          object_id: existingContact.client_id,
          confidence: 0.95,
        });
      }
    }

    // ======================================================================
    // SHORT-CIRCUIT: sender auto-match, gated on the thread already carrying a
    // deal link (decided 2026-09-06).
    //
    // Auto-match resolves a CONTACT at confidence 1.0, but it never attempts a
    // deal. Skipping the model on a contact match alone would mean those emails
    // never get a deal link -- trading deal coverage for tokens in the same
    // work that widened deal visibility to raise it (coverage is 17.2%). So the
    // model still runs unless the deal question is already answered for this
    // conversation.
    //
    // NOTE -- this branch is expected to fire RARELY, by construction. If the
    // thread carries a deal link, thread inheritance upstream will normally
    // have copied it and either short-circuited already (seed >= 0.90) or
    // deliberately fallen through to the model (seed 0.80-0.89, or blocked
    // below the floor). The reachable remainder is the edge case where the
    // thread has a deal link that inheritance did not write here -- e.g. the
    // link already existed and linkObject deduped it. The counter below exists
    // to measure how often that actually happens during the log-only week
    // rather than assuming.
    // ======================================================================
    let threadHasDealLink = false;
    if (email.thread_id) {
      const { data: threadDealLinks } = await supabase
        .from('email_object_link')
        .select('id, email_id, emails!inner(thread_id)')
        .eq('object_type', 'deal')
        .eq('emails.thread_id', email.thread_id)
        .limit(1);
      threadHasDealLink = !!(threadDealLinks && threadDealLinks.length > 0);
    }

    if (threadHasDealLink) {
      result.summary =
        `Skipped model: sender auto-matched to a known contact and the thread ` +
        `already carries a deal link`;
      result.model_skipped = true;
      result.model_skip_reason = 'sender_automatch_thread_has_deal';
      console.log(`[Agent] SHORT-CIRCUIT: ${result.summary}`);
      return result;
    }

    // Still run AI to find deals/properties, but we've already linked the contact
    console.log(`[Agent] Contact auto-matched, continuing to AI for deal/property analysis`);
  }

  // ========================================================================
  // RECIPIENT AUTO-MATCH: Match ALL recipients (To, CC, BCC) to contacts
  // Works for both inbound and outbound emails
  // ========================================================================
  if (email.recipient_list && email.recipient_list.length > 0) {
    const direction = email.direction || 'INBOUND';
    console.log(`[Agent] ${direction} email - checking ${email.recipient_list.length} recipients for contact matches`);

    let recipientMatches = 0;
    for (const recipient of email.recipient_list) {
      if (!recipient.email) continue;

      const recipientEmail = recipient.email.toLowerCase();

      // Skip internal emails (your own domain) for inbound - they're team members, not contacts
      // For outbound, we want to match all recipients
      if (direction === 'INBOUND') {
        // Check if this is an internal email address (skip team members)
        const internalDomains = ['ovisre.com', 'ovis.com'];
        const emailDomain = recipientEmail.split('@')[1];
        if (internalDomains.some(d => emailDomain === d)) {
          continue;
        }
      }

      console.log(`[Agent] Checking recipient (${recipient.type || 'to'}): ${recipientEmail}`);

      const { data: recipientContact } = await supabase
        .from('contact')
        .select('id, first_name, last_name, email, company, client_id')
        .eq('email', recipientEmail)
        .single();

      if (recipientContact) {
        console.log(`[Agent] RECIPIENT AUTO-MATCH: Found contact: ${recipientContact.first_name} ${recipientContact.last_name}`);

        // Link to the contact
        const contactLinkResult = await linkObject(
          supabase,
          email.id,
          'contact',
          recipientContact.id,
          1.0,
          `${direction} email - ${recipient.type || 'to'} recipient auto-matched: ${recipientEmail}`
        );

        if (contactLinkResult.success) {
          result.links_created++;
          recipientMatches++;
          result.tags.push({
            object_type: 'contact',
            object_id: recipientContact.id,
            confidence: 1.0,
          });
        }

        // If recipient contact has a client, link to that too
        if (recipientContact.client_id) {
          const clientLinkResult = await linkObject(
            supabase,
            email.id,
            'client',
            recipientContact.client_id,
            0.95,
            `${direction} email - linked via recipient's company association`
          );

          if (clientLinkResult.success) {
            result.links_created++;
            result.tags.push({
              object_type: 'client',
              object_id: recipientContact.client_id,
              confidence: 0.95,
            });
          }
        }
      }
    }

    if (recipientMatches > 0) {
      console.log(`[Agent] ${direction} email: auto-matched ${recipientMatches} recipients, continuing to AI for deal/property analysis`);
    }
  }

  // ========================================================================
  // ACTIVE LEARNING: Fetch relevant past corrections before calling AI
  // ========================================================================
  console.log(`[Agent] Fetching relevant past corrections for: ${email.sender_email}`);

  const relevantCorrections = await getRelevantCorrections(
    supabase,
    email.sender_email,
    email.subject
  );

  const correctionsPrompt = formatCorrectionsForPrompt(relevantCorrections);

  if (relevantCorrections.length > 0) {
    console.log(`[Agent] Found ${relevantCorrections.length} relevant past corrections`);
  }

  // THE BRAIN - System prompt that defines agent behavior
  const systemPrompt = `Role: You are the OVIS Autonomous Assistant for a commercial real estate brokerage. Your task is to intelligently classify incoming emails by linking them to the correct CRM objects.

${correctionsPrompt}

AVAILABLE TOOLS:
- search_rules: ALWAYS call this FIRST to check for user-defined rules for this sender or topic.
- search_deals: Search for active deals by name, address, city, or client. Deal names often contain location info (e.g., "JJ - Milledgeville - Amos").
- search_contacts: Search for contacts (people) by name, email, or company.
- search_clients: Search for ACTIVE clients (companies) by name. Only returns clients marked as active in the CRM.
- search_properties: Search for properties by address, name, city, or state.
- get_deal_participants: Get all people involved in a specific deal to verify sender involvement.
- link_object: Link this email to a CRM object. Use confidence_score >= 0.7 to link. Include reasoning in the 'reasoning' parameter.
- flag_for_review: Flag email for human review when uncertain or sender is unknown but relevant.
- done: Call when finished, providing summary and is_business_relevant flag.

PROTOCOL (Follow this order):
1. CHECK RULES: ALWAYS call search_rules first with the sender_email and relevant keywords. If rules exist, follow them with confidence 1.0.
2. ANALYZE SENDER: Search for the sender by email address in contacts.
3. ANALYZE CONTENT - CRITICAL FOR DEAL MATCHING:
   a) SCAN THE SUBJECT LINE carefully for:
      - City names, neighborhood names, street names (e.g., "Milledgeville", "Buckhead", "Main St")
      - Property names or addresses
      - Client initials or company names (e.g., "JJ", "Starbucks")
      - Deal reference patterns like "RE:", project codes, or deal nicknames
   b) SCAN THE EMAIL BODY for:
      - Any addresses mentioned (even partial like "123 Main" or "the Buckhead location")
      - Client/tenant names
      - Property references
      - Deal-specific terms: LOI, lease, PSA, closing, due diligence
   c) SEARCH DEALS: For EACH location/name/reference found, call search_deals. Deal names in OVIS often follow patterns like:
      - "ClientInitials - City - PropertyName" (e.g., "JJ - Milledgeville - Amos")
      - "City - PropertyName" (e.g., "Buckhead - 123 Main")
      - Search by city name, street name, client name, AND property name separately if needed
   d) Search for properties by address if specific addresses mentioned.
4. VERIFY: If a deal is found, use get_deal_participants to verify the sender is involved.
5. ACT:
   - If a rule matches: Follow the rule's instructions with confidence 1.0.
   - If confidence >= 0.9: Call link_object for each relevant CRM object.
   - If confidence 0.7-0.9: Call link_object with that confidence score.
   - If confidence < 0.7 but email seems business-relevant: Call flag_for_review.
   - If sender unknown but email discusses business topics: Call flag_for_review with suggested_name/company.
   - If email is spam/marketing/personal: Call done with is_business_relevant=false and action="delete".
6. FINISH: Always call done() with:
   - summary: What was found/linked/flagged
   - is_business_relevant: true/false
   - action: "keep" for business emails, "delete" for spam/marketing/personal emails

IMPORTANT - DELETE POLICY:
- Business emails with CRM links → action: "keep"
- Business emails flagged for review → action: "keep"
- Personal emails (school, family, subscriptions) → action: "delete"
- Spam/marketing/promotional emails → action: "delete"
- Package tracking (UPS, FedEx, USPS) → action: "delete"
- Social media notifications → action: "delete"
- If no business connection found and sender unknown → action: "delete"

IMPORTANT:
- One email can link to MULTIPLE objects (deal AND contact AND property).
- LOI, lease, contract, closing discussions = likely related to a deal.
- User-defined rules take priority over your analysis.
- Always provide clear reasoning when linking objects.
- Always call done() when finished.

CRITICAL - DEAL NAME MATCHING:
- ALWAYS extract keywords from subject AND body before finishing.
- Deal names contain location info - search by city name, street, or area (e.g., search "Milledgeville" not the full deal name).
- If subject mentions a city/location, ALWAYS search_deals for that location.
- If body discusses property/lease/LOI, extract any location reference and search.
- Multiple search_deals calls are OK - search each keyword separately if needed.`;

  // Build user prompt with email details
  const userPrompt = `Analyze this email and link it to the appropriate CRM objects.

FROM: ${email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email}
DIRECTION: ${email.direction}
SUBJECT: ${email.subject}

BODY:
${email.body_text || email.snippet}`;

  let messages: any[] = [{ role: 'user', parts: [{ text: userPrompt }] }];

  console.log(`[Agent] Processing email: ${email.subject}`);

  // THE LOOP - Multi-turn conversation with Gemini
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`[Agent] Iteration ${iteration + 1}/${maxIterations}`);

    const response = await callGeminiWithTools(apiKey, systemPrompt, messages);

    if (!response.candidates?.[0]?.content) {
      console.error('[Agent] No response from Gemini');
      break;
    }

    const content = response.candidates[0].content;
    messages.push(content);

    // Check for function calls
    const functionCalls = content.parts?.filter((p: any) => p.functionCall) || [];

    if (functionCalls.length === 0) {
      console.log('[Agent] No function calls - ending loop');
      break;
    }

    const functionResponses: any[] = [];

    // Execute each function call
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      result.tool_calls++;

      console.log(`[Agent] Tool: ${name}`, JSON.stringify(args));

      const toolResult = await executeToolCall(
        supabase,
        email.id,
        email.sender_email,
        name,
        args || {},
        email.gmail_connection_id
      );

      console.log(`[Agent] Result: ${JSON.stringify(toolResult).substring(0, 300)}`);

      // Track outcomes based on tool type
      if (name === 'link_object' && toolResult.success) {
        result.links_created++;
        result.tags.push({
          object_type: args.object_type,
          object_id: args.object_id,
          confidence: args.confidence_score,
        });
      } else if (name === 'flag_for_review' && toolResult.success) {
        result.flagged_for_review = true;
        result.action = 'keep'; // Flagged emails are kept for review
      } else if (name === 'done') {
        result.summary = args.summary || '';
        result.is_relevant = args.is_business_relevant !== false;
        result.action = args.action === 'delete' ? 'delete' : 'keep';
        console.log(`[Agent] Done: ${result.summary} (action: ${result.action})`);
        return result;
      }

      functionResponses.push({
        functionResponse: { name, response: { result: toolResult } },
      });
    }

    // Add function responses to messages for next iteration
    messages.push({ role: 'model', parts: functionResponses });
  }

  console.log(`[Agent] Loop ended after ${result.tool_calls} tool calls`);
  return result;
}

async function callGeminiWithTools(
  apiKey: string,
  systemPrompt: string,
  messages: any[]
): Promise<any> {
  // Using gemini-2.5-flash (current standard model, December 2025)
  const url = `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    tools: [{ functionDeclarations: OVIS_TOOLS }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
  }

  return await res.json();
}
