/**
 * Bookkeeper Chat Panel
 *
 * Chat interface for conversing with the Bookkeeper Agent.
 * Displays message history with markdown rendering and journal entry previews.
 */

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, BookOpen, Lightbulb, Copy, Check } from 'lucide-react';
import type { BookkeeperMessage } from '../../types/bookkeeper';
import JournalEntryPreview from './JournalEntryPreview';

interface BookkeeperChatPanelProps {
  messages: BookkeeperMessage[];
  onSendMessage: (query: string) => Promise<void>;
  isLoading: boolean;
  onJournalEntryClick?: (draft: BookkeeperMessage['journal_entry_draft']) => void;
}

export default function BookkeeperChatPanel({
  messages,
  onSendMessage,
  isLoading,
  onJournalEntryClick,
}: BookkeeperChatPanelProps) {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showRememberModal, setShowRememberModal] = useState<string | null>(null);
  const [rememberNote, setRememberNote] = useState('');
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

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRemember = async (messageId: string) => {
    if (!rememberNote.trim()) return;
    await onSendMessage(`Remember this accounting rule: ${rememberNote}`);
    setShowRememberModal(null);
    setRememberNote('');
  };

  const suggestedQuestions = [
    "How do I record a line of credit payment with interest and principal?",
    "Where should I categorize marketing software expenses?",
    "Help me create a journal entry for Arty's commission draw",
    "How do I fix an expense posted to the wrong account?",
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-emerald-600 to-teal-600">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-white" />
          <h2 className="font-semibold text-white">Bookkeeper Agent</h2>
        </div>
        <p className="text-xs text-emerald-100 mt-0.5">QuickBooks accounting help and journal entries</p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <BookOpen className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-sm font-medium text-gray-600 mb-4">How can I help with your accounting today?</p>
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
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white px-4 py-2'
                      : 'bg-gray-100 text-gray-900 px-4 py-3'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="space-y-3">
                      <div className="prose prose-sm prose-gray max-w-none">
                        <ReactMarkdown
                          components={{
                            a: ({ ...props }) => (
                              <a className="text-emerald-600 hover:underline" {...props} />
                            ),
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

                      {/* Journal Entry Preview */}
                      {msg.journal_entry_draft && (
                        <div className="mt-3">
                          <JournalEntryPreview
                            draft={msg.journal_entry_draft}
                            onCreateInQBO={onJournalEntryClick ? () => onJournalEntryClick(msg.journal_entry_draft) : undefined}
                          />
                        </div>
                      )}

                      {/* Account Suggestions */}
                      {msg.account_suggestions && msg.account_suggestions.length > 0 && (
                        <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                          <p className="text-xs font-medium text-emerald-700 mb-2">Suggested Accounts:</p>
                          <div className="space-y-1">
                            {msg.account_suggestions.map((acct, idx) => (
                              <div key={idx} className="text-sm text-emerald-800">
                                <span className="font-medium">{acct.account_name}</span>
                                <span className="text-emerald-600 ml-2">({acct.account_type})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 pt-2 border-t border-gray-200">
                        <button
                          onClick={() => {
                            setShowRememberModal(msg.id);
                            setRememberNote('');
                          }}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors disabled:opacity-50"
                          title="Save an accounting rule to remember"
                        >
                          <Lightbulb className="h-3.5 w-3.5" />
                          Remember Rule
                        </button>
                        <button
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-green-500">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>

                      {/* Remember Modal */}
                      {showRememberModal === msg.id && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs text-amber-700 mb-2">What accounting rule should I remember?</p>
                          <textarea
                            value={rememberNote}
                            onChange={(e) => setRememberNote(e.target.value)}
                            placeholder="e.g., Always use account 5200 for referral fees"
                            className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => setShowRememberModal(null)}
                              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleRemember(msg.id)}
                              disabled={!rememberNote.trim() || isLoading}
                              className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
                            >
                              Save Rule
                            </button>
                          </div>
                        </div>
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
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-white" />
                </div>
                <div className="bg-gray-100 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm text-gray-500">Checking the books...</span>
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
            placeholder="Ask about accounting, journal entries, categorization..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
