// src/pages/DealDetailsPage.tsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DealDetailsForm from "../components/DealDetailsForm";
import { FloatingPanelManager } from "../components/FloatingPanelManager";
import { FloatingPanelContainer } from "../components/FloatingPanelContainer";
import { FloatingContactPanel } from "../components/FloatingContactPanel";
import { useDealContacts } from "../hooks/useDealContacts";
import CommissionTab from '../components/CommissionTab';

export default function DealDetailsPage() {
  const { dealId } = useParams();
  const [deal, setDeal] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Get contact count for the floating button badge
  const { contacts } = useDealContacts(dealId || null);

  useEffect(() => {
    const fetchDeal = async () => {
      const { data, error } = await supabase
        .from("deal")
        .select("*")
        .eq("id", dealId)
        .single();

      if (!error && data) {
        setDeal(data);
      }
    };

    if (dealId) fetchDeal();
  }, [dealId]);

  if (!deal) return <div className="p-4">Loading...</div>;

  return (
    <FloatingPanelManager>
      <FloatingPanelContainer 
        contactCount={contacts.length}
        notesCount={0}        // TODO: Add notes count when notes are implemented
        filesCount={0}        // TODO: Add files count when files are implemented
        activityCount={0}     // TODO: Add activity count when activity is implemented
        paymentsCount={0}     // TODO: Add payments count when payments are implemented
      >
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
    </nav>
  </div>

  {/* Tab Content */}
  {activeTab === 'overview' && (
    <DealDetailsForm deal={deal} onSave={(updated) => setDeal(updated)} />
  )}

  {activeTab === 'commission' && (
    <CommissionTab dealId={dealId!} />
  )}
</div>
      </FloatingPanelContainer>
      
      {/* Floating Contact Panel */}
      {dealId && <FloatingContactPanel dealId={dealId} />}
    </FloatingPanelManager>
  );
}