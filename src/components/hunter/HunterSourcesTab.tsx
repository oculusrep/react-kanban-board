import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  NewspaperIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';

interface HunterSource {
  id: string;
  name: string;
  slug: string;
  source_type: 'website' | 'podcast' | 'rss';
  base_url: string;
  is_active: boolean;
  requires_auth: boolean;
  scrape_locally_only: boolean;
  last_scraped_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

interface SourceStats {
  total_signals: number;
  signals_this_week: number;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  website: 'Website',
  podcast: 'Podcast',
  rss: 'RSS Feed'
};

export default function HunterSourcesTab() {
  const [sources, setSources] = useState<HunterSource[]>([]);
  const [stats, setStats] = useState<Record<string, SourceStats>>({});
  const [loading, setLoading] = useState(true);
  const [authScraperStatus, setAuthScraperStatus] = useState<'idle' | 'launching' | 'running'>('idle');

  // Check if there are any local-only sources that need the auth scraper button
  const localOnlySources = sources.filter(s => s.scrape_locally_only && s.is_active);
  const hasLocalOnlySources = localOnlySources.length > 0;

  function launchAuthScrapers() {
    setAuthScraperStatus('launching');
    // Open the custom URL scheme that triggers the Mac app
    window.location.href = 'ovis-hunter://run';
    // Reset status after a delay (user can see Terminal window)
    setTimeout(() => setAuthScraperStatus('idle'), 3000);
  }

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hunter_source')
        .select('*')
        .order('name');

      if (error) throw error;
      setSources(data || []);

      // Load stats for each source
      const statsMap: Record<string, SourceStats> = {};
      for (const source of data || []) {
        const { data: signalData } = await supabase
          .from('hunter_signal')
          .select('id, created_at')
          .eq('source_id', source.id);

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        statsMap[source.id] = {
          total_signals: signalData?.length || 0,
          signals_this_week: signalData?.filter(s => new Date(s.created_at) > weekAgo).length || 0
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
        .from('hunter_source')
        .update({ is_active: !isActive })
        .eq('id', sourceId);

      if (error) throw error;
      loadSources();
    } catch (error) {
      console.error('Error toggling source:', error);
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

  function getStatusIcon(source: HunterSource) {
    // Local-only sources show blue computer icon instead of error/success
    if (source.scrape_locally_only) {
      return <ComputerDesktopIcon className="w-5 h-5 text-blue-500" />;
    }
    if (source.consecutive_failures > 0) {
      return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
    }
    if (source.last_scraped_at) {
      return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
    }
    return <ClockIcon className="w-5 h-5 text-gray-400" />;
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
        <div className="flex items-center gap-2">
          {hasLocalOnlySources && (
            <button
              onClick={launchAuthScrapers}
              disabled={authScraperStatus !== 'idle'}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-orange-600 border border-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Run scrapers for: ${localOnlySources.map(s => s.name).join(', ')}`}
            >
              <ComputerDesktopIcon className="w-4 h-4" />
              {authScraperStatus === 'launching' ? 'Launching...' : 'Run Auth Scrapers'}
            </button>
          )}
          <button
            onClick={loadSources}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>
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
                    source.scrape_locally_only ? 'bg-blue-100' :
                    source.consecutive_failures > 0 ? 'bg-red-100' :
                    source.last_scraped_at ? 'bg-green-100' :
                    'bg-gray-100'
                  }`}>
                    <NewspaperIcon className={`w-5 h-5 ${
                      source.scrape_locally_only ? 'text-blue-600' :
                      source.consecutive_failures > 0 ? 'text-red-600' :
                      source.last_scraped_at ? 'text-green-600' :
                      'text-gray-600'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{source.name}</h3>
                    <p className="text-sm text-gray-500">{SOURCE_TYPE_LABELS[source.source_type] || source.source_type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(source)}
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
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Total Signals</p>
                  <p className="font-semibold text-gray-900">{stats[source.id]?.total_signals || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500">This Week</p>
                  <p className="font-semibold text-gray-900">{stats[source.id]?.signals_this_week || 0}</p>
                </div>
              </div>

              {/* Timing Info */}
              <div className="mt-4 flex items-center justify-between text-sm">
                <div className="text-gray-500">
                  Last run: <span className="font-medium text-gray-700">{formatTimeAgo(source.last_scraped_at)}</span>
                </div>
              </div>

              {/* Error Message - don't show for local-only sources */}
              {source.consecutive_failures > 0 && source.last_error && !source.scrape_locally_only && (
                <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
                  <span className="font-medium">Error ({source.consecutive_failures} failures):</span>{' '}
                  {source.last_error}
                </div>
              )}

              {/* Auth Badge */}
              {source.requires_auth && !source.scrape_locally_only && (
                <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                  <span className="font-medium">Requires Login</span> — Ensure credentials are configured in environment variables
                </div>
              )}

              {/* Local-Only Badge */}
              {source.scrape_locally_only && (
                <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <ComputerDesktopIcon className="w-4 h-4 inline mr-1" />
                  <span className="font-medium">Local Mac Only</span> — Click "Run Auth Scrapers" button to fetch
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
