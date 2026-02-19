import React, { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface EmailComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (data: EmailData) => Promise<void>;
  defaultSubject: string;
  defaultBody: string;
  defaultRecipients: Contact[];
  siteSubmitName: string;
}

export interface Attachment {
  filename: string;
  content: string; // Base64 encoded
  content_type: string;
}

export interface EmailData {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  htmlBody: string;
  attachments?: Attachment[];
}

// TipTap Toolbar Component
const MenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Italic"
      >
        <em>I</em>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('underline') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Underline"
      >
        <u>U</u>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('strike') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Strikethrough"
      >
        <s>S</s>
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Heading"
      >
        H
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Bullet List"
      >
        •
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Numbered List"
      >
        1.
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive({ textAlign: 'left' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Align Left"
      >
        ⫷
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive({ textAlign: 'center' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Align Center"
      >
        ≡
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive({ textAlign: 'right' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Align Right"
      >
        ⫸
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

      <button
        onClick={() => {
          const url = window.prompt('Enter URL:');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('link') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Add Link"
      >
        🔗
      </button>
      <button
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive('link')}
        className="px-2 py-1 text-sm rounded hover:bg-gray-200 disabled:opacity-40"
        title="Remove Link"
      >
        ⛓️‍💥
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

      <button
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()}
        className="px-2 py-1 text-sm rounded hover:bg-gray-200"
        title="Insert Table"
      >
        📊
      </button>
      {editor.isActive('table') && (
        <>
          <button
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-2 py-1 text-sm rounded hover:bg-gray-200"
            title="Add Column"
          >
            +Col
          </button>
          <button
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-2 py-1 text-sm rounded hover:bg-gray-200"
            title="Add Row"
          >
            +Row
          </button>
          <button
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-2 py-1 text-sm rounded hover:bg-gray-200 text-red-600"
            title="Delete Table"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
};

const EmailComposerModal: React.FC<EmailComposerModalProps> = ({
  isOpen,
  onClose,
  onSend,
  defaultSubject,
  defaultBody,
  defaultRecipients,
  siteSubmitName,
}) => {
  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>(['mike@oculusrep.com', 'asantos@oculusrep.com']);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[350px] p-4',
      },
    },
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setToRecipients(defaultRecipients && Array.isArray(defaultRecipients) ? defaultRecipients.map(c => c.email) : []);
      setCcRecipients(['mike@oculusrep.com', 'asantos@oculusrep.com']);
      setBccRecipients([]);
      setSubject(defaultSubject);
      setShowPreview(false);
      setAttachments([]);

      // Set editor content
      if (editor) {
        editor.commands.setContent(defaultBody);
      }
    }
  }, [isOpen, defaultRecipients, defaultSubject, defaultBody, editor]);

  const handleAddRecipient = (type: 'to' | 'cc' | 'bcc', email: string) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) return;

    if (type === 'to' && !toRecipients.includes(trimmedEmail)) {
      setToRecipients([...toRecipients, trimmedEmail]);
    } else if (type === 'cc' && !ccRecipients.includes(trimmedEmail)) {
      setCcRecipients([...ccRecipients, trimmedEmail]);
    } else if (type === 'bcc' && !bccRecipients.includes(trimmedEmail)) {
      setBccRecipients([...bccRecipients, trimmedEmail]);
    }
  };

  const handleRemoveRecipient = (type: 'to' | 'cc' | 'bcc', email: string) => {
    if (type === 'to') {
      setToRecipients(toRecipients.filter(e => e !== email));
    } else if (type === 'cc') {
      setCcRecipients(ccRecipients.filter(e => e !== email));
    } else if (type === 'bcc') {
      setBccRecipients(bccRecipients.filter(e => e !== email));
    }
  };

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];
    const maxSize = 40 * 1024 * 1024; // 40MB limit for Gmail

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.size > maxSize) {
        alert(`File ${file.name} is too large. Maximum size is 40MB.`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        newAttachments.push({
          filename: file.name,
          content: base64,
          content_type: file.type || 'application/octet-stream',
        });
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
        alert(`Failed to read file ${file.name}`);
      }
    }

    setAttachments([...attachments, ...newAttachments]);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove data URL prefix to get just the base64 string
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to read file as base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getEmailBody = useCallback(() => {
    if (!editor) return '';
    return editor.getHTML();
  }, [editor]);

  const handleSend = async () => {
    if (toRecipients.length === 0) {
      alert('Please add at least one recipient');
      return;
    }

    if (!subject.trim()) {
      alert('Please enter a subject line');
      return;
    }

    setSending(true);
    try {
      await onSend({
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        htmlBody: getEmailBody(),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } catch (error) {
      console.error('Error sending email:', error);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .email-editor-wrapper .ProseMirror {
          min-height: 350px;
          max-height: 400px;
          overflow-y: auto;
        }
        .email-editor-wrapper .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 0;
        }
        .email-editor-wrapper .ProseMirror td,
        .email-editor-wrapper .ProseMirror th {
          border: 1px solid #ccc;
          padding: 8px;
          vertical-align: top;
        }
        .email-editor-wrapper .ProseMirror th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .email-editor-wrapper .ProseMirror p {
          margin: 0 0 0.5em 0;
        }
        .email-editor-wrapper .ProseMirror a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-visible shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                Email Site Selectors - {siteSubmitName}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Email Composer */}
          <div className="bg-white px-6 py-4 max-h-[70vh] overflow-y-auto">
            {/* To Field */}
            <RecipientField
              label="To"
              recipients={toRecipients}
              onAdd={(email) => handleAddRecipient('to', email)}
              onRemove={(email) => handleRemoveRecipient('to', email)}
            />

            {/* CC Field */}
            <RecipientField
              label="Cc"
              recipients={ccRecipients}
              onAdd={(email) => handleAddRecipient('cc', email)}
              onRemove={(email) => handleRemoveRecipient('cc', email)}
            />

            {/* BCC Field */}
            <RecipientField
              label="Bcc"
              recipients={bccRecipients}
              onAdd={(email) => handleAddRecipient('bcc', email)}
              onRemove={(email) => handleRemoveRecipient('bcc', email)}
            />

            {/* Subject */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                placeholder="Email subject..."
              />
            </div>

            {/* Attachments */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attachments
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="sr-only"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Attach Files
                </label>
                <span className="text-xs text-gray-500">Max 40MB per email</span>
              </div>

              {/* Attached Files List */}
              {attachments.length > 0 && (
                <div className="mt-2 space-y-2">
                  {attachments.map((attachment, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm text-gray-700 truncate">{attachment.filename}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          ({formatFileSize(Math.round(attachment.content.length * 0.75))})
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveAttachment(index)}
                        className="ml-2 text-red-600 hover:text-red-800"
                        title="Remove attachment"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview/Edit Toggle */}
            <div className="mb-2 flex items-center space-x-2">
              <button
                onClick={() => setShowPreview(false)}
                className={`px-3 py-1 text-sm rounded-md ${!showPreview ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
              >
                Edit
              </button>
              <button
                onClick={() => setShowPreview(true)}
                className={`px-3 py-1 text-sm rounded-md ${showPreview ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
              >
                Preview
              </button>
            </div>

            {/* Email Body Editor / Preview */}
            {showPreview ? (
              <div className="border border-gray-300 rounded-md p-4 bg-white min-h-[400px] max-h-[500px] overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: getEmailBody() }} />
              </div>
            ) : (
              <div className="border border-gray-300 rounded-md email-editor-wrapper">
                <MenuBar editor={editor} />
                <EditorContent editor={editor} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              {toRecipients.length} recipient{toRecipients.length !== 1 ? 's' : ''}
              {ccRecipients.length > 0 && `, ${ccRecipients.length} CC`}
              {bccRecipients.length > 0 && `, ${bccRecipients.length} BCC`}
              {attachments.length > 0 && `, ${attachments.length} attachment${attachments.length !== 1 ? 's' : ''}`}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={sending}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || toRecipients.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

// Recipient Field Component
interface RecipientFieldProps {
  label: string;
  recipients: string[];
  onAdd: (email: string) => void;
  onRemove: (email: string) => void;
}

const RecipientField: React.FC<RecipientFieldProps> = ({ label, recipients, onAdd, onRemove }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      if (inputValue.trim()) {
        onAdd(inputValue);
        setInputValue('');
      }
    }
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md min-h-[42px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        {recipients.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
          >
            {email}
            <button
              onClick={() => onRemove(email)}
              className="text-blue-600 hover:text-blue-800 ml-1"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) {
              onAdd(inputValue);
              setInputValue('');
            }
          }}
          className="flex-1 min-w-[200px] border-none outline-none text-sm"
          placeholder={recipients.length === 0 ? `Enter ${label.toLowerCase()} email addresses...` : ''}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">Press Enter, comma, or space to add multiple emails</p>
    </div>
  );
};

export default EmailComposerModal;
