/**
 * Gmail API Shared Utilities
 *
 * Provides Gmail API client functionality for Edge Functions including:
 * - Token refresh handling
 * - Message fetching and parsing
 * - History-based incremental sync
 */

// Types
export interface GmailConnection {
  id: string;
  user_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  last_history_id: string | null;
  last_sync_at: string | null;
  is_active: boolean;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: {
    partId?: string;
    mimeType: string;
    filename?: string;
    headers: Array<{ name: string; value: string }>;
    body?: { size: number; data?: string };
    parts?: GmailMessagePart[];
  };
  sizeEstimate: number;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface ParsedEmail {
  messageId: string;        // Message-ID header
  gmailId: string;          // Gmail's internal ID
  threadId: string;
  inReplyTo: string | null;
  references: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  snippet: string;
  senderEmail: string;
  senderName: string | null;
  recipientList: Array<{
    email: string;
    name: string | null;
    type: 'to' | 'cc' | 'bcc';
  }>;
  receivedAt: Date;
  labelIds: string[];
}

export interface TokenRefreshResult {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

// Constants
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenRefreshResult> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return await response.json();
}

/**
 * Check if the access token is expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(expiresAt: string | Date): boolean {
  const expirationTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  return now >= expirationTime - bufferMs;
}

/**
 * Make an authenticated request to the Gmail API
 */
async function gmailRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${GMAIL_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    const errorObj = new Error(`Gmail API error (${response.status}): ${error}`);
    (errorObj as any).status = response.status;
    throw errorObj;
  }

  return await response.json();
}

/**
 * List messages using history API (incremental sync)
 * Gets all new messages since last sync, regardless of label
 */
export async function listMessageHistory(
  accessToken: string,
  startHistoryId: string
): Promise<{
  messages: Array<{ id: string; threadId: string }>;
  historyId: string;
}> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: 'messageAdded',
  });

  // Don't filter by label - get ALL new messages
  const response = await gmailRequest<{
    history?: Array<{
      id: string;
      messagesAdded?: Array<{ message: { id: string; threadId: string } }>;
    }>;
    historyId: string;
    nextPageToken?: string;
  }>(`/users/me/history?${params}`, accessToken);

  const messages: Array<{ id: string; threadId: string }> = [];

  if (response.history) {
    for (const historyItem of response.history) {
      if (historyItem.messagesAdded) {
        for (const added of historyItem.messagesAdded) {
          messages.push(added.message);
        }
      }
    }
  }

  return {
    messages,
    historyId: response.historyId,
  };
}

/**
 * List recent messages (full sync fallback)
 * Fetches all recent messages without label filtering to capture:
 * - INBOX, SENT
 * - Custom labels like ![MIKE], [Properties], [Prospecting], etc.
 * - Archived emails
 */
export async function listMessages(
  accessToken: string,
  maxResults: number = 50
): Promise<{
  messages: Array<{ id: string; threadId: string }>;
  resultSizeEstimate: number;
}> {
  // Query without label filters to get ALL recent messages
  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
  });

  console.log(`[listMessages] Fetching messages with maxResults=${maxResults}`);

  const response = await gmailRequest<{
    messages?: Array<{ id: string; threadId: string }>;
    resultSizeEstimate: number;
    nextPageToken?: string;
  }>(`/users/me/messages?${params}`, accessToken);

  console.log(`[listMessages] Gmail API returned: ${response.messages?.length || 0} messages, estimate: ${response.resultSizeEstimate}`);

  return {
    messages: response.messages || [],
    resultSizeEstimate: response.resultSizeEstimate || 0,
  };
}

/**
 * Get a single message with full content
 */
export async function getMessage(
  accessToken: string,
  messageId: string,
  format: 'full' | 'metadata' | 'minimal' = 'full'
): Promise<GmailMessage> {
  return await gmailRequest<GmailMessage>(
    `/users/me/messages/${messageId}?format=${format}`,
    accessToken
  );
}

/**
 * Get the user's email address from their Gmail profile
 */
export async function getGmailProfile(accessToken: string): Promise<{
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}> {
  return await gmailRequest('/users/me/profile', accessToken);
}

/**
 * Extract a header value from Gmail message headers
 */
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string | null {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

/**
 * Parse email address from "Name <email@example.com>" format
 */
function parseEmailAddress(raw: string): { email: string; name: string | null } {
  const match = raw.match(/^(?:"?([^"]*)"?\s*)?<?([^<>]+@[^<>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || null,
      email: match[2].trim().toLowerCase(),
    };
  }
  return { email: raw.trim().toLowerCase(), name: null };
}

/**
 * Parse multiple recipients from a header value
 */
function parseRecipients(
  headerValue: string | null,
  type: 'to' | 'cc' | 'bcc'
): Array<{ email: string; name: string | null; type: 'to' | 'cc' | 'bcc' }> {
  if (!headerValue) return [];

  // Split by comma, but be careful of commas inside quotes
  const recipients: Array<{ email: string; name: string | null; type: 'to' | 'cc' | 'bcc' }> = [];
  const parts = headerValue.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

  for (const part of parts) {
    const { email, name } = parseEmailAddress(part.trim());
    if (email) {
      recipients.push({ email, name, type });
    }
  }

  return recipients;
}

/**
 * Decode base64url encoded content
 */
function decodeBase64Url(data: string): string {
  // Replace URL-safe characters with standard base64
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // Decode and handle UTF-8
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    // Fallback for non-UTF8 content
    return atob(base64);
  }
}

/**
 * Extract text body from MIME parts recursively
 */
function extractBodyFromParts(
  parts: GmailMessagePart[] | undefined,
  mimeType: string
): string | null {
  if (!parts) return null;

  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      const result = extractBodyFromParts(part.parts, mimeType);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Parse a Gmail message into our internal format
 */
export function parseGmailMessage(
  message: GmailMessage,
  userEmail: string
): ParsedEmail {
  const headers = message.payload.headers;

  // Extract headers
  const messageId = getHeader(headers, 'Message-ID') || message.id;
  const subject = getHeader(headers, 'Subject') || '(No Subject)';
  const from = getHeader(headers, 'From') || '';
  const to = getHeader(headers, 'To');
  const cc = getHeader(headers, 'Cc');
  const bcc = getHeader(headers, 'Bcc');
  const inReplyTo = getHeader(headers, 'In-Reply-To');
  const references = getHeader(headers, 'References');
  const dateHeader = getHeader(headers, 'Date');

  // Parse sender
  const { email: senderEmail, name: senderName } = parseEmailAddress(from);

  // Parse recipients
  const recipientList = [
    ...parseRecipients(to, 'to'),
    ...parseRecipients(cc, 'cc'),
    ...parseRecipients(bcc, 'bcc'),
  ];

  // Determine direction based on sender email and labels
  const isSent = message.labelIds.includes('SENT');
  const senderIsUser = senderEmail.toLowerCase() === userEmail.toLowerCase();
  const direction: 'INBOUND' | 'OUTBOUND' = (isSent || senderIsUser) ? 'OUTBOUND' : 'INBOUND';

  // Extract body content
  let bodyText = '';
  let bodyHtml: string | null = null;

  if (message.payload.body?.data) {
    // Simple message with body directly in payload
    const decoded = decodeBase64Url(message.payload.body.data);
    if (message.payload.mimeType === 'text/html') {
      bodyHtml = decoded;
      // Strip HTML for text version
      bodyText = decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      bodyText = decoded;
    }
  } else if (message.payload.parts) {
    // Multipart message
    bodyText = extractBodyFromParts(message.payload.parts, 'text/plain') || '';
    bodyHtml = extractBodyFromParts(message.payload.parts, 'text/html');

    // If no plain text, extract from HTML
    if (!bodyText && bodyHtml) {
      bodyText = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // Parse received date
  let receivedAt: Date;
  if (dateHeader) {
    receivedAt = new Date(dateHeader);
  } else {
    // Fallback to internal date (milliseconds since epoch)
    receivedAt = new Date(parseInt(message.internalDate));
  }

  return {
    messageId,
    gmailId: message.id,
    threadId: message.threadId,
    inReplyTo,
    references,
    direction,
    subject,
    bodyText,
    bodyHtml,
    snippet: message.snippet,
    senderEmail,
    senderName,
    recipientList,
    receivedAt,
    labelIds: message.labelIds,
  };
}

/**
 * Sync emails for a connection with proper 404 handling
 */
export async function syncEmailsForConnection(
  connection: GmailConnection,
  accessToken: string
): Promise<{
  messages: Array<{ id: string; threadId: string }>;
  newHistoryId: string;
  isFullSync: boolean;
}> {
  console.log(`[syncEmailsForConnection] Starting sync for ${connection.google_email}, last_history_id: ${connection.last_history_id}`);

  // Try incremental sync if we have a history ID
  if (connection.last_history_id) {
    try {
      console.log(`[syncEmailsForConnection] Attempting incremental sync from history ID ${connection.last_history_id}`);
      const historyResult = await listMessageHistory(
        accessToken,
        connection.last_history_id
      );
      console.log(`[syncEmailsForConnection] Incremental sync returned ${historyResult.messages.length} messages`);
      return {
        messages: historyResult.messages,
        newHistoryId: historyResult.historyId,
        isFullSync: false,
      };
    } catch (error: any) {
      if (error.status === 404) {
        // History ID expired or invalid - fall through to full sync
        console.log(`[syncEmailsForConnection] History ID expired for ${connection.google_email}, performing full resync`);
      } else {
        console.error(`[syncEmailsForConnection] Error in incremental sync:`, error);
        throw error;
      }
    }
  }

  // Full sync: fetch recent messages
  console.log(`[syncEmailsForConnection] Performing full sync`);
  const messagesResult = await listMessages(accessToken, 50);
  console.log(`[syncEmailsForConnection] Full sync returned ${messagesResult.messages.length} messages`);

  // Get the current history ID from the profile
  const profile = await getGmailProfile(accessToken);
  console.log(`[syncEmailsForConnection] Got profile historyId: ${profile.historyId}`);

  return {
    messages: messagesResult.messages,
    newHistoryId: profile.historyId,
    isFullSync: true,
  };
}

/**
 * Revoke OAuth tokens (for disconnect)
 */
export async function revokeToken(token: string): Promise<void> {
  const response = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: 'POST' }
  );

  if (!response.ok) {
    console.warn('Token revocation failed:', await response.text());
    // Don't throw - token may already be invalid
  }
}
