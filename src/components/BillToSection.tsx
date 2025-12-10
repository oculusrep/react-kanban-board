import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Deal, Broker, CommissionSplit } from '../lib/types';
import { supabase } from '../lib/supabaseClient';
import { prepareUpdate } from '../lib/supabaseHelpers';

interface BillToSectionProps {
  deal: Deal;
  commissionSplits: CommissionSplit[];
  brokers: Broker[];
  onDealUpdate: (updates: Partial<Deal>) => Promise<void>;
}

const DEFAULT_BCC_EMAIL = 'mike@oculusrep.com';

const BillToSection: React.FC<BillToSectionProps> = ({
  deal,
  commissionSplits,
  brokers,
  onDealUpdate
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const lastDealIdRef = useRef<string | null>(null);

  // Local form state
  const [billToCompany, setBillToCompany] = useState(deal.bill_to_company_name || '');
  const [billToContact, setBillToContact] = useState(deal.bill_to_contact_name || '');
  const [billToEmails, setBillToEmails] = useState(deal.bill_to_email || '');
  const [billToCcEmails, setBillToCcEmails] = useState(deal.bill_to_cc_emails || '');
  const [billToBccEmails, setBillToBccEmails] = useState(deal.bill_to_bcc_emails || DEFAULT_BCC_EMAIL);

  // Calculate default CC emails from deal team members (brokers on commission splits)
  // Get email from broker.email or broker.user.email (linked user account)
  const defaultCcEmails = useMemo(() => {
    const brokerIds = commissionSplits.map(cs => cs.broker_id);
    const teamEmails = brokers
      .filter(b => brokerIds.includes(b.id))
      .map(b => {
        // Try broker's direct email first, then fall back to linked user's email
        const brokerEmail = b.email;
        const userEmail = (b as any).user?.email;
        return brokerEmail || userEmail || null;
      })
      .filter((email): email is string => !!email && email.toLowerCase() !== DEFAULT_BCC_EMAIL.toLowerCase());

    return teamEmails.join(', ');
  }, [commissionSplits, brokers]);

  // Initialize form state when deal changes or on first load
  useEffect(() => {
    // Only re-initialize if the deal ID changed
    if (lastDealIdRef.current === deal.id) {
      return;
    }
    lastDealIdRef.current = deal.id;

    setBillToCompany(deal.bill_to_company_name || '');
    setBillToContact(deal.bill_to_contact_name || '');
    setBillToEmails(deal.bill_to_email || '');
    setBillToCcEmails(deal.bill_to_cc_emails || '');
    setBillToBccEmails(deal.bill_to_bcc_emails || DEFAULT_BCC_EMAIL);
    initializedRef.current = false;
  }, [deal.id, deal.bill_to_company_name, deal.bill_to_contact_name, deal.bill_to_email, deal.bill_to_cc_emails, deal.bill_to_bcc_emails]);

  // Auto-populate CC with team emails if empty (only once when data is loaded)
  useEffect(() => {
    if (initializedRef.current) return;
    if (!deal.id || !defaultCcEmails) return;

    // Only auto-populate if:
    // 1. CC emails field is empty in the database
    // 2. There are team members with emails
    // 3. Component hasn't already initialized
    if (!deal.bill_to_cc_emails && defaultCcEmails && commissionSplits.length > 0) {
      initializedRef.current = true;
      setBillToCcEmails(defaultCcEmails);
      // Save to database silently
      saveFieldSilently('bill_to_cc_emails', defaultCcEmails);
    } else {
      initializedRef.current = true;
    }
  }, [deal.id, deal.bill_to_cc_emails, defaultCcEmails, commissionSplits.length]);

  // Save field without updating parent state (prevents re-render flickering)
  const saveFieldSilently = async (field: string, value: string) => {
    if (!deal.id) return;

    try {
      const { error } = await supabase
        .from('deal')
        .update(prepareUpdate({ [field]: value || null }))
        .eq('id', deal.id);

      if (error) {
        console.error(`Error saving ${field}:`, error);
      }
    } catch (err) {
      console.error(`Error saving ${field}:`, err);
    }
  };

  // Save individual field with visual feedback
  const handleSaveField = async (field: string, value: string, currentDbValue: string | null | undefined) => {
    if (!deal.id) return;

    // Skip save if value hasn't changed
    if (value === (currentDbValue || '')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('deal')
        .update(prepareUpdate({ [field]: value || null }))
        .eq('id', deal.id);

      if (error) throw error;

      setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(`Error saving ${field}:`, err);
    } finally {
      setSaving(false);
    }
  };

  // Handle blur - save only if changed
  const handleBlur = (field: string, value: string, currentDbValue: string | null | undefined) => {
    handleSaveField(field, value, currentDbValue);
  };

  // Manual populate CC button
  const handlePopulateCc = () => {
    if (defaultCcEmails) {
      setBillToCcEmails(defaultCcEmails);
      handleSaveField('bill_to_cc_emails', defaultCcEmails, deal.bill_to_cc_emails);
    }
  };

  // Ensure BCC always has mike@oculusrep.com
  const handleEnsureBcc = () => {
    let bcc = billToBccEmails.trim();
    if (!bcc.toLowerCase().includes(DEFAULT_BCC_EMAIL.toLowerCase())) {
      bcc = bcc ? `${bcc}, ${DEFAULT_BCC_EMAIL}` : DEFAULT_BCC_EMAIL;
      setBillToBccEmails(bcc);
      handleSaveField('bill_to_bcc_emails', bcc, deal.bill_to_bcc_emails);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header - Collapsible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-gray-700">Invoice Bill-To Information</span>
          <span className="text-xs text-gray-500">(for QuickBooks)</span>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-blue-600">Saving...</span>
          )}
          {lastSaved && !saving && (
            <span className="text-xs text-gray-400">Saved {lastSaved}</span>
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Bill-To Company and Contact - Side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bill-To Company
              </label>
              <input
                type="text"
                value={billToCompany}
                onChange={(e) => setBillToCompany(e.target.value)}
                onBlur={() => handleBlur('bill_to_company_name', billToCompany, deal.bill_to_company_name)}
                placeholder="e.g., Fuqua Development"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                The company name that will appear on the invoice
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bill-To Contact Name
              </label>
              <input
                type="text"
                value={billToContact}
                onChange={(e) => setBillToContact(e.target.value)}
                onBlur={() => handleBlur('bill_to_contact_name', billToContact, deal.bill_to_contact_name)}
                placeholder="e.g., Jim Ackerman"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Contact person for invoices
              </p>
            </div>
          </div>

          {/* Email Recipients */}
          <div className="space-y-4">
            {/* Primary TO emails */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Email(s) - TO
              </label>
              <input
                type="text"
                value={billToEmails}
                onChange={(e) => setBillToEmails(e.target.value)}
                onBlur={() => handleBlur('bill_to_email', billToEmails, deal.bill_to_email)}
                placeholder="e.g., jim@company.com, accounting@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Comma-separated list of primary recipients
              </p>
            </div>

            {/* CC emails */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  CC Email(s)
                </label>
                {defaultCcEmails && billToCcEmails !== defaultCcEmails && (
                  <button
                    type="button"
                    onClick={handlePopulateCc}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    + Add deal team emails
                  </button>
                )}
              </div>
              <input
                type="text"
                value={billToCcEmails}
                onChange={(e) => setBillToCcEmails(e.target.value)}
                onBlur={() => handleBlur('bill_to_cc_emails', billToCcEmails, deal.bill_to_cc_emails)}
                placeholder="e.g., broker1@company.com, broker2@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              {defaultCcEmails && (
                <p className="mt-1 text-xs text-gray-500">
                  Deal team: {defaultCcEmails}
                </p>
              )}
            </div>

            {/* BCC emails */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  BCC Email(s)
                </label>
                {!billToBccEmails.toLowerCase().includes(DEFAULT_BCC_EMAIL.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={handleEnsureBcc}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    + Add {DEFAULT_BCC_EMAIL}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={billToBccEmails}
                onChange={(e) => setBillToBccEmails(e.target.value)}
                onBlur={() => handleBlur('bill_to_bcc_emails', billToBccEmails, deal.bill_to_bcc_emails)}
                placeholder={DEFAULT_BCC_EMAIL}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Always include {DEFAULT_BCC_EMAIL} for records
              </p>
            </div>
          </div>

          {/* Info box about QuickBooks */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium">QuickBooks Invoice Setup</p>
                <p className="mt-1 text-blue-700">
                  This information is used when syncing invoices to QuickBooks. The Bill-To Company appears as the billing entity on the invoice,
                  while the Client name ({deal.client_id ? 'linked' : 'not linked'}) is used for customer tracking in QBO.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillToSection;
