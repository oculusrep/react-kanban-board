import React from 'react';
import ReactMarkdown from 'react-markdown';

interface RichTextNoteProps {
  content: string;
  className?: string;
  maxHeight?: string;
}

const RichTextNote: React.FC<RichTextNoteProps> = ({
  content,
  className = '',
  maxHeight = 'max-h-40'
}) => {
  // Clean and prepare content for display
  const processContent = (text: string): string => {
    if (!text) return '';

    // Convert common Salesforce/HTML formatting to markdown
    let processed = text
      // Convert HTML line breaks to markdown
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p><p>/gi, '\n\n')
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')

      // Convert HTML bold/italic to markdown
      .replace(/<b>(.*?)<\/b>/gi, '**$1**')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<i>(.*?)<\/i>/gi, '*$1*')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')

      // Convert HTML lists to markdown
      .replace(/<ul>/gi, '')
      .replace(/<\/ul>/gi, '')
      .replace(/<li>(.*?)<\/li>/gi, '• $1\n')
      .replace(/<ol>/gi, '')
      .replace(/<\/ol>/gi, '')

      // Remove other HTML tags but keep content
      .replace(/<[^>]*>/g, '')

      // Fix multiple line breaks
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return processed;
  };

  const processedContent = processContent(content);

  // Check if content has rich formatting
  const hasRichFormatting = (text: string): boolean => {
    return /(\*\*.*?\*\*|\*.*?\*|^•\s|^\d+\.\s|#{1,6}\s)/m.test(text) ||
           text.includes('\n');
  };

  const shouldUseMarkdown = hasRichFormatting(processedContent);

  return (
    <div className={`${className} ${maxHeight} overflow-y-auto`}>
      {shouldUseMarkdown ? (
        <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-800 prose-strong:text-gray-900 prose-ul:text-gray-800 prose-li:text-gray-800">
          <ReactMarkdown
            components={{
              // Custom styling for markdown elements
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="mb-2 ml-4 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="mb-2 ml-4 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="text-sm">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
              em: ({ children }) => <em className="italic text-gray-800">{children}</em>,
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
          {processedContent}
        </div>
      )}
    </div>
  );
};

export default RichTextNote;