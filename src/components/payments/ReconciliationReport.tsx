import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface ReconciliationRow {
  deal_id: string;
  deal_name: string;
  sf_id: string | null;
  ovis_stage: string;
  sf_stage: string | null;
  stage_match: boolean;
  ovis_payment_amount: number;
  sf_payment_amount: number;
  payment_variance: number;
  ovis_gci: number;
  sf_gci: number;
  gci_variance: number;
  ovis_agci: number;
  sf_agci: number;
  agci_variance: number;
  ovis_house: number;
  sf_house: number;
  house_variance: number;
  ovis_mike: number;
  sf_mike: number;
  mike_variance: number;
  ovis_arty: number;
  sf_arty: number;
  arty_variance: number;
  ovis_greg: number;
  sf_greg: number;
  greg_variance: number;
}

const ReconciliationReport: React.FC = () => {
  const [reconciliationData, setReconciliationData] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<string>('deal_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [stages, setStages] = useState<string[]>([]);

  useEffect(() => {
    fetchReconciliationData();
  }, []);

  const fetchReconciliationData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[ReconciliationReport] Starting data fetch...');

      // Fetch all deal stages
      const { data: allStagesData, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label, active')
        .eq('active', true);

      if (stagesError) throw stagesError;

      // Filter out Lost stage
      const stagesData = allStagesData?.filter(s => !s.label.toLowerCase().includes('lost')) || [];
      const activeStageIds = stagesData.map(s => s.id);
      const stageLabelMap = new Map(stagesData.map(s => [s.id, s.label]));
      setStages(stagesData.map(s => s.label));

      console.log('[ReconciliationReport] Active stages:', stagesData?.length);

      // Fetch OVIS deals with active stages
      const { data: ovisDeals, error: dealsError} = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          sf_id,
          stage_id,
          fee,
          referral_fee_usd
        `)
        .in('stage_id', activeStageIds);

      if (dealsError) throw dealsError;
      console.log('[ReconciliationReport] OVIS deals:', ovisDeals?.length);

      // Fetch OVIS payments for these deals
      const dealIds = ovisDeals?.map(d => d.id) || [];
      const { data: ovisPayments, error: paymentsError } = await supabase
        .from('payment')
        .select('deal_id, payment_amount')
        .in('deal_id', dealIds)
        .eq('is_active', true);

      if (paymentsError) throw paymentsError;
      console.log('[ReconciliationReport] OVIS payments:', ovisPayments?.length);

      // Fetch OVIS payment splits to get broker totals
      const { data: ovisSplits, error: splitsError } = await supabase
        .from('payment_split')
        .select(`
          payment_id,
          split_origination_usd,
          split_site_usd,
          split_deal_usd,
          payment!inner(deal_id),
          broker!inner(name)
        `)
        .in('payment.deal_id', dealIds);

      if (splitsError) throw splitsError;
      console.log('[ReconciliationReport] OVIS splits:', ovisSplits?.length);

      // Get all SF IDs from deals
      const sfIds = ovisDeals?.filter(d => d.sf_id).map(d => d.sf_id) || [];
      console.log('[ReconciliationReport] Fetching SF data for', sfIds.length, 'opportunities');

      // Fetch Salesforce Opportunity data for stages
      const { data: sfOpportunities, error: sfOppError } = await supabase
        .from('salesforce_Opportunity')
        .select('Id, StageName')
        .in('Id', sfIds);

      if (sfOppError) throw sfOppError;
      console.log('[ReconciliationReport] SF opportunities:', sfOpportunities?.length);

      const sfStageMap = new Map(sfOpportunities?.map(o => [o.Id, o.StageName]) || []);

      // Fetch Salesforce Payment data
      const { data: sfPayments, error: sfPaymentError } = await supabase
        .from('salesforce_Payment__c')
        .select(`
          Opportunity__c,
          Payment_Amount__c,
          AGCI__c,
          House_Dollars__c,
          Broker_Total_Mike__c,
          Broker_Total_Arty__c,
          Broker_Total_Greg__c
        `)
        .in('Opportunity__c', sfIds)
        .eq('IsDeleted', false);

      if (sfPaymentError) throw sfPaymentError;
      console.log('[ReconciliationReport] SF payments:', sfPayments?.length);

      // Aggregate OVIS data by deal
      const ovisDataByDeal = new Map<string, {
        totalPayments: number;
        gci: number;
        agci: number;
        house: number;
        mikeTotal: number;
        artyTotal: number;
        gregTotal: number;
      }>();

      ovisDeals?.forEach(deal => {
        const dealPayments = ovisPayments?.filter(p => p.deal_id === deal.id) || [];
        const totalPayments = dealPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
        const gci = deal.fee || 0;
        const referralFee = deal.referral_fee_usd || 0;
        const agci = gci - referralFee;

        // Calculate broker totals
        let mikeTotal = 0;
        let artyTotal = 0;
        let gregTotal = 0;

        ovisSplits?.forEach((split: any) => {
          if (split.payment?.deal_id === deal.id) {
            const total = (split.split_origination_usd || 0) + (split.split_site_usd || 0) + (split.split_deal_usd || 0);
            const brokerName = split.broker?.name?.toLowerCase() || '';

            if (brokerName.includes('mike')) {
              mikeTotal += total;
            } else if (brokerName.includes('arty')) {
              artyTotal += total;
            } else if (brokerName.includes('greg')) {
              gregTotal += total;
            }
          }
        });

        // Calculate house (GCI - AGCI)
        const house = gci - agci;

        ovisDataByDeal.set(deal.id, {
          totalPayments,
          gci,
          agci,
          house,
          mikeTotal,
          artyTotal,
          gregTotal
        });
      });

      // Aggregate SF data by opportunity
      const sfDataByOpportunity = new Map<string, {
        totalPayments: number;
        agci: number;
        house: number;
        mikeTotal: number;
        artyTotal: number;
        gregTotal: number;
      }>();

      sfPayments?.forEach((payment: any) => {
        const oppId = payment.Opportunity__c;
        if (!oppId) return;

        const existing = sfDataByOpportunity.get(oppId) || {
          totalPayments: 0,
          agci: 0,
          house: 0,
          mikeTotal: 0,
          artyTotal: 0,
          gregTotal: 0
        };

        existing.totalPayments += payment.Payment_Amount__c || 0;
        existing.agci += payment.AGCI__c || 0;
        existing.house += payment.House_Dollars__c || 0;
        existing.mikeTotal += payment.Broker_Total_Mike__c || 0;
        existing.artyTotal += payment.Broker_Total_Arty__c || 0;
        existing.gregTotal += payment.Broker_Total_Greg__c || 0;

        sfDataByOpportunity.set(oppId, existing);
      });

      // Create reconciliation rows
      const rows: ReconciliationRow[] = ovisDeals?.map(deal => {
        const ovisData = ovisDataByDeal.get(deal.id) || {
          totalPayments: 0,
          gci: 0,
          agci: 0,
          house: 0,
          mikeTotal: 0,
          artyTotal: 0,
          gregTotal: 0
        };

        const sfData = deal.sf_id ? sfDataByOpportunity.get(deal.sf_id) || {
          totalPayments: 0,
          agci: 0,
          house: 0,
          mikeTotal: 0,
          artyTotal: 0,
          gregTotal: 0
        } : {
          totalPayments: 0,
          agci: 0,
          house: 0,
          mikeTotal: 0,
          artyTotal: 0,
          gregTotal: 0
        };

        const ovisStage = stageLabelMap.get(deal.stage_id) || 'Unknown';
        const sfStage = deal.sf_id ? sfStageMap.get(deal.sf_id) || null : null;

        // SF GCI = SF AGCI + SF House
        const sfGci = sfData.agci + sfData.house;

        return {
          deal_id: deal.id,
          deal_name: deal.deal_name || 'Unknown',
          sf_id: deal.sf_id,
          ovis_stage: ovisStage,
          sf_stage: sfStage,
          stage_match: ovisStage === sfStage,
          ovis_payment_amount: ovisData.totalPayments,
          sf_payment_amount: sfData.totalPayments,
          payment_variance: ovisData.totalPayments - sfData.totalPayments,
          ovis_gci: ovisData.gci,
          sf_gci: sfGci,
          gci_variance: ovisData.gci - sfGci,
          ovis_agci: ovisData.agci,
          sf_agci: sfData.agci,
          agci_variance: ovisData.agci - sfData.agci,
          ovis_house: ovisData.house,
          sf_house: sfData.house,
          house_variance: ovisData.house - sfData.house,
          ovis_mike: ovisData.mikeTotal,
          sf_mike: sfData.mikeTotal,
          mike_variance: ovisData.mikeTotal - sfData.mikeTotal,
          ovis_arty: ovisData.artyTotal,
          sf_arty: sfData.artyTotal,
          arty_variance: ovisData.artyTotal - sfData.artyTotal,
          ovis_greg: ovisData.gregTotal,
          sf_greg: sfData.gregTotal,
          greg_variance: ovisData.gregTotal - sfData.gregTotal
        };
      }) || [];

      setReconciliationData(rows);
      console.log('[ReconciliationReport] Reconciliation complete:', rows.length, 'rows');

    } catch (error: any) {
      console.error('[ReconciliationReport] Error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = reconciliationData;

    // Filter by stage
    if (selectedStage !== 'all') {
      filtered = filtered.filter(row => row.ovis_stage === selectedStage);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof ReconciliationRow];
      let bVal: any = b[sortColumn as keyof ReconciliationRow];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal?.toLowerCase() || '';
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [reconciliationData, selectedStage, sortColumn, sortDirection]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredAndSortedData.reduce((acc, row) => {
      acc.ovisPaymentAmount += row.ovis_payment_amount;
      acc.sfPaymentAmount += row.sf_payment_amount;
      acc.ovisGCI += row.ovis_gci;
      acc.sfGCI += row.sf_gci;
      acc.ovisAGCI += row.ovis_agci;
      acc.sfAGCI += row.sf_agci;
      acc.ovisHouse += row.ovis_house;
      acc.sfHouse += row.sf_house;
      acc.ovisMike += row.ovis_mike;
      acc.sfMike += row.sf_mike;
      acc.ovisArty += row.ovis_arty;
      acc.sfArty += row.sf_arty;
      acc.ovisGreg += row.ovis_greg;
      acc.sfGreg += row.sf_greg;
      return acc;
    }, {
      ovisPaymentAmount: 0,
      sfPaymentAmount: 0,
      ovisGCI: 0,
      sfGCI: 0,
      ovisAGCI: 0,
      sfAGCI: 0,
      ovisHouse: 0,
      sfHouse: 0,
      ovisMike: 0,
      sfMike: 0,
      ovisArty: 0,
      sfArty: 0,
      ovisGreg: 0,
      sfGreg: 0
    });
  }, [filteredAndSortedData]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getVarianceColor = (variance: number) => {
    if (Math.abs(variance) < 0.01) return 'text-gray-600';
    return variance > 0 ? 'text-green-600' : 'text-red-600';
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading reconciliation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading data: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Payment Reconciliation Report</h2>
        <p className="text-sm text-gray-600 mt-1">
          Compare OVIS payment data with Salesforce for active deals
        </p>
      </div>

      {/* Controls */}
      <div className="p-6 border-b border-gray-200 flex items-center gap-4">
        {/* Stage Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Stage
          </label>
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">All Stages</option>
            {stages.map(stage => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="ml-auto text-right">
          <div className="text-sm text-gray-600">Showing {filteredAndSortedData.length} deals</div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => handleSort('deal_name')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Deal Name {sortColumn === 'deal_name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Payment Amount</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">GCI</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-purple-50">AGCI</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-orange-50">House $</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-red-50">Mike Total</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Arty Total</th>
              <th colSpan={3} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-pink-50">Greg Total</th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-blue-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-blue-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-blue-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-green-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-green-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-green-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-purple-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-purple-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-purple-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-orange-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-orange-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-orange-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-red-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-red-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-red-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-yellow-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-yellow-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-yellow-50">Var</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-pink-50">OVIS</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-pink-50">SF</th>
              <th className="px-2 py-1 text-xs font-medium text-gray-500 text-center bg-pink-50">Var</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">
                  <a href={`/deal/${row.deal_id}`} className="text-blue-600 hover:underline">
                    {row.deal_name}
                  </a>
                </td>
                <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                  {row.ovis_stage}
                  {!row.stage_match && row.sf_stage && (
                    <div className="text-xs text-orange-600">SF: {row.sf_stage}</div>
                  )}
                </td>
                <td className="px-2 py-2 text-sm text-right bg-blue-50">{formatCurrency(row.ovis_payment_amount)}</td>
                <td className="px-2 py-2 text-sm text-right bg-blue-50">{formatCurrency(row.sf_payment_amount)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-blue-50 ${getVarianceColor(row.payment_variance)}`}>{formatCurrency(row.payment_variance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-green-50">{formatCurrency(row.ovis_gci)}</td>
                <td className="px-2 py-2 text-sm text-right bg-green-50">{formatCurrency(row.sf_gci)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-green-50 ${getVarianceColor(row.gci_variance)}`}>{formatCurrency(row.gci_variance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-purple-50">{formatCurrency(row.ovis_agci)}</td>
                <td className="px-2 py-2 text-sm text-right bg-purple-50">{formatCurrency(row.sf_agci)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-purple-50 ${getVarianceColor(row.agci_variance)}`}>{formatCurrency(row.agci_variance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-orange-50">{formatCurrency(row.ovis_house)}</td>
                <td className="px-2 py-2 text-sm text-right bg-orange-50">{formatCurrency(row.sf_house)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-orange-50 ${getVarianceColor(row.house_variance)}`}>{formatCurrency(row.house_variance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-red-50">{formatCurrency(row.ovis_mike)}</td>
                <td className="px-2 py-2 text-sm text-right bg-red-50">{formatCurrency(row.sf_mike)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-red-50 ${getVarianceColor(row.mike_variance)}`}>{formatCurrency(row.mike_variance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-yellow-50">{formatCurrency(row.ovis_arty)}</td>
                <td className="px-2 py-2 text-sm text-right bg-yellow-50">{formatCurrency(row.sf_arty)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-yellow-50 ${getVarianceColor(row.arty_variance)}`}>{formatCurrency(row.arty_variance)}</td>
                <td className="px-2 py-2 text-sm text-right bg-pink-50">{formatCurrency(row.ovis_greg)}</td>
                <td className="px-2 py-2 text-sm text-right bg-pink-50">{formatCurrency(row.sf_greg)}</td>
                <td className={`px-2 py-2 text-sm text-right font-semibold bg-pink-50 ${getVarianceColor(row.greg_variance)}`}>{formatCurrency(row.greg_variance)}</td>
              </tr>
            ))}
            {/* Totals Row */}
            <tr className="bg-gray-800 text-white font-bold">
              <td className="px-3 py-2 text-sm" colSpan={2}>TOTALS</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisPaymentAmount)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfPaymentAmount)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisPaymentAmount - totals.sfPaymentAmount)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGCI - totals.sfGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisAGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfAGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisAGCI - totals.sfAGCI)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisHouse)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfHouse)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisHouse - totals.sfHouse)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisMike)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfMike)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisMike - totals.sfMike)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisArty)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfArty)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisArty - totals.sfArty)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGreg)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.sfGreg)}</td>
              <td className="px-2 py-2 text-sm text-right">{formatCurrency(totals.ovisGreg - totals.sfGreg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReconciliationReport;
