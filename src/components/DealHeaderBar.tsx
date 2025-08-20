// src/components/DealHeaderBar.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface DealHeaderBarProps {
  deal: {
    id: string;
    deal_name: string;
    deal_value: number | null;
    fee: number | null;
    stage_id: string;
    probability: number | null;
    target_close_date: string | null;
    client_id: string | null;
  };
}

interface Client {
  id: string;
  client_name: string;
}

interface DealStage {
  id: string;
  label: string;
}

const DealHeaderBar: React.FC<DealHeaderBarProps> = ({ deal }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [stage, setStage] = useState<DealStage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHeaderData = async () => {
      try {
        // Fetch client data
        if (deal.client_id) {
          const { data: clientData } = await supabase
            .from('client')
            .select('id, client_name')
            .eq('id', deal.client_id)
            .single();
          
          if (clientData) setClient(clientData);
        }

        // Fetch stage data
        if (deal.stage_id) {
          const { data: stageData } = await supabase
            .from('deal_stage')
            .select('id, label')
            .eq('id', deal.stage_id)
            .single();
          
          if (stageData) setStage(stageData);
        }
      } catch (error) {
        console.error('Error fetching header data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHeaderData();
  }, [deal.client_id, deal.stage_id]);

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Not set';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                <span className="text-orange-600 text-sm font-bold">🏢</span>
              </div>
              <span className="text-xs font-medium">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-4 shadow-sm">
      <div className="max-w-7xl mx-auto">
        {/* Top Row - Opportunity Label and Name */}
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
            <span className="text-orange-600 text-sm font-bold">🏢</span>
          </div>
          <span className="text-xs font-medium opacity-90">Opportunity</span>
        </div>
        
        <h1 className="text-xl font-bold mb-3 leading-tight">
          {deal.deal_name || 'Unnamed Deal'}
        </h1>

        {/* Bottom Row - Deal Details */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
          <div>
            <div className="text-xs opacity-75 mb-1">Account Name</div>
            <div className="font-medium">
              {client?.client_name || 'No Client'}
            </div>
          </div>

          <div>
            <div className="text-xs opacity-75 mb-1">Stage</div>
            <div className="font-medium">
              {stage?.label || 'No Stage'}
            </div>
          </div>

          <div>
            <div className="text-xs opacity-75 mb-1">Probability (%)</div>
            <div className="font-medium">
              {deal.probability !== null ? `${deal.probability}%` : '0%'}
            </div>
          </div>

          <div>
            <div className="text-xs opacity-75 mb-1">Target Close Date</div>
            <div className="font-medium">
              {formatDate(deal.target_close_date)}
            </div>
          </div>

          <div>
            <div className="text-xs opacity-75 mb-1">Deal Value</div>
            <div className="font-medium">
              {formatCurrency(deal.deal_value)}
            </div>
          </div>

          <div>
            <div className="text-xs opacity-75 mb-1">Fee</div>
            <div className="font-medium">
              {formatCurrency(deal.fee)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealHeaderBar;