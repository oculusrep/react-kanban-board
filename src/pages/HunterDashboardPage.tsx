import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  UserGroupIcon,
  NewspaperIcon,
  EnvelopeIcon,
  ChartBarIcon,
  PlayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  CalendarDaysIcon,
  BuildingOffice2Icon,
  PresentationChartBarIcon
} from '@heroicons/react/24/outline';
import { supabase } from '../lib/supabaseClient';
import ProspectingWorkspace from '../components/hunter/ProspectingWorkspace';
import HunterLeadsTab from '../components/hunter/HunterLeadsTab';
import HunterSourcesTab from '../components/hunter/HunterSourcesTab';
import HunterOutreachTab from '../components/hunter/HunterOutreachTab';
import HunterStatsTab from '../components/hunter/HunterStatsTab';
import { MasterScorecard } from '../components/scorecard';

type TabType = 'today' | 'targets' | 'sources' | 'outreach' | 'stats' | 'scorecard';

interface RunStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  sources_scraped: number;
  signals_collected: number;
  leads_created: number;
  leads_updated: number;
  contacts_enriched: number;
  outreach_drafted: number;
  errors: any[] | null;
}

export default function HunterDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabType) || 'today';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const loadLatestRunStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('hunter_run_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        setRunStatus(data as RunStatus);
      }
    } catch (err) {
      console.error('Error loading run status:', err);
    }
  }, []);

  useEffect(() => {
    document.title = "Hunter | OVIS";
    loadLatestRunStatus();

    // Poll for status updates if a run is in progress
    const interval = setInterval(() => {
      if (runStatus?.status === 'running' || runStatus?.status === 'pending') {
        loadLatestRunStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [runStatus?.status, loadLatestRunStatus]);

  const triggerRun = async () => {
    setIsTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('hunter-trigger-run', {
        body: { action: 'run' }
      });

      if (error) throw error;

      // Reload status to show the new run
      await loadLatestRunStatus();
    } catch (err) {
      console.error('Error triggering run:', err);
      alert('Failed to trigger Hunter run. Make sure the edge function is deployed.');
    } finally {
      setIsTriggering(false);
    }
  };

  const formatRunTime = (startedAt: string, completedAt: string | null): string => {
    const start = new Date(startedAt);
    if (completedAt) {
      const end = new Date(completedAt);
      const durationMs = end.getTime() - start.getTime();
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
    return 'Running...';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
      case 'running':
        return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <ClockIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return null;
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const tabs = [
    {
      id: 'today' as TabType,
      label: "Today's Plan",
      icon: CalendarDaysIcon,
      description: 'Daily prospecting workflow'
    },
    {
      id: 'targets' as TabType,
      label: 'Targets',
      icon: BuildingOffice2Icon,
      description: 'View and manage prospecting targets'
    },
    {
      id: 'outreach' as TabType,
      label: 'Outreach',
      icon: EnvelopeIcon,
      description: 'Review and approve outreach drafts'
    },
    {
      id: 'sources' as TabType,
      label: 'Sources',
      icon: NewspaperIcon,
      description: 'Monitor news scrapers and content sources'
    },
    {
      id: 'stats' as TabType,
      label: 'Stats',
      icon: ChartBarIcon,
      description: 'Hunter performance metrics'
    },
    {
      id: 'scorecard' as TabType,
      label: 'Scorecard',
      icon: PresentationChartBarIcon,
      description: 'Master prospecting scorecard'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Hunter</h1>
                  <p className="text-gray-600">
                    AI-powered prospecting agent for commercial real estate
                  </p>
                </div>
              </div>

              {/* Run Controls */}
              <div className="flex items-center gap-4">
                {/* Last Run Status */}
                {runStatus && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    {getStatusIcon(runStatus.status)}
                    <div className="text-sm">
                      <div className="font-medium text-gray-900 capitalize">
                        {runStatus.status === 'completed' ? 'Last Run' : runStatus.status}
                      </div>
                      <div className="text-gray-500">
                        {runStatus.status === 'completed' || runStatus.status === 'failed' ? (
                          <>
                            {formatRunTime(runStatus.started_at, runStatus.completed_at)}
                            {runStatus.status === 'completed' && (
                              <span className="ml-2">
                                ({runStatus.signals_collected} signals, {runStatus.leads_created} leads)
                              </span>
                            )}
                          </>
                        ) : runStatus.status === 'running' ? (
                          'Processing...'
                        ) : (
                          'Waiting for agent'
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Run Button */}
                <button
                  onClick={triggerRun}
                  disabled={isTriggering || runStatus?.status === 'running' || runStatus?.status === 'pending'}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                    ${isTriggering || runStatus?.status === 'running' || runStatus?.status === 'pending'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                    }
                  `}
                >
                  {isTriggering ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      Starting...
                    </>
                  ) : runStatus?.status === 'running' || runStatus?.status === 'pending' ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <PlayIcon className="w-5 h-5" />
                      Run Hunter
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 border-b border-gray-200 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-orange-600 text-orange-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'today' && <ProspectingWorkspace />}
        {activeTab === 'targets' && <HunterLeadsTab />}
        {activeTab === 'outreach' && <HunterOutreachTab />}
        {activeTab === 'sources' && <HunterSourcesTab />}
        {activeTab === 'stats' && <HunterStatsTab />}
        {activeTab === 'scorecard' && <MasterScorecard mode="full" />}
      </div>
    </div>
  );
}
