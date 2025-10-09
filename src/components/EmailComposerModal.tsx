import React, { useState, useEffect, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Custom styles for the email editor
const editorStyles = `
  .email-editor-wrapper .quill {
    height: 400px;
    display: flex;
    flex-direction: column;
  }
  .email-editor-wrapper .ql-container {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .email-editor-wrapper .ql-editor {
    min-height: 100%;
  }
`;

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

export interface EmailData {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  htmlBody: string;
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
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setToRecipients(defaultRecipients && Array.isArray(defaultRecipients) ? defaultRecipients.map(c => c.email) : []);
      setCcRecipients(['mike@oculusrep.com', 'asantos@oculusrep.com']);
      setBccRecipients([]);
      setSubject(defaultSubject);
      setEmailBody(defaultBody);
      setShowPreview(false);
    }
  }, [isOpen, defaultRecipients, defaultSubject, defaultBody]);

  // Quill modules configuration
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link'],
      ['clean']
    ],
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'list', 'bullet',
    'align',
    'link'
  ];

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
        htmlBody: emailBody,
      });
      // Don't close immediately - let parent handle closing
      // onClose();
    } catch (error) {
      console.error('Error sending email:', error);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{editorStyles}</style>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
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
                <div dangerouslySetInnerHTML={{ __html: emailBody }} />
              </div>
            ) : (
              <div className="border border-gray-300 rounded-md email-editor-wrapper">
                <ReactQuill
                  theme="snow"
                  value={emailBody}
                  onChange={setEmailBody}
                  modules={modules}
                  formats={formats}
                  style={{ height: '400px' }}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center mt-24">
            <div className="text-sm text-gray-500">
              {toRecipients.length} recipient{toRecipients.length !== 1 ? 's' : ''}
              {ccRecipients.length > 0 && `, ${ccRecipients.length} CC`}
              {bccRecipients.length > 0 && `, ${bccRecipients.length} BCC`}
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
