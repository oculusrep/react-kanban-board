import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import QuickCommissionSplitModal from './QuickCommissionSplitModal';
import DealDetailsSlideout from '../DealDetailsSlideout';

// Broker IDs for the three principals
const BROKER_IDS = {
  mike: '38d4b67c-841d-4590-a909-523d3a4c6e4b',    // Mike Minihan
  arty: '1d049634-32fe-4834-8ca1-33f1cff0055a',    // Arty Santos
  greg: 'dbfdd8d4-5241-4cc2-be83-f7763f5519bf',    // Greg Bennett
};

// Stage IDs for filtering
const STAGE_IDS = {
  negotiatingLOI: '89b7ce02-d325-434a-8340-fab04fa57b8c',
  atLeasePSA: 'bd25eacc-e6c5-4e78-8d5f-25b4577ba5fd',
  underContractContingent: '583507f5-1c53-474b-b7e6-deb81d1b89d2',
  booked: '0fc71094-e33e-49ba-b675-d097bd477618',
  executedPayable: '70d9449c-c589-4b92-ac5d-f84c5eaef049',
  closedPaid: 'afa9a62e-9821-4c60-9db3-c0d51d009208',
};

interface DealDetail {
  id: string;
  deal_name: string;
  stage_label: string;
  gci: number;
  agci: number;
  house: number;
  mikeNet: number;
  artyNet: number;
  gregNet: number;
  dealValue: number;
  hasSplits: boolean;        // true if deal has any commission_split rows
  splitCount: number;        // number of broker splits assigned
}

interface ReportRow {
  category: string;
  gci: number;
  agci: number;
  house: number;
  mikeNet: number;
  artyNet: number;
  gregNet: number;
  dealCount: number | null;
  volume: number | null;
  deals?: DealDetail[];
  missingSplitsCount: number;  // count of deals with zero commission_split rows
}

interface DealData {
  id: string;
  deal_name: string | null;
  gci: number;
  agci: number;
  house_usd: number;
  house_percent: number;
  deal_value: number;
  stage_id: string;
  booked_date: string | null;
  house_only: boolean | null;
  stage?: { label: string };
}

interface CommissionSplitData {
  deal_id: string;
  broker_id: string;
  split_broker_total: number;
}

interface PaymentData {
  id: string;
  deal_id: string;
  payment_amount: number;
  agci: number;
  payment_received_date: string | null;
  payment_received: boolean;
  deal: {
    stage_id: string;
    house_percent: number;
  };
}

interface PaymentSplitData {
  payment_id: string;
  broker_id: string;
  split_broker_total: number;
}

export default function RobReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedDealForSplits, setSelectedDealForSplits] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const currentYearStart = `${currentYear}-01-01`;

  const toggleRowExpanded = (idx: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all deals with commission splits
      const { data: deals, error: dealsError } = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          gci,
          agci,
          house_usd,
          house_percent,
          deal_value,
          stage_id,
          booked_date,
          house_only,
          stage:stage_id(label)
        `)
        .neq('stage_id', '0e318cd6-a738-400a-98af-741479585057'); // Exclude Lost

      if (dealsError) throw dealsError;

      // Fetch all commission splits for the three brokers
      const { data: commissionSplits, error: splitsError } = await supabase
        .from('commission_split')
        .select('deal_id, broker_id, split_broker_total')
        .in('broker_id', [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg]);

      if (splitsError) throw splitsError;

      // Fetch payments with deal info
      const { data: payments, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_amount,
          agci,
          payment_received_date,
          payment_received,
          deal:deal_id (
            stage_id,
            house_percent
          )
        `)
        .eq('is_active', true);

      if (paymentsError) throw paymentsError;

      // Fetch payment splits for the three brokers
      const { data: paymentSplits, error: paymentSplitsError } = await supabase
        .from('payment_split')
        .select('payment_id, broker_id, split_broker_total')
        .in('broker_id', [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg]);

      if (paymentSplitsError) throw paymentSplitsError;

      // Build lookup maps
      const splitsByDeal = new Map<string, CommissionSplitData[]>();
      (commissionSplits || []).forEach(split => {
        const existing = splitsByDeal.get(split.deal_id) || [];
        existing.push(split);
        splitsByDeal.set(split.deal_id, existing);
      });

      const splitsByPayment = new Map<string, PaymentSplitData[]>();
      (paymentSplits || []).forEach(split => {
        const existing = splitsByPayment.get(split.payment_id) || [];
        existing.push(split);
        splitsByPayment.set(split.payment_id, existing);
      });

      // Helper to sum broker splits for deals
      const sumBrokerSplitsForDeals = (dealIds: string[], brokerId: string): number => {
        let total = 0;
        dealIds.forEach(dealId => {
          const splits = splitsByDeal.get(dealId) || [];
          const brokerSplit = splits.find(s => s.broker_id === brokerId);
          if (brokerSplit) {
            total += brokerSplit.split_broker_total || 0;
          }
        });
        return total;
      };

      // Helper to sum broker splits for payments
      const sumBrokerSplitsForPayments = (paymentIds: string[], brokerId: string): number => {
        let total = 0;
        paymentIds.forEach(paymentId => {
          const splits = splitsByPayment.get(paymentId) || [];
          const brokerSplit = splits.find(s => s.broker_id === brokerId);
          if (brokerSplit) {
            total += brokerSplit.split_broker_total || 0;
          }
        });
        return total;
      };

      // Helper to count deals where Greg has zero or no split
      const countDealsWithoutGregSplit = (dealIds: string[]): number => {
        return dealIds.filter(dealId => {
          const splits = splitsByDeal.get(dealId) || [];
          const gregSplit = splits.find(s => s.broker_id === BROKER_IDS.greg);
          return !gregSplit || (gregSplit.split_broker_total || 0) === 0;
        }).length;
      };

      // Build a map of deal IDs to deal data for easy lookup
      const dealsById = new Map<string, any>();
      (deals || []).forEach(d => dealsById.set(d.id, d));

      // Helper to count deals with NO commission splits or all $0 splits (excluding house_only deals)
      const countDealsWithoutSplits = (dealIds: string[]): number => {
        return dealIds.filter(dealId => {
          const deal = dealsById.get(dealId);
          // Don't flag house_only deals as missing splits
          if (deal?.house_only === true) return false;

          const splits = splitsByDeal.get(dealId) || [];
          if (splits.length === 0) return true;
          // Also flag deals where all splits have $0 totals
          const totalSplitValue = splits.reduce((sum, s) => sum + (s.split_broker_total || 0), 0);
          return totalSplitValue === 0;
        }).length;
      };

      // Helper to get broker split for a single deal
      const getBrokerSplitForDeal = (dealId: string, brokerId: string): number => {
        const splits = splitsByDeal.get(dealId) || [];
        const brokerSplit = splits.find(s => s.broker_id === brokerId);
        return brokerSplit?.split_broker_total || 0;
      };

      // Helper to build deal details array
      const buildDealDetails = (dealList: any[]): DealDetail[] => {
        return dealList.map(d => {
          const dealSplits = splitsByDeal.get(d.id) || [];
          // hasSplits is true if:
          // 1. Deal is marked as house_only, OR
          // 2. Has splits with non-zero totals
          const totalSplitValue = dealSplits.reduce((sum, s) => sum + (s.split_broker_total || 0), 0);
          const hasSplits = d.house_only === true || (dealSplits.length > 0 && totalSplitValue > 0);

          return {
            id: d.id,
            deal_name: d.deal_name || 'Unnamed Deal',
            stage_label: (d.stage as any)?.label || '',
            gci: d.gci || 0,
            agci: d.agci || 0,
            house: d.house_usd || 0,
            mikeNet: getBrokerSplitForDeal(d.id, BROKER_IDS.mike),
            artyNet: getBrokerSplitForDeal(d.id, BROKER_IDS.arty),
            gregNet: getBrokerSplitForDeal(d.id, BROKER_IDS.greg),
            dealValue: d.deal_value || 0,
            hasSplits,
            splitCount: dealSplits.length,
          };
        });
      };

      // Row 1: Booked/Closed (Booked, Executed Payable, Closed Paid with booked_date in current year)
      const bookedClosedStages = [STAGE_IDS.booked, STAGE_IDS.executedPayable, STAGE_IDS.closedPaid];
      const bookedClosedDeals = (deals || []).filter(d =>
        bookedClosedStages.includes(d.stage_id) &&
        d.booked_date &&
        d.booked_date >= currentYearStart
      );
      const bookedClosedIds = bookedClosedDeals.map(d => d.id);

      const bookedClosedRow: ReportRow = {
        category: 'Booked/Closed',
        gci: bookedClosedDeals.reduce((sum, d) => sum + (d.gci || 0), 0),
        agci: bookedClosedDeals.reduce((sum, d) => sum + (d.agci || 0), 0),
        house: bookedClosedDeals.reduce((sum, d) => sum + (d.house_usd || 0), 0),
        mikeNet: sumBrokerSplitsForDeals(bookedClosedIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForDeals(bookedClosedIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForDeals(bookedClosedIds, BROKER_IDS.greg),
        dealCount: countDealsWithoutGregSplit(bookedClosedIds),
        volume: bookedClosedDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        deals: buildDealDetails(bookedClosedDeals),
        missingSplitsCount: countDealsWithoutSplits(bookedClosedIds),
      };

      // Row 2: UC/Contingent (Under Contract / Contingent stage, no date filter)
      const ucContingentDeals = (deals || []).filter(d =>
        d.stage_id === STAGE_IDS.underContractContingent
      );
      const ucContingentIds = ucContingentDeals.map(d => d.id);

      const ucContingentRow: ReportRow = {
        category: 'UC / Contingent',
        gci: ucContingentDeals.reduce((sum, d) => sum + (d.gci || 0), 0),
        agci: ucContingentDeals.reduce((sum, d) => sum + (d.agci || 0), 0),
        house: ucContingentDeals.reduce((sum, d) => sum + (d.house_usd || 0), 0),
        mikeNet: sumBrokerSplitsForDeals(ucContingentIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForDeals(ucContingentIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForDeals(ucContingentIds, BROKER_IDS.greg),
        dealCount: countDealsWithoutGregSplit(ucContingentIds),
        volume: ucContingentDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        deals: buildDealDetails(ucContingentDeals),
        missingSplitsCount: countDealsWithoutSplits(ucContingentIds),
      };

      // Row 3: Pipeline 50%+ (Negotiating LOI, At Lease/PSA, no date filter)
      const pipelineStages = [STAGE_IDS.negotiatingLOI, STAGE_IDS.atLeasePSA];
      const pipelineDeals = (deals || []).filter(d =>
        pipelineStages.includes(d.stage_id)
      );
      const pipelineIds = pipelineDeals.map(d => d.id);

      const pipelineRow: ReportRow = {
        category: 'Pipeline 50%+',
        gci: pipelineDeals.reduce((sum, d) => sum + (d.gci || 0), 0),
        agci: pipelineDeals.reduce((sum, d) => sum + (d.agci || 0), 0),
        house: pipelineDeals.reduce((sum, d) => sum + (d.house_usd || 0), 0),
        mikeNet: sumBrokerSplitsForDeals(pipelineIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForDeals(pipelineIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForDeals(pipelineIds, BROKER_IDS.greg),
        dealCount: countDealsWithoutGregSplit(pipelineIds),
        volume: pipelineDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        deals: buildDealDetails(pipelineDeals),
        missingSplitsCount: countDealsWithoutSplits(pipelineIds),
      };

      // Row 4: Collected (payments with payment_received_date in current year)
      const collectedPayments = (payments || []).filter(p =>
        p.payment_received_date &&
        p.payment_received_date >= currentYearStart
      );
      const collectedPaymentIds = collectedPayments.map(p => p.id);

      // For collected payments, House $ = payment.agci * deal.house_percent
      const collectedHouse = collectedPayments.reduce((sum, p) => {
        const housePercent = (p.deal as any)?.house_percent || 0;
        return sum + ((p.agci || 0) * (housePercent / 100));
      }, 0);

      const collectedRow: ReportRow = {
        category: 'Collected',
        gci: collectedPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
        agci: collectedPayments.reduce((sum, p) => sum + (p.agci || 0), 0),
        house: collectedHouse,
        mikeNet: sumBrokerSplitsForPayments(collectedPaymentIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForPayments(collectedPaymentIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForPayments(collectedPaymentIds, BROKER_IDS.greg),
        dealCount: null,
        volume: null,
        missingSplitsCount: 0,  // N/A for payment rows
      };

      // Row 5: Invoiced Payments (pending payments on Booked or Executed Payable deals)
      const invoicedStages = [STAGE_IDS.booked, STAGE_IDS.executedPayable];
      const invoicedPayments = (payments || []).filter(p => {
        const dealStageId = (p.deal as any)?.stage_id;
        return (
          !p.payment_received_date &&
          p.payment_received === false &&
          invoicedStages.includes(dealStageId)
        );
      });
      const invoicedPaymentIds = invoicedPayments.map(p => p.id);

      // For invoiced payments, House $ = payment.agci * deal.house_percent
      const invoicedHouse = invoicedPayments.reduce((sum, p) => {
        const housePercent = (p.deal as any)?.house_percent || 0;
        return sum + ((p.agci || 0) * (housePercent / 100));
      }, 0);

      const invoicedRow: ReportRow = {
        category: 'Invoiced Payments',
        gci: invoicedPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
        agci: invoicedPayments.reduce((sum, p) => sum + (p.agci || 0), 0),
        house: invoicedHouse,
        mikeNet: sumBrokerSplitsForPayments(invoicedPaymentIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForPayments(invoicedPaymentIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForPayments(invoicedPaymentIds, BROKER_IDS.greg),
        dealCount: null,
        volume: null,
        missingSplitsCount: 0,  // N/A for payment rows
      };

      setReportData([
        bookedClosedRow,
        ucContingentRow,
        pipelineRow,
        collectedRow,
        invoicedRow,
      ]);
    } catch (err) {
      console.error('Error fetching Rob Report data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  // Split data into deal rows and payment rows
  const dealRows = useMemo(() => reportData.slice(0, 3), [reportData]);
  const paymentRows = useMemo(() => reportData.slice(3), [reportData]);

  // Calculate totals for deal rows only (first 3 rows)
  const dealTotals = useMemo(() => {
    return dealRows.reduce((acc, row) => ({
      gci: acc.gci + row.gci,
      agci: acc.agci + row.agci,
      house: acc.house + row.house,
      mikeNet: acc.mikeNet + row.mikeNet,
      artyNet: acc.artyNet + row.artyNet,
      gregNet: acc.gregNet + row.gregNet,
      dealCount: acc.dealCount + (row.dealCount || 0),
      volume: acc.volume + (row.volume || 0),
      missingSplitsCount: acc.missingSplitsCount + (row.missingSplitsCount || 0),
    }), {
      gci: 0,
      agci: 0,
      house: 0,
      mikeNet: 0,
      artyNet: 0,
      gregNet: 0,
      dealCount: 0,
      volume: 0,
      missingSplitsCount: 0,
    });
  }, [dealRows]);

  // Calculate totals for payment rows
  const paymentTotals = useMemo(() => {
    return paymentRows.reduce((acc, row) => ({
      gci: acc.gci + row.gci,
      agci: acc.agci + row.agci,
      house: acc.house + row.house,
      mikeNet: acc.mikeNet + row.mikeNet,
      artyNet: acc.artyNet + row.artyNet,
      gregNet: acc.gregNet + row.gregNet,
    }), {
      gci: 0,
      agci: 0,
      house: 0,
      mikeNet: 0,
      artyNet: 0,
      gregNet: 0,
    });
  }, [paymentRows]);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-600">Loading Rob Report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rob Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              Deal pipeline and commission summary for {currentYear}
            </p>
          </div>
          <button
            onClick={() => fetchReportData()}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Pipeline Section */}
      <div className="px-6 py-3 bg-gray-100 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Pipeline</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Stage
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                GCI
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                AGCI
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                House $
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-blue-50">
                Mike Net
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-green-50">
                Arty Net
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-purple-50">
                Greg Net
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <div className="flex items-center justify-end gap-1">
                  # Deals
                  <div className="relative group">
                    <svg
                      className="h-4 w-4 text-gray-400 cursor-help"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
                      <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                        Deal count does not include any of Greg's Deals
                      </div>
                    </div>
                  </div>
                </div>
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Volume
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {dealRows.map((row, idx) => (
              <React.Fragment key={idx}>
                <tr
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => row.deals && row.deals.length > 0 && toggleRowExpanded(idx)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {row.deals && row.deals.length > 0 && (
                        <svg
                          className={`h-4 w-4 text-gray-500 transition-transform ${expandedRows.has(idx) ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                      {row.category}
                      {row.missingSplitsCount > 0 && (
                        <span className="text-orange-500 text-xs font-normal">
                          ⚠️ {row.missingSplitsCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    {formatCurrency(row.gci)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    {formatCurrency(row.agci)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    {formatCurrency(row.house)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 bg-blue-50">
                    {formatCurrency(row.mikeNet)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 bg-green-50">
                    {formatCurrency(row.artyNet)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 bg-purple-50">
                    {formatCurrency(row.gregNet)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    {row.dealCount !== null ? row.dealCount : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    {row.volume !== null ? formatCurrency(row.volume) : '-'}
                  </td>
                </tr>
                {/* Expanded deal details */}
                {expandedRows.has(idx) && row.deals && (
                  <>
                    {row.deals.map((deal) => (
                      <tr
                        key={deal.id}
                        className={`border-l-4 ${
                          deal.hasSplits
                            ? 'bg-gray-50 border-blue-400'
                            : 'bg-orange-50 border-orange-400'
                        }`}
                      >
                        <td className="px-4 py-2 text-sm text-gray-600 pl-10">
                          <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDealId(deal.id);
                                }}
                                className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                              >
                                {!deal.hasSplits && <span className="text-orange-500 mr-1">⚠️</span>}
                                {deal.deal_name}
                              </button>
                              <span className="text-xs text-gray-500">{deal.stage_label}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDealForSplits({ id: deal.id, name: deal.deal_name });
                              }}
                              className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                deal.hasSplits
                                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              }`}
                            >
                              {deal.hasSplits ? 'Edit Splits' : '+ Add Splits'}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(deal.gci)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(deal.agci)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(deal.house)}
                        </td>
                        <td className={`px-4 py-2 text-sm text-right ${deal.hasSplits ? 'text-gray-600 bg-blue-50/50' : 'text-orange-400'}`}>
                          {deal.hasSplits ? formatCurrency(deal.mikeNet) : '—'}
                        </td>
                        <td className={`px-4 py-2 text-sm text-right ${deal.hasSplits ? 'text-gray-600 bg-green-50/50' : 'text-orange-400'}`}>
                          {deal.hasSplits ? formatCurrency(deal.artyNet) : '—'}
                        </td>
                        <td className={`px-4 py-2 text-sm text-right ${deal.hasSplits ? 'text-gray-600 bg-purple-50/50' : 'text-orange-400'}`}>
                          {deal.hasSplits ? formatCurrency(deal.gregNet) : '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          -
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(deal.dealValue)}
                        </td>
                      </tr>
                    ))}
                    {/* Subtotal row for expanded section */}
                    <tr className="bg-gray-200 border-l-4 border-blue-400 font-medium">
                      <td className="px-4 py-2 text-sm text-gray-700 pl-10">
                        Subtotal ({row.deals.length} deals)
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.deals.reduce((sum, d) => sum + d.gci, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.deals.reduce((sum, d) => sum + d.agci, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.deals.reduce((sum, d) => sum + d.house, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 bg-blue-100">
                        {formatCurrency(row.deals.reduce((sum, d) => sum + d.mikeNet, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 bg-green-100">
                        {formatCurrency(row.deals.reduce((sum, d) => sum + d.artyNet, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 bg-purple-100">
                        {formatCurrency(row.deals.reduce((sum, d) => sum + d.gregNet, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {row.deals.length}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.deals.reduce((sum, d) => sum + d.dealValue, 0))}
                      </td>
                    </tr>
                  </>
                )}
              </React.Fragment>
            ))}
            {/* Deal Totals Row */}
            <tr className="bg-gray-800 text-white font-semibold">
              <td className="px-4 py-3 text-sm">
                TOTALS
                {dealTotals.missingSplitsCount > 0 && (
                  <span className="ml-2 text-orange-300 text-xs font-normal">
                    ⚠️ {dealTotals.missingSplitsCount}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(dealTotals.gci)}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(dealTotals.agci)}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(dealTotals.house)}</td>
              <td className="px-4 py-3 text-sm text-right bg-blue-900">{formatCurrency(dealTotals.mikeNet)}</td>
              <td className="px-4 py-3 text-sm text-right bg-green-900">{formatCurrency(dealTotals.artyNet)}</td>
              <td className="px-4 py-3 text-sm text-right bg-purple-900">{formatCurrency(dealTotals.gregNet)}</td>
              <td className="px-4 py-3 text-sm text-right">{dealTotals.dealCount}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(dealTotals.volume)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payments Section */}
      <div className="mt-8 px-6 py-3 bg-gray-100 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Payments</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                GCI
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                AGCI
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                House $
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-blue-50">
                Mike Net
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-green-50">
                Arty Net
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider bg-purple-50">
                Greg Net
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paymentRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {row.category}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {formatCurrency(row.gci)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {formatCurrency(row.agci)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {formatCurrency(row.house)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 bg-blue-50">
                  {formatCurrency(row.mikeNet)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 bg-green-50">
                  {formatCurrency(row.artyNet)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 bg-purple-50">
                  {formatCurrency(row.gregNet)}
                </td>
              </tr>
            ))}
            {/* Payment Totals Row */}
            <tr className="bg-gray-800 text-white font-semibold">
              <td className="px-4 py-3 text-sm">TOTALS</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(paymentTotals.gci)}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(paymentTotals.agci)}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(paymentTotals.house)}</td>
              <td className="px-4 py-3 text-sm text-right bg-blue-900">{formatCurrency(paymentTotals.mikeNet)}</td>
              <td className="px-4 py-3 text-sm text-right bg-green-900">{formatCurrency(paymentTotals.artyNet)}</td>
              <td className="px-4 py-3 text-sm text-right bg-purple-900">{formatCurrency(paymentTotals.gregNet)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer Notes */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Booked/Closed:</strong> Deals in Booked, Executed Payable, or Closed Paid stages with booked date in {currentYear}</p>
          <p><strong>UC/Contingent:</strong> All deals in Under Contract / Contingent stage</p>
          <p><strong>Pipeline 50%+:</strong> All deals in Negotiating LOI or At Lease/PSA stages</p>
          <p><strong>Collected:</strong> Payments received in {currentYear}</p>
          <p><strong>Invoiced Payments:</strong> Pending payments on Booked or Executed Payable deals</p>
          <p><strong>⚠️ Missing:</strong> Deals with no commission splits assigned - click to add splits</p>
        </div>
      </div>

      {/* Quick Commission Split Modal */}
      {selectedDealForSplits && (
        <QuickCommissionSplitModal
          isOpen={!!selectedDealForSplits}
          onClose={() => setSelectedDealForSplits(null)}
          dealId={selectedDealForSplits.id}
          dealName={selectedDealForSplits.name}
          onSplitsUpdated={fetchReportData}
        />
      )}

      {/* Deal Details Slideout */}
      <DealDetailsSlideout
        dealId={selectedDealId}
        isOpen={!!selectedDealId}
        onClose={() => setSelectedDealId(null)}
        onDealUpdated={fetchReportData}
      />
    </div>
  );
}
