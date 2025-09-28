import React from 'react';
import ReactMarkdown from 'react-markdown';
import './QuillEditor.css';

interface RichTextNoteProps {
  content: string;
  className?: string;
  maxHeight?: string;
}

const RichTextNote: React.FC<RichTextNoteProps> = ({
  content,
  className = '',
  maxHeight = 'max-h-none'
}) => {
  // Check if content is HTML (from React-Quill) or Markdown (legacy)
  const isHtmlContent = (text: string): boolean => {
    return /<[^>]+>/.test(text) && !text.includes('**') && !text.includes('##');
  };

  // Enhanced HTML to Markdown conversion for Salesforce notes
  const processContent = (text: string): string => {
    if (!text) return '';

    let processed = text
      // First preserve existing markdown formatting within HTML
      .replace(/\*\*(.*?)\*\*/g, '__BOLD_START__$1__BOLD_END__')
      .replace(/\*(.*?)\*/g, '__ITALIC_START__$1__ITALIC_END__')
      .replace(/####\s*(.*?)$/gm, '__H4_START__$1__H4_END__')
      .replace(/###\s*(.*?)$/gm, '__H3_START__$1__H3_END__')
      .replace(/##\s*(.*?)$/gm, '__H2_START__$1__H2_END__')
      .replace(/#\s*(.*?)$/gm, '__H1_START__$1__H1_END__')

      // Handle Salesforce span elements with inline styles
      .replace(/<span[^>]*style="[^"]*font-weight:\s*(bold|600|700)[^"]*"[^>]*>(.*?)<\/span>/gi, '**$2**')
      .replace(/<span[^>]*style="[^"]*text-decoration:\s*underline[^"]*"[^>]*>(.*?)<\/span>/gi, '__$1__')
      .replace(/<span[^>]*style="[^"]*font-style:\s*italic[^"]*"[^>]*>(.*?)<\/span>/gi, '*$1*')

      // Convert HTML formatting to markdown
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<strike[^>]*>(.*?)<\/strike>/gi, '~~$1~~')
      .replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~')

      // Handle lists with proper spacing and bullets
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n• $1')

      // Handle paragraphs - preserve spacing for readability
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n')

      // Handle line breaks
      .replace(/<br\s*\/?>/gi, '\n')

      // Remove remaining span tags (after processing styles)
      .replace(/<\/?span[^>]*>/gi, '')

      // Remove any other HTML tags
      .replace(/<[^>]*>/gi, '')

      // Restore markdown formatting
      .replace(/__BOLD_START__(.*?)__BOLD_END__/g, '**$1**')
      .replace(/__ITALIC_START__(.*?)__ITALIC_END__/g, '*$1*')
      .replace(/__H4_START__(.*?)__H4_END__/g, '#### $1')
      .replace(/__H3_START__(.*?)__H3_END__/g, '### $1')
      .replace(/__H2_START__(.*?)__H2_END__/g, '## $1')
      .replace(/__H1_START__(.*?)__H1_END__/g, '# $1')

      // Clean up formatting
      .replace(/\n{3,}/g, '\n\n') // Max 2 line breaks
      .replace(/^\n+|\n+$/g, '') // Remove leading/trailing breaks

      // Fix bullet point formatting - ensure each bullet is on its own line
      .replace(/([^\n])• /g, '$1\n• ') // Add newline before bullets that don't have one
      .replace(/• /g, '\n• ') // Each bullet starts on new line
      .replace(/^• /gm, '• ') // Ensure bullet spacing at line start
      .replace(/^-\s+/gm, '• ') // Convert hyphens to bullets
      .replace(/(\w)•(\w)/g, '$1\n• $2') // Split words stuck to bullets
      .replace(/••+/g, '•') // Remove duplicate bullets
      .replace(/\n\n•/g, '\n•') // Remove extra newlines before bullets

      // Clean up any remaining conversion artifacts
      .replace(/__[A-Z]+_START__|__[A-Z]+_END__/g, '')
      .replace(/H1_START|H1_END|H2_START|H2_END|H3_START|H3_END|H4_START|H4_END/g, '')
      .replace(/BOLD_START|BOLD_END|ITALIC_START|ITALIC_END/g, '')

      // Decode HTML entities
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x27;/gi, "'")

      // Fix corrupted HTML entities (like 20&____39)
      .replace(/&____39/gi, "'")
      .replace(/&____34/gi, '"')
      .replace(/&____(\d+);?/gi, (match, code) => {
        // Common HTML entity codes
        if (code === '39') return "'";
        if (code === '34') return '"';
        if (code === '38') return '&';
        if (code === '60') return '<';
        if (code === '62') return '>';
        return match; // Keep unknown codes as-is
      })

      // Fix other common corrupted patterns
      .replace(/&[_\s]*39[_\s]*/gi, "'")
      .replace(/&[_\s]*34[_\s]*/gi, '"')

      .trim();

    return processed;
  };

  // Determine content type and how to render
  const isHtml = isHtmlContent(content);
  const processedContent = isHtml ? content : processContent(content);

  // Check if content has rich formatting (for markdown)
  const hasRichFormatting = (text: string): boolean => {
    return /(\*\*.*?\*\*|\*.*?\*|•|^\d+\.\s|#{1,6}\s)/m.test(text) ||
           text.includes('\n');
  };

  const shouldUseMarkdown = !isHtml && hasRichFormatting(processedContent);

  return (
    <div className={`${className} ${maxHeight} overflow-y-auto`}>
      {isHtml ? (
        // Render HTML content directly (from React-Quill)
        <div
          className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-800 prose-strong:text-gray-900 prose-ul:text-gray-800 prose-li:text-gray-800 quill-content"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      ) : shouldUseMarkdown ? (
        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-800 prose-strong:text-gray-900 prose-ul:text-gray-800 prose-li:text-gray-800">
          <ReactMarkdown
            components={{
              // Enhanced styling for beautiful note display
              h1: ({ children }) => (
                <h1 className="text-lg font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-bold text-gray-900 mb-2 mt-4">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-bold text-blue-700 mb-2 mt-3">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-sm font-semibold text-blue-600 mb-1 mt-2">
                  {children}
                </h4>
              ),
              p: ({ children }) => (
                <p className="mb-2 last:mb-0 text-sm leading-relaxed text-gray-800">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 ml-0 space-y-1 list-none">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 ml-4 space-y-1 list-decimal">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-sm leading-relaxed text-gray-800 flex items-start py-1">
                  <span className="text-blue-500 mr-2 font-bold text-base leading-none mt-0.5">•</span>
                  <span className="flex-1">{children}</span>
                </li>
              ),
              strong: ({ children }) => (
                <strong className="font-bold text-gray-900 bg-blue-50 px-1 py-0.5 rounded">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="italic text-blue-700 font-medium">
                  {children}
                </em>
              ),
              del: ({ children }) => (
                <del className="line-through text-gray-500 bg-red-50 px-1 rounded">
                  {children}
                </del>
              ),
              code: ({ children }) => (
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-700">
                  {children}
                </code>
              ),
              // Handle links if any
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  {children}
                </a>
              ),
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="text-sm text-gray-800 break-words">
          {processedContent.split('\n').map((line, index) => {
            // Handle bullet points specially
            if (line.trim().startsWith('•')) {
              return (
                <div key={index} className="flex items-start py-1">
                  <span className="text-blue-500 mr-2 font-bold text-base leading-none mt-0.5">•</span>
                  <span className="flex-1">{line.trim().substring(1).trim()}</span>
                </div>
              );
            }
            // Regular lines
            return line.trim() ? (
              <div key={index} className="mb-1">
                {line}
              </div>
            ) : (
              <div key={index} className="mb-2"></div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RichTextNote;