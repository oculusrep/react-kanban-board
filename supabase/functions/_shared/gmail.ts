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
  body?: { size: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

export interface EmailAttachment {
  attachmentId: string;     // Gmail's attachment ID for fetching content
  filename: string;
  mimeType: string;
  size: number;
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
  attachments: EmailAttachment[];
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
  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
  });

  const response = await gmailRequest<{
    messages?: Array<{ id: string; threadId: string }>;
    resultSizeEstimate?: number;
  }>(`/users/me/messages?${params}`, accessToken);

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
 * Handles various formats:
 * - "Name <email@domain.com>"
 * - '"Name" <email@domain.com>'
 * - "email@domain.com"
 * - "Company | Location <email@domain.com>"
 */
function parseEmailAddress(raw: string): { email: string; name: string | null } {
  if (!raw) return { email: '', name: null };

  raw = raw.trim();

  // Pattern 1: 'Name <email@domain.com>' or '"Name" <email@domain.com>'
  // The key fix: require the angle brackets to be present for the name<email> format
  const angleMatch = raw.match(/^(?:"?(.+?)"?\s+)?<([^<>]+@[^<>]+)>$/);
  if (angleMatch) {
    return {
      name: angleMatch[1]?.trim() || null,
      email: angleMatch[2].trim().toLowerCase(),
    };
  }

  // Pattern 2: Plain email 'email@domain.com' (no angle brackets, no name)
  const plainMatch = raw.match(/^([^\s<>]+@[^\s<>]+)$/);
  if (plainMatch) {
    return {
      name: null,
      email: plainMatch[1].trim().toLowerCase(),
    };
  }

  // Fallback: try to extract any email-like pattern from malformed input
  const emailMatch = raw.match(/([^\s<>]+@[^\s<>]+)/);
  if (emailMatch) {
    const email = emailMatch[1].toLowerCase();
    // Everything before the email (minus angle brackets and quotes) is the name
    const namePart = raw.substring(0, raw.indexOf(emailMatch[0])).replace(/[<>"]/g, '').trim();
    return {
      name: namePart || null,
      email: email,
    };
  }

  return { email: raw.toLowerCase(), name: null };
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
 * Extract attachment metadata from MIME parts recursively
 * Attachments have a filename and an attachmentId in the body
 */
function extractAttachmentsFromParts(
  parts: GmailMessagePart[] | undefined
): EmailAttachment[] {
  if (!parts) return [];

  const attachments: EmailAttachment[] = [];

  for (const part of parts) {
    // Check if this part is an attachment (has filename and attachmentId)
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size || 0,
      });
    }

    // Recurse into nested parts
    if (part.parts) {
      attachments.push(...extractAttachmentsFromParts(part.parts));
    }
  }

  return attachments;
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

  // Extract attachment metadata
  const attachments = extractAttachmentsFromParts(message.payload.parts);

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
    attachments,
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
  // Try incremental sync if we have a history ID
  if (connection.last_history_id) {
    try {
      const historyResult = await listMessageHistory(
        accessToken,
        connection.last_history_id
      );
      return {
        messages: historyResult.messages,
        newHistoryId: historyResult.historyId,
        isFullSync: false,
      };
    } catch (error: any) {
      if (error.status === 404) {
        // History ID expired or invalid - fall through to full sync
        console.log(`History ID expired for ${connection.google_email}, performing full resync`);
      } else {
        throw error;
      }
    }
  }

  // Full sync: fetch recent messages
  const profile = await getGmailProfile(accessToken);
  const messagesResult = await listMessages(accessToken, 50);

  return {
    messages: messagesResult.messages,
    newHistoryId: profile.historyId,
    isFullSync: true,
  };
}

// ============================================================================
// Gmail Label Management
// ============================================================================

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messageListVisibility?: 'show' | 'hide';
  labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
}

/**
 * List all labels in the user's Gmail account
 */
export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const response = await gmailRequest<{ labels: GmailLabel[] }>(
    '/users/me/labels',
    accessToken
  );
  return response.labels || [];
}

/**
 * Get a specific label by ID
 */
export async function getLabel(accessToken: string, labelId: string): Promise<GmailLabel> {
  return await gmailRequest<GmailLabel>(
    `/users/me/labels/${labelId}`,
    accessToken
  );
}

/**
 * Create a new label
 */
export async function createLabel(
  accessToken: string,
  name: string,
  options?: {
    messageListVisibility?: 'show' | 'hide';
    labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
  }
): Promise<GmailLabel> {
  return await gmailRequest<GmailLabel>(
    '/users/me/labels',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        messageListVisibility: options?.messageListVisibility || 'show',
        labelListVisibility: options?.labelListVisibility || 'labelShow',
      }),
    }
  );
}

/**
 * Find a label by name (case-insensitive)
 * Returns null if not found
 */
export async function findLabelByName(
  accessToken: string,
  labelName: string
): Promise<GmailLabel | null> {
  const labels = await listLabels(accessToken);
  const lowerName = labelName.toLowerCase();
  return labels.find(l => l.name.toLowerCase() === lowerName) || null;
}

/**
 * Get or create a label by name
 * Returns the label ID
 */
export async function getOrCreateLabel(
  accessToken: string,
  labelName: string
): Promise<string> {
  // First, try to find existing label
  const existingLabel = await findLabelByName(accessToken, labelName);
  if (existingLabel) {
    return existingLabel.id;
  }

  // Create new label
  const newLabel = await createLabel(accessToken, labelName);
  return newLabel.id;
}

/**
 * Modify labels on a message (add and/or remove labels)
 * Requires gmail.modify scope
 */
export async function modifyMessageLabels(
  accessToken: string,
  messageId: string,
  addLabelIds?: string[],
  removeLabelIds?: string[]
): Promise<void> {
  await gmailRequest(
    `/users/me/messages/${messageId}/modify`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        addLabelIds: addLabelIds || [],
        removeLabelIds: removeLabelIds || [],
      }),
    }
  );
}

/**
 * Apply a label to a message by label name
 * Creates the label if it doesn't exist
 * Gracefully handles permission errors (missing gmail.modify scope)
 */
export async function applyLabelToMessage(
  accessToken: string,
  messageId: string,
  labelName: string
): Promise<{ success: boolean; error?: string; labelId?: string }> {
  try {
    // Get or create the label
    const labelId = await getOrCreateLabel(accessToken, labelName);

    // Apply it to the message
    await modifyMessageLabels(accessToken, messageId, [labelId]);

    return { success: true, labelId };
  } catch (error: any) {
    // Handle permission errors gracefully
    if (error.status === 403) {
      console.warn(`[Gmail Label] Permission denied - gmail.modify scope may be required: ${error.message}`);
      return {
        success: false,
        error: 'Permission denied - gmail.modify scope required'
      };
    }

    // Handle other errors
    console.error(`[Gmail Label] Error applying label "${labelName}":`, error);
    return {
      success: false,
      error: error.message
    };
  }
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

// ============================================================================
// Gmail Send Email
// ============================================================================

export interface SendEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: string;
  inReplyTo?: string;   // Message-ID for threading
  references?: string;  // Reference chain for threading
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Encode a string to base64url format (Gmail's required encoding)
 */
function encodeBase64Url(str: string): string {
  // Convert string to UTF-8 bytes, then to base64
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of utf8Bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  // Convert to base64url: replace + with -, / with _, remove padding
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build a MIME message for Gmail API
 */
function buildMimeMessage(
  from: string,
  options: SendEmailOptions
): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Build headers
  const headers: string[] = [
    `From: ${from}`,
    `To: ${options.to.join(', ')}`,
  ];

  if (options.cc && options.cc.length > 0) {
    headers.push(`Cc: ${options.cc.join(', ')}`);
  }

  if (options.bcc && options.bcc.length > 0) {
    headers.push(`Bcc: ${options.bcc.join(', ')}`);
  }

  headers.push(`Subject: ${options.subject}`);

  if (options.replyTo) {
    headers.push(`Reply-To: ${options.replyTo}`);
  }

  // Threading headers for replies
  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
  }

  if (options.references) {
    headers.push(`References: ${options.references}`);
  }

  headers.push(`MIME-Version: 1.0`);

  let mimeBody: string;

  if (options.bodyHtml && options.bodyText) {
    // Multipart alternative (both text and HTML)
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    mimeBody = [
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      options.bodyText,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      options.bodyHtml,
      '',
      `--${boundary}--`,
    ].join('\r\n');
  } else if (options.bodyHtml) {
    // HTML only
    headers.push('Content-Type: text/html; charset="UTF-8"');
    mimeBody = '\r\n' + options.bodyHtml;
  } else {
    // Plain text only
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    mimeBody = '\r\n' + (options.bodyText || '');
  }

  return headers.join('\r\n') + '\r\n' + mimeBody;
}

/**
 * Send an email using the Gmail API
 * Requires gmail.send scope
 *
 * @param accessToken - Valid OAuth access token with gmail.send scope
 * @param fromEmail - The sender's email address (must match authenticated user)
 * @param options - Email options (to, subject, body, etc.)
 * @returns Send result with message ID and thread ID on success
 */
export async function sendEmail(
  accessToken: string,
  fromEmail: string,
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    // Validate required fields
    if (!options.to || options.to.length === 0) {
      return { success: false, error: 'At least one recipient is required' };
    }

    if (!options.subject) {
      return { success: false, error: 'Subject is required' };
    }

    if (!options.bodyText && !options.bodyHtml) {
      return { success: false, error: 'Email body (text or HTML) is required' };
    }

    // Build the MIME message
    const mimeMessage = buildMimeMessage(fromEmail, options);

    // Encode to base64url
    const encodedMessage = encodeBase64Url(mimeMessage);

    // Send via Gmail API
    const response = await gmailRequest<{
      id: string;
      threadId: string;
      labelIds: string[];
    }>(
      '/users/me/messages/send',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          raw: encodedMessage,
        }),
      }
    );

    return {
      success: true,
      messageId: response.id,
      threadId: response.threadId,
    };
  } catch (error: any) {
    console.error('[Gmail Send] Error sending email:', error);

    // Handle specific error cases
    if (error.status === 403) {
      return {
        success: false,
        error: 'Permission denied - gmail.send scope required. User may need to reconnect Gmail.',
      };
    }

    if (error.status === 401) {
      return {
        success: false,
        error: 'Authentication failed - access token may be expired.',
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}
