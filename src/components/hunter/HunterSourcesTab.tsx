import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  NewspaperIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  PlayIcon
} from '@heroicons/react/24/outline';

interface SourceConfig {
  id: string;
  source_name: string;
  source_type: 'rss' | 'scraper' | 'podcast' | 'api';
  base_url: string;
  is_active: boolean;
  scrape_interval_hours: number;
  last_scrape_at: string | null;
  last_scrape_status: 'success' | 'failed' | 'pending' | null;
  last_error_message: string | null;
  articles_found_last_run: number | null;
  requires_auth: boolean;
}

interface SourceStats {
  total_articles: number;
  articles_this_week: number;
  leads_generated: number;
}

const STATUS_ICONS = {
  success: <CheckCircleIcon className="w-5 h-5 text-green-500" />,
  failed: <ExclamationCircleIcon className="w-5 h-5 text-red-500" />,
  pending: <ClockIcon className="w-5 h-5 text-yellow-500" />,
  null: <ClockIcon className="w-5 h-5 text-gray-400" />
};

const SOURCE_TYPE_LABELS = {
  rss: 'RSS Feed',
  scraper: 'Web Scraper',
  podcast: 'Podcast',
  api: 'API'
};

export default function HunterSourcesTab() {
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [stats, setStats] = useState<Record<string, SourceStats>>({});
  const [loading, setLoading] = useState(true);
  const [runningSource, setRunningSource] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hunter_source_config')
        .select('*')
        .order('source_name');

      if (error) throw error;
      setSources(data || []);

      // Load stats for each source
      const statsMap: Record<string, SourceStats> = {};
      for (const source of data || []) {
        const { data: articleData } = await supabase
          .from('hunter_article')
          .select('id, created_at', { count: 'exact' })
          .eq('source_config_id', source.id);

        const { data: leadData } = await supabase
          .from('hunter_lead')
          .select('id', { count: 'exact' })
          .eq('source_article_id', articleData?.map(a => a.id) || []);

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        statsMap[source.id] = {
          total_articles: articleData?.length || 0,
          articles_this_week: articleData?.filter(a => new Date(a.created_at) > weekAgo).length || 0,
          leads_generated: leadData?.length || 0
        };
      }
      setStats(statsMap);
    } catch (error) {
      console.error('Error loading sources:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSource(sourceId: string, isActive: boolean) {
    try {
      const { error } = await supabase
        .from('hunter_source_config')
        .update({ is_active: !isActive })
        .eq('id', sourceId);

      if (error) throw error;
      loadSources();
    } catch (error) {
      console.error('Error toggling source:', error);
    }
  }

  async function triggerScrape(sourceId: string) {
    setRunningSource(sourceId);
    try {
      // Call the hunter agent to run a specific source
      // This would typically call an edge function or background job
      const response = await fetch('/api/hunter/run-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId })
      });

      if (!response.ok) {
        throw new Error('Failed to trigger scrape');
      }

      // Refresh sources after triggering
      setTimeout(loadSources, 2000);
    } catch (error) {
      console.error('Error triggering scrape:', error);
      alert('Failed to trigger scrape. The Hunter agent may need to be running.');
    } finally {
      setRunningSource(null);
    }
  }

  function formatTimeAgo(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  function getNextRunTime(source: SourceConfig): string {
    if (!source.last_scrape_at) return 'Pending first run';
    const lastRun = new Date(source.last_scrape_at);
    const nextRun = new Date(lastRun.getTime() + source.scrape_interval_hours * 3600000);
    const now = new Date();

    if (nextRun < now) return 'Due now';

    const diffMs = nextRun.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 60) return `in ${diffMins}m`;
    return `in ${diffHours}h`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">News Sources</h2>
          <p className="text-sm text-gray-500">Monitor and manage Hunter's content sources</p>
        </div>
        <button
          onClick={loadSources}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Sources Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sources.map((source) => (
          <div
            key={source.id}
            className={`bg-white rounded-lg shadow-sm border ${
              source.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
            } overflow-hidden`}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    source.last_scrape_status === 'success' ? 'bg-green-100' :
                    source.last_scrape_status === 'failed' ? 'bg-red-100' :
                    'bg-gray-100'
                  }`}>
                    <NewspaperIcon className={`w-5 h-5 ${
                      source.last_scrape_status === 'success' ? 'text-green-600' :
                      source.last_scrape_status === 'failed' ? 'text-red-600' :
                      'text-gray-600'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{source.source_name}</h3>
                    <p className="text-sm text-gray-500">{SOURCE_TYPE_LABELS[source.source_type]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {STATUS_ICONS[source.last_scrape_status || 'null']}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={source.is_active}
                      onChange={() => toggleSource(source.id, source.is_active)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Articles</p>
                  <p className="font-semibold text-gray-900">{stats[source.id]?.total_articles || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500">This Week</p>
                  <p className="font-semibold text-gray-900">{stats[source.id]?.articles_this_week || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500">Leads</p>
                  <p className="font-semibold text-gray-900">{stats[source.id]?.leads_generated || 0}</p>
                </div>
              </div>

              {/* Timing Info */}
              <div className="mt-4 flex items-center justify-between text-sm">
                <div className="text-gray-500">
                  Last run: <span className="font-medium text-gray-700">{formatTimeAgo(source.last_scrape_at)}</span>
                  {source.articles_found_last_run !== null && (
                    <span className="ml-2 text-gray-400">
                      ({source.articles_found_last_run} articles)
                    </span>
                  )}
                </div>
                <div className="text-gray-500">
                  Next: <span className="font-medium text-gray-700">{getNextRunTime(source)}</span>
                </div>
              </div>

              {/* Error Message */}
              {source.last_scrape_status === 'failed' && source.last_error_message && (
                <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
                  {source.last_error_message}
                </div>
              )}

              {/* Auth Warning */}
              {source.requires_auth && (
                <div className="mt-3 p-2 bg-yellow-50 rounded text-sm text-yellow-700">
                  This source requires authentication
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <a
                href={source.base_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                View Source
              </a>
              <button
                onClick={() => triggerScrape(source.id)}
                disabled={!source.is_active || runningSource === source.id}
                className={`flex items-center gap-1 px-3 py-1 text-sm font-medium rounded ${
                  source.is_active
                    ? 'text-orange-600 hover:bg-orange-50'
                    : 'text-gray-400 cursor-not-allowed'
                }`}
              >
                {runningSource === source.id ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-4 h-4" />
                    Run Now
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {sources.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <NewspaperIcon className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">No sources configured</h3>
          <p className="mt-1 text-gray-500">
            Run the Hunter agent setup to configure news sources.
          </p>
        </div>
      )}
    </div>
  );
}
