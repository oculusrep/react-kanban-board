import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { usePermissions } from '../hooks/usePermissions';

interface HistoricalDealRecord {
  deal_id: string;
  deal_name: string;
  client_name: string | null;
  closed_date: string;
  closed_year: number;
  stages: {
    stage_label: string;
    days: number;
  }[];
  total_days: number;
}

interface YearlyStageVelocity {
  stage_label: string;
  avg_days: number;
  deal_count: number;
  min_days: number;
  max_days: number;
}

interface YearlyVelocity {
  year: number;
  stages: YearlyStageVelocity[];
  deal_count: number;
  avg_total_days: number;
}

export default function HistoricalVelocityPage() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [yearlyVelocity, setYearlyVelocity] = useState<YearlyVelocity[]>([]);
  const [dealRecords, setDealRecords] = useState<HistoricalDealRecord[]>([]);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [excludedDealsCount, setExcludedDealsCount] = useState(0);

  // Stages to track in order (exclude Lost)
  const [velocityStages, setVelocityStages] = useState<string[]>([]);

  useEffect(() => {
    document.title = "Historical Velocity | OVIS";
    loadHistoricalData();
  }, []);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  };

  const toggleStage = (key: string) => {
    setExpandedStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const loadHistoricalData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch active stages from database
      const { data: stageData, error: stageError } = await supabase
        .from('deal_stage')
        .select('id, label, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (stageError) throw stageError;

      // Track all stages except Lost for historical velocity
      // We want to see the full journey including Closed Paid
      const excludedStages = ['Lost'];
      const activeStages = (stageData || [])
        .filter(s => !excludedStages.includes(s.label))
        .map(s => s.label);

      setVelocityStages(activeStages);

      // Fetch all deals with closed_date
      const { data: closedDeals, error: dealsError } = await supabase
        .from('deal')
        .select('id, deal_name, closed_date, client_id, loi_signed_date, contract_signed_date, booked_date')
        .not('closed_date', 'is', null)
        .order('closed_date', { ascending: false });

      if (dealsError) throw dealsError;

      console.log('📊 Closed deals found:', closedDeals?.length || 0);

      // Fetch clients for names
      const { data: clientsData } = await supabase
        .from('client')
        .select('id, client_name');

      const clientMap = new Map<string, string>();
      clientsData?.forEach(c => clientMap.set(c.id, c.client_name || 'Unknown'));

      // Fetch stage history for closed deals
      const dealIds = closedDeals?.map(d => d.id) || [];

      // Batch fetch stage history
      const BATCH_SIZE = 50;
      const allHistory: any[] = [];

      for (let i = 0; i < dealIds.length; i += BATCH_SIZE) {
        const batch = dealIds.slice(i, i + BATCH_SIZE);
        const { data: historyBatch, error: historyError } = await supabase
          .from('deal_stage_history')
          .select(`
            deal_id,
            to_stage_id,
            duration_seconds,
            deal_stage!deal_stage_history_to_stage_id_fkey(label)
          `)
          .in('deal_id', batch)
          .not('duration_seconds', 'is', null);

        if (historyError) {
          console.warn('History batch error:', historyError);
        } else if (historyBatch) {
          allHistory.push(...historyBatch);
        }
      }

      console.log('📊 Stage history records:', allHistory.length);

      // Group history by deal
      const dealHistoryMap = new Map<string, Map<string, number>>();
      allHistory.forEach(record => {
        const stageLabel = (record.deal_stage as any)?.label;
        if (!stageLabel || !activeStages.includes(stageLabel)) return;

        if (!dealHistoryMap.has(record.deal_id)) {
          dealHistoryMap.set(record.deal_id, new Map());
        }
        const dealStages = dealHistoryMap.get(record.deal_id)!;

        // Sum up duration for each stage (a deal might have multiple entries for same stage)
        const currentDays = dealStages.get(stageLabel) || 0;
        const newDays = Math.round(record.duration_seconds / 86400 * 10) / 10;
        dealStages.set(stageLabel, currentDays + newDays);
      });

      // Filter deals - must have at least some stage history
      // Deals with incomplete data (no history records) are excluded
      let excluded = 0;
      const historicalRecords: HistoricalDealRecord[] = [];

      closedDeals?.forEach(deal => {
        const stageHistory = dealHistoryMap.get(deal.id);

        // Exclude deals with no stage history at all
        if (!stageHistory || stageHistory.size === 0) {
          excluded++;
          return;
        }

        const closedYear = new Date(deal.closed_date).getFullYear();

        const stages = Array.from(stageHistory.entries()).map(([label, days]) => ({
          stage_label: label,
          days
        }));

        const totalDays = stages.reduce((sum, s) => sum + s.days, 0);

        historicalRecords.push({
          deal_id: deal.id,
          deal_name: deal.deal_name || 'Untitled Deal',
          client_name: deal.client_id ? clientMap.get(deal.client_id) || null : null,
          closed_date: deal.closed_date,
          closed_year: closedYear,
          stages,
          total_days: Math.round(totalDays * 10) / 10
        });
      });

      setExcludedDealsCount(excluded);
      setDealRecords(historicalRecords);

      console.log('📊 Historical records:', historicalRecords.length, 'Excluded:', excluded);

      // Group by year and calculate averages
      const yearMap = new Map<number, HistoricalDealRecord[]>();
      historicalRecords.forEach(record => {
        if (!yearMap.has(record.closed_year)) {
          yearMap.set(record.closed_year, []);
        }
        yearMap.get(record.closed_year)!.push(record);
      });

      // Calculate yearly velocity stats
      const yearlyData: YearlyVelocity[] = Array.from(yearMap.entries())
        .map(([year, deals]) => {
          // Calculate stage averages for this year
          const stageStats = new Map<string, number[]>();

          deals.forEach(deal => {
            deal.stages.forEach(stage => {
              if (!stageStats.has(stage.stage_label)) {
                stageStats.set(stage.stage_label, []);
              }
              stageStats.get(stage.stage_label)!.push(stage.days);
            });
          });

          const stages: YearlyStageVelocity[] = activeStages
            .filter(label => stageStats.has(label))
            .map(label => {
              const days = stageStats.get(label)!;
              const avgDays = days.reduce((sum, d) => sum + d, 0) / days.length;
              return {
                stage_label: label,
                avg_days: Math.round(avgDays * 10) / 10,
                deal_count: days.length,
                min_days: Math.round(Math.min(...days) * 10) / 10,
                max_days: Math.round(Math.max(...days) * 10) / 10
              };
            });

          const avgTotalDays = deals.reduce((sum, d) => sum + d.total_days, 0) / deals.length;

          return {
            year,
            stages,
            deal_count: deals.length,
            avg_total_days: Math.round(avgTotalDays * 10) / 10
          };
        })
        .sort((a, b) => b.year - a.year); // Most recent year first

      setYearlyVelocity(yearlyData);

    } catch (err) {
      console.error('Error loading historical velocity:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Check permission
  if (!permissionsLoading && !hasPermission('can_view_velocity_analytics')) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to view this page.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const formatDays = (days: number): string => {
    if (days < 1) return '< 1 day';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  const getVelocityColor = (days: number): string => {
    if (days <= 30) return 'bg-green-100 text-green-800';
    if (days <= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (loading || permissionsLoading) {
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-800 font-semibold">Error Loading Data</h2>
            <p className="text-red-600 mt-1">{error}</p>
            <button
              onClick={loadHistoricalData}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get deals for a specific year and stage
  const getDealsForYearStage = (year: number, stageLabel: string) => {
    return dealRecords
      .filter(d => d.closed_year === year && d.stages.some(s => s.stage_label === stageLabel))
      .map(d => ({
        ...d,
        stage_days: d.stages.find(s => s.stage_label === stageLabel)?.days || 0
      }))
      .sort((a, b) => b.stage_days - a.stage_days);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Historical Velocity</h1>
          <p className="mt-2 text-gray-600">
            Average time closed deals spent in each pipeline stage, grouped by year.
            {excludedDealsCount > 0 && (
              <span className="ml-2 text-amber-600">
                ({excludedDealsCount} deals excluded due to incomplete stage history)
              </span>
            )}
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Total Closed Deals Analyzed</div>
            <div className="text-2xl font-bold text-gray-900">{dealRecords.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Years of Data</div>
            <div className="text-2xl font-bold text-gray-900">{yearlyVelocity.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Date Range</div>
            <div className="text-2xl font-bold text-gray-900">
              {yearlyVelocity.length > 0
                ? `${yearlyVelocity[yearlyVelocity.length - 1].year} - ${yearlyVelocity[0].year}`
                : 'N/A'
              }
            </div>
          </div>
        </div>

        {/* Yearly Breakdown */}
        <div className="space-y-6">
          {yearlyVelocity.map((yearData) => {
            const isYearExpanded = expandedYears.has(yearData.year);

            return (
              <div key={yearData.year} className="bg-white rounded-lg shadow overflow-hidden">
                <div
                  className="px-6 py-4 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleYear(yearData.year)}
                >
                  <div className="flex items-center space-x-4">
                    <svg
                      className={`h-5 w-5 text-gray-400 transform transition-transform ${isYearExpanded ? 'rotate-90' : ''}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{yearData.year}</h2>
                      <p className="text-sm text-gray-500">
                        {yearData.deal_count} deals closed | Avg total time: {formatDays(yearData.avg_total_days)}
                      </p>
                    </div>
                  </div>
                </div>

                {isYearExpanded && (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="w-8 px-2 py-3"></th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Stage
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Days
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Min
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Max
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Deals
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {yearData.stages.map((stage) => {
                        const stageKey = `${yearData.year}:${stage.stage_label}`;
                        const isStageExpanded = expandedStages.has(stageKey);
                        const stageDeals = isStageExpanded
                          ? getDealsForYearStage(yearData.year, stage.stage_label)
                          : [];

                        return (
                          <>
                            <tr
                              key={stage.stage_label}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleStage(stageKey)}
                            >
                              <td className="px-2 py-4">
                                <svg
                                  className={`h-5 w-5 text-gray-400 transform transition-transform ${isStageExpanded ? 'rotate-90' : ''}`}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {stage.stage_label}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded ${getVelocityColor(stage.avg_days)}`}>
                                  {formatDays(stage.avg_days)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                                {formatDays(stage.min_days)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                                {formatDays(stage.max_days)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                                {stage.deal_count}
                              </td>
                            </tr>
                            {isStageExpanded && (
                              <tr key={`${stage.stage_label}-expanded`}>
                                <td colSpan={6} className="p-0">
                                  <div className="bg-gray-50 px-6 py-4">
                                    <table className="min-w-full">
                                      <thead>
                                        <tr className="text-xs text-gray-500 uppercase">
                                          <th className="text-left py-2 px-2">Deal</th>
                                          <th className="text-left py-2 px-2">Client</th>
                                          <th className="text-left py-2 px-2">Closed Date</th>
                                          <th className="text-right py-2 px-2">Days in Stage</th>
                                          <th className="text-right py-2 px-2">Total Pipeline Time</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {stageDeals.map((deal) => (
                                          <tr key={deal.deal_id} className="text-sm">
                                            <td className="py-2 px-2">
                                              <Link
                                                to={`/deal/${deal.deal_id}`}
                                                className="text-blue-600 hover:underline"
                                              >
                                                {deal.deal_name}
                                              </Link>
                                            </td>
                                            <td className="py-2 px-2 text-gray-600">
                                              {deal.client_name || '—'}
                                            </td>
                                            <td className="py-2 px-2 text-gray-600">
                                              {new Date(deal.closed_date).toLocaleDateString()}
                                            </td>
                                            <td className="py-2 px-2 text-right">
                                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${getVelocityColor(deal.stage_days)}`}>
                                                {formatDays(deal.stage_days)}
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-right text-gray-600">
                                              {formatDays(deal.total_days)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        {yearlyVelocity.length === 0 && (
          <div className="bg-white rounded-lg shadow px-6 py-8 text-center text-gray-500">
            No historical velocity data available. Closed deals with stage history will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
