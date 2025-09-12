export interface ParsedEmail {
  subject: string;
  body: string;
  from: string;
  to: string[];
  cc: string[];
  date: string;
  isForwarded: boolean;
  forwardedFrom?: string;
  originalMessage?: string;
  signature?: string;
}

export interface FormattedEmailAddress {
  name: string;
  email: string;
}

// Simple cache for parsed emails to avoid re-parsing identical content
const parseCache = new Map<string, ParsedEmail | null>();

export function parseEmailDescription(description: string): ParsedEmail | null {
  if (!description) return null;
  
  // Check cache first
  if (parseCache.has(description)) {
    return parseCache.get(description) || null;
  }

  try {
    // Check if this is a forwarded message
    const isForwarded = description.includes('Forwarded message') || 
                       description.includes('---------- Forwarded message ---------') ||
                       description.match(/^Fwd:/i) !== null;

    let subject = '';
    let from = '';
    let to: string[] = [];
    let cc: string[] = [];
    let date = '';
    let body = '';
    let forwardedFrom = '';
    let originalMessage = '';
    let signature = '';

    if (isForwarded) {
      // Handle forwarded message format
      const result = parseForwardedEmail(description);
      subject = result.subject;
      from = result.from;
      to = result.to;
      cc = result.cc;
      date = result.date;
      body = result.body;
      forwardedFrom = result.forwardedFrom;
      originalMessage = result.originalMessage;
      signature = result.signature;
    } else {
      // Handle regular email format
      const lines = description.split('\n');
      let bodyStartIndex = 0;

      // Extract headers from the first part of the email
      for (let i = 0; i < lines.length && i < 20; i++) {
        const line = lines[i].trim();
        if (!line) {
          bodyStartIndex = Math.max(bodyStartIndex, i + 1);
          continue;
        }

        // Parse email headers
        if (line.match(/^Subject:\s*/i)) {
          subject = line.replace(/^Subject:\s*/i, '').trim();
          bodyStartIndex = Math.max(bodyStartIndex, i + 1);
        } else if (line.match(/^From:\s*/i)) {
          from = line.replace(/^From:\s*/i, '').trim();
          bodyStartIndex = Math.max(bodyStartIndex, i + 1);
        } else if (line.match(/^To:\s*/i)) {
          const toEmails = line.replace(/^To:\s*/i, '').trim();
          to = toEmails.split(/[,;]/).map(email => email.trim()).filter(Boolean);
          bodyStartIndex = Math.max(bodyStartIndex, i + 1);
        } else if (line.match(/^Cc:\s*/i)) {
          const ccEmails = line.replace(/^Cc:\s*/i, '').trim();
          cc = ccEmails.split(/[,;]/).map(email => email.trim()).filter(Boolean);
          bodyStartIndex = Math.max(bodyStartIndex, i + 1);
        } else if (line.match(/^Date:\s*/i) || line.match(/^Sent:\s*/i)) {
          date = line.replace(/^(Date|Sent):\s*/i, '').trim();
          bodyStartIndex = Math.max(bodyStartIndex, i + 1);
        } else if (bodyStartIndex === 0 && line.includes('@')) {
          // If we haven't found headers yet but see an email pattern, continue looking
          continue;
        } else if (bodyStartIndex === 0) {
          // If no headers found, assume body starts here
          bodyStartIndex = i;
          break;
        }
      }

      // Extract body content (everything after headers)
      const fullBody = lines.slice(bodyStartIndex).join('\n').trim();
      const separatedContent = separateBodyAndSignature(fullBody);
      body = separatedContent.body;
      signature = separatedContent.signature;
    }

    const result = {
      subject,
      body,
      from,
      to,
      cc,
      date,
      isForwarded,
      forwardedFrom,
      originalMessage,
      signature
    };
    
    // Cache the result (limit cache size to prevent memory leaks)
    if (parseCache.size > 100) {
      const firstKey = parseCache.keys().next().value;
      parseCache.delete(firstKey);
    }
    parseCache.set(description, result);
    
    return result;
  } catch (error) {
    console.error('Error parsing email description:', error);
    const fallbackResult = {
      subject: '',
      body: description,
      from: '',
      to: [],
      cc: [],
      date: '',
      isForwarded: false
    };
    
    // Cache even error results to avoid re-processing bad data
    parseCache.set(description, fallbackResult);
    return fallbackResult;
  }
}

function parseForwardedEmail(description: string): {
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  date: string;
  body: string;
  forwardedFrom: string;
  originalMessage: string;
  signature: string;
} {
  const lines = description.split('\n');
  let subject = '';
  let originalBody = '';
  let forwardedFrom = '';
  let originalMessage = '';
  let signature = '';
  
  // Extract the forwarding header info first
  const subjectMatch = description.match(/^Subject:\s*(.+)$/m);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
  }

  // Find the forwarded message separator
  const forwardSeparatorIndex = lines.findIndex(line => 
    line.includes('---------- Forwarded message ---------') ||
    line.includes('-----Original Message-----') ||
    line.includes('Begin forwarded message')
  );

  if (forwardSeparatorIndex !== -1) {
    // Everything before the separator is the forwarding message
    const forwardingContent = lines.slice(0, forwardSeparatorIndex).join('\n').trim();
    const contentAndSig = separateBodyAndSignature(forwardingContent.replace(/^Subject:.*$/m, '').trim());
    originalBody = contentAndSig.body;
    signature = contentAndSig.signature;

    // Everything after the separator is the original message
    const originalContent = lines.slice(forwardSeparatorIndex + 1).join('\n').trim();
    originalMessage = originalContent;

    // Try to extract the original sender from the forwarded headers
    const fromMatch = originalContent.match(/^From:\s*(.+)$/m);
    if (fromMatch) {
      forwardedFrom = fromMatch[1].trim();
    }
  } else {
    // Fallback: treat entire content as body
    const contentAndSig = separateBodyAndSignature(description.replace(/^Subject:.*$/m, '').trim());
    originalBody = contentAndSig.body;
    signature = contentAndSig.signature;
  }

  return {
    subject,
    from: '',
    to: [],
    cc: [],
    date: '',
    body: originalBody,
    forwardedFrom,
    originalMessage,
    signature
  };
}

function separateBodyAndSignature(content: string): { body: string; signature: string } {
  if (!content) return { body: '', signature: '' };

  // Common signature separators with improved patterns
  const signaturePatterns = [
    { pattern: /^--\s*$/m, type: 'separator' },                                    // Standard email signature separator
    { pattern: /^_{5,}$/m, type: 'separator' },                                    // Underscores
    { pattern: /^-{5,}$/m, type: 'separator' },                                    // Dashes
    { pattern: /^\s*Best,?\s*$/mi, type: 'closing' },                             // "Best,"
    { pattern: /^\s*Regards,?\s*$/mi, type: 'closing' },                          // "Regards,"
    { pattern: /^\s*Sincerely,?\s*$/mi, type: 'closing' },                        // "Sincerely,"
    { pattern: /^\s*Thanks?,?\s*$/mi, type: 'closing' },                          // "Thanks,"
    { pattern: /^[A-Za-z\s]+\s*\|\s*[A-Za-z\s]+$/m, type: 'title' },            // Name | Title format
    { pattern: /^\s*M:\s*\d{3}[-.]?\d{3}[-.]?\d{4}/m, type: 'contact' },         // Mobile phone pattern
    { pattern: /^\s*\d{3}[-.]?\d{3}[-.]?\d{4}/m, type: 'contact' },              // Phone number pattern
    { pattern: /^www\./m, type: 'contact' },                                      // Website
    { pattern: /^\s*Connect with me on LinkedIn/mi, type: 'contact' },            // LinkedIn invitation
    { pattern: /^Confidentiality Note:/mi, type: 'legal' },                       // Legal disclaimer
    { pattern: /^[A-Za-z\s.]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/m, type: 'contact' } // Email address line
  ];

  let signatureStartIndex = -1;
  let earliestIndex = content.length;
  let signatureType = '';

  // Find the earliest signature pattern
  for (const { pattern, type } of signaturePatterns) {
    const match = content.match(pattern);
    if (match && match.index !== undefined && match.index < earliestIndex) {
      earliestIndex = match.index;
      signatureStartIndex = match.index;
      signatureType = type;
    }
  }

  // For closings like "Best,", look for the line break before it to include in signature
  if (signatureStartIndex !== -1 && signatureType === 'closing') {
    const contentBeforeSignature = content.substring(0, signatureStartIndex);
    const lines = contentBeforeSignature.split('\n');
    
    // If the last few lines before the closing look like signature content, include them
    let actualBodyEndIndex = signatureStartIndex;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      // If we find a line that looks like actual content, stop
      if (line.length > 50 || line.includes('?') || line.includes('.') && !line.match(/^\w+\./)) {
        break;
      }
      
      // Move the signature start to include this line
      const lineStart = content.indexOf(lines[i], actualBodyEndIndex - contentBeforeSignature.length);
      if (lineStart !== -1) {
        actualBodyEndIndex = lineStart;
      }
    }
    signatureStartIndex = actualBodyEndIndex;
  }

  if (signatureStartIndex !== -1) {
    const body = content.substring(0, signatureStartIndex).trim();
    const signature = content.substring(signatureStartIndex).trim();
    return { body, signature };
  }

  return { body: content.trim(), signature: '' };
}

export function formatEmailAddress(emailString: string): FormattedEmailAddress {
  if (!emailString) {
    return { name: '', email: '' };
  }

  // Handle format: "Name <email@domain.com>"
  const nameEmailMatch = emailString.match(/^(.*?)\s*<([^>]+)>$/);
  if (nameEmailMatch) {
    const name = nameEmailMatch[1].trim().replace(/^["']|["']$/g, '');
    const email = nameEmailMatch[2].trim();
    return { name, email };
  }

  // Handle format: "email@domain.com (Name)"
  const emailNameMatch = emailString.match(/^([^\s(]+)\s*\(([^)]+)\)$/);
  if (emailNameMatch) {
    const email = emailNameMatch[1].trim();
    const name = emailNameMatch[2].trim();
    return { name, email };
  }

  // Handle plain email address
  if (emailString.includes('@')) {
    return { name: '', email: emailString.trim() };
  }

  // If no email pattern found, treat as name
  return { name: emailString.trim(), email: '' };
}

export function formatSignatureForDisplay(signature: string): string[] {
  if (!signature) return [];

  // Clean up the signature text while preserving intentional line breaks
  const cleaned = signature
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!cleaned) return [];

  // Split signature into logical blocks that should be displayed together
  const lines = cleaned.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Identify signature components and group them logically
  const signatureBlocks: string[] = [];
  let currentBlock = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Identify different types of signature lines
    const isClosing = line.match(/^(Best|Regards|Sincerely|Thanks),?\s*$/i);
    const isSeparator = line.match(/^_{3,}$/) || line.match(/^-{3,}$/);
    const isPersonName = line.match(/^[A-Z][a-z]+ [A-Z][a-z]+(\s+[A-Z][a-z]+)*$/);
    const isJobTitle = line.match(/^[A-Z][a-z]+(\s+([\w&|,]+\s*)+)*$/);
    const isCompany = line.match(/^[A-Z][a-zA-Z\s,&.]+,?\s+(LLC|Inc|Corp|Co|Ltd)?\.?$/);
    const isPhone = line.match(/^(M|T|P|Phone|Mobile):\s*\d{3}[-.]?\d{3}[-.]?\d{4}/);
    const isEmail = line.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
    const isWebsite = line.match(/^(www\.|https?:\/\/)/);
    const isLinkedIn = line.match(/Connect with me on LinkedIn/i);
    const isAddress = line.match(/^\d+.*?(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)/i);
    const isLegalNote = line.match(/^Confidentiality Note:/i);

    // Determine if this line should start a new block
    const shouldStartNewBlock = 
      (isClosing) || 
      (isSeparator) || 
      (isLegalNote) ||
      (isWebsite && currentBlock.includes('\n')) || // Website on its own if we already have content
      (currentBlock && isPersonName && !currentBlock.match(/^(Best|Regards|Sincerely|Thanks)/i)); // New person name (but not after a closing)

    if (shouldStartNewBlock && currentBlock.trim()) {
      signatureBlocks.push(currentBlock.trim());
      currentBlock = line;
    } else {
      // Always preserve line breaks for signature elements to maintain structure
      if (currentBlock) {
        // Most signature elements should be on separate lines for readability
        const shouldJoinWithSpace = 
          (!isPhone && !isEmail && !isWebsite && !isAddress && !isLinkedIn && !isSeparator &&
           !currentBlock.includes('\n') && // Only join if current block is still single line
           currentBlock.length + line.length < 60); // And combined length is reasonable

        if (shouldJoinWithSpace && isJobTitle && currentBlock.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)) {
          // Join job title with name on same line if both are short
          currentBlock += ' - ' + line;
        } else {
          currentBlock += '\n' + line;
        }
      } else {
        currentBlock = line;
      }
    }
  }

  if (currentBlock.trim()) {
    signatureBlocks.push(currentBlock.trim());
  }

  // Filter out pure separator blocks and empty blocks
  return signatureBlocks.filter(block => 
    block.trim().length > 0 && 
    !block.match(/^[_-]+$/)
  );
}

export function formatEmailBodyForDisplay(text: string): string[] {
  if (!text) return [];

  // Clean up the text
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!cleaned) return [];

  // Remove common email artifacts and clean up formatting
  const cleanedText = cleaned
    .replace(/^>+\s*/gm, '') // Remove quote markers
    .replace(/^\s*$/gm, '') // Remove lines that are only whitespace
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple line breaks to double breaks
    .trim();

  if (!cleanedText) return [];

  // Split into paragraphs on double line breaks
  let paragraphs = cleanedText
    .split(/\n\s*\n/)
    .map(paragraph => {
      // Join single line breaks within a paragraph with spaces, but preserve intentional formatting
      const lines = paragraph.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // If it looks like a structured list or has special formatting, preserve line breaks
      const hasStructuredContent = lines.some(line => 
        line.match(/^\s*[-*•]\s/) || // Bullet points
        line.match(/^\s*\d+\.\s/) || // Numbered lists
        line.match(/^\s*[A-Z][A-Z\s]+:\s*/) || // Headers like "IMPORTANT:"
        line.match(/^\s*\w+:\s*\S/) // Key-value pairs like "Date: 2025"
      );

      if (hasStructuredContent) {
        return lines.join('\n');
      } else {
        return lines.join(' ');
      }
    })
    .filter(paragraph => paragraph.length > 0);

  // Further split very long paragraphs that might contain multiple thoughts
  const finalParagraphs: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length > 500 && paragraph.includes('.')) {
      // Split on sentence boundaries for very long paragraphs
      const sentences = paragraph.split(/\.\s+/);
      let currentParagraph = '';
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i] + (i < sentences.length - 1 ? '.' : '');
        
        if (currentParagraph.length + sentence.length > 300 && currentParagraph.length > 0) {
          finalParagraphs.push(currentParagraph.trim());
          currentParagraph = sentence;
        } else {
          currentParagraph += (currentParagraph ? ' ' : '') + sentence;
        }
      }
      
      if (currentParagraph.trim()) {
        finalParagraphs.push(currentParagraph.trim());
      }
    } else {
      finalParagraphs.push(paragraph);
    }
  }

  return finalParagraphs;
}