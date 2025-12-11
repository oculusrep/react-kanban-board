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
    description: 'Search for clients (companies/organizations) in OVIS CRM by company name.',
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
      },
      required: ['summary', 'is_business_relevant'],
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
  // Get active stage IDs
  const { data: activeStages } = await supabase
    .from('deal_stage')
    .select('id, label')
    .in('label', ['Negotiating LOI', 'At Lease/PSA', 'Under Contract / Contingent', 'Booked', 'Executed Payable']);

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
 */
export async function searchClients(
  supabase: SupabaseClient,
  query: string
): Promise<ClientSearchResult[]> {
  const { data: clients } = await supabase
    .from('client')
    .select('id, client_name, contact(id)')
    .ilike('client_name', `%${query}%`)
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
  possibleMatches?: string[]
): Promise<FlagResult> {
  // Get email details
  const { data: email } = await supabase
    .from('emails')
    .select('subject, snippet, received_at')
    .eq('id', emailId)
    .single();

  // Insert into unmatched_email_queue for human review
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
  args: Record<string, any>
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
        args.possible_matches
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
  summary: string;
  tool_calls: number;
  tags: Array<{
    object_type: string;
    object_id: string;
    confidence: number;
  }>;
}

export async function runEmailTriageAgent(
  supabase: SupabaseClient,
  email: {
    id: string;
    subject: string;
    body_text: string;
    snippet: string;
    sender_email: string;
    sender_name: string | null;
    direction: string;
    recipient_list?: string[];
  },
  apiKey: string,
  maxIterations: number = 5
): Promise<AgentResult> {
  const result: AgentResult = {
    links_created: 0,
    flagged_for_review: false,
    is_relevant: true,
    summary: '',
    tool_calls: 0,
    tags: [],
  };

  // THE BRAIN - System prompt that defines agent behavior
  const systemPrompt = `Role: You are the OVIS Autonomous Assistant for a commercial real estate brokerage. Your task is to intelligently classify incoming emails by linking them to the correct CRM objects.

AVAILABLE TOOLS:
- search_rules: ALWAYS call this FIRST to check for user-defined rules for this sender or topic.
- search_deals: Search for active deals by name, address, city, or client. Deal names often contain location info (e.g., "JJ - Milledgeville - Amos").
- search_contacts: Search for contacts (people) by name, email, or company.
- search_clients: Search for clients (companies) by name.
- search_properties: Search for properties by address, name, city, or state.
- get_deal_participants: Get all people involved in a specific deal to verify sender involvement.
- link_object: Link this email to a CRM object. Use confidence_score >= 0.7 to link. Include reasoning in the 'reasoning' parameter.
- flag_for_review: Flag email for human review when uncertain or sender is unknown but relevant.
- done: Call when finished, providing summary and is_business_relevant flag.

PROTOCOL (Follow this order):
1. CHECK RULES: ALWAYS call search_rules first with the sender_email and relevant keywords. If rules exist, follow them with confidence 1.0.
2. ANALYZE SENDER: Search for the sender by email address in contacts.
3. ANALYZE CONTENT:
   - Extract location names, addresses, company names, deal references from subject and body.
   - Search for deals mentioning those locations/companies.
   - Search for properties by address if specific addresses mentioned.
4. VERIFY: If a deal is found, use get_deal_participants to verify the sender is involved.
5. ACT:
   - If a rule matches: Follow the rule's instructions with confidence 1.0.
   - If confidence >= 0.9: Call link_object for each relevant CRM object.
   - If confidence 0.7-0.9: Call link_object with that confidence score.
   - If confidence < 0.7 but email seems business-relevant: Call flag_for_review.
   - If sender unknown but email discusses business topics: Call flag_for_review with suggested_name/company.
   - If email is spam/marketing/personal: Call done with is_business_relevant=false.
6. FINISH: Always call done() with a summary of actions taken.

IMPORTANT:
- One email can link to MULTIPLE objects (deal AND contact AND property).
- LOI, lease, contract, closing discussions = likely related to a deal.
- User-defined rules take priority over your analysis.
- Always provide clear reasoning when linking objects.
- Always call done() when finished.`;

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
        args || {}
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
      } else if (name === 'done') {
        result.summary = args.summary || '';
        result.is_relevant = args.is_business_relevant !== false;
        console.log(`[Agent] Done: ${result.summary}`);
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
