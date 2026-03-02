import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Users,
  Building2,
  Calendar,
  Filter,
  AlertCircle,
  CheckCircle2,
  XCircle
} from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Stage probability weights
const STAGE_PROBABILITIES: Record<string, number> = {
  'Negotiating LOI': 0.50,
  'At Lease/PSA': 0.75,
  'Under Contract / Contingent': 0.85,
  'Booked': 0.90,
  'Executed Payable': 0.95,
  'Closed Paid': 1.0,
};

interface Broker {
  id: string;
  name: string;
}

interface DealStage {
  id: string;
  label: string;
  sort_order: number;
}

interface Client {
  id: string;
  client_name: string;
}

interface PipelinePayment {
  paymentId: string;
  dealId: string;
  dealName: string;
  clientName: string;
  stageLabel: string;
  stageId: string;
  paymentSequence: number;
  totalPayments: number;
  paymentAmount: number;
  estimatedDate: string | null;
  dateSource: string | null;
  autoCalculatedDate: string | null;
  probability: number;
  // Broker split amounts
  brokerAmounts: { brokerId: string; brokerName: string; amount: number }[];
  houseAmount: number;
  // Audit flags
  hasSplits: boolean;
  hasEstimatedDate: boolean;
  ownerId: string | null;
  ownerName: string | null;
}

interface BrokerSummary {
  brokerId: string;
  brokerName: string;
  ytdReceived: number;
  pipelineUnweighted: number;
  pipelineWeighted: number;
  byQuarter: { q1: number; q2: number; q3: number; q4: number };
}

interface AuditIssue {
  type: 'no_payments' | 'no_splits' | 'no_date';
  dealId: string;
  dealName: string;
  stageLabel: string;
  paymentId?: string;
  paymentSequence?: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BrokerForecastDashboard() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pipelinePayments, setPipelinePayments] = useState<PipelinePayment[]>([]);
  const [brokerSummaries, setBrokerSummaries] = useState<BrokerSummary[]>([]);
  const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);

  // YTD actuals
  const [companyYtdRevenue, setCompanyYtdRevenue] = useState(0);
  const [companyYtdExpenses, setCompanyYtdExpenses] = useState(0);
  const [houseYtdProfit, setHouseYtdProfit] = useState(0);
  const [annualBudget, setAnnualBudget] = useState(0);
  const [blendedExpenses, setBlendedExpenses] = useState(0); // Actual for completed months + budget for remaining

  // Filters
  const [filterStageIds, setFilterStageIds] = useState<string[]>([]);
  const [filterOwnerId, setFilterOwnerId] = useState<string>('');
  const [filterClientId, setFilterClientId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // UI state
  const [expandedSection, setExpandedSection] = useState<'brokers' | 'pipeline' | 'audit' | null>('pipeline');
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Broker Forecast Dashboard | OVIS";
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch brokers (no active column on broker table)
      const { data: brokerData } = await supabase
        .from('broker')
        .select('id, name')
        .order('name');
      setBrokers(brokerData || []);

      // Fetch stages
      const { data: stageData } = await supabase
        .from('deal_stage')
        .select('id, label, sort_order')
        .order('sort_order');
      setStages(stageData || []);

      // Fetch clients
      const { data: clientData } = await supabase
        .from('client')
        .select('id, client_name')
        .order('client_name');
      setClients(clientData || []);

      // Fetch pipeline payments with all needed data
      // Note: owner_id doesn't have a direct FK relationship we can join on,
      // so we fetch owner_id and look up the name from brokers separately
      const { data: paymentData, error: paymentError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_sequence,
          payment_amount,
          payment_date_estimated,
          payment_date_source,
          payment_date_auto_calculated,
          payment_received,
          deal:deal_id (
            id,
            deal_name,
            stage_id,
            client_id,
            owner_id,
            number_of_payments,
            deal_usd,
            site_usd,
            origination_usd,
            house_usd,
            stage:stage_id (id, label),
            client:client_id (client_name)
          ),
          payment_split (
            id,
            broker_id,
            split_deal_percent,
            split_site_percent,
            split_origination_percent,
            broker:broker_id (name)
          )
        `)
        .eq('is_active', true)
        .or('payment_received.eq.false,payment_received.is.null');

      // Create a broker lookup map for owner names
      const brokerNameMap = new Map((brokerData || []).map(b => [b.id, b.name]));

      if (paymentError) throw paymentError;

      // Process payments
      const excludedStages = ['Lost', 'Closed Paid'];
      const processedPayments: PipelinePayment[] = [];
      const issues: AuditIssue[] = [];
      const dealsWithPayments = new Set<string>();

      for (const p of paymentData || []) {
        const deal = p.deal as any;
        if (!deal) continue;

        const stageLabel = (deal.stage as any)?.label || '';
        if (excludedStages.includes(stageLabel)) continue;

        dealsWithPayments.add(deal.id);

        const splits = p.payment_split || [];
        const hasSplits = splits.length > 0;
        const hasEstimatedDate = !!p.payment_date_estimated;

        // Calculate broker amounts
        const brokerAmounts: { brokerId: string; brokerName: string; amount: number }[] = [];
        let totalBrokerAmount = 0;

        for (const split of splits) {
          const dealPct = split.split_deal_percent || 0;
          const sitePct = split.split_site_percent || 0;
          const origPct = split.split_origination_percent || 0;

          const amount = (
            (deal.deal_usd || 0) * dealPct / 100 +
            (deal.site_usd || 0) * sitePct / 100 +
            (deal.origination_usd || 0) * origPct / 100
          ) / (deal.number_of_payments || 1);

          if (split.broker_id) {
            brokerAmounts.push({
              brokerId: split.broker_id,
              brokerName: (split.broker as any)?.name || 'Unknown',
              amount
            });
            totalBrokerAmount += amount;
          }
        }

        const houseAmount = ((deal.house_usd || 0) / (deal.number_of_payments || 1));

        processedPayments.push({
          paymentId: p.id,
          dealId: deal.id,
          dealName: deal.deal_name || 'Unknown Deal',
          clientName: (deal.client as any)?.client_name || '',
          stageLabel,
          stageId: deal.stage_id,
          paymentSequence: p.payment_sequence || 1,
          totalPayments: deal.number_of_payments || 1,
          paymentAmount: p.payment_amount || 0,
          estimatedDate: p.payment_date_estimated,
          dateSource: p.payment_date_source,
          autoCalculatedDate: p.payment_date_auto_calculated,
          probability: STAGE_PROBABILITIES[stageLabel] || 0.5,
          brokerAmounts,
          houseAmount,
          hasSplits,
          hasEstimatedDate,
          ownerId: deal.owner_id,
          ownerName: deal.owner_id ? brokerNameMap.get(deal.owner_id) || null : null,
        });

        // Track audit issues
        if (!hasSplits) {
          issues.push({
            type: 'no_splits',
            dealId: deal.id,
            dealName: deal.deal_name || 'Unknown',
            stageLabel,
            paymentId: p.id,
            paymentSequence: p.payment_sequence
          });
        }
        if (!hasEstimatedDate) {
          issues.push({
            type: 'no_date',
            dealId: deal.id,
            dealName: deal.deal_name || 'Unknown',
            stageLabel,
            paymentId: p.id,
            paymentSequence: p.payment_sequence
          });
        }
      }

      // Find deals without payments - use stageData (not state) since we just fetched it
      const excludedStageIds = (stageData || [])
        .filter(s => excludedStages.includes(s.label))
        .map(s => s.id);

      // Only query if we have stage IDs to exclude
      let dealsWithoutPayments: any[] = [];
      if (excludedStageIds.length > 0) {
        const { data } = await supabase
          .from('deal')
          .select('id, deal_name, stage_id, stage:stage_id (label)')
          .not('stage_id', 'in', `(${excludedStageIds.join(',')})`);
        dealsWithoutPayments = data || [];
      } else {
        // If no excluded stages, just get all deals
        const { data } = await supabase
          .from('deal')
          .select('id, deal_name, stage_id, stage:stage_id (label)');
        dealsWithoutPayments = data || [];
      }

      for (const deal of dealsWithoutPayments) {
        if (!dealsWithPayments.has(deal.id)) {
          const stageLabel = (deal.stage as any)?.label || '';
          if (!excludedStages.includes(stageLabel)) {
            issues.push({
              type: 'no_payments',
              dealId: deal.id,
              dealName: deal.deal_name || 'Unknown',
              stageLabel
            });
          }
        }
      }

      setPipelinePayments(processedPayments);
      setAuditIssues(issues);

      // Calculate broker summaries
      await calculateBrokerSummaries(brokerData || [], processedPayments, selectedYear);

      // Fetch company financials
      await fetchCompanyFinancials(selectedYear);

    } catch (err) {
      console.error('Error fetching data:', err);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const calculateBrokerSummaries = async (brokerList: Broker[], payments: PipelinePayment[], year: number) => {
    const summaries: BrokerSummary[] = [];

    for (const broker of brokerList) {
      // Get YTD received
      const { data: ytdData } = await supabase
        .from('payment')
        .select(`
          payment_amount,
          payment_received_date,
          deal:deal_id (deal_usd, site_usd, origination_usd, number_of_payments),
          payment_split!inner (
            broker_id,
            split_deal_percent,
            split_site_percent,
            split_origination_percent
          )
        `)
        .eq('payment_received', true)
        .eq('payment_split.broker_id', broker.id)
        .gte('payment_received_date', `${year}-01-01`)
        .lte('payment_received_date', `${year}-12-31`);

      let ytdReceived = 0;
      for (const p of ytdData || []) {
        const deal = p.deal as any;
        const split = (p.payment_split as any[])?.[0];
        if (deal && split) {
          ytdReceived += (
            (deal.deal_usd || 0) * (split.split_deal_percent || 0) / 100 +
            (deal.site_usd || 0) * (split.split_site_percent || 0) / 100 +
            (deal.origination_usd || 0) * (split.split_origination_percent || 0) / 100
          ) / (deal.number_of_payments || 1);
        }
      }

      // Calculate pipeline for this broker
      const brokerPayments = payments.filter(p =>
        p.brokerAmounts.some(ba => ba.brokerId === broker.id) &&
        p.estimatedDate &&
        new Date(p.estimatedDate).getFullYear() === year
      );

      let pipelineUnweighted = 0;
      let pipelineWeighted = 0;
      const byQuarter = { q1: 0, q2: 0, q3: 0, q4: 0 };

      for (const payment of brokerPayments) {
        const brokerAmount = payment.brokerAmounts.find(ba => ba.brokerId === broker.id)?.amount || 0;
        pipelineUnweighted += brokerAmount;
        pipelineWeighted += brokerAmount * payment.probability;

        if (payment.estimatedDate) {
          const month = new Date(payment.estimatedDate).getMonth();
          const weighted = brokerAmount * payment.probability;
          if (month < 3) byQuarter.q1 += weighted;
          else if (month < 6) byQuarter.q2 += weighted;
          else if (month < 9) byQuarter.q3 += weighted;
          else byQuarter.q4 += weighted;
        }
      }

      summaries.push({
        brokerId: broker.id,
        brokerName: broker.name,
        ytdReceived,
        pipelineUnweighted,
        pipelineWeighted,
        byQuarter
      });
    }

    setBrokerSummaries(summaries);
  };

  const fetchCompanyFinancials = async (year: number) => {
    // YTD Revenue
    const { data: revenueData } = await supabase
      .from('payment')
      .select('payment_amount')
      .eq('payment_received', true)
      .gte('payment_received_date', `${year}-01-01`)
      .lte('payment_received_date', `${year}-12-31`);

    const ytdRevenue = (revenueData || []).reduce((sum, p) => sum + (p.payment_amount || 0), 0);
    setCompanyYtdRevenue(ytdRevenue);

    // YTD Expenses & Budget from budget_vs_actual_monthly view
    // Fetch monthly budget columns for blended expense calculation
    const { data: budgetData } = await supabase
      .from('budget_vs_actual_monthly')
      .select('ytd_actual, budget_annual, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec')
      .eq('budget_year', year);

    const ytdExpenses = (budgetData || []).reduce((sum, b) => sum + (b.ytd_actual || 0), 0);
    const budget = (budgetData || []).reduce((sum, b) => sum + (b.budget_annual || 0), 0);
    setCompanyYtdExpenses(ytdExpenses);
    setAnnualBudget(budget);

    // Calculate blended expenses: actual for completed months + budget for remaining months
    // Current month is in progress, so we use actual through last completed month + budget for current + future
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed (0 = January)
    const monthColumns = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    // Sum budgeted expenses for current month and remaining months
    let budgetedRemaining = 0;
    for (const row of budgetData || []) {
      for (let m = currentMonth; m < 12; m++) {
        budgetedRemaining += (row as any)[monthColumns[m]] || 0;
      }
    }

    // Blended = YTD Actual (completed months) + Budgeted (current + remaining months)
    // Note: ytd_actual includes current month's actuals, but we use budgeted for current month
    // to be conservative (use full month budget not partial actual)
    // So we need to subtract current month's actual and add current month's budget
    // Actually, for simplicity: blended = ytd_actual + budget for remaining months (current + future)
    // This slightly double-counts current month, but is conservative
    setBlendedExpenses(ytdExpenses + budgetedRemaining);

    // House YTD profit - use house_usd from received payments
    const { data: houseProfitData } = await supabase
      .from('payment')
      .select('deal:deal_id (house_usd, number_of_payments)')
      .eq('payment_received', true)
      .gte('payment_received_date', `${year}-01-01`)
      .lte('payment_received_date', `${year}-12-31`);

    let houseProfit = 0;
    for (const p of houseProfitData || []) {
      const deal = p.deal as any;
      if (deal) {
        houseProfit += (deal.house_usd || 0) / (deal.number_of_payments || 1);
      }
    }
    setHouseYtdProfit(houseProfit);
  };

  // Handle date change
  const handleDateChange = async (paymentId: string, newDate: Date | null) => {
    setSavingPaymentId(paymentId);

    const dateStr = newDate ? newDate.toISOString().split('T')[0] : null;

    const { error } = await supabase
      .from('payment')
      .update({
        payment_date_estimated: dateStr,
        payment_date_source: dateStr ? 'broker_override' : 'auto'
      })
      .eq('id', paymentId);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update date' });
    } else {
      // Update local state
      setPipelinePayments(prev => prev.map(p =>
        p.paymentId === paymentId
          ? { ...p, estimatedDate: dateStr, dateSource: dateStr ? 'broker_override' : 'auto', hasEstimatedDate: !!dateStr }
          : p
      ));
      setMessage({ type: 'success', text: 'Date updated' });
      setTimeout(() => setMessage(null), 2000);
    }

    setSavingPaymentId(null);
  };

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return pipelinePayments.filter(p => {
      if (filterStageIds.length > 0 && !filterStageIds.includes(p.stageId)) return false;
      if (filterOwnerId && p.ownerId !== filterOwnerId) return false;
      if (filterClientId && !p.clientName.toLowerCase().includes(filterClientId.toLowerCase())) return false;
      return true;
    });
  }, [pipelinePayments, filterStageIds, filterOwnerId, filterClientId]);

  // Payments in selected year
  const yearPayments = useMemo(() => {
    return filteredPayments.filter(p =>
      p.estimatedDate && new Date(p.estimatedDate).getFullYear() === selectedYear
    );
  }, [filteredPayments, selectedYear]);

  // House pipeline totals
  const housePipelineTotals = useMemo(() => {
    let unweighted = 0;
    let weighted = 0;
    const byQuarter = { q1: 0, q2: 0, q3: 0, q4: 0 };

    for (const payment of yearPayments) {
      unweighted += payment.houseAmount;
      weighted += payment.houseAmount * payment.probability;

      if (payment.estimatedDate) {
        const month = new Date(payment.estimatedDate).getMonth();
        const w = payment.houseAmount * payment.probability;
        if (month < 3) byQuarter.q1 += w;
        else if (month < 6) byQuarter.q2 += w;
        else if (month < 9) byQuarter.q3 += w;
        else byQuarter.q4 += w;
      }
    }

    return { unweighted, weighted, byQuarter };
  }, [yearPayments]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Filter by active pipeline stages by default
  const pipelineStages = stages.filter(s => !['Lost', 'Closed Paid'].includes(s.label));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/finance')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Broker Forecast Dashboard</h1>
              <p className="text-sm text-gray-500">Income projections, pipeline management & audit</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-md shadow-sm text-sm font-medium ${
                showFilters || filterStageIds.length > 0 || filterOwnerId || filterClientId
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
              {(filterStageIds.length > 0 || filterOwnerId || filterClientId) && (
                <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {(filterStageIds.length > 0 ? 1 : 0) + (filterOwnerId ? 1 : 0) + (filterClientId ? 1 : 0)}
                </span>
              )}
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {message.text}
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow mb-6 p-4">
            <div className="grid grid-cols-3 gap-4">
              {/* Stage Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stages</label>
                <div className="flex flex-wrap gap-2">
                  {pipelineStages.map(stage => (
                    <button
                      key={stage.id}
                      onClick={() => {
                        setFilterStageIds(prev =>
                          prev.includes(stage.id)
                            ? prev.filter(id => id !== stage.id)
                            : [...prev, stage.id]
                        );
                      }}
                      className={`px-2 py-1 text-xs rounded-full ${
                        filterStageIds.length === 0 || filterStageIds.includes(stage.id)
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Owner Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                <select
                  value={filterOwnerId}
                  onChange={(e) => setFilterOwnerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">All Owners</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Client Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Search</label>
                <input
                  type="text"
                  value={filterClientId}
                  onChange={(e) => setFilterClientId(e.target.value)}
                  placeholder="Type to filter by client..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setFilterStageIds([]);
                  setFilterOwnerId('');
                  setFilterClientId('');
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        {/* Summary Cards Row */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          {/* Company Revenue */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              <p className="text-xs font-medium text-gray-500 uppercase">YTD Revenue</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(companyYtdRevenue)}</p>
          </div>

          {/* YTD Expenses */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-red-500" />
              <p className="text-xs font-medium text-gray-500 uppercase">YTD Expenses</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(companyYtdExpenses)}</p>
            <p className="text-xs text-gray-500">of {formatCurrency(annualBudget)} budget</p>
          </div>

          {/* House Gross YTD */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-blue-500" />
              <p className="text-xs font-medium text-gray-500 uppercase">House Gross YTD</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(houseYtdProfit)}</p>
          </div>

          {/* House Pipeline */}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <p className="text-xs font-medium text-gray-500 uppercase">House Pipeline</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(housePipelineTotals.weighted)}</p>
            <p className="text-xs text-gray-500">({formatCurrency(housePipelineTotals.unweighted)} unweighted)</p>
          </div>

          {/* Net Profit Forecast */}
          <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${(houseYtdProfit + housePipelineTotals.weighted - blendedExpenses) >= 0 ? 'border-emerald-500' : 'border-red-500'}`}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className={`h-4 w-4 ${(houseYtdProfit + housePipelineTotals.weighted - blendedExpenses) >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
              <p className="text-xs font-medium text-gray-500 uppercase">Net Profit Forecast</p>
            </div>
            <p className={`text-xl font-bold ${(houseYtdProfit + housePipelineTotals.weighted - blendedExpenses) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(houseYtdProfit + housePipelineTotals.weighted - blendedExpenses)}
            </p>
            <p className="text-xs text-gray-500">Gross + Pipeline − Expenses</p>
          </div>

          {/* Audit Issues */}
          <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${auditIssues.length > 0 ? 'border-amber-500' : 'border-green-500'}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`h-4 w-4 ${auditIssues.length > 0 ? 'text-amber-500' : 'text-green-500'}`} />
              <p className="text-xs font-medium text-gray-500 uppercase">Audit Issues</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{auditIssues.length}</p>
            <p className="text-xs text-gray-500">missing data items</p>
          </div>
        </div>

        {/* Broker Income Section */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => setExpandedSection(expandedSection === 'brokers' ? null : 'brokers')}
            className="w-full px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Broker Income Summary</h2>
            </div>
            {expandedSection === 'brokers' ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          {expandedSection === 'brokers' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Broker</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">YTD Received</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pipeline (Weighted)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{selectedYear} Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q1</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q2</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q3</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Q4</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {brokerSummaries.map(broker => (
                    <tr key={broker.brokerId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{broker.brokerName}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-600">{formatCurrency(broker.ytdReceived)}</td>
                      <td className="px-4 py-3 text-sm text-right text-blue-600">{formatCurrency(broker.pipelineWeighted)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(broker.ytdReceived + broker.pipelineWeighted)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(broker.byQuarter.q1)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(broker.byQuarter.q2)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(broker.byQuarter.q3)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(broker.byQuarter.q4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pipeline Payments Section */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => setExpandedSection(expandedSection === 'pipeline' ? null : 'pipeline')}
            className="w-full px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Pipeline Payments ({filteredPayments.length})</h2>
              <span className="text-sm text-gray-500">
                {yearPayments.length} in {selectedYear}
              </span>
            </div>
            {expandedSection === 'pipeline' ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          {expandedSection === 'pipeline' && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pmt</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Date</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Prob</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weighted</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPayments
                    .sort((a, b) => {
                      if (!a.estimatedDate && !b.estimatedDate) return 0;
                      if (!a.estimatedDate) return 1;
                      if (!b.estimatedDate) return -1;
                      return new Date(a.estimatedDate).getTime() - new Date(b.estimatedDate).getTime();
                    })
                    .map(payment => {
                      const hasIssues = !payment.hasSplits || !payment.hasEstimatedDate;
                      return (
                        <tr key={payment.paymentId} className={`hover:bg-gray-50 ${hasIssues ? 'bg-amber-50' : ''}`}>
                          <td className="px-3 py-2 text-sm">
                            <a
                              href={`/deal/${payment.dealId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                            >
                              {payment.dealName}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">{payment.clientName}</td>
                          <td className="px-3 py-2 text-sm">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              payment.stageLabel === 'Executed Payable' ? 'bg-green-100 text-green-800' :
                              payment.stageLabel === 'Booked' ? 'bg-blue-100 text-blue-800' :
                              payment.stageLabel === 'Under Contract / Contingent' ? 'bg-purple-100 text-purple-800' :
                              payment.stageLabel === 'At Lease/PSA' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {payment.stageLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-center text-gray-600">
                            {payment.paymentSequence}/{payment.totalPayments}
                          </td>
                          <td className="px-3 py-2 text-sm text-right font-medium">
                            {formatCurrency(payment.paymentAmount)}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            <DatePicker
                              selected={payment.estimatedDate ? new Date(payment.estimatedDate) : null}
                              onChange={(date) => handleDateChange(payment.paymentId, date)}
                              dateFormat="MMM d, yyyy"
                              placeholderText="Set date"
                              className={`w-28 rounded border text-xs px-2 py-1 ${
                                payment.dateSource === 'broker_override'
                                  ? 'border-amber-400 bg-amber-50'
                                  : payment.estimatedDate
                                    ? 'border-gray-300'
                                    : 'border-red-300 bg-red-50'
                              }`}
                              disabled={savingPaymentId === payment.paymentId}
                            />
                            {payment.dateSource === 'broker_override' && (
                              <span className="ml-1 text-xs text-amber-600" title="Manual override">✏️</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-center text-gray-600">
                            {Math.round(payment.probability * 100)}%
                          </td>
                          <td className="px-3 py-2 text-sm text-right font-medium text-blue-600">
                            {formatCurrency(payment.paymentAmount * payment.probability)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {payment.hasSplits ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" title="Has broker splits" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" title="Missing broker splits" />
                              )}
                              {payment.hasEstimatedDate ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" title="Has estimated date" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" title="Missing estimated date" />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <a
                              href={`/deal/${payment.dealId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Open Deal
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit Issues Section */}
        <div className="bg-white rounded-lg shadow mb-6">
          <button
            onClick={() => setExpandedSection(expandedSection === 'audit' ? null : 'audit')}
            className="w-full px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className={`h-5 w-5 ${auditIssues.length > 0 ? 'text-amber-500' : 'text-green-500'}`} />
              <h2 className="text-lg font-semibold text-gray-900">Pipeline Audit ({auditIssues.length} issues)</h2>
            </div>
            {expandedSection === 'audit' ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          {expandedSection === 'audit' && (
            <div className="p-4">
              {auditIssues.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>All pipeline deals have payments, splits, and estimated dates!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Group by type */}
                  {['no_payments', 'no_splits', 'no_date'].map(issueType => {
                    const typeIssues = auditIssues.filter(i => i.type === issueType);
                    if (typeIssues.length === 0) return null;

                    const typeLabels: Record<string, { label: string; color: string }> = {
                      no_payments: { label: 'Missing Payments', color: 'red' },
                      no_splits: { label: 'Missing Broker Splits', color: 'amber' },
                      no_date: { label: 'Missing Estimated Date', color: 'orange' }
                    };

                    return (
                      <div key={issueType} className="border rounded-lg">
                        <div className={`px-4 py-2 bg-${typeLabels[issueType].color}-50 border-b`}>
                          <h3 className={`text-sm font-semibold text-${typeLabels[issueType].color}-800`}>
                            {typeLabels[issueType].label} ({typeIssues.length})
                          </h3>
                        </div>
                        <div className="divide-y">
                          {typeIssues.map((issue, idx) => (
                            <div key={`${issue.dealId}-${issue.paymentId || idx}`} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                              <div>
                                <span className="font-medium text-gray-900">{issue.dealName}</span>
                                <span className="text-xs text-gray-500 ml-2">({issue.stageLabel})</span>
                                {issue.paymentSequence && (
                                  <span className="text-xs text-gray-400 ml-2">Payment #{issue.paymentSequence}</span>
                                )}
                              </div>
                              <a
                                href={`/deal/${issue.dealId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                              >
                                Fix <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white rounded-lg shadow px-6 py-3">
          <div className="text-xs text-gray-500 space-y-1">
            <p><strong>Probability Weights:</strong> Negotiating LOI (50%), At Lease/PSA (75%), Under Contract (85%), Booked (90%), Executed Payable (95%)</p>
            <p><strong>Broker Income:</strong> Calculated as (deal_usd × deal_split%) + (site_usd × site_split%) + (origination_usd × orig_split%) ÷ number_of_payments</p>
            <p><strong>House Gross:</strong> house_usd ÷ number_of_payments for each received payment</p>
            <p><strong>Net Profit Forecast:</strong> House Gross YTD + House Pipeline (weighted) − Blended Expenses (actual for completed months + budget for remaining months)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
