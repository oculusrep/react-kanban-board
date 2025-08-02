import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

type Deal = {
  id: string;
  deal_name: string;
  fee: number;
  deal_value: number;
  stage_id: string;
  client_name: string;
  close_date?: string; // <- Add this
};

type StageColumn = {
  id: string;
  name: string;
};

function useKanbanData() {
  const [cards, setCards] = useState<Deal[]>([]);
  const [columns, setColumns] = useState<StageColumn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeals();
    fetchStages();
  }, []);

  const fetchDeals = async () => {
    const { data, error } = await supabase
      .from("deal")
      .select(`
        id,
        deal_name,
        fee,
        deal_value,
        stage_id,
        close_date,
        client:client_id (client_name)
      `);

    if (error) {
      console.error("Failed to fetch deals:", error);
      return;
    }

    const mapped = data.map((d: any) => ({
      id: d.id,
      deal_name: d.deal_name,
      fee: d.fee,
      deal_value: d.deal_value,
      stage_id: d.stage_id,
      client_name: d.client?.client_name || "",
      close_date: d.close_date || null, // <- Include this
    }));

    setCards(mapped);
  };

  const fetchStages = async () => {
    const { data, error } = await supabase.from("deal_stage").select("*");
    if (error) {
      console.error("Failed to fetch stages:", error);
      return;
    }

    const mapped = data
      .filter((s: any) => s.label !== "Lost")
      .map((s: any) => ({
        id: s.id,
        name: s.label,
      }));

    setColumns(mapped);
    setLoading(false);
  };

  return { columns, cards, loading };
}

export default useKanbanData;
