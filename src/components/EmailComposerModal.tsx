import React, { useState, useEffect } from 'react';

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
  const [customNote, setCustomNote] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setToRecipients(defaultRecipients && Array.isArray(defaultRecipients) ? defaultRecipients.map(c => c.email) : []);
      setCcRecipients(['mike@oculusrep.com', 'asantos@oculusrep.com']);
      setBccRecipients([]);
      setSubject(defaultSubject);
      setCustomNote('');
      setAttachments([]);
    }
  }, [isOpen, defaultRecipients, defaultSubject]);

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

  // Build final HTML body with custom note prepended if present
  const getFinalHtmlBody = (): string => {
    if (!customNote.trim()) {
      return defaultBody;
    }

    // Wrap custom note in styled paragraph and add it before the template
    const noteHtml = `<p style="font-size: 15px; color: #1e293b; margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-left: 4px solid #2563eb; border-radius: 4px;">${customNote.replace(/\n/g, '<br>')}</p>`;
    return noteHtml + defaultBody;
  };

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
        htmlBody: getFinalHtmlBody(),
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

            {/* Custom Note (optional) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Note <span className="text-gray-400 font-normal">(optional - appears at top of email)</span>
              </label>
              <textarea
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                rows={3}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                placeholder="Add a personal note that will appear before the property details..."
              />
            </div>

            {/* Email Preview */}
            <div className="mb-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Preview
              </label>
              <p className="text-xs text-gray-500 mb-2">
                This is exactly how the email will appear to recipients
              </p>
            </div>
            <div className="border border-gray-300 rounded-md p-4 bg-white min-h-[300px] max-h-[400px] overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: getFinalHtmlBody() }} />
            </div>
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
