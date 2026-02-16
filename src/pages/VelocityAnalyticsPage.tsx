import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { usePermissions } from '../hooks/usePermissions';

interface DealVelocityRecord {
  deal_id: string;
  deal_name: string;
  stage_label: string;
  days: number;
  client_name: string | null;
  broker_name: string | null;
  broker_id: string | null;
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

interface BrokerVelocity {
  broker_name: string;
  broker_id: string;
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

type ViewMode = 'broker' | 'client' | 'overall';

export default function VelocityAnalyticsPage() {
  const navigate = useNavigate();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overall');

  const [overallVelocity, setOverallVelocity] = useState<StageVelocity[]>([]);
  const [brokerVelocity, setBrokerVelocity] = useState<BrokerVelocity[]>([]);
  const [clientVelocity, setClientVelocity] = useState<ClientVelocity[]>([]);

  // Track expanded rows: "overall:Prospect", "broker:abc123:Negotiating LOI", etc.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Stages we care about for velocity (excluding Lost and Closed Paid which are terminal)
  const velocityStages = ['Prospect', 'Negotiating LOI', 'At Lease / PSA', 'Booked/Under Contract'];

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

      // Fetch all stage history with related data
      const { data: historyData, error: historyError } = await supabase
        .from('deal_stage_history')
        .select(`
          id,
          deal_id,
          to_stage_id,
          duration_seconds,
          deal_owner_id,
          client_id,
          deal_stage!deal_stage_history_to_stage_id_fkey(label)
        `)
        .not('duration_seconds', 'is', null)
        .gt('duration_seconds', 0);

      if (historyError) throw historyError;

      // Fetch deal names
      const dealIds = [...new Set(historyData?.map(h => h.deal_id) || [])];
      const { data: dealsData } = await supabase
        .from('deal')
        .select('id, deal_name')
        .in('id', dealIds);

      const dealMap = new Map<string, string>();
      dealsData?.forEach(d => dealMap.set(d.id, d.deal_name || 'Untitled Deal'));

      // Fetch brokers (users)
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, full_name');

      const userMap = new Map<string, string>();
      usersData?.forEach(u => userMap.set(u.id, u.full_name || 'Unknown'));

      // Fetch clients
      const { data: clientsData } = await supabase
        .from('client')
        .select('id, client_name');

      const clientMap = new Map<string, string>();
      clientsData?.forEach(c => clientMap.set(c.id, c.client_name || 'Unknown'));

      // Build full deal records with all info
      const allDealRecords: DealVelocityRecord[] = (historyData || [])
        .filter(record => {
          const stageLabel = (record.deal_stage as any)?.label;
          return stageLabel && velocityStages.includes(stageLabel);
        })
        .map(record => ({
          deal_id: record.deal_id,
          deal_name: dealMap.get(record.deal_id) || 'Unknown Deal',
          stage_label: (record.deal_stage as any)?.label,
          days: Math.round(record.duration_seconds / 86400 * 10) / 10,
          client_name: record.client_id ? clientMap.get(record.client_id) || null : null,
          broker_name: record.deal_owner_id ? userMap.get(record.deal_owner_id) || null : null,
          broker_id: record.deal_owner_id,
          client_id: record.client_id,
        }));

      // Process overall velocity with deals
      const stageDealsMap = new Map<string, DealVelocityRecord[]>();
      allDealRecords.forEach(record => {
        if (!stageDealsMap.has(record.stage_label)) {
          stageDealsMap.set(record.stage_label, []);
        }
        stageDealsMap.get(record.stage_label)!.push(record);
      });

      const overallData: StageVelocity[] = velocityStages
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

      // Process broker velocity with deals
      const brokerDealsMap = new Map<string, Map<string, DealVelocityRecord[]>>();
      allDealRecords.forEach(record => {
        if (!record.broker_id) return;
        if (!brokerDealsMap.has(record.broker_id)) {
          brokerDealsMap.set(record.broker_id, new Map());
        }
        const brokerStages = brokerDealsMap.get(record.broker_id)!;
        if (!brokerStages.has(record.stage_label)) {
          brokerStages.set(record.stage_label, []);
        }
        brokerStages.get(record.stage_label)!.push(record);
      });

      const brokerData: BrokerVelocity[] = Array.from(brokerDealsMap.entries())
        .map(([brokerId, stages]) => {
          const stageData: StageVelocity[] = velocityStages
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
            broker_name: userMap.get(brokerId) || 'Unknown Broker',
            broker_id: brokerId,
            stages: stageData,
            overall_avg_days: allDeals.length > 0 ? Math.round(totalDays / allDeals.length * 10) / 10 : 0,
            deal_count: allDeals.length
          };
        })
        .filter(b => b.deal_count > 0)
        .sort((a, b) => b.deal_count - a.deal_count);

      setBrokerVelocity(brokerData);

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
          const stageData: StageVelocity[] = velocityStages
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
  if (!permissionsLoading && !hasPermission('can_view_goal_dashboard')) {
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

  const getVelocityColor = (days: number, stage: string): string => {
    // Different thresholds for different stages
    const thresholds: Record<string, { good: number; warning: number }> = {
      'Prospect': { good: 30, warning: 60 },
      'Negotiating LOI': { good: 30, warning: 60 },
      'At Lease / PSA': { good: 45, warning: 90 },
      'Booked/Under Contract': { good: 30, warning: 60 }
    };

    const threshold = thresholds[stage] || { good: 30, warning: 60 };

    if (days <= threshold.good) return 'bg-green-100 text-green-800';
    if (days <= threshold.warning) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const renderDealsTable = (deals: DealVelocityRecord[], showBroker: boolean = true, showClient: boolean = true) => (
    <div className="bg-gray-50 px-6 py-4">
      <table className="min-w-full">
        <thead>
          <tr className="text-xs text-gray-500 uppercase">
            <th className="text-left py-2 px-2">Deal</th>
            {showClient && <th className="text-left py-2 px-2">Client</th>}
            {showBroker && <th className="text-left py-2 px-2">Broker</th>}
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
              {showBroker && (
                <td className="py-2 px-2 text-gray-600">
                  {deal.broker_name || '—'}
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
                onClick={() => setViewMode('broker')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  viewMode === 'broker'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                By Broker
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

        {/* Broker View */}
        {viewMode === 'broker' && (
          <div className="space-y-6">
            {brokerVelocity.map((broker) => (
              <div key={broker.broker_id} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{broker.broker_name}</h2>
                    <p className="text-sm text-gray-500">
                      {broker.deal_count} stage transitions | Avg: {formatDays(broker.overall_avg_days)}
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
                    {broker.stages.map((stage) => {
                      const rowKey = `broker:${broker.broker_id}:${stage.stage_label}`;
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
            {brokerVelocity.length === 0 && (
              <div className="bg-white rounded-lg shadow px-6 py-8 text-center text-gray-500">
                No broker velocity data available.
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
