// src/pages/DealDetailsPage.tsx
import { useParams, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DealDetailsForm from "../components/DealDetailsForm";
import { FloatingPanelManager } from "../components/FloatingPanelManager";
import { FloatingPanelContainer } from "../components/FloatingPanelContainer";
import { FloatingContactPanel } from "../components/FloatingContactPanel";
import { useDealContacts } from "../hooks/useDealContacts";
import CommissionTab from '../components/CommissionTab';
import PaymentTab from '../components/PaymentTab';
import DealHeaderBar from '../components/DealHeaderBar';

export default function DealDetailsPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const location = useLocation();
  const [deal, setDeal] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isNewDeal, setIsNewDeal] = useState(false);
  
  console.log('DealDetailsPage - location:', location.pathname, 'dealId from params:', dealId);
  
  // Fallback: if dealId is undefined but pathname is /deal/new, treat as new deal
  const actualDealId = dealId || (location.pathname === '/deal/new' ? 'new' : undefined);
  
  // Get contact count for the floating button badge (only for existing deals)
  const { contacts } = useDealContacts(actualDealId && actualDealId !== 'new' ? actualDealId : null);

  useEffect(() => {
    const fetchDeal = async () => {
      if (actualDealId === 'new') {
        console.log('Creating new blank deal...');
        // Create a blank deal object for new deals
        const blankDeal = {
          id: null,
          deal_name: '',
          client_id: null,
          property_id: null,
          deal_stage_id: null,
          sf_broker: '',
          sf_address: '',
          sf_close_date: null,
          sf_contract_date: null,
          sf_list_date: null,
          deal_side: null,
          commission_rate: null,
          gross_commission: null,
          net_commission: null,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        console.log('Blank deal created:', blankDeal);
        setDeal(blankDeal);
        setIsNewDeal(true);
        return;
      }

      console.log('Fetching existing deal with ID:', actualDealId);
      const { data, error } = await supabase
        .from("deal")
        .select("*")
        .eq("id", actualDealId)
        .single();

      if (error) {
        console.error('Error fetching deal:', error);
      } else if (data) {
        console.log('Existing deal loaded:', data);
        setDeal(data);
        setIsNewDeal(false);
      }
    };

    console.log('DealDetailsPage useEffect - actualDealId:', actualDealId, 'type:', typeof actualDealId);
    
    if (actualDealId) {
      console.log('DealDetailsPage useEffect triggered with actualDealId:', actualDealId);
      fetchDeal();
    } else {
      console.log('No actualDealId provided - this should not happen for deal routes');
    }
  }, [actualDealId]);

  // Shared function to update deal state - used by Overview, Commission, and Payment tabs
  const handleDealUpdate = (updatedDeal: any) => {
    setDeal(updatedDeal);
    // If this was a new deal that just got saved, update the URL and state
    if (isNewDeal && updatedDeal.id) {
      setIsNewDeal(false);
      // Optional: Update URL to the new deal ID
      // window.history.replaceState(null, '', `/deal/${updatedDeal.id}`);
    }
  };

  // Handle Payment Tab's async update pattern
  const handleAsyncDealUpdate = async (updates: Partial<any>): Promise<void> => {
    const updatedDeal = { ...deal, ...updates };
    setDeal(updatedDeal);
    // If this was a new deal that just got saved, update the state
    if (isNewDeal && updatedDeal.id) {
      setIsNewDeal(false);
    }
    return Promise.resolve();
  };

  console.log('DealDetailsPage render - deal:', deal, 'dealId:', dealId, 'actualDealId:', actualDealId, 'isNewDeal:', isNewDeal);
  
  if (!deal) {
    return <div className="p-4">{actualDealId === 'new' ? 'Initializing new deal...' : 'Loading...'}</div>;
  }

  return (
    <FloatingPanelManager>
      <FloatingPanelContainer 
        contactCount={contacts.length}
        notesCount={0}        // TODO: Add notes count when notes are implemented
        filesCount={0}        // TODO: Add files count when files are implemented
        activityCount={0}     // TODO: Add activity count when activity is implemented
        paymentsCount={0}     // TODO: Add payments count when payments are implemented
      >
        {/* Deal Header Bar - Always visible at top */}
        <DealHeaderBar deal={deal} />
        
        <div className="p-4 max-w-4xl mx-auto">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('commission')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'commission'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Commission
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'payments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Payments
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <DealDetailsForm deal={deal} onSave={handleDealUpdate} />
          )}

          {activeTab === 'commission' && (
            <>
              {isNewDeal ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">Save Deal First</h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>Please save the deal in the Overview tab before managing commission details.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <CommissionTab dealId={dealId!} deal={deal} onDealUpdate={handleAsyncDealUpdate} />
              )}
            </>
          )}

          {activeTab === 'payments' && (
            <>
              {isNewDeal ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">Save Deal First</h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>Please save the deal in the Overview tab before managing payments.</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <PaymentTab deal={deal} onDealUpdate={handleAsyncDealUpdate} />
              )}
            </>
          )}
        </div>
      </FloatingPanelContainer>
      
      {/* Floating Contact Panel - only for existing deals */}
      {dealId && dealId !== 'new' && <FloatingContactPanel dealId={dealId} />}
    </FloatingPanelManager>
  );
}