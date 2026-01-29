import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Broker IDs for the three principals
const BROKER_IDS = {
  mike: '38d4b67c-841d-4590-a909-523d3a4c6e4b',
  arty: '1d049634-32fe-4834-8ca1-33f1cff0055a',
  greg: 'dbfdd8d4-5241-4cc2-be83-f7763f5519bf',
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

// Entity types for goals
type EntityType = 'company' | 'mike_arty' | 'arty' | 'greg';

interface Goal {
  id: string;
  year: number;
  goal_type: 'gci' | 'deal_count';
  target_value: number;
  entity_type: EntityType;
}

interface RecapMetrics {
  collected: number;
  bookedCount: number;
  bookedGci: number;
  closedCount: number;
  closedGci: number;
}

interface CashflowMonth {
  month: string;
  gci: number;
}

interface ProspectingMetrics {
  callsMade: number;
  completedCalls: number;
  meetingsHeld: number;
  byMonth: { month: string; calls: number; completed: number; meetings: number }[];
}

interface HistoricalYearMetrics {
  year: number;
  totalGci: number;
  totalDeals: number;
  avgTransactionGci: number;
  mikeDeals: number;
  artyDeals: number;
  gregDeals: number;
}

const ENTITY_LABELS: Record<EntityType, string> = {
  company: 'Company',
  mike_arty: 'Mike & Arty',
  arty: 'Arty',
  greg: 'Greg',
};

export default function GoalDashboard2026() {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin';

  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // 2025 Recap data
  const [recap2025, setRecap2025] = useState<Record<EntityType, RecapMetrics>>({
    company: { collected: 0, bookedCount: 0, bookedGci: 0, closedCount: 0, closedGci: 0 },
    mike_arty: { collected: 0, bookedCount: 0, bookedGci: 0, closedCount: 0, closedGci: 0 },
    arty: { collected: 0, bookedCount: 0, bookedGci: 0, closedCount: 0, closedGci: 0 },
    greg: { collected: 0, bookedCount: 0, bookedGci: 0, closedCount: 0, closedGci: 0 },
  });

  // Goals data
  const [goals2025, setGoals2025] = useState<Goal[]>([]);
  const [goals2026, setGoals2026] = useState<Goal[]>([]);

  // Cashflow data
  const [cashflow2026, setCashflow2026] = useState<CashflowMonth[]>([]);

  // Prospecting data
  const [prospecting2025, setProspecting2025] = useState<ProspectingMetrics>({
    callsMade: 0,
    completedCalls: 0,
    meetingsHeld: 0,
    byMonth: [],
  });

  // Edit state
  const [editingGoal, setEditingGoal] = useState<{ year: number; entity: EntityType; type: 'gci' | 'deal_count' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Expanded sections
  const [expandedProspecting, setExpandedProspecting] = useState(false);
  const [expandedHistorical, setExpandedHistorical] = useState(true);

  // Historical metrics
  const [historicalMetrics, setHistoricalMetrics] = useState<HistoricalYearMetrics[]>([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetch2025Recap(),
        fetchGoals(),
        fetchCashflow2026(),
        fetchProspecting2025(),
        fetchHistoricalMetrics(),
      ]);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetch2025Recap = async () => {
    const year2025Start = '2025-01-01';
    const year2025End = '2025-12-31';

    // Fetch collected payments in 2025
    const { data: payments } = await supabase
      .from('payment')
      .select(`
        id,
        payment_amount,
        referral_fee_usd,
        agci,
        payment_received_date,
        deal_id,
        deal:deal_id (
          house_percent
        )
      `)
      .eq('payment_received', true)
      .gte('payment_received_date', year2025Start)
      .lte('payment_received_date', year2025End);

    // Fetch payment splits for broker breakdown
    const paymentIds = (payments || []).map(p => p.id);
    const { data: paymentSplits } = await supabase
      .from('payment_split')
      .select('payment_id, broker_id, split_broker_total')
      .in('payment_id', paymentIds)
      .in('broker_id', [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg]);

    // Build payment splits map
    const splitsByPayment = new Map<string, { mike: number; arty: number; greg: number }>();
    (paymentSplits || []).forEach(split => {
      const existing = splitsByPayment.get(split.payment_id) || { mike: 0, arty: 0, greg: 0 };
      if (split.broker_id === BROKER_IDS.mike) existing.mike = split.split_broker_total || 0;
      if (split.broker_id === BROKER_IDS.arty) existing.arty = split.split_broker_total || 0;
      if (split.broker_id === BROKER_IDS.greg) existing.greg = split.split_broker_total || 0;
      splitsByPayment.set(split.payment_id, existing);
    });

    // Calculate collected by entity
    let companyCollected = 0;
    let mikeArtyCollected = 0;
    let artyCollected = 0;
    let gregCollected = 0;

    (payments || []).forEach(p => {
      const gci = (p.payment_amount || 0) - (p.referral_fee_usd || 0);
      companyCollected += gci;

      const splits = splitsByPayment.get(p.id);
      if (splits) {
        mikeArtyCollected += splits.mike + splits.arty;
        artyCollected += splits.arty;
        gregCollected += splits.greg;
      }
    });

    // Fetch booked deals in 2025 (by booked_date)
    const bookedClosedStages = [STAGE_IDS.booked, STAGE_IDS.executedPayable, STAGE_IDS.closedPaid];
    const { data: bookedDeals } = await supabase
      .from('deal')
      .select('id, gci, booked_date, stage_id')
      .in('stage_id', bookedClosedStages)
      .gte('booked_date', year2025Start)
      .lte('booked_date', year2025End);

    // Fetch closed deals in 2025 (by closed_date - using stage = closedPaid)
    const { data: closedDeals } = await supabase
      .from('deal')
      .select('id, gci, closed_date, stage_id')
      .eq('stage_id', STAGE_IDS.closedPaid)
      .gte('closed_date', year2025Start)
      .lte('closed_date', year2025End);

    // Fetch commission splits for deal breakdown
    const allDealIds = [...(bookedDeals || []).map(d => d.id), ...(closedDeals || []).map(d => d.id)];
    const { data: commissionSplits } = await supabase
      .from('commission_split')
      .select('deal_id, broker_id, split_broker_total')
      .in('deal_id', allDealIds)
      .in('broker_id', [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg]);

    // Build commission splits map
    const splitsByDeal = new Map<string, { mike: number; arty: number; greg: number }>();
    (commissionSplits || []).forEach(split => {
      const existing = splitsByDeal.get(split.deal_id) || { mike: 0, arty: 0, greg: 0 };
      if (split.broker_id === BROKER_IDS.mike) existing.mike = split.split_broker_total || 0;
      if (split.broker_id === BROKER_IDS.arty) existing.arty = split.split_broker_total || 0;
      if (split.broker_id === BROKER_IDS.greg) existing.greg = split.split_broker_total || 0;
      splitsByDeal.set(split.deal_id, existing);
    });

    // Calculate booked metrics by entity
    const bookedMetrics = { company: { count: 0, gci: 0 }, mike_arty: { count: 0, gci: 0 }, arty: { count: 0, gci: 0 }, greg: { count: 0, gci: 0 } };
    (bookedDeals || []).forEach(d => {
      bookedMetrics.company.count++;
      bookedMetrics.company.gci += d.gci || 0;

      const splits = splitsByDeal.get(d.id);
      if (splits) {
        if (splits.mike > 0 || splits.arty > 0) {
          bookedMetrics.mike_arty.count++;
          bookedMetrics.mike_arty.gci += splits.mike + splits.arty;
        }
        if (splits.arty > 0) {
          bookedMetrics.arty.count++;
          bookedMetrics.arty.gci += splits.arty;
        }
        if (splits.greg > 0) {
          bookedMetrics.greg.count++;
          bookedMetrics.greg.gci += splits.greg;
        }
      }
    });

    // Calculate closed metrics by entity
    const closedMetrics = { company: { count: 0, gci: 0 }, mike_arty: { count: 0, gci: 0 }, arty: { count: 0, gci: 0 }, greg: { count: 0, gci: 0 } };
    (closedDeals || []).forEach(d => {
      closedMetrics.company.count++;
      closedMetrics.company.gci += d.gci || 0;

      const splits = splitsByDeal.get(d.id);
      if (splits) {
        if (splits.mike > 0 || splits.arty > 0) {
          closedMetrics.mike_arty.count++;
          closedMetrics.mike_arty.gci += splits.mike + splits.arty;
        }
        if (splits.arty > 0) {
          closedMetrics.arty.count++;
          closedMetrics.arty.gci += splits.arty;
        }
        if (splits.greg > 0) {
          closedMetrics.greg.count++;
          closedMetrics.greg.gci += splits.greg;
        }
      }
    });

    setRecap2025({
      company: {
        collected: companyCollected,
        bookedCount: bookedMetrics.company.count,
        bookedGci: bookedMetrics.company.gci,
        closedCount: closedMetrics.company.count,
        closedGci: closedMetrics.company.gci,
      },
      mike_arty: {
        collected: mikeArtyCollected,
        bookedCount: bookedMetrics.mike_arty.count,
        bookedGci: bookedMetrics.mike_arty.gci,
        closedCount: closedMetrics.mike_arty.count,
        closedGci: closedMetrics.mike_arty.gci,
      },
      arty: {
        collected: artyCollected,
        bookedCount: bookedMetrics.arty.count,
        bookedGci: bookedMetrics.arty.gci,
        closedCount: closedMetrics.arty.count,
        closedGci: closedMetrics.arty.gci,
      },
      greg: {
        collected: gregCollected,
        bookedCount: bookedMetrics.greg.count,
        bookedGci: bookedMetrics.greg.gci,
        closedCount: closedMetrics.greg.count,
        closedGci: closedMetrics.greg.gci,
      },
    });
  };

  const fetchGoals = async () => {
    // Fetch 2025 goals
    const { data: goals25 } = await supabase
      .from('goal')
      .select('*')
      .eq('year', 2025);

    setGoals2025(goals25 || []);

    // Fetch 2026 goals
    const { data: goals26 } = await supabase
      .from('goal')
      .select('*')
      .eq('year', 2026);

    setGoals2026(goals26 || []);
  };

  const fetchCashflow2026 = async () => {
    const year2026Start = '2026-01-01';
    const year2026End = '2026-12-31';

    // Fetch invoiced payments (not received, on booked/executed deals, with estimated date in 2026)
    const { data: payments } = await supabase
      .from('payment')
      .select(`
        id,
        payment_amount,
        referral_fee_usd,
        payment_date_estimated,
        deal:deal_id (
          stage_id
        )
      `)
      .eq('is_active', true)
      .or('payment_received.eq.false,payment_received.is.null')
      .gte('payment_date_estimated', year2026Start)
      .lte('payment_date_estimated', year2026End);

    // Filter for booked/executed payable deals
    const invoicedPayments = (payments || []).filter(p => {
      const stageId = (p.deal as any)?.stage_id;
      return [STAGE_IDS.booked, STAGE_IDS.executedPayable].includes(stageId);
    });

    // Group by month
    const monthlyData = new Map<string, number>();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach(m => monthlyData.set(m, 0));

    invoicedPayments.forEach(p => {
      if (p.payment_date_estimated) {
        const date = new Date(p.payment_date_estimated);
        const monthIndex = date.getMonth();
        const monthName = months[monthIndex];
        const gci = (p.payment_amount || 0) - (p.referral_fee_usd || 0);
        monthlyData.set(monthName, (monthlyData.get(monthName) || 0) + gci);
      }
    });

    const cashflowData: CashflowMonth[] = months.map(month => ({
      month,
      gci: monthlyData.get(month) || 0,
    }));

    setCashflow2026(cashflowData);
  };

  const fetchProspecting2025 = async () => {
    const year2025Start = '2025-01-01';
    const year2025End = '2025-12-31';

    // Fetch Mike's prospecting activities in 2025
    const { data: activities } = await supabase
      .from('activity')
      .select('id, completed_at, is_prospecting_call, completed_call, meeting_held, assigned_to')
      .eq('assigned_to', BROKER_IDS.mike)
      .gte('completed_at', year2025Start)
      .lte('completed_at', year2025End)
      .or('is_prospecting_call.eq.true,completed_call.eq.true,meeting_held.eq.true');

    const callsMade = (activities || []).filter(a => a.is_prospecting_call).length;
    const completedCalls = (activities || []).filter(a => a.completed_call).length;
    const meetingsHeld = (activities || []).filter(a => a.meeting_held).length;

    // Group by month
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const byMonth = months.map(month => ({ month, calls: 0, completed: 0, meetings: 0 }));

    (activities || []).forEach(a => {
      if (a.completed_at) {
        const date = new Date(a.completed_at);
        const monthIndex = date.getMonth();
        if (a.is_prospecting_call) byMonth[monthIndex].calls++;
        if (a.completed_call) byMonth[monthIndex].completed++;
        if (a.meeting_held) byMonth[monthIndex].meetings++;
      }
    });

    setProspecting2025({
      callsMade,
      completedCalls,
      meetingsHeld,
      byMonth,
    });
  };

  const fetchHistoricalMetrics = async () => {
    const years = [2021, 2022, 2023, 2024, 2025];
    const bookedClosedStages = [STAGE_IDS.booked, STAGE_IDS.executedPayable, STAGE_IDS.closedPaid];

    // Fetch all deals at once for efficiency
    const { data: allDeals } = await supabase
      .from('deal')
      .select('id, gci, booked_date, stage_id')
      .in('stage_id', bookedClosedStages)
      .gte('booked_date', '2021-01-01')
      .lte('booked_date', '2025-12-31');

    // Fetch all commission splits for these deals
    const dealIds = (allDeals || []).map(d => d.id);
    const { data: commissionSplits } = await supabase
      .from('commission_split')
      .select('deal_id, broker_id, split_broker_total')
      .in('deal_id', dealIds)
      .in('broker_id', [BROKER_IDS.mike, BROKER_IDS.arty, BROKER_IDS.greg]);

    // Build splits map
    const splitsByDeal = new Map<string, { mike: number; arty: number; greg: number }>();
    (commissionSplits || []).forEach(split => {
      const existing = splitsByDeal.get(split.deal_id) || { mike: 0, arty: 0, greg: 0 };
      if (split.broker_id === BROKER_IDS.mike) existing.mike = split.split_broker_total || 0;
      if (split.broker_id === BROKER_IDS.arty) existing.arty = split.split_broker_total || 0;
      if (split.broker_id === BROKER_IDS.greg) existing.greg = split.split_broker_total || 0;
      splitsByDeal.set(split.deal_id, existing);
    });

    // Calculate metrics for each year
    const metrics: HistoricalYearMetrics[] = years.map(year => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const yearDeals = (allDeals || []).filter(d =>
        d.booked_date && d.booked_date >= yearStart && d.booked_date <= yearEnd
      );

      const totalGci = yearDeals.reduce((sum, d) => sum + (d.gci || 0), 0);
      const totalDeals = yearDeals.length;
      const avgTransactionGci = totalDeals > 0 ? totalGci / totalDeals : 0;

      // Count deals by broker
      let mikeDeals = 0;
      let artyDeals = 0;
      let gregDeals = 0;

      yearDeals.forEach(d => {
        const splits = splitsByDeal.get(d.id);
        if (splits) {
          if (splits.mike > 0) mikeDeals++;
          if (splits.arty > 0) artyDeals++;
          if (splits.greg > 0) gregDeals++;
        }
      });

      return {
        year,
        totalGci,
        totalDeals,
        avgTransactionGci,
        mikeDeals,
        artyDeals,
        gregDeals,
      };
    });

    setHistoricalMetrics(metrics);
  };

  const getGoal = (goals: Goal[], entity: EntityType, type: 'gci' | 'deal_count'): number | null => {
    const goal = goals.find(g => g.entity_type === entity && g.goal_type === type);
    return goal?.target_value ?? null;
  };

  const saveGoal = async (year: number, entity: EntityType, type: 'gci' | 'deal_count', value: number) => {
    setSaving(true);
    try {
      const goals = year === 2025 ? goals2025 : goals2026;
      const existingGoal = goals.find(g => g.entity_type === entity && g.goal_type === type);

      if (existingGoal) {
        await supabase
          .from('goal')
          .update({ target_value: value, updated_at: new Date().toISOString() })
          .eq('id', existingGoal.id);
      } else {
        await supabase
          .from('goal')
          .insert({ year, goal_type: type, target_value: value, entity_type: entity });
      }

      await fetchGoals();
    } catch (err) {
      console.error('Error saving goal:', err);
    } finally {
      setSaving(false);
      setEditingGoal(null);
      setEditValue('');
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

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'bg-green-500';
    if (progress >= 80) return 'bg-green-400';
    if (progress >= 60) return 'bg-yellow-400';
    if (progress >= 40) return 'bg-orange-400';
    return 'bg-red-400';
  };

  const getProgressTextColor = (progress: number) => {
    if (progress >= 80) return 'text-green-600';
    if (progress >= 60) return 'text-yellow-600';
    if (progress >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  // Calculate year progress for 2026
  const dayOfYear = Math.floor((Date.now() - new Date(2026, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
  const yearProgress2026 = Math.max(0, Math.min(100, (dayOfYear / 365) * 100));

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/4"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: 2025 Recap */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">2025 Recap</h2>
          <p className="text-sm text-gray-500">Full year performance baseline</p>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Booked (#)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Booked GCI</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Closed (#)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Closed GCI</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(['company', 'mike_arty', 'arty', 'greg'] as EntityType[]).map(entity => (
                  <tr key={entity} className={entity === 'company' ? 'bg-blue-50 font-semibold' : ''}>
                    <td className="px-4 py-3 text-sm text-gray-900">{ENTITY_LABELS[entity]}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(recap2025[entity].collected)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{recap2025[entity].bookedCount}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(recap2025[entity].bookedGci)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{recap2025[entity].closedCount}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(recap2025[entity].closedGci)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 2025 Goal vs Actual */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">2025 Goal vs Actual</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(['company', 'mike_arty', 'arty', 'greg'] as EntityType[]).map(entity => {
                const gciGoal = getGoal(goals2025, entity, 'gci');
                const dealGoal = getGoal(goals2025, entity, 'deal_count');
                const actualGci = recap2025[entity].bookedGci;
                const actualDeals = recap2025[entity].bookedCount;

                return (
                  <div key={entity} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">{ENTITY_LABELS[entity]}</h4>

                    {/* GCI Goal */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600">GCI Goal</span>
                        {isAdmin && editingGoal?.year === 2025 && editingGoal?.entity === entity && editingGoal?.type === 'gci' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 px-2 py-1 text-sm border rounded"
                              placeholder="$"
                            />
                            <button
                              onClick={() => saveGoal(2025, entity, 'gci', parseFloat(editValue))}
                              disabled={saving || !editValue}
                              className="px-2 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingGoal(null); setEditValue(''); }}
                              className="px-2 py-1 text-xs border rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{gciGoal ? formatCurrency(gciGoal) : 'Not set'}</span>
                            {isAdmin && (
                              <button
                                onClick={() => { setEditingGoal({ year: 2025, entity, type: 'gci' }); setEditValue(gciGoal?.toString() || ''); }}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {gciGoal && (
                        <>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <div
                              className={`h-2 rounded-full transition-all ${getProgressColor((actualGci / gciGoal) * 100)}`}
                              style={{ width: `${Math.min((actualGci / gciGoal) * 100, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className={getProgressTextColor((actualGci / gciGoal) * 100)}>
                              {formatCurrency(actualGci)} ({Math.round((actualGci / gciGoal) * 100)}%)
                            </span>
                            <span className="text-gray-500">Gap: {formatCurrency(gciGoal - actualGci)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Deal Count Goal */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-600">Transaction Goal</span>
                        {isAdmin && editingGoal?.year === 2025 && editingGoal?.entity === entity && editingGoal?.type === 'deal_count' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-24 px-2 py-1 text-sm border rounded"
                              placeholder="#"
                            />
                            <button
                              onClick={() => saveGoal(2025, entity, 'deal_count', parseFloat(editValue))}
                              disabled={saving || !editValue}
                              className="px-2 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingGoal(null); setEditValue(''); }}
                              className="px-2 py-1 text-xs border rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{dealGoal ? `${dealGoal} deals` : 'Not set'}</span>
                            {isAdmin && (
                              <button
                                onClick={() => { setEditingGoal({ year: 2025, entity, type: 'deal_count' }); setEditValue(dealGoal?.toString() || ''); }}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {dealGoal && (
                        <>
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                            <div
                              className={`h-2 rounded-full transition-all ${getProgressColor((actualDeals / dealGoal) * 100)}`}
                              style={{ width: `${Math.min((actualDeals / dealGoal) * 100, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className={getProgressTextColor((actualDeals / dealGoal) * 100)}>
                              {actualDeals} deals ({Math.round((actualDeals / dealGoal) * 100)}%)
                            </span>
                            <span className="text-gray-500">Gap: {dealGoal - actualDeals} deals</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Historical Performance Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <button
            onClick={() => setExpandedHistorical(!expandedHistorical)}
            className="flex items-center gap-2 w-full text-left"
          >
            <svg
              className={`h-5 w-5 text-gray-500 transition-transform ${expandedHistorical ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Historical Performance</h2>
              <p className="text-sm text-gray-500">Year-over-year metrics (2021-2025)</p>
            </div>
          </button>
        </div>
        {expandedHistorical && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total GCI</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"># Deals</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Transaction GCI</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-blue-600 uppercase tracking-wider bg-blue-50">Mike Deals</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase tracking-wider bg-green-50">Arty Deals</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-purple-600 uppercase tracking-wider bg-purple-50">Greg Deals</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {historicalMetrics.map((metrics, idx) => (
                    <tr key={metrics.year} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{metrics.year}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(metrics.totalGci)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{metrics.totalDeals}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(metrics.avgTransactionGci)}</td>
                      <td className="px-4 py-3 text-sm text-right text-blue-900 bg-blue-50">{metrics.mikeDeals}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-900 bg-green-50">{metrics.artyDeals}</td>
                      <td className="px-4 py-3 text-sm text-right text-purple-900 bg-purple-50">{metrics.gregDeals}</td>
                    </tr>
                  ))}
                </tbody>
                {historicalMetrics.length > 0 && (
                  <tfoot className="bg-gray-800 text-white">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold">5-Year Totals</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        {formatCurrency(historicalMetrics.reduce((sum, m) => sum + m.totalGci, 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        {historicalMetrics.reduce((sum, m) => sum + m.totalDeals, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        {formatCurrency(
                          historicalMetrics.reduce((sum, m) => sum + m.totalGci, 0) /
                          Math.max(historicalMetrics.reduce((sum, m) => sum + m.totalDeals, 0), 1)
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold bg-blue-900">
                        {historicalMetrics.reduce((sum, m) => sum + m.mikeDeals, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold bg-green-900">
                        {historicalMetrics.reduce((sum, m) => sum + m.artyDeals, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold bg-purple-900">
                        {historicalMetrics.reduce((sum, m) => sum + m.gregDeals, 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Year-over-Year Growth */}
            {historicalMetrics.length > 1 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Year-over-Year Growth</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {historicalMetrics.slice(1).map((metrics, idx) => {
                    const prevYear = historicalMetrics[idx];
                    const gciGrowth = prevYear.totalGci > 0
                      ? ((metrics.totalGci - prevYear.totalGci) / prevYear.totalGci) * 100
                      : 0;
                    const dealGrowth = prevYear.totalDeals > 0
                      ? ((metrics.totalDeals - prevYear.totalDeals) / prevYear.totalDeals) * 100
                      : 0;

                    return (
                      <div key={metrics.year} className="border border-gray-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-600">{prevYear.year} → {metrics.year}</p>
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">GCI</span>
                            <span className={`text-sm font-semibold ${gciGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {gciGrowth >= 0 ? '+' : ''}{gciGrowth.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">Deals</span>
                            <span className={`text-sm font-semibold ${dealGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {dealGrowth >= 0 ? '+' : ''}{dealGrowth.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: 2026 Goals */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">2026 Goals</h2>
          <p className="text-sm text-gray-500">Set targets for the year ({Math.round(yearProgress2026)}% of year complete)</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['company', 'mike_arty', 'arty', 'greg'] as EntityType[]).map(entity => {
              const gciGoal = getGoal(goals2026, entity, 'gci');
              const dealGoal = getGoal(goals2026, entity, 'deal_count');

              return (
                <div key={entity} className={`border rounded-lg p-4 ${entity === 'company' ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                  <h4 className="font-semibold text-gray-900 mb-4">{ENTITY_LABELS[entity]}</h4>

                  {/* GCI Target */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">GCI Target</span>
                      {isAdmin && editingGoal?.year === 2026 && editingGoal?.entity === entity && editingGoal?.type === 'gci' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">$</span>
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-28 px-2 py-1 text-sm border rounded"
                          />
                          <button
                            onClick={() => saveGoal(2026, entity, 'gci', parseFloat(editValue))}
                            disabled={saving || !editValue}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingGoal(null); setEditValue(''); }}
                            className="px-2 py-1 text-xs border rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-900">{gciGoal ? formatCurrency(gciGoal) : 'Not set'}</span>
                          {isAdmin && (
                            <button
                              onClick={() => { setEditingGoal({ year: 2026, entity, type: 'gci' }); setEditValue(gciGoal?.toString() || ''); }}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Transaction Target */}
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Transaction Target</span>
                      {isAdmin && editingGoal?.year === 2026 && editingGoal?.entity === entity && editingGoal?.type === 'deal_count' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-20 px-2 py-1 text-sm border rounded"
                          />
                          <span className="text-gray-500">deals</span>
                          <button
                            onClick={() => saveGoal(2026, entity, 'deal_count', parseFloat(editValue))}
                            disabled={saving || !editValue}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingGoal(null); setEditValue(''); }}
                            className="px-2 py-1 text-xs border rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-900">{dealGoal ? `${dealGoal} deals` : 'Not set'}</span>
                          {isAdmin && (
                            <button
                              onClick={() => { setEditingGoal({ year: 2026, entity, type: 'deal_count' }); setEditValue(dealGoal?.toString() || ''); }}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 3: Gap Analysis */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Gap Analysis</h2>
          <p className="text-sm text-gray-500">2025 Actual vs 2026 Goals</p>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">2025 Actual GCI</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">2026 Goal GCI</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gap</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">2025 Actual Deals</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">2026 Goal Deals</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(['company', 'mike_arty', 'arty', 'greg'] as EntityType[]).map(entity => {
                  const actual2025Gci = recap2025[entity].bookedGci;
                  const goal2026Gci = getGoal(goals2026, entity, 'gci') || 0;
                  const gciGap = goal2026Gci - actual2025Gci;

                  const actual2025Deals = recap2025[entity].bookedCount;
                  const goal2026Deals = getGoal(goals2026, entity, 'deal_count') || 0;
                  const dealGap = goal2026Deals - actual2025Deals;

                  return (
                    <tr key={entity} className={entity === 'company' ? 'bg-blue-50 font-semibold' : ''}>
                      <td className="px-4 py-3 text-sm text-gray-900">{ENTITY_LABELS[entity]}</td>
                      <td className="px-4 py-3 text-sm text-right">{formatCurrency(actual2025Gci)}</td>
                      <td className="px-4 py-3 text-sm text-right">{goal2026Gci ? formatCurrency(goal2026Gci) : '-'}</td>
                      <td className={`px-4 py-3 text-sm text-right ${gciGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {goal2026Gci ? formatCurrency(gciGap) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">{actual2025Deals}</td>
                      <td className="px-4 py-3 text-sm text-right">{goal2026Deals || '-'}</td>
                      <td className={`px-4 py-3 text-sm text-right ${dealGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {goal2026Deals ? (dealGap > 0 ? `+${dealGap}` : dealGap) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Progress indicators for 2026 */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">2026 Progress (YTD)</h3>
            <p className="text-sm text-gray-500 mb-4">Progress tracking will show here as deals are booked in 2026</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['company', 'mike_arty', 'arty', 'greg'] as EntityType[]).map(entity => {
                const gciGoal = getGoal(goals2026, entity, 'gci');
                const dealGoal = getGoal(goals2026, entity, 'deal_count');
                // For now, 2026 actuals are 0 since we're at the start of 2026
                // In production, this would query 2026 booked deals

                if (!gciGoal && !dealGoal) return null;

                return (
                  <div key={entity} className="border border-gray-200 rounded-lg p-3">
                    <h4 className="font-medium text-gray-900 mb-2">{ENTITY_LABELS[entity]}</h4>
                    {gciGoal && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span>GCI: $0 of {formatCurrency(gciGoal)}</span>
                          <span>0%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="h-2 rounded-full bg-gray-400" style={{ width: '0%' }} />
                        </div>
                      </div>
                    )}
                    {dealGoal && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Deals: 0 of {dealGoal}</span>
                          <span>0%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="h-2 rounded-full bg-gray-400" style={{ width: '0%' }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: 2026 Cashflow Chart */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">2026 Projected Cashflow</h2>
          <p className="text-sm text-gray-500">Based on invoiced payments with estimated payment dates</p>
        </div>
        <div className="p-6">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflow2026} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'GCI']}
                  labelFormatter={(label) => `${label} 2026`}
                />
                <Bar dataKey="gci" fill="#3B82F6" name="Projected GCI" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 text-center">
            <p className="text-lg font-semibold text-gray-900">
              Total Projected: {formatCurrency(cashflow2026.reduce((sum, m) => sum + m.gci, 0))}
            </p>
          </div>
        </div>
      </div>

      {/* Section 5: Prospecting Metrics */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">2025 Prospecting Metrics</h2>
            <p className="text-sm text-gray-500">Mike's prospecting activity for the year</p>
          </div>
          <button
            onClick={() => setExpandedProspecting(!expandedProspecting)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {expandedProspecting ? 'Hide Monthly' : 'Show Monthly'}
          </button>
        </div>
        <div className="p-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-3xl font-bold text-blue-600">{formatNumber(prospecting2025.callsMade)}</p>
              <p className="text-sm text-gray-600">Prospecting Calls Made</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-3xl font-bold text-green-600">{formatNumber(prospecting2025.completedCalls)}</p>
              <p className="text-sm text-gray-600">Completed Calls</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-3xl font-bold text-purple-600">{formatNumber(prospecting2025.meetingsHeld)}</p>
              <p className="text-sm text-gray-600">Meetings Held</p>
            </div>
          </div>

          {/* Conversion Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">Call Completion Rate</p>
              <p className="text-xl font-bold text-gray-900">
                {prospecting2025.callsMade > 0
                  ? `${Math.round((prospecting2025.completedCalls / prospecting2025.callsMade) * 100)}%`
                  : 'N/A'}
              </p>
            </div>
            <div className="p-3 border border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600">Meeting Conversion Rate</p>
              <p className="text-xl font-bold text-gray-900">
                {prospecting2025.completedCalls > 0
                  ? `${Math.round((prospecting2025.meetingsHeld / prospecting2025.completedCalls) * 100)}%`
                  : 'N/A'}
              </p>
            </div>
          </div>

          {/* Monthly Breakdown (Expandable) */}
          {expandedProspecting && (
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Monthly Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Calls Made</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Completed</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Meetings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {prospecting2025.byMonth.map(m => (
                      <tr key={m.month}>
                        <td className="px-4 py-2 text-sm text-gray-900">{m.month}</td>
                        <td className="px-4 py-2 text-sm text-right">{m.calls}</td>
                        <td className="px-4 py-2 text-sm text-right">{m.completed}</td>
                        <td className="px-4 py-2 text-sm text-right">{m.meetings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-center">
        <button
          onClick={fetchAllData}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Refresh All Data
        </button>
      </div>
    </div>
  );
}
