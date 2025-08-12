// Even safer version - fetch clients separately to avoid join issues
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface DealCard {
  id: string;
  deal_name: string | null;
  fee: number | null;
  deal_value: number | null;
  closed_date: string | null;
  stage_id: string | null;
  kanban_position: number | null;
  client_name: string | null;
  created_at: string | null;
}

interface KanbanColumn {
  id: string;
  label: string;
  description: string | null;
  sort_order: number | null;
  active: boolean | null;
}

export default function useKanbanData() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('🔍 Fetching kanban data (safe version)...');
        
        // Fetch stages (now including all active stages, including Lost)
        const { data: stageData, error: stageError } = await supabase
          .from('deal_stage')
          .select('id, label, description, sort_order, active')
          .eq('active', true)
          .order('sort_order', { ascending: true });

        console.log('📊 Stages:', stageData);
        if (stageError) {
          console.error('❌ Stage error:', stageError);
          throw stageError;
        }

        // Fetch deals WITHOUT client join first
        const { data: dealData, error: dealError } = await supabase
          .from('deal')
          .select('id, deal_name, fee, deal_value, closed_date, stage_id, kanban_position, client_id, created_at')
          .order('kanban_position', { ascending: true });

        console.log('💼 Deals:', dealData?.length || 0, 'deals fetched');
        if (dealError) {
          console.error('❌ Deal error:', dealError);
          throw dealError;
        }

        // Fetch clients separately
        const { data: clientData, error: clientError } = await supabase
          .from('client')
          .select('id, client_name');

        console.log('👥 Clients:', clientData?.length || 0, 'clients fetched');
        if (clientError) {
          console.warn('⚠️ Client error (non-fatal):', clientError);
        }

        // Create client lookup map
        const clientMap = new Map<string, string>();
        clientData?.forEach(client => {
          clientMap.set(client.id, client.client_name);
        });

        // Transform deals
        const transformedCards: DealCard[] = dealData.map(deal => ({
          id: deal.id,
          deal_name: deal.deal_name,
          fee: deal.fee,
          deal_value: deal.deal_value,
          closed_date: deal.closed_date,
          stage_id: deal.stage_id,
          kanban_position: deal.kanban_position,
          client_name: deal.client_id ? clientMap.get(deal.client_id) || null : null,
          created_at: deal.created_at,
        }));

        // Create a map of stage labels for filtering
        const stageMap = new Map<string, string>();
        stageData.forEach(stage => {
          stageMap.set(stage.id, stage.label);
        });

        // Filter cards based on stage rules
        const validStageIds = new Set(stageData.map(stage => stage.id));
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        const filteredCards = transformedCards.filter(card => {
          // Must have valid stage_id
          if (!card.stage_id || !validStageIds.has(card.stage_id)) {
            return false;
          }

          // Special filtering for "Lost" deals
          const stageLabel = stageMap.get(card.stage_id);
          if (stageLabel === 'Lost') {
            // Only include Lost deals created within the last 2 years
            if (!card.created_at) return false;
            const createdDate = new Date(card.created_at);
            return createdDate >= twoYearsAgo;
          }

          // All other stages: include all deals
          return true;
        });

        console.log('🃏 Final cards:', filteredCards.length);
        console.log('📊 Final columns:', stageData.length);

        setColumns(stageData || []);
        setCards(filteredCards);
      } catch (error) {
        console.error('💥 Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { columns, cards, loading };
}