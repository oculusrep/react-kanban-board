/**
 * SiteSubmitEmailTab - Email sending functionality for site submits
 *
 * Provides a button to prepare and send site submit emails to client contacts.
 * Uses the useSiteSubmitEmail hook for email generation and sending.
 */

import { useState } from 'react';
import { useSiteSubmitEmail } from '../../hooks/useSiteSubmitEmail';
import EmailComposerModal from '../EmailComposerModal';
import { SiteSubmitData } from './SiteSubmitSidebar';

interface SiteSubmitEmailTabProps {
  siteSubmit: SiteSubmitData;
}

export default function SiteSubmitEmailTab({ siteSubmit }: SiteSubmitEmailTabProps) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [preparing, setPreparing] = useState(false);

  const showToast = (message: string, options?: { type?: 'success' | 'error' | 'info'; duration?: number }) => {
    setToast({ message, type: options?.type || 'info' });
    setTimeout(() => setToast(null), options?.duration || 3000);
  };

  const {
    showEmailComposer,
    setShowEmailComposer,
    sendingEmail,
    emailDefaultData,
    prepareEmail,
    sendEmail,
  } = useSiteSubmitEmail({ showToast });

  const handlePrepareEmail = async () => {
    setPreparing(true);
    try {
      await prepareEmail(siteSubmit.id);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="p-4 flex-1 flex flex-col">
      {/* Toast notification */}
      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Email info section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Send Site Submit Email</h3>
        <p className="text-sm text-gray-600 mb-4">
          Send an email notification about this site submit to the client's site selectors.
          The email will include property details, links to the portal, and any attached files.
        </p>

        {/* Client info */}
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Client</span>
          </div>
          <p className="text-sm text-gray-900 ml-6">
            {siteSubmit.client?.client_name || 'No client assigned'}
          </p>
        </div>

        {/* Property info */}
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Property</span>
          </div>
          <p className="text-sm text-gray-900 ml-6">
            {siteSubmit.property?.property_name || 'Unnamed property'}
          </p>
          {siteSubmit.property?.address && (
            <p className="text-sm text-gray-500 ml-6">
              {siteSubmit.property.address}
              {siteSubmit.property.city && `, ${siteSubmit.property.city}`}
              {siteSubmit.property.state && `, ${siteSubmit.property.state}`}
            </p>
          )}
          {siteSubmit.property_unit && (
            <p className="text-sm text-blue-600 ml-6 mt-1">
              Unit: {siteSubmit.property_unit.property_unit_name}
            </p>
          )}
        </div>
      </div>

      {/* Send Email button */}
      <div className="mt-auto">
        <button
          onClick={handlePrepareEmail}
          disabled={preparing || !siteSubmit.client_id}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-white transition-colors ${
            preparing || !siteSubmit.client_id
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {preparing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Preparing Email...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>Compose Email to Site Selectors</span>
            </>
          )}
        </button>
        {!siteSubmit.client_id && (
          <p className="text-sm text-red-500 mt-2 text-center">
            A client must be assigned to send emails
          </p>
        )}
      </div>

      {/* Email history section (future enhancement) */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Email History
        </h4>
        <p className="text-sm text-gray-400 italic">
          Email history coming soon...
        </p>
      </div>

      {/* Email Composer Modal */}
      <EmailComposerModal
        isOpen={showEmailComposer}
        onClose={() => setShowEmailComposer(false)}
        onSend={(emailData) => sendEmail(siteSubmit.id, emailData)}
        defaultSubject={emailDefaultData.subject}
        defaultBody={emailDefaultData.body}
        defaultRecipients={emailDefaultData.recipients}
        templateData={emailDefaultData.templateData}
        availableFiles={emailDefaultData.availableFiles}
        sending={sendingEmail}
        title={`Email: ${siteSubmit.property?.property_name || 'Site Submit'}`}
      />
    </div>
  );
}
