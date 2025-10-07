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
  onDelete?: () => void;
}

interface Client {
  id: string;
  client_name: string;
}

interface DealStage {
  id: string;
  label: string;
}

const DealHeaderBar: React.FC<DealHeaderBarProps> = ({ deal, onDelete }) => {
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

  const getStageColor = (stageLabel: string): string => {
    const stageColors: Record<string, string> = {
      'Negotiating LOI': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'At Lease/PSA': 'bg-blue-100 text-blue-800 border-blue-200',
      'Under Contract / Contingent': 'bg-purple-100 text-purple-800 border-purple-200',
      'Booked': 'bg-green-100 text-green-800 border-green-200',
      'Executed Payable': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'Closed Paid': 'bg-gray-100 text-gray-800 border-gray-200',
      'Lost': 'bg-red-100 text-red-800 border-red-200',
    };
    return stageColors[stageLabel] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Modern deal icon SVG - Trending up chart with geometric elements
  const DealIcon = () => (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      <circle cx="4" cy="4" r="1" fill="currentColor" />
      <circle cx="13" cy="7" r="1" fill="currentColor" />
      <circle cx="21" cy="7" r="1" fill="currentColor" />
    </svg>
  );

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center">
                <DealIcon />
              </div>
              <span className="text-sm font-medium text-slate-300">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white px-6 py-4">
      <div className="max-w-7xl mx-auto">
        {/* Top Row - Deal Label and Name */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 rounded-lg">
              <DealIcon />
              <span className="text-white text-sm font-medium">Deal</span>
            </div>
            <h1 className="text-xl font-bold leading-tight">
              {deal.deal_name || 'Unnamed Deal'}
            </h1>
          </div>
          {onDelete && deal.id && (
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
              title="Delete Deal"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>

        {/* Bottom Row - Deal Details */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
          <div>
            <div className="text-slate-300 font-medium mb-1">Account Name</div>
            <div className="text-white">
              {client?.client_name || 'No Client'}
            </div>
          </div>

          <div>
            <div className="text-slate-300 font-medium mb-1">Stage</div>
            <div className="text-white font-semibold">
              {stage?.label || 'No Stage'}
            </div>
          </div>

          <div>
            <div className="text-slate-300 font-medium mb-1">Probability</div>
            <div className="text-white font-semibold">
              {deal.probability !== null ? `${deal.probability}%` : '0%'}
            </div>
          </div>

          <div>
            <div className="text-slate-300 font-medium mb-1">Target Close Date</div>
            <div className="text-white">
              {formatDate(deal.target_close_date)}
            </div>
          </div>

          <div>
            <div className="text-slate-300 font-medium mb-1">Deal Value</div>
            <div className="text-white font-bold text-base">
              {formatCurrency(deal.deal_value)}
            </div>
          </div>

          <div>
            <div className="text-slate-300 font-medium mb-1">Fee</div>
            <div className="text-emerald-400 font-bold text-base">
              {formatCurrency(deal.fee)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealHeaderBar;