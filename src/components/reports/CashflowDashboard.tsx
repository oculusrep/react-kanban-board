import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Broker IDs
const BROKER_IDS = {
  mike: '38d4b67c-841d-4590-a909-523d3a4c6e4b',
  arty: '1d049634-32fe-4834-8ca1-33f1cff0055a',
  greg: 'dbfdd8d4-5241-4cc2-be83-f7763f5519bf',
};

// Stage IDs
const STAGE_IDS = {
  negotiatingLOI: '89b7ce02-d325-434a-8340-fab04fa57b8c',
  atLeasePSA: 'bd25eacc-e6c5-4e78-8d5f-25b4577ba5fd',
  underContractContingent: '583507f5-1c53-474b-b7e6-deb81d1b89d2',
  booked: '0fc71094-e33e-49ba-b675-d097bd477618',
  executedPayable: '70d9449c-c589-4b92-ac5d-f84c5eaef049',
  closedPaid: 'afa9a62e-9821-4c60-9db3-c0d51d009208',
  lost: '0e318cd6-a738-400a-98af-741479585057',
};

type ViewMode = 'personal' | 'admin';
type BrokerFilter = 'mike' | 'arty' | 'greg' | 'all';

interface PaymentDetail {
  id: string;
  dealId: string;
  dealName: string;
  paymentName: string;
  invoiceNumber: string | null;
  totalAmount: number;  // GCI = payment_amount - referral_fee
  brokerAmount: number;
  houseAmount: number;
  mikeSplit: number;
  artySplit: number;
  gregSplit: number;
  estimatedDate: string | null;
  category: 'invoiced' | 'pipeline' | 'ucContingent';
  stageLabel: string;
}

interface MonthlyData {
  month: string;
  monthKey: string;
  invoiced: number;
  pipeline: number;
  ucContingent: number;
  total: number;
  payments: PaymentDetail[];
}

export default function CashflowDashboard() {
  const { user, userRole } = useAuth();
  const isAdmin = userRole === 'admin';

  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(isAdmin ? 'admin' : 'personal');
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>('all');

  // Toggle states
  const [showPipeline, setShowPipeline] = useState(false);
  const [showUcContingent, setShowUcContingent] = useState(false);

  // Data
  const [payments, setPayments] = useState<PaymentDetail[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Determine which broker the current user is
  const currentUserBrokerId = useMemo(() => {
    if (!user?.id) return null;
    // Map user ID to broker ID - you may need to adjust this mapping
    // For now, we'll check if the user's profile has a broker_id
    return user.id;
  }, [user]);

  // Determine effective broker filter based on user and view mode
  const effectiveBrokerIds = useMemo(() => {
    if (viewMode === 'admin') {
      if (brokerFilter === 'all') {
        return [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg];
      }
      return [BROKER_IDS[brokerFilter]];
    }

    // Personal view - determine broker based on user
    if (currentUserBrokerId === BROKER_IDS.arty) {
      return [BROKER_IDS.arty];
    }
    if (currentUserBrokerId === BROKER_IDS.greg) {
      return [BROKER_IDS.greg];
    }
    // Default to Mike + all (admin view)
    return [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg];
  }, [viewMode, brokerFilter, currentUserBrokerId]);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;

      // Fetch all pending payments
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
            house_usd,
            stage:stage_id (label)
          )
        `)
        .eq('is_active', true)
        .or('payment_received.eq.false,payment_received.is.null');

      if (paymentError) throw paymentError;

      // Fetch payment splits
      const paymentIds = (paymentData || []).map(p => p.id);
      const { data: splitData, error: splitError } = await supabase
        .from('payment_split')
        .select('payment_id, broker_id, split_broker_total')
        .in('payment_id', paymentIds)
        .in('broker_id', [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg]);

      if (splitError) throw splitError;

      // Build splits map
      const splitsByPayment = new Map<string, { mike: number; arty: number; greg: number }>();
      (splitData || []).forEach(split => {
        const existing = splitsByPayment.get(split.payment_id) || { mike: 0, arty: 0, greg: 0 };
        if (split.broker_id === BROKER_IDS.mike) existing.mike = split.split_broker_total || 0;
        if (split.broker_id === BROKER_IDS.arty) existing.arty = split.split_broker_total || 0;
        if (split.broker_id === BROKER_IDS.greg) existing.greg = split.split_broker_total || 0;
        splitsByPayment.set(split.payment_id, existing);
      });

      // Process payments - filter out Lost deals and payments without estimated dates
      const processedPayments: PaymentDetail[] = (paymentData || [])
        .filter(p => {
          const deal = p.deal as any;
          // Filter out Lost deals
          if (deal?.stage_id === STAGE_IDS.lost) return false;
          // Filter out payments without estimated dates
          if (!p.payment_date_estimated) return false;
          return true;
        })
        .map(p => {
          const deal = p.deal as any;
          const stageId = deal?.stage_id;
          const splits = splitsByPayment.get(p.id) || { mike: 0, arty: 0, greg: 0 };

          // Calculate house amount from payment AGCI
          const housePercent = deal?.house_percent || 0;
          const houseAmount = (p.agci || 0) * (housePercent / 100);

          // Determine category based on deal stage
          let category: 'invoiced' | 'pipeline' | 'ucContingent' = 'invoiced';
          if ([STAGE_IDS.negotiatingLOI, STAGE_IDS.atLeasePSA].includes(stageId)) {
            category = 'pipeline';
          } else if (stageId === STAGE_IDS.underContractContingent) {
            category = 'ucContingent';
          }

          // Total broker amount
          const brokerAmount = splits.mike + splits.arty + splits.greg;

          return {
            id: p.id,
            dealId: p.deal_id,
            dealName: deal?.deal_name || 'Unknown Deal',
            paymentName: p.payment_name || 'Payment',
            invoiceNumber: p.orep_invoice,
            totalAmount: (p.payment_amount || 0) - (p.referral_fee_usd || 0),
            brokerAmount,
            houseAmount,
            mikeSplit: splits.mike,
            artySplit: splits.arty,
            gregSplit: splits.greg,
            estimatedDate: p.payment_date_estimated,
            category,
            stageLabel: (deal?.stage as any)?.label || '',
          };
        });

      setPayments(processedPayments);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter payments based on broker selection
  const filteredPayments = useMemo(() => {
    if (brokerFilter === 'all') {
      return payments;
    }
    // Only include payments where the selected broker has money coming
    return payments.filter(payment => {
      if (brokerFilter === 'mike') return payment.mikeSplit > 0;
      if (brokerFilter === 'arty') return payment.artySplit > 0;
      if (brokerFilter === 'greg') return payment.gregSplit > 0;
      return true;
    });
  }, [payments, brokerFilter]);

  // Calculate monthly breakdown
  const monthlyData = useMemo(() => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const currentYear = new Date().getFullYear();

    const data: MonthlyData[] = months.map((month, idx) => ({
      month,
      monthKey: `${currentYear}-${String(idx + 1).padStart(2, '0')}`,
      invoiced: 0,
      pipeline: 0,
      ucContingent: 0,
      total: 0,
      payments: [],
    }));

    filteredPayments.forEach(payment => {
      // Use GCI (totalAmount) instead of broker amounts
      const amount = payment.totalAmount;

      // All payments should have estimated dates (filtered earlier)
      const date = new Date(payment.estimatedDate!);
      const monthIdx = date.getMonth();
      const year = date.getFullYear();

      if (year !== currentYear) return; // Skip other years for now

      if (payment.category === 'invoiced') {
        data[monthIdx].invoiced += amount;
      } else if (payment.category === 'pipeline') {
        data[monthIdx].pipeline += amount;
      } else if (payment.category === 'ucContingent') {
        data[monthIdx].ucContingent += amount;
      }
      data[monthIdx].payments.push(payment);
    });

    // Calculate totals
    data.forEach(d => {
      d.total = d.invoiced + (showPipeline ? d.pipeline : 0) + (showUcContingent ? d.ucContingent : 0);
    });

    return data;
  }, [filteredPayments, showPipeline, showUcContingent]);

  // Calculate summary totals
  const summaryTotals = useMemo(() => {
    let invoiced = 0;
    let pipeline = 0;
    let ucContingent = 0;

    filteredPayments.forEach(payment => {
      // Use GCI (totalAmount) instead of broker amounts
      const amount = payment.totalAmount;

      if (payment.category === 'invoiced') invoiced += amount;
      else if (payment.category === 'pipeline') pipeline += amount;
      else if (payment.category === 'ucContingent') ucContingent += amount;
    });

    return { invoiced, pipeline, ucContingent };
  }, [filteredPayments]);

  // Chart data
  const chartData = useMemo(() => {
    return monthlyData.filter(d => d.monthKey !== 'unknown').map(d => ({
      month: d.month,
      Invoiced: d.invoiced,
      ...(showPipeline && { Pipeline: d.pipeline }),
      ...(showUcContingent && { 'UC/Contingent': d.ucContingent }),
    }));
  }, [monthlyData, showPipeline, showUcContingent]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  };

  const getViewTitle = () => {
    if (viewMode === 'admin') {
      if (brokerFilter === 'all') return 'Company View (All Brokers + House)';
      if (brokerFilter === 'mike') return "Mike's Cashflow";
      if (brokerFilter === 'arty') return "Arty's Cashflow";
      if (brokerFilter === 'greg') return "Greg's Cashflow";
    }
    return 'My Cashflow';
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-600">Loading cashflow data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cashflow Planning</h1>
              <p className="text-sm text-gray-500 mt-1">{getViewTitle()}</p>
            </div>
            <div className="flex items-center gap-4">
              {/* View Mode Toggle (Admin only) */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <select
                    value={viewMode === 'admin' ? brokerFilter : 'personal'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'personal') {
                        setViewMode('personal');
                      } else {
                        setViewMode('admin');
                        setBrokerFilter(val as BrokerFilter);
                      }
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm"
                  >
                    <option value="all">All (Company)</option>
                    <option value="mike">Mike</option>
                    <option value="arty">Arty</option>
                    <option value="greg">Greg</option>
                  </select>
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={fetchPayments}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Toggle Controls */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-6">
          <span className="text-sm font-medium text-gray-700">Include:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showPipeline}
              onChange={(e) => setShowPipeline(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Pipeline 50%+ ({formatCurrency(summaryTotals.pipeline)})</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showUcContingent}
              onChange={(e) => setShowUcContingent(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">UC/Contingent ({formatCurrency(summaryTotals.ucContingent)})</span>
          </label>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Invoiced (Primary) */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Invoiced (Booked)</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(summaryTotals.invoiced)}</p>
          <p className="text-xs text-gray-500 mt-1">Primary expected income</p>
        </div>

        {/* Pipeline */}
        <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${showPipeline ? 'border-blue-500' : 'border-gray-300'}`}>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Pipeline 50%+</p>
          <p className={`text-3xl font-bold mt-2 ${showPipeline ? 'text-gray-900' : 'text-gray-400'}`}>
            {formatCurrency(summaryTotals.pipeline)}
          </p>
          <p className="text-xs text-gray-500 mt-1">{showPipeline ? 'Included in totals' : 'Not included'}</p>
        </div>

        {/* UC/Contingent */}
        <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${showUcContingent ? 'border-yellow-500' : 'border-gray-300'}`}>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">UC/Contingent</p>
          <p className={`text-3xl font-bold mt-2 ${showUcContingent ? 'text-gray-900' : 'text-gray-400'}`}>
            {formatCurrency(summaryTotals.ucContingent)}
          </p>
          <p className="text-xs text-gray-500 mt-1">{showUcContingent ? 'Included in totals' : 'Not included'}</p>
        </div>

        {/* Total */}
        <div className="bg-gray-800 rounded-lg shadow p-6 text-white">
          <p className="text-sm font-medium text-gray-300 uppercase tracking-wide">Total Expected</p>
          <p className="text-3xl font-bold mt-2">
            {formatCurrency(
              summaryTotals.invoiced +
              (showPipeline ? summaryTotals.pipeline : 0) +
              (showUcContingent ? summaryTotals.ucContingent : 0)
            )}
          </p>
          <p className="text-xs text-gray-400 mt-1">Based on selected categories</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Monthly Projection</h2>
        </div>
        <div className="p-6">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                <Legend />
                <Bar dataKey="Invoiced" fill="#22C55E" stackId="a" />
                {showPipeline && <Bar dataKey="Pipeline" fill="#3B82F6" stackId="a" />}
                {showUcContingent && <Bar dataKey="UC/Contingent" fill="#EAB308" stackId="a" />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Monthly Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase bg-green-50">Invoiced</th>
                {showPipeline && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-blue-600 uppercase bg-blue-50">Pipeline</th>
                )}
                {showUcContingent && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-yellow-600 uppercase bg-yellow-50">UC/Contingent</th>
                )}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"># Payments</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {monthlyData.map((month) => (
                <>
                  <tr
                    key={month.monthKey}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleMonth(month.monthKey)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`h-4 w-4 text-gray-400 transition-transform ${expandedMonths.has(month.monthKey) ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {month.month}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 bg-green-50">
                      {formatCurrency(month.invoiced)}
                    </td>
                    {showPipeline && (
                      <td className="px-4 py-3 text-sm text-right text-gray-900 bg-blue-50">
                        {formatCurrency(month.pipeline)}
                      </td>
                    )}
                    {showUcContingent && (
                      <td className="px-4 py-3 text-sm text-right text-gray-900 bg-yellow-50">
                        {formatCurrency(month.ucContingent)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(month.total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">
                      {month.payments.length}
                    </td>
                  </tr>
                  {/* Expanded Payment Details */}
                  {expandedMonths.has(month.monthKey) && month.payments.length > 0 && (
                    <>
                      {month.payments
                        .filter(p => {
                          if (p.category === 'invoiced') return true;
                          if (p.category === 'pipeline' && showPipeline) return true;
                          if (p.category === 'ucContingent' && showUcContingent) return true;
                          return false;
                        })
                        .sort((a, b) => {
                          if (!a.estimatedDate && !b.estimatedDate) return 0;
                          if (!a.estimatedDate) return 1;
                          if (!b.estimatedDate) return -1;
                          return a.estimatedDate.localeCompare(b.estimatedDate);
                        })
                        .map((payment) => (
                          <tr key={payment.id} className="bg-gray-50 border-l-4 border-gray-300">
                            <td className="px-4 py-2 text-sm text-gray-600 pl-10" colSpan={1}>
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{payment.dealName}</span>
                                <span className="text-xs text-gray-500">
                                  {payment.paymentName}
                                  {payment.invoiceNumber && (
                                    <span className="ml-2 text-green-600">INV {payment.invoiceNumber}</span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-gray-600 bg-green-50/50">
                              {payment.category === 'invoiced' ? formatCurrency(payment.totalAmount) : '-'}
                            </td>
                            {showPipeline && (
                              <td className="px-4 py-2 text-sm text-right text-gray-600 bg-blue-50/50">
                                {payment.category === 'pipeline' ? formatCurrency(payment.totalAmount) : '-'}
                              </td>
                            )}
                            {showUcContingent && (
                              <td className="px-4 py-2 text-sm text-right text-gray-600 bg-yellow-50/50">
                                {payment.category === 'ucContingent' ? formatCurrency(payment.totalAmount) : '-'}
                              </td>
                            )}
                            <td className="px-4 py-2 text-sm text-right text-gray-600">
                              {formatDate(payment.estimatedDate)}
                            </td>
                            <td className="px-4 py-2 text-sm text-right">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                payment.category === 'invoiced' ? 'bg-green-100 text-green-700' :
                                payment.category === 'pipeline' ? 'bg-blue-100 text-blue-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {payment.stageLabel}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </>
                  )}
                </>
              ))}
            </tbody>
            {/* Totals Row */}
            <tfoot className="bg-gray-800 text-white">
              <tr>
                <td className="px-4 py-3 text-sm font-semibold">TOTAL</td>
                <td className="px-4 py-3 text-sm text-right font-semibold bg-green-900">
                  {formatCurrency(summaryTotals.invoiced)}
                </td>
                {showPipeline && (
                  <td className="px-4 py-3 text-sm text-right font-semibold bg-blue-900">
                    {formatCurrency(summaryTotals.pipeline)}
                  </td>
                )}
                {showUcContingent && (
                  <td className="px-4 py-3 text-sm text-right font-semibold bg-yellow-700">
                    {formatCurrency(summaryTotals.ucContingent)}
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-right font-semibold">
                  {formatCurrency(
                    summaryTotals.invoiced +
                    (showPipeline ? summaryTotals.pipeline : 0) +
                    (showUcContingent ? summaryTotals.ucContingent : 0)
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold">
                  {payments.length}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white rounded-lg shadow px-6 py-3">
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Invoiced:</strong> Payments on Booked or Executed Payable deals</p>
          <p><strong>Pipeline 50%+:</strong> Payments on deals in Negotiating LOI or At Lease/PSA stages</p>
          <p><strong>UC/Contingent:</strong> Payments on deals in Under Contract / Contingent stage</p>
          <p><strong>GCI:</strong> Payment Amount - Referral Fee (filtered by selected broker involvement)</p>
          <p><strong>Filter:</strong> Excludes Lost deals and payments without estimated dates</p>
        </div>
      </div>
    </div>
  );
}
