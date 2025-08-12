// Fixed version with correct column names
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
        console.log('🔍 Fetching kanban data with correct columns...');
        
        // Fetch stages using the correct column names (label, not name)
        const { data: stageData, error: stageError } = await supabase
          .from('deal_stage')
          .select('id, label, description, sort_order, active')
          .eq('active', true)  // Only get active stages
          .order('sort_order', { ascending: true });

        console.log('📊 Stages:', stageData);
        console.log('❌ Stage error:', stageError);

        if (stageError) throw stageError;

        // Fetch deals with all the fields we need
        const { data: dealData, error: dealError } = await supabase
          .from('deal')
          .select(`
            id,
            deal_name,
            fee,
            deal_value,
            closed_date,
            stage_id,
            kanban_position,
            client (
              client_name
            )
          `)
          .order('kanban_position', { ascending: true });

        console.log('💼 Deals:', dealData?.length || 0, 'deals fetched');
        console.log('❌ Deal error:', dealError);

        if (dealError) throw dealError;

        // Transform deals with proper type handling
        const transformedCards: DealCard[] = (dealData as any[]).map((deal: any) => {
          let clientName: string | null = null;
          if (deal.client) {
            if (Array.isArray(deal.client)) {
              clientName = deal.client[0]?.client_name || null;
            } else {
              clientName = deal.client.client_name || null;
            }
          }

          return {
            id: deal.id,
            deal_name: deal.deal_name,
            fee: deal.fee,
            deal_value: deal.deal_value,
            closed_date: deal.closed_date,
            stage_id: deal.stage_id,
            kanban_position: deal.kanban_position,
            client_name: clientName,
          };
        });

        // Filter cards to only include those in valid stages and with non-null stage_id
        const validStageIds = new Set(stageData.map(stage => stage.id));
        const filteredCards = transformedCards.filter(card => 
          card.stage_id && validStageIds.has(card.stage_id)
        );

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