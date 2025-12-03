import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Stage IDs for filtering (same as RobReport)
const STAGE_IDS = {
  booked: '0fc71094-e33e-49ba-b675-d097bd477618',
  executedPayable: '70d9449c-c589-4b92-ac5d-f84c5eaef049',
  closedPaid: 'afa9a62e-9821-4c60-9db3-c0d51d009208',
  underContractContingent: '583507f5-1c53-474b-b7e6-deb81d1b89d2',
  negotiatingLOI: '89b7ce02-d325-434a-8340-fab04fa57b8c',
  atLeasePSA: 'bd25eacc-e6c5-4e78-8d5f-25b4577ba5fd',
};

interface Goal {
  id: string;
  year: number;
  goal_type: 'gci' | 'deal_count';
  target_value: number;
}

interface GoalDashboardProps {
  isAdmin?: boolean;
}

export default function GoalDashboard({ isAdmin = false }: GoalDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bookedGci, setBookedGci] = useState(0);
  const [bookedDealCount, setBookedDealCount] = useState(0);
  const [pipelineGci, setPipelineGci] = useState(0);
  const [priorYearGci, setPriorYearGci] = useState(0);
  const [priorYearDealCount, setPriorYearDealCount] = useState(0);

  // Edit state for admin
  const [editingGci, setEditingGci] = useState(false);
  const [editingDeals, setEditingDeals] = useState(false);
  const [gciTarget, setGciTarget] = useState('');
  const [dealTarget, setDealTarget] = useState('');
  const [saving, setSaving] = useState(false);

  // Year selection (admin only)
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const isCurrentYear = selectedYear === currentYear;

  // Generate year options (current year back to 2020, plus next year for planning)
  const yearOptions = [];
  for (let y = currentYear + 1; y >= 2020; y--) {
    yearOptions.push(y);
  }

  const priorYear = selectedYear - 1;
  const selectedYearStart = `${selectedYear}-01-01`;
  const selectedYearEnd = `${selectedYear}-12-31`;
  const priorYearStart = `${priorYear}-01-01`;
  const priorYearEnd = `${priorYear}-12-31`;

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch goals for selected year
      const { data: goalsData } = await supabase
        .from('goal')
        .select('*')
        .eq('year', selectedYear);

      setGoals(goalsData || []);

      // Set form values from goals
      const gciGoal = goalsData?.find(g => g.goal_type === 'gci');
      const dealGoal = goalsData?.find(g => g.goal_type === 'deal_count');
      setGciTarget(gciGoal?.target_value.toString() || '');
      setDealTarget(dealGoal?.target_value.toString() || '');

      // Fetch selected year booked/closed deals
      const { data: yearDeals } = await supabase
        .from('deal')
        .select('id, gci, booked_date, stage_id')
        .in('stage_id', [STAGE_IDS.booked, STAGE_IDS.executedPayable, STAGE_IDS.closedPaid])
        .gte('booked_date', selectedYearStart)
        .lte('booked_date', selectedYearEnd);

      const yearBookedGci = (yearDeals || []).reduce((sum, d) => sum + (d.gci || 0), 0);
      const yearDealCount = (yearDeals || []).length;
      setBookedGci(yearBookedGci);
      setBookedDealCount(yearDealCount);

      // Fetch pipeline deals (UC/Contingent + Pipeline 50%+) - only relevant for current year
      if (isCurrentYear) {
        const { data: pipelineDeals } = await supabase
          .from('deal')
          .select('id, gci, stage_id')
          .in('stage_id', [
            STAGE_IDS.underContractContingent,
            STAGE_IDS.negotiatingLOI,
            STAGE_IDS.atLeasePSA,
          ]);

        const pipelineTotal = (pipelineDeals || []).reduce((sum, d) => sum + (d.gci || 0), 0);
        setPipelineGci(pipelineTotal);
      } else {
        setPipelineGci(0);
      }

      // Fetch prior year's data for comparison
      const { data: priorYearDeals } = await supabase
        .from('deal')
        .select('id, gci, booked_date, stage_id')
        .in('stage_id', [STAGE_IDS.booked, STAGE_IDS.executedPayable, STAGE_IDS.closedPaid])
        .gte('booked_date', priorYearStart)
        .lte('booked_date', priorYearEnd);

      const priorYearBookedGci = (priorYearDeals || []).reduce((sum, d) => sum + (d.gci || 0), 0);
      const priorYearDealsCount = (priorYearDeals || []).length;
      setPriorYearGci(priorYearBookedGci);
      setPriorYearDealCount(priorYearDealsCount);

    } catch (err) {
      console.error('Error fetching goal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveGoal = async (goalType: 'gci' | 'deal_count', value: number) => {
    setSaving(true);
    try {
      const existingGoal = goals.find(g => g.goal_type === goalType);

      if (existingGoal) {
        await supabase
          .from('goal')
          .update({ target_value: value, updated_at: new Date().toISOString() })
          .eq('id', existingGoal.id);
      } else {
        await supabase
          .from('goal')
          .insert({ year: selectedYear, goal_type: goalType, target_value: value });
      }

      await fetchData();
    } catch (err) {
      console.error('Error saving goal:', err);
    } finally {
      setSaving(false);
      setEditingGci(false);
      setEditingDeals(false);
    }
  };

  const gciGoal = useMemo(() => goals.find(g => g.goal_type === 'gci'), [goals]);
  const dealGoal = useMemo(() => goals.find(g => g.goal_type === 'deal_count'), [goals]);

  const gciProgress = gciGoal ? (bookedGci / gciGoal.target_value) * 100 : 0;
  const dealProgress = dealGoal ? (bookedDealCount / dealGoal.target_value) * 100 : 0;
  const gciRemaining = gciGoal ? gciGoal.target_value - bookedGci : 0;
  const dealsRemaining = dealGoal ? dealGoal.target_value - bookedDealCount : 0;
  const pipelineCoverage = gciRemaining > 0 ? pipelineGci / gciRemaining : 0;

  // Calculate year progress (only meaningful for current year)
  const dayOfYear = Math.floor((Date.now() - new Date(currentYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
  const yearProgress = isCurrentYear ? dayOfYear / 365 : 1; // Past years are 100% complete

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
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

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
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
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">
                {isAdmin ? (
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="text-xl font-bold text-gray-900 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 rounded cursor-pointer pr-8"
                  >
                    {yearOptions.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                ) : (
                  currentYear
                )} Goals
              </h2>
              {!isCurrentYear && (
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                  Historical
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {isCurrentYear
                ? `${Math.round(yearProgress * 100)}% of year complete`
                : `Final results for ${selectedYear}`
              }
            </p>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* GCI Goal */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">GCI Target</h3>
            {isAdmin && !editingGci && (
              <button
                onClick={() => setEditingGci(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
            )}
          </div>

          {editingGci ? (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={gciTarget}
                onChange={(e) => setGciTarget(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 w-40"
                placeholder="Enter target"
              />
              <button
                onClick={() => saveGoal('gci', parseFloat(gciTarget))}
                disabled={saving || !gciTarget}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingGci(false);
                  setGciTarget(gciGoal?.target_value.toString() || '');
                }}
                className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : gciGoal ? (
            <>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {formatCurrency(gciGoal.target_value)}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                <div
                  className={`h-4 rounded-full transition-all ${getProgressColor(gciProgress)}`}
                  style={{ width: `${Math.min(gciProgress, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm">
                <span className={`font-semibold ${getProgressTextColor(gciProgress)}`}>
                  {formatCurrency(bookedGci)} ({Math.round(gciProgress)}%)
                </span>
                <span className="text-gray-500">
                  Remaining: {formatCurrency(Math.max(gciRemaining, 0))}
                </span>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              {isAdmin ? 'Click Edit to set a GCI target' : 'No GCI target set for this year'}
            </p>
          )}
        </div>

        {/* Deal Count Goal */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">Deals Booked Target</h3>
            {isAdmin && !editingDeals && (
              <button
                onClick={() => setEditingDeals(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
            )}
          </div>

          {editingDeals ? (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                value={dealTarget}
                onChange={(e) => setDealTarget(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 w-40"
                placeholder="Enter target"
              />
              <span className="text-gray-500">deals</span>
              <button
                onClick={() => saveGoal('deal_count', parseFloat(dealTarget))}
                disabled={saving || !dealTarget}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingDeals(false);
                  setDealTarget(dealGoal?.target_value.toString() || '');
                }}
                className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : dealGoal ? (
            <>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {dealGoal.target_value} deals
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                <div
                  className={`h-4 rounded-full transition-all ${getProgressColor(dealProgress)}`}
                  style={{ width: `${Math.min(dealProgress, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm">
                <span className={`font-semibold ${getProgressTextColor(dealProgress)}`}>
                  {bookedDealCount} deals ({Math.round(dealProgress)}%)
                </span>
                <span className="text-gray-500">
                  Remaining: {Math.max(dealsRemaining, 0)} deals
                </span>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              {isAdmin ? 'Click Edit to set a deal count target' : 'No deal target set for this year'}
            </p>
          )}
        </div>

        {/* Pipeline Coverage - only show for current year */}
        {isCurrentYear && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Pipeline Coverage</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Pipeline GCI</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(pipelineGci)}</p>
                <p className="text-xs text-gray-400">UC/Contingent + Pipeline 50%+</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Coverage Ratio</p>
                <p className={`text-2xl font-bold ${pipelineCoverage >= 1.5 ? 'text-green-600' : pipelineCoverage >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {pipelineCoverage.toFixed(1)}x
                </p>
                <p className="text-xs text-gray-400">Pipeline / Remaining Goal</p>
              </div>
            </div>
          </div>
        )}

        {/* Year-over-Year Comparison */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">vs. {priorYear} (Full Year)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">GCI</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-gray-900">{formatCurrency(bookedGci)}</p>
                <p className="text-sm text-gray-500">vs {formatCurrency(priorYearGci)}</p>
              </div>
              {priorYearGci > 0 && (
                <p className={`text-sm ${bookedGci >= priorYearGci ? 'text-green-600' : 'text-red-600'}`}>
                  {bookedGci >= priorYearGci ? '+' : ''}{Math.round(((bookedGci - priorYearGci) / priorYearGci) * 100)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Deals Booked</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-gray-900">{bookedDealCount}</p>
                <p className="text-sm text-gray-500">vs {priorYearDealCount}</p>
              </div>
              {priorYearDealCount > 0 && (
                <p className={`text-sm ${bookedDealCount >= priorYearDealCount ? 'text-green-600' : 'text-red-600'}`}>
                  {bookedDealCount >= priorYearDealCount ? '+' : ''}{Math.round(((bookedDealCount - priorYearDealCount) / priorYearDealCount) * 100)}%
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        <p><strong>GCI Target:</strong> Based on Booked/Closed deals with booked date in {selectedYear}</p>
        {isCurrentYear && <p><strong>Pipeline Coverage:</strong> Ratio of pipeline GCI to remaining goal (1.5x+ is healthy)</p>}
      </div>
    </div>
  );
}
