/**
 * CFO Chat Panel
 *
 * Chat interface for conversing with the CFO Agent.
 * Displays message history with markdown rendering and handles user input.
 */

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, BarChart3 } from 'lucide-react';
import type { CFOMessage } from '../../types/cfo';

interface CFOChatPanelProps {
  messages: CFOMessage[];
  onSendMessage: (query: string) => Promise<void>;
  isLoading: boolean;
  onChartClick?: (chartSpec: CFOMessage['chart_spec']) => void;
}

export default function CFOChatPanel({
  messages,
  onSendMessage,
  isLoading,
  onChartClick,
}: CFOChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    setInput('');
    await onSendMessage(trimmedInput);
  };

  const suggestedQuestions = [
    "What will the house balance be for the next 6 months?",
    "How are we tracking against budget this month?",
    "Show me our accounts receivable aging",
    "What's our projected cash flow for Q2?",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-white" />
          <h2 className="font-semibold text-white">CFO Agent</h2>
        </div>
        <p className="text-xs text-blue-100 mt-0.5">Ask questions about finances and get instant analysis</p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <Bot className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-sm font-medium text-gray-600 mb-4">How can I help you today?</p>
            <div className="space-y-2 w-full max-w-md">
              {suggestedQuestions.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInput(question);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white px-4 py-2'
                      : 'bg-gray-100 text-gray-900 px-4 py-3'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="space-y-3">
                      <div className="prose prose-sm prose-gray max-w-none">
                        <ReactMarkdown
                          components={{
                            // Style links
                            a: ({ ...props }) => (
                              <a className="text-blue-600 hover:underline" {...props} />
                            ),
                            // Style code blocks
                            code: ({ className, children, ...props }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className="bg-gray-200 px-1 py-0.5 rounded text-sm" {...props}>
                                  {children}
                                </code>
                              ) : (
                                <code className="block bg-gray-800 text-gray-100 p-3 rounded-lg overflow-x-auto" {...props}>
                                  {children}
                                </code>
                              );
                            },
                            // Style tables
                            table: ({ ...props }) => (
                              <table className="min-w-full divide-y divide-gray-200 text-sm" {...props} />
                            ),
                            th: ({ ...props }) => (
                              <th className="px-2 py-1 text-left font-medium text-gray-700 bg-gray-50" {...props} />
                            ),
                            td: ({ ...props }) => (
                              <td className="px-2 py-1 border-t" {...props} />
                            ),
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>

                      {/* Chart indicator */}
                      {msg.chart_spec && onChartClick && (
                        <button
                          onClick={() => onChartClick(msg.chart_spec)}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <BarChart3 className="h-4 w-4" />
                          View Chart: {msg.chart_spec.title}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-4 w-4 text-gray-600" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-gray-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm text-gray-500">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t bg-white p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about finances..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
