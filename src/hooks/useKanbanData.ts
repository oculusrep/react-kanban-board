// Updated to use central types
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DealCard, KanbanColumn } from '../lib/types';

export default function useKanbanData() {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [cards, setCards] = useState<DealCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
          .select('id, deal_name, fee, deal_value, closed_date, stage_id, kanban_position, client_id, created_at, last_stage_change_at')
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

        // Fetch deal synopses for alert levels
        const { data: synopsisData, error: synopsisError } = await supabase
          .from('deal_synopsis')
          .select('deal_id, alert_level');

        if (synopsisError) {
          console.warn('⚠️ Synopsis error (non-fatal):', synopsisError);
        }

        // Create synopsis alert level lookup map
        const synopsisMap = new Map<string, 'green' | 'yellow' | 'red' | null>();
        synopsisData?.forEach(synopsis => {
          synopsisMap.set(synopsis.deal_id, synopsis.alert_level);
        });

        // Transform deals using central DealCard type
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
          last_stage_change_at: deal.last_stage_change_at,
          synopsis_alert_level: synopsisMap.get(deal.id) || null,
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
            // Only include Lost deals moved to Lost stage within the last 2 years
            // Use last_stage_change_at if available, otherwise fall back to created_at
            const dateToCheck = card.last_stage_change_at || card.created_at;
            if (!dateToCheck) return false;
            const lostDate = new Date(dateToCheck);
            return lostDate >= twoYearsAgo;
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

  useEffect(() => {
    fetchData();

    // Refetch when page becomes visible (user comes back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Page visible, refreshing kanban data...');
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshTrigger]);

  const refresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return { columns, cards, loading, refresh };
}