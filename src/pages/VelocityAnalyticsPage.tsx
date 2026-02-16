import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { usePermissions } from '../hooks/usePermissions';

interface DealTeam {
  id: string;
  label: string;
}

interface DealVelocityRecord {
  deal_id: string;
  deal_name: string;
  stage_label: string;
  days: number;
  client_name: string | null;
  team_name: string | null;
  team_id: string | null;
  client_id: string | null;
}

interface StageVelocity {
  stage_label: string;
  avg_days: number;
  deal_count: number;
  min_days: number;
  max_days: number;
  deals: DealVelocityRecord[];
}

interface TeamVelocity {
  team_name: string;
  team_id: string;
  stages: StageVelocity[];
  overall_avg_days: number;
  deal_count: number;
}

interface ClientVelocity {
  client_name: string;
  client_id: string;
  stages: StageVelocity[];
  overall_avg_days: number;
  deal_count: number;
}

type ViewMode = 'team' | 'client' | 'overall';

export default function VelocityAnalyticsPage() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overall');

  const [overallVelocity, setOverallVelocity] = useState<StageVelocity[]>([]);
  const [teamVelocity, setTeamVelocity] = useState<TeamVelocity[]>([]);
  const [clientVelocity, setClientVelocity] = useState<ClientVelocity[]>([]);

  // Track expanded rows: "overall:Prospect", "team:abc123:Negotiating LOI", etc.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Deal teams for dropdown
  const [dealTeams, setDealTeams] = useState<DealTeam[]>([]);

  // Dynamically loaded stages from the database
  const [velocityStages, setVelocityStages] = useState<string[]>([]);

  useEffect(() => {
    document.title = "Deal Velocity Analytics | OVIS";
    loadVelocityData();
  }, []);

  const toggleRow = (rowKey: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowKey)) {
        newSet.delete(rowKey);
      } else {
        newSet.add(rowKey);
      }
      return newSet;
    });
  };

  const loadVelocityData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch active stages from the database (excluding Lost and Closed Paid for velocity tracking)
      const { data: stageData, error: stageError } = await supabase
        .from('deal_stage')
        .select('id, label, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      if (stageError) throw stageError;

      // Filter to only include pipeline stages we want to track velocity for
      // Exclude: Lost (not a normal pipeline progression), Closed Paid (end state)
      const excludedStages = ['Lost', 'Closed Paid'];
      const activeStages = (stageData || [])
        .filter(s => !excludedStages.includes(s.label))
        .map(s => s.label);

      console.log('📊 Active velocity stages from DB:', activeStages);
      setVelocityStages(activeStages);

      // First, check total records in the table for debugging
      const { count: totalCount } = await supabase
        .from('deal_stage_history')
        .select('*', { count: 'exact', head: true });

      console.log('📊 Total deal_stage_history records:', totalCount);

      // Fetch all stage history - include records without duration_seconds
      // We'll calculate duration for active stages on the client side
      // Note: The table uses changed_at/corrected_date, not entered_at/exited_at
      const { data: historyData, error: historyError } = await supabase
        .from('deal_stage_history')
        .select(`
          id,
          deal_id,
          to_stage_id,
          duration_seconds,
          changed_at,
          corrected_date,
          deal_owner_id,
          client_id,
          deal_stage!deal_stage_history_to_stage_id_fkey(label)
        `);

      console.log('📊 Raw history data count:', historyData?.length || 0);
      console.log('📊 History error:', historyError);

      // Log sample of data to see what we have
      if (historyData && historyData.length > 0) {
        console.log('📊 Sample records:', historyData.slice(0, 3));
        const withDuration = historyData.filter(r => r.duration_seconds && r.duration_seconds > 0);
        console.log('📊 Records with duration_seconds > 0:', withDuration.length);
      }

      if (historyError) throw historyError;

      // Calculate duration for active stages (where duration_seconds is null)
      // Active stages have a corrected_date/changed_at but no duration yet
      const now = new Date();
      const processedHistory = (historyData || []).map(record => {
        let effectiveDuration = record.duration_seconds;

        // If no duration_seconds, calculate from corrected_date (or changed_at) to now
        // This means the deal is still in this stage
        if (!effectiveDuration) {
          const enteredAt = new Date(record.corrected_date || record.changed_at);
          effectiveDuration = Math.floor((now.getTime() - enteredAt.getTime()) / 1000);
        }

        return {
          ...record,
          duration_seconds: effectiveDuration
        };
      }).filter(record => record.duration_seconds && record.duration_seconds > 0);

      console.log('📊 Processed records with duration:', processedHistory.length);

      // Fetch deal names and deal_team_id - batch to avoid URL too long error
      const dealIds = [...new Set(processedHistory.map(h => h.deal_id))];
      const dealMap = new Map<string, { deal_name: string; deal_team_id: string | null }>();

      // Batch in chunks of 50 to avoid URL length limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < dealIds.length; i += BATCH_SIZE) {
        const batch = dealIds.slice(i, i + BATCH_SIZE);
        const { data: dealsData } = await supabase
          .from('deal')
          .select('id, deal_name, deal_team_id')
          .in('id', batch);
        dealsData?.forEach(d => dealMap.set(d.id, {
          deal_name: d.deal_name || 'Untitled Deal',
          deal_team_id: d.deal_team_id
        }));
      }

      // Fetch deal teams
      const { data: teamsData } = await supabase
        .from('deal_team')
        .select('id, label')
        .order('label');

      const teamMap = new Map<string, string>();
      teamsData?.forEach(t => teamMap.set(t.id, t.label));

      // Store deal teams for dropdown
      setDealTeams(teamsData || []);

      // Fetch clients
      const { data: clientsData } = await supabase
        .from('client')
        .select('id, client_name');

      const clientMap = new Map<string, string>();
      clientsData?.forEach(c => clientMap.set(c.id, c.client_name || 'Unknown'));

      // Build full deal records with all info
      // Note: Use activeStages (local variable) not velocityStages (state) since state hasn't updated yet
      const allDealRecords: DealVelocityRecord[] = processedHistory
        .filter(record => {
          const stageLabel = (record.deal_stage as any)?.label;
          return stageLabel && activeStages.includes(stageLabel);
        })
        .map(record => {
          const dealInfo = dealMap.get(record.deal_id);
          const teamId = dealInfo?.deal_team_id || null;
          return {
            deal_id: record.deal_id,
            deal_name: dealInfo?.deal_name || 'Unknown Deal',
            stage_label: (record.deal_stage as any)?.label,
            days: Math.round(record.duration_seconds / 86400 * 10) / 10,
            client_name: record.client_id ? clientMap.get(record.client_id) || null : null,
            team_name: teamId ? teamMap.get(teamId) || null : null,
            team_id: teamId,
            client_id: record.client_id,
          };
        });

      console.log('📊 Final deal records for velocity:', allDealRecords.length);

      // Process overall velocity with deals
      const stageDealsMap = new Map<string, DealVelocityRecord[]>();
      allDealRecords.forEach(record => {
        if (!stageDealsMap.has(record.stage_label)) {
          stageDealsMap.set(record.stage_label, []);
        }
        stageDealsMap.get(record.stage_label)!.push(record);
      });

      const overallData: StageVelocity[] = activeStages
        .filter(stage => stageDealsMap.has(stage))
        .map(stage => {
          const deals = stageDealsMap.get(stage)!;
          const totalDays = deals.reduce((sum, d) => sum + d.days, 0);
          const minDays = Math.min(...deals.map(d => d.days));
          const maxDays = Math.max(...deals.map(d => d.days));
          return {
            stage_label: stage,
            avg_days: Math.round(totalDays / deals.length * 10) / 10,
            deal_count: deals.length,
            min_days: Math.round(minDays * 10) / 10,
            max_days: Math.round(maxDays * 10) / 10,
            deals: deals.sort((a, b) => b.days - a.days), // Sort by days desc
          };
        });

      setOverallVelocity(overallData);

      // Process deal team velocity with deals
      const teamDealsMap = new Map<string, Map<string, DealVelocityRecord[]>>();
      allDealRecords.forEach(record => {
        if (!record.team_id) return;
        if (!teamDealsMap.has(record.team_id)) {
          teamDealsMap.set(record.team_id, new Map());
        }
        const teamStages = teamDealsMap.get(record.team_id)!;
        if (!teamStages.has(record.stage_label)) {
          teamStages.set(record.stage_label, []);
        }
        teamStages.get(record.stage_label)!.push(record);
      });

      const teamData: TeamVelocity[] = Array.from(teamDealsMap.entries())
        .map(([teamId, stages]) => {
          const stageData: StageVelocity[] = activeStages
            .filter(stage => stages.has(stage))
            .map(stage => {
              const deals = stages.get(stage)!;
              const totalDays = deals.reduce((sum, d) => sum + d.days, 0);
              const minDays = Math.min(...deals.map(d => d.days));
              const maxDays = Math.max(...deals.map(d => d.days));
              return {
                stage_label: stage,
                avg_days: Math.round(totalDays / deals.length * 10) / 10,
                deal_count: deals.length,
                min_days: Math.round(minDays * 10) / 10,
                max_days: Math.round(maxDays * 10) / 10,
                deals: deals.sort((a, b) => b.days - a.days),
              };
            });

          const allDeals = stageData.flatMap(s => s.deals);
          const totalDays = allDeals.reduce((sum, d) => sum + d.days, 0);

          return {
            team_name: teamMap.get(teamId) || 'Unknown Team',
            team_id: teamId,
            stages: stageData,
            overall_avg_days: allDeals.length > 0 ? Math.round(totalDays / allDeals.length * 10) / 10 : 0,
            deal_count: allDeals.length
          };
        })
        .filter(t => t.deal_count > 0)
        .sort((a, b) => b.deal_count - a.deal_count);

      setTeamVelocity(teamData);

      // Process client velocity with deals
      const clientDealsMap = new Map<string, Map<string, DealVelocityRecord[]>>();
      allDealRecords.forEach(record => {
        if (!record.client_id) return;
        if (!clientDealsMap.has(record.client_id)) {
          clientDealsMap.set(record.client_id, new Map());
        }
        const clientStages = clientDealsMap.get(record.client_id)!;
        if (!clientStages.has(record.stage_label)) {
          clientStages.set(record.stage_label, []);
        }
        clientStages.get(record.stage_label)!.push(record);
      });

      const clientData: ClientVelocity[] = Array.from(clientDealsMap.entries())
        .map(([clientId, stages]) => {
          const stageData: StageVelocity[] = activeStages
            .filter(stage => stages.has(stage))
            .map(stage => {
              const deals = stages.get(stage)!;
              const totalDays = deals.reduce((sum, d) => sum + d.days, 0);
              const minDays = Math.min(...deals.map(d => d.days));
              const maxDays = Math.max(...deals.map(d => d.days));
              return {
                stage_label: stage,
                avg_days: Math.round(totalDays / deals.length * 10) / 10,
                deal_count: deals.length,
                min_days: Math.round(minDays * 10) / 10,
                max_days: Math.round(maxDays * 10) / 10,
                deals: deals.sort((a, b) => b.days - a.days),
              };
            });

          const allDeals = stageData.flatMap(s => s.deals);
          const totalDays = allDeals.reduce((sum, d) => sum + d.days, 0);

          return {
            client_name: clientMap.get(clientId) || 'Unknown Client',
            client_id: clientId,
            stages: stageData,
            overall_avg_days: allDeals.length > 0 ? Math.round(totalDays / allDeals.length * 10) / 10 : 0,
            deal_count: allDeals.length
          };
        })
        .filter(c => c.deal_count > 0)
        .sort((a, b) => b.deal_count - a.deal_count);

      setClientVelocity(clientData);

    } catch (err) {
      console.error('Error loading velocity data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load velocity data');
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

  const handleTeamChange = async (dealId: string, newTeamId: string) => {
    try {
      const { error } = await supabase
        .from('deal')
        .update({ deal_team_id: newTeamId || null })
        .eq('id', dealId);

      if (error) throw error;

      // Reload data to reflect the change
      loadVelocityData();
    } catch (err) {
      console.error('Error updating deal team:', err);
      alert('Failed to update deal team');
    }
  };

  const formatDays = (days: number): string => {
    if (days < 1) return '< 1 day';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  const getVelocityColor = (days: number, stage: string): string => {
    // Different thresholds for different stages
    // Stages with longer expected durations get higher thresholds
    const thresholds: Record<string, { good: number; warning: number }> = {
      'Prospect': { good: 30, warning: 60 },
      'Negotiating LOI': { good: 30, warning: 60 },
      'At Lease / PSA': { good: 45, warning: 90 },
      'At Lease/PSA': { good: 45, warning: 90 }, // Handle both formats
      'Under Contract / Contingent': { good: 30, warning: 60 },
      'Booked': { good: 30, warning: 60 },
      'Executed Payable': { good: 30, warning: 60 },
      'Closed': { good: 30, warning: 60 },
    };

    // Default thresholds for any stage not explicitly listed
    const threshold = thresholds[stage] || { good: 30, warning: 60 };

    if (days <= threshold.good) return 'bg-green-100 text-green-800';
    if (days <= threshold.warning) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const renderDealsTable = (deals: DealVelocityRecord[], showTeam: boolean = true, showClient: boolean = true) => (
    <div className="bg-gray-50 px-6 py-4">
      <table className="min-w-full">
        <thead>
          <tr className="text-xs text-gray-500 uppercase">
            <th className="text-left py-2 px-2">Deal</th>
            {showClient && <th className="text-left py-2 px-2">Client</th>}
            {showTeam && <th className="text-left py-2 px-2">Deal Team</th>}
            <th className="text-right py-2 px-2">Days in Stage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {deals.map((deal, idx) => (
            <tr key={`${deal.deal_id}-${idx}`} className="text-sm">
              <td className="py-2 px-2">
                <Link
                  to={`/deal/${deal.deal_id}`}
                  className="text-blue-600 hover:underline"
                >
                  {deal.deal_name}
                </Link>
              </td>
              {showClient && (
                <td className="py-2 px-2 text-gray-600">
                  {deal.client_name || '—'}
                </td>
              )}
              {showTeam && (
                <td className="py-2 px-2">
                  <select
                    value={deal.team_id || ''}
                    onChange={(e) => handleTeamChange(deal.deal_id, e.target.value)}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 py-1 px-2"
                  >
                    <option value="">— Unassigned —</option>
                    {dealTeams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.label}
                      </option>
                    ))}
                  </select>
                </td>
              )}
              <td className="py-2 px-2 text-right">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${getVelocityColor(deal.days, deal.stage_label)}`}>
                  {formatDays(deal.days)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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
              onClick={loadVelocityData}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Deal Velocity Analytics</h1>
          <p className="mt-2 text-gray-600">
            Analyze how long deals spend in each pipeline stage. Click a row to see individual deals.
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setViewMode('overall')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  viewMode === 'overall'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overall
              </button>
              <button
                onClick={() => setViewMode('team')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  viewMode === 'team'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                By Deal Team
              </button>
              <button
                onClick={() => setViewMode('client')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  viewMode === 'client'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                By Client
              </button>
            </nav>
          </div>
        </div>

        {/* Overall View */}
        {viewMode === 'overall' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Average Time by Stage</h2>
            </div>
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
                {overallVelocity.map((stage) => {
                  const rowKey = `overall:${stage.stage_label}`;
                  const isExpanded = expandedRows.has(rowKey);
                  return (
                    <>
                      <tr
                        key={stage.stage_label}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleRow(rowKey)}
                      >
                        <td className="px-2 py-4">
                          <svg
                            className={`h-5 w-5 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
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
                          <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded ${getVelocityColor(stage.avg_days, stage.stage_label)}`}>
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
                      {isExpanded && (
                        <tr key={`${stage.stage_label}-expanded`}>
                          <td colSpan={6} className="p-0">
                            {renderDealsTable(stage.deals)}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {overallVelocity.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                No velocity data available. Stage transitions will appear here after deals move through the pipeline.
              </div>
            )}
          </div>
        )}

        {/* Deal Team View */}
        {viewMode === 'team' && (
          <div className="space-y-6">
            {teamVelocity.map((team) => (
              <div key={team.team_id} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{team.team_name}</h2>
                    <p className="text-sm text-gray-500">
                      {team.deal_count} stage transitions | Avg: {formatDays(team.overall_avg_days)}
                    </p>
                  </div>
                </div>
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
                    {team.stages.map((stage) => {
                      const rowKey = `team:${team.team_id}:${stage.stage_label}`;
                      const isExpanded = expandedRows.has(rowKey);
                      return (
                        <>
                          <tr
                            key={stage.stage_label}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleRow(rowKey)}
                          >
                            <td className="px-2 py-4">
                              <svg
                                className={`h-5 w-5 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
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
                              <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded ${getVelocityColor(stage.avg_days, stage.stage_label)}`}>
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
                          {isExpanded && (
                            <tr key={`${stage.stage_label}-expanded`}>
                              <td colSpan={6} className="p-0">
                                {renderDealsTable(stage.deals, false, true)}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            {teamVelocity.length === 0 && (
              <div className="bg-white rounded-lg shadow px-6 py-8 text-center text-gray-500">
                No deal team velocity data available.
              </div>
            )}
          </div>
        )}

        {/* Client View */}
        {viewMode === 'client' && (
          <div className="space-y-6">
            {clientVelocity.slice(0, 20).map((client) => (
              <div key={client.client_id} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{client.client_name}</h2>
                    <p className="text-sm text-gray-500">
                      {client.deal_count} stage transitions | Avg: {formatDays(client.overall_avg_days)}
                    </p>
                  </div>
                </div>
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
                    {client.stages.map((stage) => {
                      const rowKey = `client:${client.client_id}:${stage.stage_label}`;
                      const isExpanded = expandedRows.has(rowKey);
                      return (
                        <>
                          <tr
                            key={stage.stage_label}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => toggleRow(rowKey)}
                          >
                            <td className="px-2 py-4">
                              <svg
                                className={`h-5 w-5 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
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
                              <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded ${getVelocityColor(stage.avg_days, stage.stage_label)}`}>
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
                          {isExpanded && (
                            <tr key={`${stage.stage_label}-expanded`}>
                              <td colSpan={6} className="p-0">
                                {renderDealsTable(stage.deals, true, false)}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            {clientVelocity.length > 20 && (
              <div className="text-center text-gray-500 text-sm">
                Showing top 20 clients by deal count. {clientVelocity.length - 20} more clients not shown.
              </div>
            )}
            {clientVelocity.length === 0 && (
              <div className="bg-white rounded-lg shadow px-6 py-8 text-center text-gray-500">
                No client velocity data available.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
