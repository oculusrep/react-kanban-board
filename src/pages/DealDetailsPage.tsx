// src/pages/DealDetailsPage.tsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DealDetailsForm from "../components/DealDetailsForm";
import { FloatingPanelManager } from "../components/FloatingPanelManager";
import { FloatingPanelContainer } from "../components/FloatingPanelContainer";
import { FloatingContactPanel } from "../components/FloatingContactPanel";
import { useDealContacts } from "../hooks/useDealContacts";

export default function DealDetailsPage() {
  const { dealId } = useParams();
  const [deal, setDeal] = useState<any>(null);
  
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
          <DealDetailsForm deal={deal} onSave={(updated) => setDeal(updated)} />
        </div>
      </FloatingPanelContainer>
      
      {/* Floating Contact Panel */}
      {dealId && <FloatingContactPanel dealId={dealId} />}
    </FloatingPanelManager>
  );
}