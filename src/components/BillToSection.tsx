import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Broker, CommissionSplit } from '../lib/types';
import { supabase } from '../lib/supabaseClient';
import { prepareUpdate } from '../lib/supabaseHelpers';

interface BillToSectionProps {
  dealId: string;
  clientId?: string;
  commissionSplits: CommissionSplit[];
  brokers: Broker[];
}

const DEFAULT_BCC_EMAIL = 'mike@oculusrep.com';

// Bill-to fields we manage locally
interface BillToData {
  bill_to_company_name: string;
  bill_to_contact_name: string;
  bill_to_email: string;
  bill_to_cc_emails: string;
  bill_to_bcc_emails: string;
}

const BillToSection: React.FC<BillToSectionProps> = ({
  dealId,
  clientId,
  commissionSplits,
  brokers
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedForDealId = useRef<string | null>(null);

  // Local form state - fetched independently from DB
  const [billToCompany, setBillToCompany] = useState('');
  const [billToContact, setBillToContact] = useState('');
  const [billToEmails, setBillToEmails] = useState('');
  const [billToCcEmails, setBillToCcEmails] = useState('');
  const [billToBccEmails, setBillToBccEmails] = useState('');

  // Calculate default CC emails from deal team members
  const defaultCcEmails = useMemo(() => {
    const brokerIds = commissionSplits.map(cs => cs.broker_id);
    const teamEmails = brokers
      .filter(b => brokerIds.includes(b.id) && b.email)
      .map(b => b.email!);
    return teamEmails.join(', ');
  }, [commissionSplits, brokers]);

  // Fetch bill-to data directly from DB - completely independent of parent's deal state
  const fetchBillToData = useCallback(async () => {
    if (!dealId || fetchedForDealId.current === dealId) return;

    fetchedForDealId.current = dealId;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('deal')
        .select('bill_to_company_name, bill_to_contact_name, bill_to_email, bill_to_cc_emails, bill_to_bcc_emails')
        .eq('id', dealId)
        .single();

      if (error) throw error;

      if (data) {
        setBillToCompany(data.bill_to_company_name || '');
        setBillToContact(data.bill_to_contact_name || '');
        setBillToEmails(data.bill_to_email || '');
        setBillToCcEmails(data.bill_to_cc_emails || '');
        setBillToBccEmails(data.bill_to_bcc_emails || DEFAULT_BCC_EMAIL);
      }
    } catch (err) {
      console.error('Error fetching bill-to data:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  // Fetch on mount and when dealId changes
  useEffect(() => {
    fetchBillToData();
  }, [fetchBillToData]);

  // Save field on blur - direct DB update, no parent involvement
  const handleBlur = useCallback(async (field: string, value: string) => {
    if (!dealId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('deal')
        .update(prepareUpdate({ [field]: value || null }))
        .eq('id', dealId);

      if (error) throw error;
      setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(`Error saving ${field}:`, err);
    } finally {
      setSaving(false);
    }
  }, [dealId]);

  // Manual populate CC button
  const handlePopulateCc = async () => {
    if (defaultCcEmails) {
      setBillToCcEmails(defaultCcEmails);
      await handleBlur('bill_to_cc_emails', defaultCcEmails);
    }
  };

  // Add default BCC
  const handleEnsureBcc = async () => {
    let bcc = billToBccEmails.trim();
    if (!bcc.toLowerCase().includes(DEFAULT_BCC_EMAIL.toLowerCase())) {
      bcc = bcc ? `${bcc}, ${DEFAULT_BCC_EMAIL}` : DEFAULT_BCC_EMAIL;
      setBillToBccEmails(bcc);
      await handleBlur('bill_to_bcc_emails', bcc);
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
                onBlur={() => handleBlur('bill_to_company_name', billToCompany)}
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
                onBlur={() => handleBlur('bill_to_contact_name', billToContact)}
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
                onBlur={() => handleBlur('bill_to_email', billToEmails)}
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
                {defaultCcEmails && (
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
                onBlur={() => handleBlur('bill_to_cc_emails', billToCcEmails)}
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
                onBlur={() => handleBlur('bill_to_bcc_emails', billToBccEmails)}
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
                  while the Client name ({clientId ? 'linked' : 'not linked'}) is used for customer tracking in QBO.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple memo - only re-render when dealId, commissionSplits, or brokers change
export default React.memo(BillToSection);
