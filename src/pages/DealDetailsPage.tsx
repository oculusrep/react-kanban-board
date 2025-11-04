// src/pages/DealDetailsPage.tsx
import { useParams, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DealDetailsForm from "../components/DealDetailsForm";
import CommissionTab from '../components/CommissionTab';
import PaymentTab from '../components/PaymentTab';
import ActivityTab from '../components/ActivityTab';
import CriticalDatesTab from '../components/CriticalDatesTab';
import DealHeaderBar from '../components/DealHeaderBar';
import DealSidebar from '../components/DealSidebar';
import SiteSubmitSidebar from '../components/SiteSubmitSidebar';
import PinDetailsSlideout from '../components/mapping/slideouts/PinDetailsSlideout';
import { LayerManagerProvider } from '../components/mapping/layers/LayerManager';
import FileManager from '../components/FileManager/FileManager';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useTrackPageView, useRecentlyViewed } from '../hooks/useRecentlyViewed';

export default function DealDetailsPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [deal, setDeal] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isNewDeal, setIsNewDeal] = useState(false);
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [siteSubmitSidebarOpen, setSiteSubmitSidebarOpen] = useState(false);
  const [siteSubmitSidebarMinimized, setSiteSubmitSidebarMinimized] = useState(false);
  const [selectedSiteSubmitId, setSelectedSiteSubmitId] = useState<string | null>(null);
  const [propertySlideoutOpen, setPropertySlideoutOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [propertyData, setPropertyData] = useState<any>(null);
  const { toast, showToast } = useToast();
  const { trackView } = useTrackPageView();
  const { removeRecentItem } = useRecentlyViewed();

  console.log('DealDetailsPage - location:', location.pathname, 'dealId from params:', dealId);

  // Fallback: if dealId is undefined but pathname is /deal/new, treat as new deal
  const actualDealId = dealId || (location.pathname === '/deal/new' ? 'new' : undefined);

  // Check for tab query parameter and set active tab
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['overview', 'commission', 'payments', 'activity', 'files', 'critical-dates'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Listen for messages from iframe (site submit sidebar)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'OPEN_PROPERTY_SLIDEOUT') {
        const propertyId = event.data.propertyId;
        console.log('📨 Received message to open property slideout:', propertyId);

        // Fetch property data
        const { data, error } = await supabase
          .from('property')
          .select('*')
          .eq('id', propertyId)
          .single();

        if (data && !error) {
          setSelectedPropertyId(propertyId);
          setPropertyData(data);
          setPropertySlideoutOpen(true);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Set page title
  useEffect(() => {
    if (isNewDeal) {
      document.title = "New Deal | OVIS";
    } else if (deal?.deal_name) {
      document.title = `${deal.deal_name} | OVIS`;
    } else {
      document.title = "Deal | OVIS";
    }
  }, [deal, isNewDeal]);

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
          house_percent: 40,
          origination_percent: 50,
          site_percent: 25,
          deal_percent: 25,
          number_of_payments: 2,
          contract_signed_date: null,
          booked_date: null,
          booked: null,
          loss_reason: null,
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
        // Remove from recently viewed if it doesn't exist
        if (error.code === 'PGRST116') { // No rows found
          removeRecentItem(actualDealId, 'deal');
          showToast('This deal no longer exists', { type: 'error' });
          navigate('/master-pipeline');
        }
      } else if (data) {
        console.log('Existing deal loaded:', data);
        setDeal(data);
        setIsNewDeal(false);
        // Track this deal as recently viewed
        trackView(
          data.id,
          'deal',
          data.deal_name || 'Unnamed Deal',
          data.sf_address || data.client?.client_name || undefined
        );
      } else {
        // No data and no error means the deal doesn't exist
        console.log('Deal not found - removing from recently viewed');
        removeRecentItem(actualDealId, 'deal');
        showToast('This deal no longer exists', { type: 'error' });
        navigate('/master-pipeline');
      }
    };

    console.log('DealDetailsPage useEffect - actualDealId:', actualDealId, 'type:', typeof actualDealId);
    
    if (actualDealId) {
      console.log('DealDetailsPage useEffect triggered with actualDealId:', actualDealId);
      // Reset to Overview tab when creating a new deal
      if (actualDealId === 'new') {
        setActiveTab('overview');
      }
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

  // Handle deal deletion
  const handleDelete = () => {
    if (!deal.id || isNewDeal) return;
    setShowDeleteConfirm(true);
  };

  // Handle viewing site submit details in sidebar
  const handleViewSiteSubmitDetails = (siteSubmitId: string) => {
    setSelectedSiteSubmitId(siteSubmitId);
    setSiteSubmitSidebarOpen(true);
    setSiteSubmitSidebarMinimized(false);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);

    try {
      // Step 1: Check if there are any assignments referencing this deal
      const { data: assignments, error: assignmentError } = await supabase
        .from('assignment')
        .select('id')
        .eq('deal_id', deal.id);

      if (assignmentError) throw assignmentError;

      // If there are assignments, we need to nullify the deal_id first
      if (assignments && assignments.length > 0) {
        const { error: updateError } = await supabase
          .from('assignment')
          .update({ deal_id: null })
          .eq('deal_id', deal.id);

        if (updateError) throw updateError;
      }

      // Step 2: Delete any deal_contact records
      const { error: dealContactError } = await supabase
        .from('deal_contact')
        .delete()
        .eq('deal_id', deal.id);

      if (dealContactError) throw dealContactError;

      // Step 3: Nullify site_submit references to this deal
      const { error: siteSubmitError } = await supabase
        .from('site_submit')
        .update({ deal_id: null })
        .eq('deal_id', deal.id);

      if (siteSubmitError) throw siteSubmitError;

      // Step 4: Delete any activity records linked to this deal
      const { error: activityError } = await supabase
        .from('activity')
        .delete()
        .eq('deal_id', deal.id);

      if (activityError && activityError.code !== 'PGRST116') { // PGRST116 = no rows found
        throw activityError;
      }

      // Step 5: Delete payments and their related data
      // First get all payments for this deal
      const { data: payments, error: fetchPaymentError } = await supabase
        .from('payment')
        .select('id')
        .eq('deal_id', deal.id);

      if (fetchPaymentError) throw fetchPaymentError;

      // If there are payments, delete their payment_splits
      if (payments && payments.length > 0) {
        const paymentIds = payments.map(p => p.id);
        const { error: paymentSplitError } = await supabase
          .from('payment_split')
          .delete()
          .in('payment_id', paymentIds);

        if (paymentSplitError && paymentSplitError.code !== 'PGRST116') {
          throw paymentSplitError;
        }

        // Now delete the payments themselves
        const { error: paymentError } = await supabase
          .from('payment')
          .delete()
          .eq('deal_id', deal.id);

        if (paymentError && paymentError.code !== 'PGRST116') {
          throw paymentError;
        }
      }

      // Step 6: Delete commission splits linked to this deal
      const { error: commissionSplitError } = await supabase
        .from('commission_split')
        .delete()
        .eq('deal_id', deal.id);

      if (commissionSplitError && commissionSplitError.code !== 'PGRST116') { // PGRST116 = no rows found
        throw commissionSplitError;
      }

      // Step 7: Now delete the deal
      const { error } = await supabase
        .from('deal')
        .delete()
        .eq('id', deal.id);

      if (error) throw error;

      // Remove from recently viewed
      removeRecentItem(deal.id, 'deal');

      showToast('Deal deleted successfully!', { type: 'success' });

      // Navigate after a brief delay to show the toast
      setTimeout(() => {
        navigate('/master-pipeline');
      }, 1000);
    } catch (error) {
      console.error('Error deleting deal:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast(`Error deleting deal: ${errorMessage}`, { type: 'error' });
    }
  };

  console.log('DealDetailsPage render - deal:', deal, 'dealId:', dealId, 'actualDealId:', actualDealId, 'isNewDeal:', isNewDeal);
  
  if (!deal) {
    return <div className="p-4">{actualDealId === 'new' ? 'Initializing new deal...' : 'Loading...'}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Deal Header Bar - Full Width */}
      <DealHeaderBar deal={deal} onDelete={handleDelete} />

      {/* Main Content Area with Static Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className={`mx-auto p-4 pb-8 ${activeTab === 'critical-dates' ? 'max-w-7xl' : 'max-w-4xl'}`}>
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
                  Details
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
                <button
                  onClick={() => {
                    setActiveTab('critical-dates');
                    setSidebarMinimized(true); // Auto-collapse sidebar
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'critical-dates'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Critical Dates
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'activity'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Activity
                </button>
                <button
                  onClick={() => setActiveTab('files')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
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
            {activeTab === 'overview' && (
              <DealDetailsForm
                deal={deal}
                onSave={handleDealUpdate}
                onViewSiteSubmitDetails={handleViewSiteSubmitDetails}
              />
            )}

            {activeTab === 'commission' && (
              <>
                {isNewDeal || !deal.id ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Save Deal First</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>Please save the deal in the Details tab before managing commission details.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CommissionTab dealId={deal.id} deal={deal} onDealUpdate={handleAsyncDealUpdate} onSwitchToPayments={() => setActiveTab('payments')} />
                )}
              </>
            )}

            {activeTab === 'payments' && (
              <>
                {isNewDeal || !deal.id ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Save Deal First</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>Please save the deal in the Details tab before managing payments.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <PaymentTab deal={deal} onDealUpdate={handleAsyncDealUpdate} />
                )}
              </>
            )}

            {activeTab === 'critical-dates' && (
              <>
                {isNewDeal || !deal.id ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Save Deal First</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>Please save the deal in the Details tab before managing critical dates.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CriticalDatesTab dealId={deal.id} deal={deal} />
                )}
              </>
            )}

            {activeTab === 'activity' && (
              <>
                {isNewDeal || !deal.id ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Save Deal First</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>Please save the deal in the Details tab before viewing activities.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ActivityTab dealId={deal.id} />
                )}
              </>
            )}

            {activeTab === 'files' && (
              <>
                {isNewDeal || !deal.id ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Save Deal First</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>Please save the deal in the Details tab before managing files.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6">
                    <FileManager
                      entityType="deal"
                      entityId={deal.id}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Deal Sidebar - Static right sidebar */}
        {actualDealId && actualDealId !== 'new' && (
          <DealSidebar
            dealId={actualDealId}
            isMinimized={sidebarMinimized}
            onMinimize={() => setSidebarMinimized(!sidebarMinimized)}
          />
        )}

        {/* Site Submit Sidebar - Shows on top of Deal Sidebar when opened */}
        {siteSubmitSidebarOpen && selectedSiteSubmitId && (
          <SiteSubmitSidebar
            siteSubmitId={selectedSiteSubmitId}
            isMinimized={siteSubmitSidebarMinimized}
            onMinimize={() => setSiteSubmitSidebarMinimized(!siteSubmitSidebarMinimized)}
            onClose={() => setSiteSubmitSidebarOpen(false)}
            propertySlideoutOpen={propertySlideoutOpen}
          />
        )}

        {/* Property Details Slideout - Shows to the right of Site Submit Sidebar */}
        {propertySlideoutOpen && propertyData && (
          <LayerManagerProvider>
            <PinDetailsSlideout
              isOpen={propertySlideoutOpen}
              onClose={() => {
                setPropertySlideoutOpen(false);
                setPropertyData(null);
                setSelectedPropertyId(null);
              }}
              data={propertyData}
              type="property"
              rightOffset={0}
            />
          </LayerManagerProvider>
        )}
      </div>

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Deal"
        message="Are you sure you want to delete this deal? This action cannot be undone. All associated contacts, activities, and links to assignments/site submits will be removed. The original assignment and site submit records will remain."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}