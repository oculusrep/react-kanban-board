/**
 * Gemini AI Shared Utilities
 *
 * Provides Gemini API client functionality for Edge Functions including:
 * - Email triage (tagging to CRM objects)
 * - Business relevance checking
 * - Deal synopsis generation
 * - Contact info extraction
 */

// Types
export interface CRMContext {
  contacts: Array<{
    id: string;
    email: string;
    personal_email?: string;
    first_name: string;
    last_name: string;
    company?: string;
    client_id?: string;
  }>;
  clients: Array<{
    id: string;
    client_name: string;
  }>;
  deals: Array<{
    id: string;
    deal_name: string;
    property_id?: string;
    client_id?: string;
  }>;
  properties: Array<{
    id: string;
    property_name?: string;
    address?: string;
    city?: string;
    state?: string;
  }>;
}

export interface EmailForAnalysis {
  subject: string;
  bodyText: string;
  senderEmail: string;
  senderName?: string;
  snippet: string;
}

export interface AICorrection {
  correction_type: string;
  object_type: string;
  email_snippet: string;
  sender_email: string;
  reasoning_hint?: string;
}

export interface TagResult {
  object_type: 'contact' | 'client' | 'deal' | 'property';
  object_id: string;
  confidence: number;
  reason: string;
}

export interface TriageResult {
  tags: TagResult[];
  is_business_relevant: boolean;
  suggested_contact_name?: string;
  suggested_company?: string;
}

export interface DealSynopsisResult {
  ball_in_court: string;
  ball_in_court_type: 'us' | 'them' | 'landlord' | 'tenant' | 'broker' | 'attorney' | 'unknown';
  status_summary: string;
  key_document_status?: string;
  alert_level: 'green' | 'yellow' | 'red';
  alert_reason: string;
  next_steps?: string[];
}

export interface ActivityForSynopsis {
  id: string;
  activity_type: string;
  subject?: string;
  description?: string;
  activity_date: string;
  completed_at?: string;
  is_completed: boolean;
  direction?: 'INBOUND' | 'OUTBOUND';
  contact_name?: string;
}

// Constants
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Make a request to the Gemini API
 */
async function geminiRequest<T>(
  model: string,
  apiKey: string,
  prompt: string,
  systemInstruction?: string
): Promise<T> {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const requestBody: any = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2, // Lower temperature for more consistent outputs
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 2048,
    },
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  // Extract text from response
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response text from Gemini');
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${text}`);
  }
}

/**
 * Build the system prompt for the Triage Agent
 */
function buildTriageSystemPrompt(corrections: AICorrection[]): string {
  let prompt = `You are a CRM Data Entry Expert for a commercial real estate brokerage.

Your task is to analyze emails and identify which CRM objects they should be linked to.

CRM Object Types:
- Contact: Individual people (identified by name or email)
- Client: Companies/organizations
- Deal: Active transactions (identified by deal name or context about negotiations, contracts, leases)
- Property: Real estate assets (identified by addresses, property names, or references to specific locations)

Rules:
1. An email can be linked to MULTIPLE objects (e.g., a contact AND their client AND a deal)
2. Look for explicit mentions of addresses, property names, deal names, company names
3. If discussing pricing, contracts, LOI, lease terms → likely related to a Deal
4. If mentioning a specific address or property name → link to that Property
5. Consider the full context: subject line AND body text
6. Confidence scores: 0.9+ for explicit mentions, 0.7-0.9 for strong implications, 0.5-0.7 for weak associations
7. If the email appears to be spam, marketing, or personal (not business related), mark is_business_relevant as false
8. IMPORTANT: Deal names often contain location names (e.g., "JJ - Milledgeville - Amos"). If an email mentions a city like "Milledgeville", look for deals containing that location.
9. IMPORTANT: When the email subject or body mentions a location/city, ALWAYS check if any deal names contain that location and link to them.

Output Format (JSON only):
{
  "tags": [
    {"object_type": "contact", "object_id": "uuid", "confidence": 0.95, "reason": "Sender email matches contact"},
    {"object_type": "deal", "object_id": "uuid", "confidence": 0.85, "reason": "Discusses lease terms for this deal"}
  ],
  "is_business_relevant": true,
  "suggested_contact_name": "John Smith",  // Only if sender is unknown but seems business-relevant
  "suggested_company": "Acme Corp"         // Only if company mentioned but not in CRM
}`;

  // Add learning from corrections if available
  if (corrections.length > 0) {
    prompt += `\n\n### LEARNING FROM PAST MISTAKES\n`;
    prompt += `These are recent corrections made by users. Learn from them:\n\n`;

    for (const correction of corrections) {
      if (correction.correction_type === 'removed_tag') {
        prompt += `- WRONG: Tagged an email to ${correction.object_type} when it shouldn't have been.`;
        if (correction.reasoning_hint) {
          prompt += ` User feedback: "${correction.reasoning_hint}"`;
        }
        prompt += `\n  Email snippet: "${correction.email_snippet}"\n`;
      } else if (correction.correction_type === 'added_tag') {
        prompt += `- MISSED: Should have tagged email to ${correction.object_type} but didn't.`;
        if (correction.reasoning_hint) {
          prompt += ` User feedback: "${correction.reasoning_hint}"`;
        }
        prompt += `\n  Email snippet: "${correction.email_snippet}"\n`;
      }
    }
  }

  return prompt;
}

/**
 * Build the user prompt with email content and CRM context
 */
function buildTriageUserPrompt(
  email: EmailForAnalysis,
  context: CRMContext
): string {
  let prompt = `Analyze this email and identify which CRM objects it should be linked to.

## Email Details
From: ${email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail}
Subject: ${email.subject}

Body:
${email.bodyText.substring(0, 3000)}${email.bodyText.length > 3000 ? '...(truncated)' : ''}

## Available CRM Objects

### Contacts (match by name or email)
${context.contacts.slice(0, 50).map(c =>
  `- ID: ${c.id} | ${c.first_name} ${c.last_name} | ${c.email}${c.company ? ` | ${c.company}` : ''}`
).join('\n')}

### Clients (companies)
${context.clients.slice(0, 30).map(c =>
  `- ID: ${c.id} | ${c.client_name}`
).join('\n')}

### Deals (active transactions)
${context.deals.slice(0, 30).map(d =>
  `- ID: ${d.id} | ${d.deal_name}`
).join('\n')}

### Properties (real estate)
${context.properties.slice(0, 50).map(p =>
  `- ID: ${p.id} | ${p.property_name || p.address || 'Unnamed'}${p.city ? ` | ${p.city}, ${p.state}` : ''}`
).join('\n')}

Respond with JSON only.`;

  return prompt;
}

/**
 * Analyze an email for CRM object tags using Gemini
 */
export async function analyzeEmailForTags(
  email: EmailForAnalysis,
  context: CRMContext,
  corrections: AICorrection[],
  apiKey: string
): Promise<TriageResult> {
  const systemPrompt = buildTriageSystemPrompt(corrections);
  const userPrompt = buildTriageUserPrompt(email, context);

  try {
    const result = await geminiRequest<TriageResult>(
      'gemini-1.5-pro', // Use Pro for better reasoning on CRM matching
      apiKey,
      userPrompt,
      systemPrompt
    );

    // Validate and normalize the result
    return {
      tags: Array.isArray(result.tags) ? result.tags.filter(t =>
        t.object_type && t.object_id && typeof t.confidence === 'number'
      ) : [],
      is_business_relevant: result.is_business_relevant !== false,
      suggested_contact_name: result.suggested_contact_name,
      suggested_company: result.suggested_company,
    };
  } catch (error) {
    console.error('Error analyzing email:', error);
    console.error('Email subject:', email.subject);
    console.error('Context size:', {
      contacts: context.contacts.length,
      clients: context.clients.length,
      deals: context.deals.length,
      properties: context.properties.length,
    });
    // Return empty result on error - don't fail the whole process
    return {
      tags: [],
      is_business_relevant: true, // Assume relevant on error, let human decide
    };
  }
}

/**
 * Quick check if an email from an unknown sender is business-relevant
 */
export async function checkBusinessRelevance(
  email: EmailForAnalysis,
  crmObjectNames: string[], // List of known property names, client names, etc.
  apiKey: string
): Promise<{
  is_relevant: boolean;
  matched_object_name?: string;
  reason: string;
}> {
  const systemPrompt = `You are a filter for a commercial real estate CRM.
Your job is to determine if an email from an unknown sender is business-relevant.

Business-relevant emails:
- Discuss specific properties, addresses, or real estate transactions
- Reference known clients or deals
- Are from brokers, attorneys, landlords, tenants, or other business contacts
- Discuss lease terms, contracts, LOIs, or property details

NOT business-relevant:
- Spam, marketing, newsletters
- Personal emails
- General inquiries not related to specific properties or deals
- Automated notifications from services

Output JSON:
{
  "is_relevant": true/false,
  "matched_object_name": "Property or client name if found",
  "reason": "Brief explanation"
}`;

  const userPrompt = `Email:
From: ${email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail}
Subject: ${email.subject}
Preview: ${email.snippet}

Known CRM Objects (properties, clients, deals):
${crmObjectNames.slice(0, 100).join('\n')}

Is this email business-relevant? Respond with JSON only.`;

  try {
    return await geminiRequest<{
      is_relevant: boolean;
      matched_object_name?: string;
      reason: string;
    }>('gemini-1.5-flash', apiKey, userPrompt, systemPrompt);
  } catch (error) {
    console.error('Error checking relevance:', error);
    // Default to relevant on error
    return { is_relevant: true, reason: 'Error during analysis' };
  }
}

/**
 * Generate a deal synopsis from activity history
 */
export async function generateDealSynopsis(
  dealName: string,
  activities: ActivityForSynopsis[],
  stalledThresholdDays: number,
  apiKey: string
): Promise<DealSynopsisResult> {
  const systemPrompt = `You are a commercial real estate deal analyst.
Your job is to analyze the activity history of a deal and provide a status synopsis.

Determine:
1. Ball in Court: Who owes the next action? (us = our team, them = the other party, landlord, tenant, broker, attorney)
2. Status Summary: 2-3 sentence summary of where the deal stands
3. Key Document Status: What's the status of LOI, lease, or other key documents if mentioned?
4. Alert Level:
   - GREEN: Deal is progressing normally, recent activity
   - YELLOW: Needs attention (approaching stale, waiting on important response)
   - RED: Stalled (no activity for ${stalledThresholdDays}+ days) or blocked

Output JSON:
{
  "ball_in_court": "Landlord",
  "ball_in_court_type": "landlord",
  "status_summary": "Lease was sent to landlord on Dec 5. Waiting for their redlines. Last communication mentioned they need board approval.",
  "key_document_status": "Lease sent, awaiting landlord redlines",
  "alert_level": "yellow",
  "alert_reason": "Waiting 6 days for landlord response on lease",
  "next_steps": ["Follow up with landlord", "Prepare for potential counter-terms"]
}`;

  // Build chronological activity transcript
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(a.activity_date).getTime() - new Date(b.activity_date).getTime()
  );

  let transcript = `## Deal: ${dealName}\n\n### Activity Timeline:\n\n`;

  for (const activity of sortedActivities) {
    const date = new Date(activity.activity_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const status = activity.is_completed ? '[COMPLETED]' : '[OPEN]';
    const direction = activity.direction ? (activity.direction === 'INBOUND' ? '[IN]' : '[OUT]') : '';

    transcript += `**${date}** ${activity.activity_type} ${status} ${direction}\n`;
    if (activity.subject) transcript += `Subject: ${activity.subject}\n`;
    if (activity.contact_name) transcript += `Contact: ${activity.contact_name}\n`;
    if (activity.description) {
      transcript += `${activity.description.substring(0, 500)}${activity.description.length > 500 ? '...' : ''}\n`;
    }
    transcript += '\n';
  }

  // Calculate days since last activity
  const lastActivity = sortedActivities[sortedActivities.length - 1];
  const daysSinceActivity = lastActivity
    ? Math.floor((Date.now() - new Date(lastActivity.activity_date).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  transcript += `\n### Current Status:\n`;
  transcript += `- Days since last activity: ${daysSinceActivity}\n`;
  transcript += `- Stalled threshold: ${stalledThresholdDays} days\n`;
  transcript += `- Total activities: ${activities.length}\n`;

  try {
    return await geminiRequest<DealSynopsisResult>(
      'gemini-1.5-pro', // Use Pro for longer context
      apiKey,
      transcript,
      systemPrompt
    );
  } catch (error) {
    console.error('Error generating synopsis:', error);
    // Return a default synopsis on error
    return {
      ball_in_court: 'Unknown',
      ball_in_court_type: 'unknown',
      status_summary: 'Unable to generate synopsis due to an error.',
      alert_level: daysSinceActivity > stalledThresholdDays ? 'red' : 'yellow',
      alert_reason: `Last activity was ${daysSinceActivity} days ago`,
    };
  }
}

/**
 * Extract contact information from an email with unknown sender
 */
export async function extractContactInfo(
  email: EmailForAnalysis,
  apiKey: string
): Promise<{
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
}> {
  const systemPrompt = `Extract contact information from this email.
Look at the sender name, email signature, and email domain.

Output JSON:
{
  "name": "Full name if found",
  "first_name": "First name",
  "last_name": "Last name",
  "company": "Company name if found",
  "title": "Job title if found"
}

If information is not found, omit that field.`;

  const userPrompt = `From: ${email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail}
Subject: ${email.subject}

Body:
${email.bodyText.substring(0, 2000)}

Extract contact info. Respond with JSON only.`;

  try {
    return await geminiRequest<{
      name?: string;
      first_name?: string;
      last_name?: string;
      company?: string;
      title?: string;
    }>('gemini-1.5-flash', apiKey, userPrompt, systemPrompt);
  } catch (error) {
    console.error('Error extracting contact info:', error);
    return {};
  }
}
