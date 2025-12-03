import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import DealDetailsForm from './DealDetailsForm';
import CommissionTab from './CommissionTab';
import PaymentTab from './PaymentTab';
import ActivityTab from './ActivityTab';
import FileManager from './FileManager/FileManager';
import SlideOutPanel from './SlideOutPanel';

interface Deal {
  id: string;
  deal_name: string;
  client_id: string | null;
  assignment_id: string | null;
  source: string | null;
  transaction_type_id: string | null;
  property_id: string | null;
  site_submit_id: string | null;
  property_unit_id: string | null;
  property_type_id: string | null;
  size_sqft: number | null;
  size_acres: number | null;
  representation_id: string | null;
  owner_id: string | null;
  deal_team_id: string | null;
  deal_value: number | null;
  commission_percent: number | null;
  flat_fee_override: number | null;
  fee: number | null;
  house_percent: number | null;
  origination_percent: number | null;
  site_percent: number | null;
  deal_percent: number | null;
  number_of_payments: number | null;
  stage_id: string;
  probability: number | null;
  target_close_date: string | null;
  loi_signed_date: string | null;
  contract_signed_date: string | null;
  booked_date: string | null;
  closed_date: string | null;
  booked: boolean | null;
  loss_reason: string | null;
  last_stage_change_at: string | null;
  updated_by_id?: string | null;
  updated_at?: string | null;
}

interface DealDetailsSlideoutProps {
  dealId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDealUpdated?: () => void;
  initialTab?: 'overview' | 'commission' | 'payments' | 'activity' | 'files';
}

export default function DealDetailsSlideout({
  dealId,
  isOpen,
  onClose,
  onDealUpdated,
  initialTab = 'overview'
}: DealDetailsSlideoutProps) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (dealId && isOpen) {
      fetchDeal();
      setActiveTab(initialTab);
    }
  }, [dealId, isOpen, initialTab]);

  const fetchDeal = async () => {
    if (!dealId) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('deal')
        .select('*')
        .eq('id', dealId)
        .single();

      if (fetchError) throw fetchError;
      if (!data) throw new Error('Deal not found');

      setDeal(data as Deal);
    } catch (err) {
      console.error('Error fetching deal:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deal');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (updatedDeal: Deal) => {
    setDeal(updatedDeal);
    if (onDealUpdated) {
      onDealUpdated();
    }
  };

  const handleAsyncDealUpdate = async () => {
    // Refetch the deal to get latest data
    if (dealId) {
      await fetchDeal();
      if (onDealUpdated) {
        onDealUpdated();
      }
    }
  };

  return (
    <SlideOutPanel
      isOpen={isOpen}
      onClose={onClose}
      title={deal?.deal_name || 'Deal Details'}
      width="45%"
      canMinimize={true}
    >
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Error loading deal</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && deal && (
        <>
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('commission')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'commission'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Commission
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'payments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Payments
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'activity'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Activity
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'files'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Files
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="px-6 py-4">
            {activeTab === 'overview' && (
              <DealDetailsForm
                deal={deal}
                onSave={handleSave}
              />
            )}

            {activeTab === 'commission' && (
              <CommissionTab
                dealId={deal.id}
                deal={deal}
                onDealUpdate={handleAsyncDealUpdate}
                onSwitchToPayments={() => setActiveTab('payments')}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentTab
                deal={deal}
                onDealUpdate={handleAsyncDealUpdate}
              />
            )}

            {activeTab === 'activity' && (
              <ActivityTab dealId={deal.id} />
            )}

            {activeTab === 'files' && (
              <FileManager
                entityType="deal"
                entityId={deal.id}
                entityName={deal.deal_name}
              />
            )}
          </div>
        </>
      )}
    </SlideOutPanel>
  );
}
