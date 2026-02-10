import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import {
  ArrowLeft,
  RefreshCw,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Wallet,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart, ReferenceLine } from 'recharts';

// Stage IDs for deal classification
const STAGE_IDS = {
  negotiatingLOI: '89b7ce02-d325-434a-8340-fab04fa57b8c',
  atLeasePSA: 'bd25eacc-e6c5-4e78-8d5f-25b4577ba5fd',
  underContractContingent: '583507f5-1c53-474b-b7e6-deb81d1b89d2',
  booked: '0fc71094-e33e-49ba-b675-d097bd477618',
  executedPayable: '70d9449c-c589-4b92-ac5d-f84c5eaef049',
  closedPaid: 'afa9a62e-9821-4c60-9db3-c0d51d009208',
  lost: '0e318cd6-a738-400a-98af-741479585057',
};

interface AccountBudget {
  qb_account_id: string;
  year: number;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
}

interface QBAccount {
  id: string;
  qb_account_id: string;
  name: string;
  account_type: string;
  fully_qualified_name: string;
}

interface PaymentDetail {
  id: string;
  dealId: string;
  dealName: string;
  paymentName: string;
  invoiceNumber: string | null;
  // Amounts breakdown
  paymentAmount: number;      // Gross check amount
  referralFee: number;        // Referral fee (COGS outflow)
  brokerSplits: number;       // Broker commissions (COGS outflow)
  houseNet: number;           // What house keeps = payment - referral - brokers
  gci: number;                // GCI = payment - referral (for reference)
  estimatedDate: string | null;
  category: 'invoiced' | 'pipeline' | 'ucContingent';
  stageLabel: string;
}

interface MonthlyForecast {
  month: string;
  monthIndex: number;
  // Inflows
  invoicedIncome: number;
  pipelineIncome: number;
  ucContingentIncome: number;
  totalIncome: number;
  // Outflows (from budget)
  budgetedExpenses: number;
  cogsExpenses: number;
  operatingExpenses: number;
  // Net
  netCashFlow: number;
  cumulativeCashFlow: number;
  // For drill-down
  payments: PaymentDetail[];
  expenseDetails: { category: string; amount: number }[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

export default function CashFlowForecastPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [includePipeline, setIncludePipeline] = useState(false);
  const [includeUcContingent, setIncludeUcContingent] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  // Data
  const [payments, setPayments] = useState<PaymentDetail[]>([]);
  const [accountBudgets, setAccountBudgets] = useState<Map<string, AccountBudget>>(new Map());
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    document.title = "Cash Flow Forecast | OVIS Admin";
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch payments with deal info including house_percent
      const { data: paymentData, error: paymentError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_name,
          payment_amount,
          referral_fee_usd,
          agci,
          payment_date_estimated,
          orep_invoice,
          deal:deal_id (
            id,
            deal_name,
            stage_id,
            house_percent,
            stage:stage_id (label)
          )
        `)
        .eq('is_active', true)
        .or('payment_received.eq.false,payment_received.is.null');

      if (paymentError) throw paymentError;

      // Process payments
      // GCI = Payment Amount - Referral Fee
      // AGCI = GCI - House$ (what goes to brokers - from DB trigger)
      // House$ = GCI - AGCI (what house keeps)
      const processedPayments: PaymentDetail[] = (paymentData || [])
        .filter(p => {
          const deal = p.deal as any;
          if (deal?.stage_id === STAGE_IDS.lost) return false;
          if (!p.payment_date_estimated) return false;
          return true;
        })
        .map(p => {
          const deal = p.deal as any;
          const stageId = deal?.stage_id;

          let category: 'invoiced' | 'pipeline' | 'ucContingent' = 'invoiced';
          if ([STAGE_IDS.negotiatingLOI, STAGE_IDS.atLeasePSA].includes(stageId)) {
            category = 'pipeline';
          } else if (stageId === STAGE_IDS.underContractContingent) {
            category = 'ucContingent';
          }

          const paymentAmount = p.payment_amount || 0;
          const referralFee = p.referral_fee_usd || 0;
          const gci = paymentAmount - referralFee;
          const agci = p.agci || 0;  // AGCI = GCI - House$ (calculated by DB trigger)
          const houseNet = gci - agci;  // House$ = GCI - AGCI
          const brokerSplits = agci;  // What brokers split = AGCI

          return {
            id: p.id,
            dealId: p.deal_id,
            dealName: deal?.deal_name || 'Unknown Deal',
            paymentName: p.payment_name || 'Payment',
            invoiceNumber: p.orep_invoice,
            paymentAmount,
            referralFee,
            brokerSplits,
            gci,
            houseNet,
            estimatedDate: p.payment_date_estimated,
            category,
            stageLabel: (deal?.stage as any)?.label || '',
          };
        });

      setPayments(processedPayments);

      // Fetch accounts
      const { data: accountData, error: accountError } = await supabase
        .from('qb_account')
        .select('id, qb_account_id, name, account_type, fully_qualified_name')
        .eq('active', true);

      if (accountError) throw accountError;
      setAccounts(accountData || []);

      // Fetch account budgets
      const { data: budgetData, error: budgetError } = await supabase
        .from('account_budget')
        .select('*')
        .eq('year', selectedYear);

      if (budgetError) {
        console.warn('Could not fetch account budgets:', budgetError.message);
      }

      const budgetMap = new Map<string, AccountBudget>();
      for (const budget of budgetData || []) {
        budgetMap.set(budget.qb_account_id, budget);
      }
      setAccountBudgets(budgetMap);

    } catch (err) {
      console.error('Error fetching data:', err);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  // Calculate monthly forecasts
  const monthlyForecasts = useMemo(() => {
    const forecasts: MonthlyForecast[] = [];

    // Build account type lookup
    const accountTypeByQbId = new Map<string, string>();
    for (const account of accounts) {
      accountTypeByQbId.set(account.qb_account_id, account.account_type);
    }

    // Calculate expense budgets by month and type
    const expensesByMonth: { cogs: number; operating: number }[] = Array.from({ length: 12 }, () => ({ cogs: 0, operating: 0 }));
    const expenseDetailsByMonth: { category: string; amount: number }[][] = Array.from({ length: 12 }, () => []);

    for (const [qbAccountId, budget] of accountBudgets) {
      const accountType = accountTypeByQbId.get(qbAccountId);
      const account = accounts.find(a => a.qb_account_id === qbAccountId);

      // Skip income accounts - we only want expenses
      if (accountType === 'Income' || accountType === 'Other Income') continue;

      const isCogs = accountType === 'Cost of Goods Sold';

      for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
        const monthKey = MONTH_KEYS[monthIdx];
        const budgetAmount = budget[monthKey] || 0;
        if (budgetAmount > 0) {
          if (isCogs) {
            expensesByMonth[monthIdx].cogs += budgetAmount;
          } else {
            expensesByMonth[monthIdx].operating += budgetAmount;
          }
          expenseDetailsByMonth[monthIdx].push({
            category: account?.name || qbAccountId,
            amount: budgetAmount
          });
        }
      }
    }

    let cumulativeCash = 0;

    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      // Calculate inflows from payments
      const monthPayments = payments.filter(p => {
        if (!p.estimatedDate) return false;
        const date = new Date(p.estimatedDate);
        return date.getFullYear() === selectedYear && date.getMonth() === monthIdx;
      });

      // Use houseNet - what the house actually keeps after broker splits and referral fees
      const invoicedIncome = monthPayments
        .filter(p => p.category === 'invoiced')
        .reduce((sum, p) => sum + p.houseNet, 0);

      const pipelineIncome = monthPayments
        .filter(p => p.category === 'pipeline')
        .reduce((sum, p) => sum + p.houseNet, 0);

      const ucContingentIncome = monthPayments
        .filter(p => p.category === 'ucContingent')
        .reduce((sum, p) => sum + p.houseNet, 0);

      // Total income based on what's included
      let totalIncome = invoicedIncome;
      if (includePipeline) totalIncome += pipelineIncome;
      if (includeUcContingent) totalIncome += ucContingentIncome;

      // Total expenses
      const cogsExpenses = expensesByMonth[monthIdx].cogs;
      const operatingExpenses = expensesByMonth[monthIdx].operating;
      const budgetedExpenses = cogsExpenses + operatingExpenses;

      // Net cash flow
      const netCashFlow = totalIncome - budgetedExpenses;
      cumulativeCash += netCashFlow;

      forecasts.push({
        month: MONTH_NAMES[monthIdx],
        monthIndex: monthIdx,
        invoicedIncome,
        pipelineIncome,
        ucContingentIncome,
        totalIncome,
        cogsExpenses,
        operatingExpenses,
        budgetedExpenses,
        netCashFlow,
        cumulativeCashFlow: cumulativeCash,
        payments: monthPayments,
        expenseDetails: expenseDetailsByMonth[monthIdx].sort((a, b) => b.amount - a.amount)
      });
    }

    return forecasts;
  }, [payments, accountBudgets, accounts, selectedYear, includePipeline, includeUcContingent]);

  // Summary totals
  const summaryTotals = useMemo(() => {
    const totalInvoiced = monthlyForecasts.reduce((sum, m) => sum + m.invoicedIncome, 0);
    const totalPipeline = monthlyForecasts.reduce((sum, m) => sum + m.pipelineIncome, 0);
    const totalUcContingent = monthlyForecasts.reduce((sum, m) => sum + m.ucContingentIncome, 0);
    const totalExpenses = monthlyForecasts.reduce((sum, m) => sum + m.budgetedExpenses, 0);

    let totalIncome = totalInvoiced;
    if (includePipeline) totalIncome += totalPipeline;
    if (includeUcContingent) totalIncome += totalUcContingent;

    const netCashFlow = totalIncome - totalExpenses;

    // Find heaviest and lightest expense months
    const sortedByExpense = [...monthlyForecasts].sort((a, b) => b.budgetedExpenses - a.budgetedExpenses);
    const heaviestMonths = sortedByExpense.slice(0, 3).filter(m => m.budgetedExpenses > 0);
    const lightestMonths = sortedByExpense.slice(-3).filter(m => m.budgetedExpenses > 0).reverse();

    // Find surplus and deficit months - sorted chronologically by monthIndex
    const surplusMonths = monthlyForecasts.filter(m => m.netCashFlow > 0).sort((a, b) => a.monthIndex - b.monthIndex);
    const deficitMonths = monthlyForecasts.filter(m => m.netCashFlow < 0).sort((a, b) => a.monthIndex - b.monthIndex);

    return {
      totalInvoiced,
      totalPipeline,
      totalUcContingent,
      totalIncome,
      totalExpenses,
      netCashFlow,
      heaviestMonths,
      lightestMonths,
      surplusMonths,
      deficitMonths
    };
  }, [monthlyForecasts, includePipeline, includeUcContingent]);

  // Chart data
  const chartData = useMemo(() => {
    return monthlyForecasts.map(m => ({
      month: m.month,
      Income: m.totalIncome,
      Expenses: m.budgetedExpenses,
      'Net Cash': m.netCashFlow,
      Cumulative: m.cumulativeCashFlow
    }));
  }, [monthlyForecasts]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const toggleMonth = (monthIdx: number) => {
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(monthIdx)) {
        newSet.delete(monthIdx);
      } else {
        newSet.add(monthIdx);
      }
      return newSet;
    });
  };

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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-full mx-auto px-2">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/budget')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cash Flow Forecast</h1>
              <p className="text-sm text-gray-500">Projected income vs budgeted expenses</p>
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
            </select>
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

        {/* Income Toggle Controls */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-6">
            <span className="text-sm font-medium text-gray-700">Include in projections:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includePipeline}
                onChange={(e) => setIncludePipeline(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Pipeline 50%+ ({formatCurrency(summaryTotals.totalPipeline)})</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeUcContingent}
                onChange={(e) => setIncludeUcContingent(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">UC/Contingent ({formatCurrency(summaryTotals.totalUcContingent)})</span>
            </label>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {/* House Net Income */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="h-5 w-5 text-green-500" />
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">House Net Income</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaryTotals.totalIncome)}</p>
            <p className="text-xs text-gray-500 mt-1">After broker splits & referral fees</p>
          </div>

          {/* Operating Expenses */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="h-5 w-5 text-red-500" />
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Operating Expenses</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaryTotals.totalExpenses)}</p>
            <p className="text-xs text-gray-500 mt-1">Budgeted (excl. COGS)</p>
          </div>

          {/* Net Cash Flow */}
          <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${summaryTotals.netCashFlow >= 0 ? 'border-blue-500' : 'border-orange-500'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-5 w-5 text-blue-500" />
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Net Cash Flow</p>
            </div>
            <p className={`text-2xl font-bold ${summaryTotals.netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              {formatCurrency(summaryTotals.netCashFlow)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Available for debt/distributions</p>
          </div>

          {/* Heaviest Month */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-500">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Heaviest Months</p>
            </div>
            {summaryTotals.heaviestMonths.length > 0 ? (
              <div className="space-y-1">
                {summaryTotals.heaviestMonths.map(m => (
                  <div key={m.month} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-900">{m.month}</span>
                    <span className="text-amber-600">{formatCurrency(m.budgetedExpenses)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No budget data</p>
            )}
          </div>

          {/* Lightest Month */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-emerald-500">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="h-5 w-5 text-emerald-500" />
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Lightest Months</p>
            </div>
            {summaryTotals.lightestMonths.length > 0 ? (
              <div className="space-y-1">
                {summaryTotals.lightestMonths.map(m => (
                  <div key={m.month} className="flex justify-between text-sm">
                    <span className="font-medium text-gray-900">{m.month}</span>
                    <span className="text-emerald-600">{formatCurrency(m.budgetedExpenses)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No budget data</p>
            )}
          </div>
        </div>

        {/* Cash Flow Analysis Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Surplus Months */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Cash Surplus Months
            </h3>
            {summaryTotals.surplusMonths.length > 0 ? (
              <div className="space-y-2">
                {summaryTotals.surplusMonths.slice(0, 5).map(m => (
                  <div key={m.month} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <div>
                      <span className="font-medium text-gray-900">{m.month}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        (In: {formatCurrency(m.totalIncome)} / Out: {formatCurrency(m.budgetedExpenses)})
                      </span>
                    </div>
                    <span className="font-semibold text-green-600">+{formatCurrency(m.netCashFlow)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No surplus months projected</p>
            )}
          </div>

          {/* Deficit Months */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              Cash Deficit Months
            </h3>
            {summaryTotals.deficitMonths.length > 0 ? (
              <div className="space-y-2">
                {summaryTotals.deficitMonths.slice(0, 5).map(m => (
                  <div key={m.month} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <div>
                      <span className="font-medium text-gray-900">{m.month}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        (In: {formatCurrency(m.totalIncome)} / Out: {formatCurrency(m.budgetedExpenses)})
                      </span>
                    </div>
                    <span className="font-semibold text-red-600">{formatCurrency(m.netCashFlow)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No deficit months projected</p>
            )}
          </div>
        </div>

        {/* Cash Flow Chart */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Monthly Cash Flow Projection</h2>
          </div>
          <div className="p-6">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  <Bar dataKey="Income" fill="#22C55E" />
                  <Bar dataKey="Expenses" fill="#EF4444" />
                  <Line type="monotone" dataKey="Net Cash" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Cumulative Cash Flow Chart */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Cumulative Cash Flow</h2>
            <p className="text-sm text-gray-500">Running total of net cash flow throughout the year</p>
          </div>
          <div className="p-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="Cumulative"
                    stroke="#8B5CF6"
                    strokeWidth={3}
                    dot={{ fill: '#8B5CF6', r: 5 }}
                    name="Cumulative Cash Flow"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Monthly Breakdown Table */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Monthly Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase bg-green-50">Invoiced</th>
                  {includePipeline && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-blue-600 uppercase bg-blue-50">Pipeline</th>
                  )}
                  {includeUcContingent && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-yellow-600 uppercase bg-yellow-50">UC/Contingent</th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase bg-gray-100">Total Income</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-red-600 uppercase bg-red-50">COGS</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-red-600 uppercase bg-red-50">Operating</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase bg-gray-100">Total Expenses</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-blue-600 uppercase bg-blue-50">Net Cash</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-purple-600 uppercase bg-purple-50">Cumulative</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {monthlyForecasts.map((forecast, idx) => (
                  <>
                    <tr
                      key={forecast.month}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleMonth(idx)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          {forecast.payments.length > 0 || forecast.expenseDetails.length > 0 ? (
                            expandedMonths.has(idx) ? (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            )
                          ) : (
                            <span className="w-4" />
                          )}
                          {forecast.month}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 bg-green-50/50">
                        {formatCurrency(forecast.invoicedIncome)}
                      </td>
                      {includePipeline && (
                        <td className="px-4 py-3 text-sm text-right text-gray-900 bg-blue-50/50">
                          {formatCurrency(forecast.pipelineIncome)}
                        </td>
                      )}
                      {includeUcContingent && (
                        <td className="px-4 py-3 text-sm text-right text-gray-900 bg-yellow-50/50">
                          {formatCurrency(forecast.ucContingentIncome)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 bg-gray-50">
                        {formatCurrency(forecast.totalIncome)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-600 bg-red-50/50">
                        {formatCurrency(forecast.cogsExpenses)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-600 bg-red-50/50">
                        {formatCurrency(forecast.operatingExpenses)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-red-700 bg-gray-50">
                        {formatCurrency(forecast.budgetedExpenses)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold bg-blue-50/50 ${forecast.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {forecast.netCashFlow >= 0 ? '+' : ''}{formatCurrency(forecast.netCashFlow)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold bg-purple-50/50 ${forecast.cumulativeCashFlow >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                        {formatCurrency(forecast.cumulativeCashFlow)}
                      </td>
                    </tr>
                    {/* Expanded Details */}
                    {expandedMonths.has(idx) && (
                      <tr className="bg-gray-50">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="grid grid-cols-2 gap-6">
                            {/* Income Details */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">Expected Income ({forecast.payments.length} payments)</h4>
                              {forecast.payments.length > 0 ? (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {forecast.payments.map(p => (
                                    <div key={p.id} className="text-sm py-2 border-b border-gray-100">
                                      <div className="flex justify-between items-start mb-1">
                                        <div>
                                          <span className="text-gray-900 font-medium">{p.dealName}</span>
                                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                            p.category === 'invoiced' ? 'bg-green-100 text-green-700' :
                                            p.category === 'pipeline' ? 'bg-blue-100 text-blue-700' :
                                            'bg-yellow-100 text-yellow-700'
                                          }`}>
                                            {p.stageLabel}
                                          </span>
                                        </div>
                                        <span className="font-semibold text-green-700">{formatCurrency(p.houseNet)}</span>
                                      </div>
                                      <div className="text-xs text-gray-500 pl-2 space-y-0.5">
                                        <div className="flex justify-between">
                                          <span>Check Amount:</span>
                                          <span>{formatCurrency(p.paymentAmount)}</span>
                                        </div>
                                        {p.referralFee > 0 && (
                                          <div className="flex justify-between text-red-500">
                                            <span>Less Referral Fee:</span>
                                            <span>-{formatCurrency(p.referralFee)}</span>
                                          </div>
                                        )}
                                        {p.brokerSplits > 0 && (
                                          <div className="flex justify-between text-red-500">
                                            <span>Less Broker Splits:</span>
                                            <span>-{formatCurrency(p.brokerSplits)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500">No payments expected</p>
                              )}
                            </div>
                            {/* Expense Details */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">Budgeted Expenses ({forecast.expenseDetails.length} categories)</h4>
                              {forecast.expenseDetails.length > 0 ? (
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {forecast.expenseDetails.slice(0, 10).map((exp, i) => (
                                    <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-100">
                                      <span className="text-gray-700 truncate max-w-xs">{exp.category}</span>
                                      <span className="font-medium text-red-600">{formatCurrency(exp.amount)}</span>
                                    </div>
                                  ))}
                                  {forecast.expenseDetails.length > 10 && (
                                    <p className="text-xs text-gray-500 pt-1">+ {forecast.expenseDetails.length - 10} more categories</p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500">No budgeted expenses</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              {/* Totals Row */}
              <tfoot className="bg-gray-800 text-white">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold">TOTAL {selectedYear}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold bg-green-900/50">
                    {formatCurrency(summaryTotals.totalInvoiced)}
                  </td>
                  {includePipeline && (
                    <td className="px-4 py-3 text-sm text-right font-semibold bg-blue-900/50">
                      {formatCurrency(summaryTotals.totalPipeline)}
                    </td>
                  )}
                  {includeUcContingent && (
                    <td className="px-4 py-3 text-sm text-right font-semibold bg-yellow-700/50">
                      {formatCurrency(summaryTotals.totalUcContingent)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-right font-semibold">
                    {formatCurrency(summaryTotals.totalIncome)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold bg-red-900/50" colSpan={2}>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">
                    {formatCurrency(summaryTotals.totalExpenses)}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-semibold ${summaryTotals.netCashFlow >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {summaryTotals.netCashFlow >= 0 ? '+' : ''}{formatCurrency(summaryTotals.netCashFlow)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-purple-300">
                    {formatCurrency(monthlyForecasts[11]?.cumulativeCashFlow || 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Budget Analysis Section */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Budget Expense Analysis by Month</h2>
            <p className="text-sm text-gray-500">Compare budgeted expenses across months to identify seasonal patterns</p>
          </div>
          <div className="p-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyForecasts.map(m => ({
                    month: m.month,
                    COGS: m.cogsExpenses,
                    Operating: m.operatingExpenses
                  }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                  <Legend />
                  <Bar dataKey="COGS" fill="#F59E0B" stackId="a" name="Cost of Goods Sold" />
                  <Bar dataKey="Operating" fill="#EF4444" stackId="a" name="Operating Expenses" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Footer Notes */}
        <div className="bg-white rounded-lg shadow px-6 py-3">
          <div className="text-xs text-gray-500 space-y-1">
            <p><strong>House Net Income:</strong> Check Amount - Referral Fee (COGS) - Broker Splits (COGS) = What the house keeps from each payment</p>
            <p><strong>Income Sources:</strong> Expected payments from deals in Booked/Executed Payable (Invoiced), LOI/PSA (Pipeline 50%+), and Under Contract (UC/Contingent) stages</p>
            <p><strong>Expense Sources:</strong> Monthly budgeted amounts from the Budget Setup page ({selectedYear}) - excludes COGS already deducted from income</p>
            <p><strong>Net Cash Flow:</strong> House Net Income - Budgeted Operating Expenses = Available for debt payments, profit distributions, or reinvestment</p>
          </div>
        </div>
      </div>
    </div>
  );
}
