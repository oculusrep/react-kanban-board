// src/pages/DealDetailsPage.tsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import DealDetailsForm from "../components/DealDetailsForm";
import { FloatingPanelManager } from "../components/FloatingPanelManager";
import { FloatingPanelContainer } from "../components/FloatingPanelContainer";
import { FloatingContactPanel } from "../components/FloatingContactPanel";

export default function DealDetailsPage() {
  const { dealId } = useParams();
  const [deal, setDeal] = useState<any>(null);

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
      <FloatingPanelContainer>
        <div className="p-4 max-w-4xl mx-auto">
          <DealDetailsForm deal={deal} onSave={(updated) => setDeal(updated)} />
        </div>
      </FloatingPanelContainer>
      
      {/* Floating Contact Panel */}
      {dealId && <FloatingContactPanel dealId={dealId} />}
    </FloatingPanelManager>
  );
}