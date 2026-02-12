import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  UserGroupIcon,
  EnvelopeIcon,
  BuildingStorefrontIcon,
  NewspaperIcon
} from '@heroicons/react/24/outline';

interface Stats {
  totalArticles: number;
  articlesThisWeek: number;
  totalLeads: number;
  leadsThisWeek: number;
  hotLeads: number;
  convertedLeads: number;
  outreachSent: number;
  outreachPending: number;
  conversionRate: number;
  leadsByGeo: { geo: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  recentActivity: {
    date: string;
    articles: number;
    leads: number;
    outreach: number;
  }[];
}

export default function HunterStatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadStats();
  }, [timeRange]);

  async function loadStats() {
    setLoading(true);
    try {
      const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Load signals (articles)
      const { data: signals } = await supabase
        .from('hunter_signal')
        .select('id, source_id, created_at, source:hunter_source!source_id(name)');

      // Load targets
      const { data: leads } = await supabase
        .from('target')
        .select('id, signal_strength, status, created_at');

      // Load outreach
      const { data: outreach } = await supabase
        .from('hunter_outreach_draft')
        .select('id, status, created_at, sent_at');

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Calculate stats
      const totalArticles = signals?.length || 0;
      const articlesThisWeek = signals?.filter(a => new Date(a.created_at) > weekAgo).length || 0;
      const totalLeads = leads?.length || 0;
      const leadsThisWeek = leads?.filter(l => new Date(l.created_at) > weekAgo).length || 0;
      const hotLeads = leads?.filter(l => l.signal_strength === 'HOT').length || 0;
      const convertedLeads = leads?.filter(l => l.status === 'converted').length || 0;
      const outreachSent = outreach?.filter(o => o.status === 'sent').length || 0;
      const outreachPending = outreach?.filter(o => o.status === 'draft' || o.status === 'approved').length || 0;
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

      // Leads by signal strength
      const geoGroups: Record<string, number> = {};
      leads?.forEach(l => {
        geoGroups[l.signal_strength] = (geoGroups[l.signal_strength] || 0) + 1;
      });
      const leadsByGeo = Object.entries(geoGroups).map(([geo, count]) => ({ geo, count }));

      // Signals by source
      const sourceGroups: Record<string, number> = {};
      signals?.forEach(s => {
        const sourceName = (s.source as any)?.name || 'Unknown';
        sourceGroups[sourceName] = (sourceGroups[sourceName] || 0) + 1;
      });
      const leadsBySource = Object.entries(sourceGroups)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Recent activity (daily for last 7 days)
      const recentActivity: Stats['recentActivity'] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        recentActivity.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          articles: signals?.filter(s => {
            const created = new Date(s.created_at);
            return created >= date && created < nextDate;
          }).length || 0,
          leads: leads?.filter(l => {
            const created = new Date(l.created_at);
            return created >= date && created < nextDate;
          }).length || 0,
          outreach: outreach?.filter(o => {
            if (!o.sent_at) return false;
            const sent = new Date(o.sent_at);
            return sent >= date && sent < nextDate;
          }).length || 0
        });
      }

      setStats({
        totalArticles,
        articlesThisWeek,
        totalLeads,
        leadsThisWeek,
        hotLeads,
        convertedLeads,
        outreachSent,
        outreachPending,
        conversionRate,
        leadsByGeo,
        leadsBySource,
        recentActivity
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">Failed to load stats</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-white">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                timeRange === range
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <NewspaperIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalArticles}</p>
              <p className="text-sm text-gray-500">Articles Scanned</p>
              <p className="text-xs text-green-600">+{stats.articlesThisWeek} this week</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <UserGroupIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalLeads}</p>
              <p className="text-sm text-gray-500">Leads Discovered</p>
              <p className="text-xs text-green-600">+{stats.leadsThisWeek} this week</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <BuildingStorefrontIcon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.hotLeads}</p>
              <p className="text-sm text-gray-500">HOT Leads</p>
              <p className="text-xs text-gray-400">{stats.convertedLeads} converted</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <EnvelopeIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.outreachSent}</p>
              <p className="text-sm text-gray-500">Emails Sent</p>
              <p className="text-xs text-yellow-600">{stats.outreachPending} pending</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Geo Relevance */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-4">Leads by Geographic Relevance</h3>
          <div className="space-y-3">
            {['HOT', 'WARM+', 'WARM', 'COOL'].map((geo) => {
              const data = stats.leadsByGeo.find(g => g.geo === geo);
              const count = data?.count || 0;
              const percentage = stats.totalLeads > 0 ? (count / stats.totalLeads) * 100 : 0;
              const colors = {
                'HOT': 'bg-red-500',
                'WARM+': 'bg-orange-500',
                'WARM': 'bg-yellow-500',
                'COOL': 'bg-blue-500'
              };
              return (
                <div key={geo}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{geo}</span>
                    <span className="text-gray-500">{count} ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`${colors[geo as keyof typeof colors]} h-2 rounded-full transition-all`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Sources */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-4">Top Article Sources</h3>
          <div className="space-y-3">
            {stats.leadsBySource.map((source, idx) => {
              const percentage = stats.totalArticles > 0 ? (source.count / stats.totalArticles) * 100 : 0;
              return (
                <div key={source.source}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{source.source}</span>
                    <span className="text-gray-500">{source.count} articles</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {stats.leadsBySource.length === 0 && (
              <p className="text-gray-500 text-sm">No article data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4">7-Day Activity</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 font-medium text-gray-500">Date</th>
                <th className="text-right py-2 font-medium text-gray-500">Articles</th>
                <th className="text-right py-2 font-medium text-gray-500">Leads</th>
                <th className="text-right py-2 font-medium text-gray-500">Outreach</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentActivity.map((day) => (
                <tr key={day.date} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900">{day.date}</td>
                  <td className="py-2 text-right">
                    <span className={day.articles > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                      {day.articles}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <span className={day.leads > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>
                      {day.leads}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <span className={day.outreach > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                      {day.outreach}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
              <span className="text-2xl font-bold text-blue-700">{stats.totalArticles}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">Articles</p>
          </div>
          <ArrowTrendingUpIcon className="w-6 h-6 text-gray-400" />
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
              <span className="text-2xl font-bold text-orange-700">{stats.totalLeads}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">Leads</p>
          </div>
          <ArrowTrendingUpIcon className="w-6 h-6 text-gray-400" />
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <span className="text-2xl font-bold text-green-700">{stats.outreachSent}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">Contacted</p>
          </div>
          <ArrowTrendingUpIcon className="w-6 h-6 text-gray-400" />
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <span className="text-2xl font-bold text-emerald-700">{stats.convertedLeads}</span>
            </div>
            <p className="mt-2 text-sm text-gray-600">Converted</p>
          </div>
        </div>
        <p className="text-center mt-4 text-sm text-gray-500">
          Overall conversion rate: <span className="font-medium text-gray-700">{stats.conversionRate.toFixed(1)}%</span>
        </p>
      </div>
    </div>
  );
}
