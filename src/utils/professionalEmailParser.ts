// @ts-ignore
import * as EmailReplyParserModule from 'email-reply-parser';
import * as emailAddresses from 'email-addresses';

// Handle different module exports
const EmailReplyParser = (EmailReplyParserModule as any).default || EmailReplyParserModule;

export interface ProfessionalParsedEmail {
  headers: {
    to: string[];
    from: string;
    cc: string[];
    bcc: string[];
    subject: string;
    date: string;
    replyTo?: string;
  };
  content: {
    visibleText: string; // The main email content without quotes
    signature: string; // Email signature
    fragments: EmailFragment[]; // All email fragments for advanced display
    emailThread: ThreadedEmail[]; // Parsed individual emails in the thread
  };
  metadata: {
    isReply: boolean;
    isForward: boolean;
    hasQuotedText: boolean;
    hasSignature: boolean;
  };
}

export interface ThreadedEmail {
  id: string;
  headers: {
    from: string;
    to: string[];
    date: string;
    subject: string;
  };
  content: string;
  signature?: string;
  type: 'current' | 'quoted';
  level: number; // Nesting level for replies
}

export interface EmailFragment {
  content: string;
  isQuoted: boolean;
  isSignature: boolean;
  isHidden: boolean;
}

export function parseProfessionalEmail(emailContent: string, activitySubject?: string): ProfessionalParsedEmail | null {
  if (!emailContent) return null;

  try {
    // Use email-reply-parser to intelligently separate content
    const parsedEmail = new EmailReplyParser().read(emailContent);
    
    // Extract headers from the raw content
    const headers = extractEmailHeaders(emailContent);
    
    // Get all fragments for advanced display options
    const fragments = parsedEmail.getFragments().map((fragment: any) => ({
      content: fragment.getContent(),
      isQuoted: fragment.isQuoted(),
      isSignature: fragment.isSignature(),
      isHidden: fragment.isHidden()
    }));

    // Separate content types
    const visibleFragments = fragments.filter(f => !f.isQuoted && !f.isSignature && !f.isHidden);
    const quotedFragments = fragments.filter(f => f.isQuoted && !f.isHidden);
    const signatureFragments = fragments.filter(f => f.isSignature);

    // Extract individual emails from the thread
    const emailThread = extractEmailThread(emailContent, headers);
    
    const result: ProfessionalParsedEmail = {
      headers: {
        ...headers,
        subject: headers.subject || activitySubject || '',
      },
      content: {
        visibleText: visibleFragments.map(f => f.content).join('\n\n').trim(),
        signature: signatureFragments.map(f => f.content).join('\n\n').trim(),
        fragments,
        emailThread
      },
      metadata: {
        isReply: parsedEmail.getFragments().some((f: any) => f.isQuoted()),
        isForward: emailContent.toLowerCase().includes('forwarded message') || 
                   emailContent.toLowerCase().includes('fwd:') ||
                   emailContent.toLowerCase().includes('forward:'),
        hasQuotedText: quotedFragments.length > 0,
        hasSignature: signatureFragments.length > 0,
      }
    };

    return result;
  } catch (error) {
    console.error('Error parsing email:', error);
    
    // Fallback to simple parsing if library fails
    return createFallbackParsedEmail(emailContent, activitySubject);
  }
}

function extractEmailHeaders(content: string): Omit<ProfessionalParsedEmail['headers'], 'subject'> {
  const headers = {
    to: [] as string[],
    from: '',
    cc: [] as string[],
    bcc: [] as string[],
    date: '',
    replyTo: undefined as string | undefined,
  };

  const lines = content.split('\n').slice(0, 30); // Only check first 30 lines

  const headerPatterns = {
    from: /^(from|From|FROM):\s*(.+)$/,
    to: /^(to|To|TO):\s*(.+)$/,
    cc: /^(cc|Cc|CC):\s*(.+)$/,
    bcc: /^(bcc|Bcc|BCC):\s*(.+)$/,
    date: /^(date|Date|DATE|sent|Sent):\s*(.+)$/,
    replyTo: /^(reply-to|Reply-To|REPLY-TO):\s*(.+)$/,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check each header pattern
    for (const [field, pattern] of Object.entries(headerPatterns)) {
      const match = trimmed.match(pattern);
      if (match) {
        const value = match[2].trim();
        
        if (field === 'to' || field === 'cc' || field === 'bcc') {
          // Use email-addresses library for proper parsing
          const parsed = emailAddresses.parseAddressList(value);
          if (parsed) {
            headers[field] = parsed.map(addr => {
              if (addr.name) {
                return `${addr.name} <${addr.address}>`;
              }
              return addr.address;
            });
          } else {
            // Fallback to simple parsing
            headers[field] = value.split(/[,;]/).map(email => email.trim()).filter(Boolean);
          }
        } else if (field === 'from' || field === 'replyTo') {
          // Parse single address
          const parsed = emailAddresses.parseOneAddress(value);
          if (parsed && field === 'from') {
            headers.from = parsed.name ? `${parsed.name} <${parsed.address}>` : parsed.address;
          } else if (parsed && field === 'replyTo') {
            headers.replyTo = parsed.name ? `${parsed.name} <${parsed.address}>` : parsed.address;
          } else {
            if (field === 'from') headers.from = value;
            if (field === 'replyTo') headers.replyTo = value;
          }
        } else {
          (headers as any)[field] = value;
        }
        break;
      }
    }
  }

  return headers;
}

function createFallbackParsedEmail(content: string, activitySubject?: string): ProfessionalParsedEmail {
  // Simple fallback when professional parsing fails
  return {
    headers: {
      to: [],
      from: '',
      cc: [],
      bcc: [],
      subject: activitySubject || '',
      date: '',
    },
    content: {
      visibleText: content.trim(),
      signature: '',
      fragments: [{
        content: content.trim(),
        isQuoted: false,
        isSignature: false,
        isHidden: false
      }],
      emailThread: [{
        id: 'fallback-email-0',
        headers: {
          from: 'Unknown Sender',
          to: [],
          date: '',
          subject: activitySubject || 'No Subject'
        },
        content: content.trim(),
        type: 'current',
        level: 0
      }]
    },
    metadata: {
      isReply: false,
      isForward: false,
      hasQuotedText: false,
      hasSignature: false,
    }
  };
}

// Helper function to format text for display
export function formatProfessionalEmailContent(text: string): string[] {
  if (!text) return [];
  
  return text
    .split(/\n\s*\n/) // Split on paragraph breaks
    .map(paragraph => paragraph.replace(/\n/g, ' ').trim()) // Join lines within paragraphs
    .filter(paragraph => paragraph.length > 0); // Remove empty paragraphs
}

// Helper to get a clean sender name from email address
export function getSenderName(fromAddress: string): string {
  if (!fromAddress) return 'Unknown';
  
  const parsed = emailAddresses.parseOneAddress(fromAddress);
  if (parsed && parsed.name) {
    return parsed.name;
  }
  
  // Extract name from "Name <email>" format
  const match = fromAddress.match(/^(.+?)\s*<[^>]+>$/);
  if (match) {
    return match[1].trim().replace(/^"|"$/g, '');
  }
  
  // Use email address if no name
  return fromAddress.split('@')[0];
}

// Helper to check if content looks like an email
export function looksLikeEmail(content: string): boolean {
  if (!content) return false;
  
  const emailIndicators = [
    /@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,  // Contains email address
    /^(from|to|cc|subject):/mi,        // Has email headers
    /wrote:|said:|forwarded message/i, // Has threading indicators
    /(dear|hi|hello|regards|best|sincerely)/i // Common email language
  ];
  
  return emailIndicators.some(pattern => pattern.test(content));
}

// Extract individual email messages from a threaded conversation
function extractEmailThread(emailContent: string, primaryHeaders: any): ThreadedEmail[] {
  const thread: ThreadedEmail[] = [];
  let emailCounter = 0;
  
  // Split content by common email separators
  const emailSeparators = [
    /^.*?wrote:\s*$/gm,
    /^.*?said:\s*$/gm,
    /^.*?forwarded message.*$/gmi,
    /^From:.*$/gm,
    /^----.*Original.*Message.*----/gmi,
    /^>.*?wrote:.*$/gm
  ];
  
  // First, add the current/primary email
  const parsedPrimary = new EmailReplyParser().read(emailContent);
  const visibleText = parsedPrimary.getVisibleText().trim();
  
  if (visibleText) {
    thread.push({
      id: `email-${emailCounter++}`,
      headers: {
        from: primaryHeaders.from || 'Unknown Sender',
        to: primaryHeaders.to || [],
        date: primaryHeaders.date || '',
        subject: primaryHeaders.subject || ''
      },
      content: visibleText,
      type: 'current',
      level: 0
    });
  }
  
  // Extract quoted emails
  const fragments = parsedPrimary.getFragments();
  let quotedContent = '';
  
  fragments.forEach((fragment: any) => {
    if (fragment.isQuoted() && !fragment.isSignature() && !fragment.isHidden()) {
      quotedContent += fragment.getContent() + '\n';
    }
  });
  
  if (quotedContent.trim()) {
    // Try to split quoted content into individual emails
    const quotedEmails = parseQuotedEmails(quotedContent);
    quotedEmails.forEach((email, index) => {
      thread.push({
        id: `email-${emailCounter++}`,
        headers: {
          from: email.from || 'Unknown Sender',
          to: email.to || [],
          date: email.date || '',
          subject: email.subject || primaryHeaders.subject || ''
        },
        content: email.content,
        signature: email.signature,
        type: 'quoted',
        level: index + 1
      });
    });
  }
  
  return thread;
}

// Parse individual emails from quoted content
function parseQuotedEmails(quotedContent: string): Array<{
  from: string;
  to: string[];
  date: string;
  subject: string;
  content: string;
  signature?: string;
}> {
  const emails: Array<any> = [];
  
  // Split by "wrote:" or "From:" patterns
  const emailBlocks = quotedContent.split(/(?=.*(?:wrote:|From:|said:))/i);
  
  emailBlocks.forEach(block => {
    const trimmed = block.trim();
    if (!trimmed || trimmed.length < 20) return;
    
    // Extract headers from the block
    const headers = {
      from: '',
      to: [] as string[],
      date: '',
      subject: ''
    };
    
    const lines = trimmed.split('\n');
    let contentStartIndex = 0;
    
    // Look for header information in the first few lines
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i].trim();
      
      // Extract "From:" information
      const fromMatch = line.match(/^From:\s*(.+)$/i) || 
                       line.match(/^(.+?)\s+wrote:/i) ||
                       line.match(/^(.+?)\s+said:/i);
      if (fromMatch) {
        headers.from = fromMatch[1].trim();
        contentStartIndex = Math.max(contentStartIndex, i + 1);
      }
      
      // Extract date information
      const dateMatch = line.match(/^(?:Date|Sent|On):\s*(.+)$/i) ||
                       line.match(/^On\s+(.+?),\s*.+?\s+wrote:/i);
      if (dateMatch) {
        headers.date = dateMatch[1].trim();
        contentStartIndex = Math.max(contentStartIndex, i + 1);
      }
      
      // Extract "To:" information
      const toMatch = line.match(/^To:\s*(.+)$/i);
      if (toMatch) {
        headers.to = toMatch[1].split(/[,;]/).map(email => email.trim());
        contentStartIndex = Math.max(contentStartIndex, i + 1);
      }
      
      // Extract subject
      const subjectMatch = line.match(/^Subject:\s*(.+)$/i);
      if (subjectMatch) {
        headers.subject = subjectMatch[1].trim();
        contentStartIndex = Math.max(contentStartIndex, i + 1);
      }
    }
    
    // Extract content (everything after headers)
    const content = lines.slice(contentStartIndex)
      .join('\n')
      .replace(/^>+\s*/gm, '') // Remove quote markers
      .replace(/^\s*$/gm, '') // Remove empty lines
      .trim();
    
    // Detect signature
    const signatureMatch = content.match(/^(--\s*$|_{2,}$|-{2,}$)/m);
    let emailContent = content;
    let signature = '';
    
    if (signatureMatch) {
      const sigIndex = signatureMatch.index || 0;
      emailContent = content.substring(0, sigIndex).trim();
      signature = content.substring(sigIndex).trim();
    }
    
    if (emailContent && (headers.from || headers.date)) {
      emails.push({
        from: headers.from,
        to: headers.to,
        date: headers.date,
        subject: headers.subject,
        content: emailContent,
        signature: signature || undefined
      });
    }
  });
  
  return emails;
}