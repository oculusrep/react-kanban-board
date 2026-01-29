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

interface PaymentDetail {
  id: string;
  deal_id: string;
  deal_name: string;
  payment_name: string;
  invoice_number: string | null;
  paymentAmount: number;     // raw payment_amount before deductions
  gci: number;               // payment_amount - referral_fee
  agci: number;
  house: number;
  mikeNet: number;
  artyNet: number;
  gregNet: number;
  payment_received_date: string | null;
  payment_due_date: string | null;
  isOverdueOrMissing: boolean;  // true if payment_due_date is null or before today
}

interface ReportRow {
  category: string;
  paymentAmount: number;     // sum of raw payment_amount (only for payment rows)
  gci: number;
  agci: number;
  house: number;
  mikeNet: number;
  artyNet: number;
  gregNet: number;
  dealCount: number | null;
  volume: number | null;
  deals?: DealDetail[];
  payments?: PaymentDetail[];
  missingSplitsCount: number;  // count of deals with zero commission_split rows
  overduePaymentsCount: number;  // count of payments with null or past due date
}

interface CommissionSplitData {
  deal_id: string;
  broker_id: string;
  split_broker_total: number;
  split_origination_percent: number;
  split_site_percent: number;
  split_deal_percent: number;
}

interface PaymentSplitData {
  payment_id: string;
  broker_id: string;
  split_broker_total: number;
}

interface RobReportProps {
  readOnly?: boolean;
}

interface YearMetrics {
  avgTransactionGci: number;
  totalDeals: number;
  mikeDeals: number;
  artyDeals: number;
  gregDeals: number;
  totalGci: number;
}

interface ClientMetrics {
  clientId: string;
  clientName: string;
  totalGci: number;
  dealCount: number;
  avgTransactionGci: number;
}

export default function RobReport({ readOnly = false }: RobReportProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [expandedPaymentRows, setExpandedPaymentRows] = useState<Set<number>>(new Set());
  const [selectedDealForSplits, setSelectedDealForSplits] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedDealInitialTab, setSelectedDealInitialTab] = useState<'overview' | 'payments'>('overview');
  const [editingPaymentDate, setEditingPaymentDate] = useState<string | null>(null);
  const [savingPaymentDate, setSavingPaymentDate] = useState<string | null>(null);

  // Metrics state
  const [yearMetrics, setYearMetrics] = useState<YearMetrics | null>(null);
  const [clientMetrics, setClientMetrics] = useState<ClientMetrics[]>([]);

  // Year selector
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const isCurrentYear = selectedYear === currentYear;

  // Generate year options from 2020 to current year
  const yearOptions = useMemo(() => {
    const years = [];
    for (let year = currentYear; year >= 2020; year--) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  // Date range for selected year
  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = `${selectedYear}-12-31`;

  // Make report effectively read-only for historical years
  const effectiveReadOnly = readOnly || !isCurrentYear;

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

  const togglePaymentRowExpanded = (idx: number) => {
    setExpandedPaymentRows(prev => {
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
  }, [selectedYear]);

  // Update payment estimated date
  const updatePaymentDate = async (paymentId: string, newDate: string | null) => {
    setSavingPaymentDate(paymentId);
    try {
      const { error } = await supabase
        .from('payment')
        .update({ payment_date_estimated: newDate || null })
        .eq('id', paymentId);

      if (error) throw error;

      // Refresh data after update
      await fetchReportData();
    } catch (err) {
      console.error('Error updating payment date:', err);
    } finally {
      setSavingPaymentDate(null);
      setEditingPaymentDate(null);
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all deals with commission splits (include fields needed for on-the-fly calculation)
      const { data: deals, error: dealsError } = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          gci,
          agci,
          fee,
          referral_fee_usd,
          house_usd,
          house_percent,
          origination_percent,
          site_percent,
          deal_percent,
          deal_value,
          stage_id,
          booked_date,
          house_only,
          client_id,
          stage:stage_id(label),
          client:client_id(id, client_name)
        `)
        .neq('stage_id', '0e318cd6-a738-400a-98af-741479585057'); // Exclude Lost

      if (dealsError) throw dealsError;

      // Fetch all commission splits for the three brokers (include percentage fields for on-the-fly calculation)
      const { data: commissionSplits, error: splitsError } = await supabase
        .from('commission_split')
        .select('deal_id, broker_id, split_broker_total, split_origination_percent, split_site_percent, split_deal_percent')
        .in('broker_id', [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg]);

      if (splitsError) throw splitsError;

      // Fetch payments with deal info
      const { data: payments, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_name,
          payment_amount,
          referral_fee_usd,
          agci,
          payment_received_date,
          payment_date_estimated,
          payment_received,
          orep_invoice,
          deal:deal_id (
            deal_name,
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

      // Build a map of deal IDs to deal data for easy lookup (needed for on-the-fly calculations)
      const dealsById = new Map<string, any>();
      (deals || []).forEach(d => dealsById.set(d.id, d));

      // Helper to calculate broker total on-the-fly from percentages
      const calculateBrokerTotalForDeal = (dealId: string, brokerId: string): number => {
        const deal = dealsById.get(dealId);
        if (!deal) return 0;

        const splits = splitsByDeal.get(dealId) || [];
        const brokerSplit = splits.find(s => s.broker_id === brokerId);
        if (!brokerSplit) return 0;

        // Calculate base amounts (same logic as useCommissionCalculations)
        const gci = deal.fee || 0;
        const referralFeeUsd = deal.referral_fee_usd || 0;
        const houseUsd = deal.house_usd || 0;
        const agci = gci - referralFeeUsd - houseUsd;

        // Deal-level USD amounts
        const originationUSD = ((deal.origination_percent || 0) / 100) * agci;
        const siteUSD = ((deal.site_percent || 0) / 100) * agci;
        const dealUSD = ((deal.deal_percent || 0) / 100) * agci;

        // Calculate broker's share from percentages
        const originationSplitUSD = ((brokerSplit.split_origination_percent || 0) / 100) * originationUSD;
        const siteSplitUSD = ((brokerSplit.split_site_percent || 0) / 100) * siteUSD;
        const dealSplitUSD = ((brokerSplit.split_deal_percent || 0) / 100) * dealUSD;

        return originationSplitUSD + siteSplitUSD + dealSplitUSD;
      };

      // Helper to sum broker splits for deals (calculated on-the-fly)
      const sumBrokerSplitsForDeals = (dealIds: string[], brokerId: string): number => {
        let total = 0;
        dealIds.forEach(dealId => {
          total += calculateBrokerTotalForDeal(dealId, brokerId);
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

      // Helper to count deals where Greg has zero or no split (calculated on-the-fly)
      const countDealsWithoutGregSplit = (dealIds: string[]): number => {
        return dealIds.filter(dealId => {
          const calculatedGregTotal = calculateBrokerTotalForDeal(dealId, BROKER_IDS.greg);
          return calculatedGregTotal === 0;
        }).length;
      };

      // Helper to count deals with NO commission splits or all $0 splits (excluding house_only deals)
      const countDealsWithoutSplits = (dealIds: string[]): number => {
        return dealIds.filter(dealId => {
          const deal = dealsById.get(dealId);
          // Don't flag house_only deals as missing splits
          if (deal?.house_only === true) return false;

          const splits = splitsByDeal.get(dealId) || [];
          if (splits.length === 0) return true;
          // Calculate total split value on-the-fly
          const totalSplitValue = [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg].reduce(
            (sum, brokerId) => sum + calculateBrokerTotalForDeal(dealId, brokerId), 0
          );
          return totalSplitValue === 0;
        }).length;
      };

      // Helper to get broker split for a single deal (calculated on-the-fly)
      const getBrokerSplitForDeal = (dealId: string, brokerId: string): number => {
        return calculateBrokerTotalForDeal(dealId, brokerId);
      };

      // Helper to build deal details array
      const buildDealDetails = (dealList: any[]): DealDetail[] => {
        return dealList.map(d => {
          const dealSplits = splitsByDeal.get(d.id) || [];
          // Calculate broker nets on-the-fly
          const mikeNet = getBrokerSplitForDeal(d.id, BROKER_IDS.mike);
          const artyNet = getBrokerSplitForDeal(d.id, BROKER_IDS.arty);
          const gregNet = getBrokerSplitForDeal(d.id, BROKER_IDS.greg);
          // hasSplits is true if:
          // 1. Deal is marked as house_only, OR
          // 2. Has splits with non-zero calculated totals
          const totalSplitValue = mikeNet + artyNet + gregNet;
          const hasSplits = d.house_only === true || (dealSplits.length > 0 && totalSplitValue > 0);

          return {
            id: d.id,
            deal_name: d.deal_name || 'Unnamed Deal',
            stage_label: (d.stage as any)?.label || '',
            gci: d.gci || 0,
            agci: d.agci || 0,
            house: d.house_usd || 0,
            mikeNet,
            artyNet,
            gregNet,
            dealValue: d.deal_value || 0,
            hasSplits,
            splitCount: dealSplits.length,
          };
        });
      };

      // Helper to get broker split for a single payment
      const getBrokerSplitForPayment = (paymentId: string, brokerId: string): number => {
        const splits = splitsByPayment.get(paymentId) || [];
        const brokerSplit = splits.find(s => s.broker_id === brokerId);
        return brokerSplit?.split_broker_total || 0;
      };

      // Helper to check if payment is overdue or missing date
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      // Helper to build payment details array
      const buildPaymentDetails = (paymentList: any[]): PaymentDetail[] => {
        return paymentList.map(p => {
          const housePercent = (p.deal as any)?.house_percent || 0;
          const house = (p.agci || 0) * (housePercent / 100);
          const paymentAmount = p.payment_amount || 0;
          // GCI = payment_amount - referral_fee_usd
          const gci = paymentAmount - (p.referral_fee_usd || 0);
          // Check if payment due date is null or before today
          const isOverdueOrMissing = !p.payment_date_estimated || p.payment_date_estimated < today;

          return {
            id: p.id,
            deal_id: p.deal_id,
            deal_name: (p.deal as any)?.deal_name || 'Unnamed Deal',
            payment_name: p.payment_name || 'Unnamed Payment',
            invoice_number: p.orep_invoice || null,
            paymentAmount,
            gci,
            agci: p.agci || 0,
            house,
            mikeNet: getBrokerSplitForPayment(p.id, BROKER_IDS.mike),
            artyNet: getBrokerSplitForPayment(p.id, BROKER_IDS.arty),
            gregNet: getBrokerSplitForPayment(p.id, BROKER_IDS.greg),
            payment_received_date: p.payment_received_date,
            payment_due_date: p.payment_date_estimated,
            isOverdueOrMissing,
          };
        });
      };

      // Row 1: Booked/Closed (Booked, Executed Payable, Closed Paid with booked_date in selected year)
      const bookedClosedStages = [STAGE_IDS.booked, STAGE_IDS.executedPayable, STAGE_IDS.closedPaid];
      const bookedClosedDeals = (deals || []).filter(d =>
        bookedClosedStages.includes(d.stage_id) &&
        d.booked_date &&
        d.booked_date >= yearStart &&
        d.booked_date <= yearEnd
      );
      const bookedClosedIds = bookedClosedDeals.map(d => d.id);

      const bookedClosedRow: ReportRow = {
        category: 'Booked/Closed',
        paymentAmount: 0,  // N/A for deal rows
        gci: bookedClosedDeals.reduce((sum, d) => sum + (d.gci || 0), 0),
        agci: bookedClosedDeals.reduce((sum, d) => sum + (d.agci || 0), 0),
        house: bookedClosedDeals.reduce((sum, d) => sum + (d.house_usd || 0), 0),
        mikeNet: sumBrokerSplitsForDeals(bookedClosedIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForDeals(bookedClosedIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForDeals(bookedClosedIds, BROKER_IDS.greg),
        dealCount: bookedClosedDeals.length,
        volume: bookedClosedDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        deals: buildDealDetails(bookedClosedDeals),
        missingSplitsCount: countDealsWithoutSplits(bookedClosedIds),
        overduePaymentsCount: 0,  // N/A for deal rows
      };

      // Calculate year metrics for Booked/Closed deals
      const totalGci = bookedClosedDeals.reduce((sum, d) => sum + (d.gci || 0), 0);
      const totalDeals = bookedClosedDeals.length;
      const avgTransactionGci = totalDeals > 0 ? totalGci / totalDeals : 0;

      // Count deals by broker - if broker has a split on the deal, they get credit
      let mikeDeals = 0;
      let artyDeals = 0;
      let gregDeals = 0;
      bookedClosedIds.forEach(dealId => {
        const splits = splitsByDeal.get(dealId) || [];
        if (splits.some(s => s.broker_id === BROKER_IDS.mike && calculateBrokerTotalForDeal(dealId, BROKER_IDS.mike) > 0)) {
          mikeDeals++;
        }
        if (splits.some(s => s.broker_id === BROKER_IDS.arty && calculateBrokerTotalForDeal(dealId, BROKER_IDS.arty) > 0)) {
          artyDeals++;
        }
        if (splits.some(s => s.broker_id === BROKER_IDS.greg && calculateBrokerTotalForDeal(dealId, BROKER_IDS.greg) > 0)) {
          gregDeals++;
        }
      });

      setYearMetrics({
        avgTransactionGci,
        totalDeals,
        mikeDeals,
        artyDeals,
        gregDeals,
        totalGci,
      });

      // Calculate client metrics - group by client
      const clientMetricsMap = new Map<string, { clientName: string; totalGci: number; dealCount: number }>();
      bookedClosedDeals.forEach(deal => {
        const clientId = deal.client_id || 'unknown';
        const clientName = (deal.client as any)?.client_name || 'Unknown Client';
        const existing = clientMetricsMap.get(clientId) || { clientName, totalGci: 0, dealCount: 0 };
        existing.totalGci += deal.gci || 0;
        existing.dealCount += 1;
        clientMetricsMap.set(clientId, existing);
      });

      // Convert to array and calculate avg, then sort by totalGci descending
      const clientMetricsArray: ClientMetrics[] = Array.from(clientMetricsMap.entries())
        .map(([clientId, data]) => ({
          clientId,
          clientName: data.clientName,
          totalGci: data.totalGci,
          dealCount: data.dealCount,
          avgTransactionGci: data.dealCount > 0 ? data.totalGci / data.dealCount : 0,
        }))
        .sort((a, b) => b.totalGci - a.totalGci);

      setClientMetrics(clientMetricsArray);

      // Row 2: UC/Contingent (Under Contract / Contingent stage, no date filter)
      const ucContingentDeals = (deals || []).filter(d =>
        d.stage_id === STAGE_IDS.underContractContingent
      );
      const ucContingentIds = ucContingentDeals.map(d => d.id);

      const ucContingentRow: ReportRow = {
        category: 'UC / Contingent',
        paymentAmount: 0,  // N/A for deal rows
        gci: ucContingentDeals.reduce((sum, d) => sum + (d.gci || 0), 0),
        agci: ucContingentDeals.reduce((sum, d) => sum + (d.agci || 0), 0),
        house: ucContingentDeals.reduce((sum, d) => sum + (d.house_usd || 0), 0),
        mikeNet: sumBrokerSplitsForDeals(ucContingentIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForDeals(ucContingentIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForDeals(ucContingentIds, BROKER_IDS.greg),
        dealCount: ucContingentDeals.length,
        volume: ucContingentDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        deals: buildDealDetails(ucContingentDeals),
        missingSplitsCount: countDealsWithoutSplits(ucContingentIds),
        overduePaymentsCount: 0,  // N/A for deal rows
      };

      // Row 3: Pipeline 50%+ (Negotiating LOI, At Lease/PSA, no date filter)
      const pipelineStages = [STAGE_IDS.negotiatingLOI, STAGE_IDS.atLeasePSA];
      const pipelineDeals = (deals || []).filter(d =>
        pipelineStages.includes(d.stage_id)
      );
      const pipelineIds = pipelineDeals.map(d => d.id);

      const pipelineRow: ReportRow = {
        category: 'Pipeline 50%+',
        paymentAmount: 0,  // N/A for deal rows
        gci: pipelineDeals.reduce((sum, d) => sum + (d.gci || 0), 0),
        agci: pipelineDeals.reduce((sum, d) => sum + (d.agci || 0), 0),
        house: pipelineDeals.reduce((sum, d) => sum + (d.house_usd || 0), 0),
        mikeNet: sumBrokerSplitsForDeals(pipelineIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForDeals(pipelineIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForDeals(pipelineIds, BROKER_IDS.greg),
        dealCount: pipelineDeals.length,
        volume: pipelineDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0),
        deals: buildDealDetails(pipelineDeals),
        missingSplitsCount: countDealsWithoutSplits(pipelineIds),
        overduePaymentsCount: 0,  // N/A for deal rows
      };

      // Row 4: Collected (payments with payment_received=true AND payment_received_date in selected year)
      const collectedPayments = (payments || []).filter(p =>
        p.payment_received === true &&
        p.payment_received_date &&
        p.payment_received_date >= yearStart &&
        p.payment_received_date <= yearEnd
      ).sort((a, b) => {
        // Sort by payment_received_date ascending
        const dateA = a.payment_received_date || '';
        const dateB = b.payment_received_date || '';
        return dateA.localeCompare(dateB);
      });
      const collectedPaymentIds = collectedPayments.map(p => p.id);

      // For collected payments, House $ = payment.agci * deal.house_percent
      const collectedHouse = collectedPayments.reduce((sum, p) => {
        const housePercent = (p.deal as any)?.house_percent || 0;
        return sum + ((p.agci || 0) * (housePercent / 100));
      }, 0);

      const collectedRow: ReportRow = {
        category: 'Collected',
        paymentAmount: collectedPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
        // GCI = payment_amount - referral_fee_usd
        gci: collectedPayments.reduce((sum, p) => sum + ((p.payment_amount || 0) - (p.referral_fee_usd || 0)), 0),
        agci: collectedPayments.reduce((sum, p) => sum + (p.agci || 0), 0),
        house: collectedHouse,
        mikeNet: sumBrokerSplitsForPayments(collectedPaymentIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForPayments(collectedPaymentIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForPayments(collectedPaymentIds, BROKER_IDS.greg),
        dealCount: null,
        volume: null,
        payments: buildPaymentDetails(collectedPayments),
        missingSplitsCount: 0,  // N/A for payment rows
        overduePaymentsCount: 0,  // N/A for collected payments
      };

      // Row 5: Invoiced Payments (pending payments on Booked or Executed Payable deals)
      const invoicedStages = [STAGE_IDS.booked, STAGE_IDS.executedPayable];
      const invoicedPayments = (payments || []).filter(p => {
        const dealStageId = (p.deal as any)?.stage_id;
        return (
          !p.payment_received_date &&
          (p.payment_received === false || p.payment_received === null) &&
          invoicedStages.includes(dealStageId)
        );
      }).sort((a, b) => {
        // Sort by payment_date_estimated ascending
        const dateA = a.payment_date_estimated || '';
        const dateB = b.payment_date_estimated || '';
        return dateA.localeCompare(dateB);
      });
      const invoicedPaymentIds = invoicedPayments.map(p => p.id);

      // For invoiced payments, House $ = payment.agci * deal.house_percent
      const invoicedHouse = invoicedPayments.reduce((sum, p) => {
        const housePercent = (p.deal as any)?.house_percent || 0;
        return sum + ((p.agci || 0) * (housePercent / 100));
      }, 0);

      // Count overdue or missing estimated dates for invoiced payments
      const overdueInvoicedCount = invoicedPayments.filter(p =>
        !p.payment_date_estimated || p.payment_date_estimated < today
      ).length;

      const invoicedRow: ReportRow = {
        category: 'Invoiced Payments',
        paymentAmount: invoicedPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0),
        // GCI = payment_amount - referral_fee_usd
        gci: invoicedPayments.reduce((sum, p) => sum + ((p.payment_amount || 0) - (p.referral_fee_usd || 0)), 0),
        agci: invoicedPayments.reduce((sum, p) => sum + (p.agci || 0), 0),
        house: invoicedHouse,
        mikeNet: sumBrokerSplitsForPayments(invoicedPaymentIds, BROKER_IDS.mike),
        artyNet: sumBrokerSplitsForPayments(invoicedPaymentIds, BROKER_IDS.arty),
        gregNet: sumBrokerSplitsForPayments(invoicedPaymentIds, BROKER_IDS.greg),
        dealCount: null,
        volume: null,
        payments: buildPaymentDetails(invoicedPayments),
        missingSplitsCount: 0,  // N/A for payment rows
        overduePaymentsCount: overdueInvoicedCount,
      };

      // For current year: show all rows
      // For previous years: only show Booked/Closed and Collected
      if (isCurrentYear) {
        setReportData([
          bookedClosedRow,
          ucContingentRow,
          pipelineRow,
          collectedRow,
          invoicedRow,
        ]);
      } else {
        setReportData([
          bookedClosedRow,
          collectedRow,
        ]);
      }
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    const date = new Date(dateString + 'T00:00:00'); // Prevent timezone issues
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Split data into deal rows and payment rows
  // For current year: first 3 are deals, rest are payments
  // For previous years: first 1 is deals (Booked/Closed), rest are payments (Collected)
  const dealRows = useMemo(() => {
    if (isCurrentYear) {
      return reportData.slice(0, 3);
    }
    return reportData.slice(0, 1); // Just Booked/Closed for previous years
  }, [reportData, isCurrentYear]);

  const paymentRows = useMemo(() => {
    if (isCurrentYear) {
      return reportData.slice(3);
    }
    return reportData.slice(1); // Just Collected for previous years
  }, [reportData, isCurrentYear]);

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
      paymentAmount: acc.paymentAmount + row.paymentAmount,
      gci: acc.gci + row.gci,
      agci: acc.agci + row.agci,
      house: acc.house + row.house,
      mikeNet: acc.mikeNet + row.mikeNet,
      artyNet: acc.artyNet + row.artyNet,
      gregNet: acc.gregNet + row.gregNet,
    }), {
      paymentAmount: 0,
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
              Deal pipeline and commission summary for {selectedYear}
              {!isCurrentYear && <span className="ml-2 text-amber-600 font-medium">(Historical)</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Year Selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {yearOptions.map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
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
                # Deals
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
                  onClick={() => row.deals && toggleRowExpanded(idx)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {row.deals && (
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
                      {!effectiveReadOnly && row.missingSplitsCount > 0 && (
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
                    {row.deals.length === 0 && (
                      <tr className="bg-gray-50 border-l-4 border-gray-300">
                        <td colSpan={9} className="px-4 py-3 text-sm text-gray-500 text-center italic">
                          No deals in this category yet
                        </td>
                      </tr>
                    )}
                    {row.deals.map((deal) => (
                      <tr
                        key={deal.id}
                        className={`border-l-4 ${
                          effectiveReadOnly || deal.hasSplits
                            ? 'bg-gray-50 border-blue-400'
                            : 'bg-orange-50 border-orange-400'
                        }`}
                      >
                        <td className="px-4 py-2 text-sm text-gray-600 pl-10">
                          <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                              {effectiveReadOnly ? (
                                <span className="font-medium text-gray-900">
                                  {deal.deal_name}
                                </span>
                              ) : (
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
                              )}
                              <span className="text-xs text-gray-500">{deal.stage_label}</span>
                            </div>
                            {!effectiveReadOnly && (
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
                            )}
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
                    {row.deals.length > 0 && (
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
                    )}
                  </>
                )}
              </React.Fragment>
            ))}
            {/* Deal Totals Row */}
            <tr className="bg-gray-800 text-white font-semibold">
              <td className="px-4 py-3 text-sm">
                TOTALS
                {!effectiveReadOnly && dealTotals.missingSplitsCount > 0 && (
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
                Payment Amt
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
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paymentRows.map((row, idx) => (
              <React.Fragment key={idx}>
                <tr
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => row.payments && row.payments.length > 0 && togglePaymentRowExpanded(idx)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {row.payments && row.payments.length > 0 && (
                        <svg
                          className={`h-4 w-4 text-gray-500 transition-transform ${expandedPaymentRows.has(idx) ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                      {row.category}
                      {!effectiveReadOnly && row.overduePaymentsCount > 0 && (
                        <span className="text-orange-500 text-xs font-normal">
                          ⚠️ {row.overduePaymentsCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">
                    {formatCurrency(row.paymentAmount)}
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
                    -
                  </td>
                </tr>
                {/* Expanded payment details */}
                {expandedPaymentRows.has(idx) && row.payments && (
                  <>
                    {row.payments.map((payment) => {
                      // Only show overdue warning for Invoiced Payments, not Collected
                      const isOverdue = row.category === 'Invoiced Payments' && payment.isOverdueOrMissing;
                      return (
                      <tr
                        key={payment.id}
                        className={`border-l-4 ${
                          isOverdue && !effectiveReadOnly
                            ? 'bg-orange-50 border-orange-400'
                            : 'bg-gray-50 border-blue-400'
                        }`}
                      >
                        <td className="px-4 py-2 text-sm text-gray-600 pl-10">
                          <div className="flex flex-col">
                            {effectiveReadOnly ? (
                              <span className="font-medium text-gray-900">{payment.deal_name}</span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDealInitialTab('payments');
                                  setSelectedDealId(payment.deal_id);
                                }}
                                className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                              >
                                {isOverdue && <span className="text-orange-500 mr-1">⚠️</span>}
                                {payment.deal_name}
                              </button>
                            )}
                            <span className="text-xs text-gray-500">
                              {payment.payment_name}
                              {payment.invoice_number && (
                                <span className="ml-2 text-green-600 font-medium">INV {payment.invoice_number}</span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(payment.paymentAmount)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(payment.gci)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(payment.agci)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600">
                          {formatCurrency(payment.house)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600 bg-blue-50/50">
                          {formatCurrency(payment.mikeNet)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600 bg-green-50/50">
                          {formatCurrency(payment.artyNet)}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-600 bg-purple-50/50">
                          {formatCurrency(payment.gregNet)}
                        </td>
                        <td className={`px-4 py-2 text-sm text-right ${isOverdue && !effectiveReadOnly ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                          {row.category === 'Collected' ? (
                            formatDate(payment.payment_received_date)
                          ) : effectiveReadOnly ? (
                            formatDate(payment.payment_due_date)
                          ) : editingPaymentDate === payment.id ? (
                            <input
                              type="date"
                              defaultValue={payment.payment_due_date || ''}
                              autoFocus
                              className="w-32 px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              onBlur={(e) => {
                                const newDate = e.target.value;
                                if (newDate !== (payment.payment_due_date || '')) {
                                  updatePaymentDate(payment.id, newDate);
                                } else {
                                  setEditingPaymentDate(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                } else if (e.key === 'Escape') {
                                  setEditingPaymentDate(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPaymentDate(payment.id);
                              }}
                              disabled={savingPaymentDate === payment.id}
                              className={`hover:bg-gray-100 px-1 py-0.5 rounded ${savingPaymentDate === payment.id ? 'opacity-50' : ''}`}
                              title="Click to edit date"
                            >
                              {savingPaymentDate === payment.id ? (
                                <span className="text-gray-400">Saving...</span>
                              ) : (
                                formatDate(payment.payment_due_date)
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );})}
                    {/* Subtotal row for expanded section */}
                    <tr className="bg-gray-200 border-l-4 border-blue-400 font-medium">
                      <td className="px-4 py-2 text-sm text-gray-700 pl-10">
                        Subtotal ({row.payments.length} payments)
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.payments.reduce((sum, p) => sum + p.paymentAmount, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.payments.reduce((sum, p) => sum + p.gci, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.payments.reduce((sum, p) => sum + p.agci, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        {formatCurrency(row.payments.reduce((sum, p) => sum + p.house, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 bg-blue-100">
                        {formatCurrency(row.payments.reduce((sum, p) => sum + p.mikeNet, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 bg-green-100">
                        {formatCurrency(row.payments.reduce((sum, p) => sum + p.artyNet, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 bg-purple-100">
                        {formatCurrency(row.payments.reduce((sum, p) => sum + p.gregNet, 0))}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">
                        -
                      </td>
                    </tr>
                  </>
                )}
              </React.Fragment>
            ))}
            {/* Payment Totals Row */}
            <tr className="bg-gray-800 text-white font-semibold">
              <td className="px-4 py-3 text-sm">TOTALS</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(paymentTotals.paymentAmount)}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(paymentTotals.gci)}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(paymentTotals.agci)}</td>
              <td className="px-4 py-3 text-sm text-right">{formatCurrency(paymentTotals.house)}</td>
              <td className="px-4 py-3 text-sm text-right bg-blue-900">{formatCurrency(paymentTotals.mikeNet)}</td>
              <td className="px-4 py-3 text-sm text-right bg-green-900">{formatCurrency(paymentTotals.artyNet)}</td>
              <td className="px-4 py-3 text-sm text-right bg-purple-900">{formatCurrency(paymentTotals.gregNet)}</td>
              <td className="px-4 py-3 text-sm text-right">-</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Metrics Section - only for Booked/Closed year data */}
      {yearMetrics && yearMetrics.totalDeals > 0 && (
        <>
          {/* Metrics Cards */}
          <div className="mt-8 px-6 py-3 bg-gray-100 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{selectedYear} Metrics</h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Total GCI */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total GCI</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(yearMetrics.totalGci)}</p>
              </div>

              {/* Avg Transaction GCI */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Transaction GCI</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(yearMetrics.avgTransactionGci)}</p>
              </div>

              {/* Total Deals */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Deals Booked/Closed</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{yearMetrics.totalDeals}</p>
              </div>

              {/* Mike's Deals */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-sm">
                <p className="text-xs text-blue-600 uppercase tracking-wide">Mike's Deals</p>
                <p className="text-2xl font-bold text-blue-900 mt-1">{yearMetrics.mikeDeals}</p>
              </div>

              {/* Arty's Deals */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow-sm">
                <p className="text-xs text-green-600 uppercase tracking-wide">Arty's Deals</p>
                <p className="text-2xl font-bold text-green-900 mt-1">{yearMetrics.artyDeals}</p>
              </div>

              {/* Greg's Deals */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 shadow-sm">
                <p className="text-xs text-purple-600 uppercase tracking-wide">Greg's Deals</p>
                <p className="text-2xl font-bold text-purple-900 mt-1">{yearMetrics.gregDeals}</p>
              </div>
            </div>
          </div>

          {/* Client Breakdown Table */}
          {clientMetrics.length > 0 && (
            <>
              <div className="mt-4 px-6 py-3 bg-gray-100 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Client Breakdown ({selectedYear})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Total GCI
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        # Deals
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Avg Transaction GCI
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {clientMetrics.map((client, idx) => (
                      <tr key={client.clientId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {client.clientName}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">
                          {formatCurrency(client.totalGci)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">
                          {client.dealCount}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">
                          {formatCurrency(client.avgTransactionGci)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-800 text-white">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold">TOTALS</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        {formatCurrency(clientMetrics.reduce((sum, c) => sum + c.totalGci, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        {clientMetrics.reduce((sum, c) => sum + c.dealCount, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        {formatCurrency(yearMetrics.avgTransactionGci)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Footer Notes */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Booked/Closed:</strong> Deals in Booked, Executed Payable, or Closed Paid stages with booked date in {selectedYear}</p>
          {isCurrentYear && (
            <>
              <p><strong>UC/Contingent:</strong> All deals in Under Contract / Contingent stage</p>
              <p><strong>Pipeline 50%+:</strong> All deals in Negotiating LOI or At Lease/PSA stages</p>
            </>
          )}
          <p><strong>Collected:</strong> Payments received in {selectedYear}</p>
          {isCurrentYear && (
            <p><strong>Invoiced Payments:</strong> Pending payments on Booked or Executed Payable deals</p>
          )}
          <p><strong>GCI (Payments):</strong> Payment Amount - Referral Fee</p>
          <p><strong>AGCI:</strong> GCI - House Cut</p>
          {!effectiveReadOnly && <p><strong>⚠️ Missing:</strong> Deals with no commission splits assigned - click to add splits</p>}
          {!effectiveReadOnly && <p><strong>⚠️ Overdue:</strong> Invoiced payments with no estimated date or past due</p>}
          <p><strong># Deals:</strong> Total count of deals in each category</p>
        </div>
      </div>

      {/* Quick Commission Split Modal - only in edit mode */}
      {!effectiveReadOnly && selectedDealForSplits && (
        <QuickCommissionSplitModal
          isOpen={!!selectedDealForSplits}
          onClose={() => setSelectedDealForSplits(null)}
          dealId={selectedDealForSplits.id}
          dealName={selectedDealForSplits.name}
          onSplitsUpdated={fetchReportData}
        />
      )}

      {/* Deal Details Slideout - only in edit mode */}
      {!effectiveReadOnly && (
        <DealDetailsSlideout
          dealId={selectedDealId}
          isOpen={!!selectedDealId}
          onClose={() => {
            setSelectedDealId(null);
            setSelectedDealInitialTab('overview');
          }}
          onDealUpdated={fetchReportData}
          initialTab={selectedDealInitialTab}
        />
      )}
    </div>
  );
}
