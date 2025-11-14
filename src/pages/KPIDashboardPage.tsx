import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface SiteSubmitMetrics {
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
}

const KPIDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<SiteSubmitMetrics>({
    thisWeek: 0,
    thisMonth: 0,
    thisYear: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      const now = new Date();

      // Calculate date ranges
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);

      const startOfYear = new Date(now.getFullYear(), 0, 1);
      startOfYear.setHours(0, 0, 0, 0);

      // Fetch site submits for this week
      const { count: weekCount, error: weekError } = await supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('date_submitted', startOfWeek.toISOString())
        .not('date_submitted', 'is', null);

      if (weekError) throw weekError;

      // Fetch site submits for this month
      const { count: monthCount, error: monthError } = await supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('date_submitted', startOfMonth.toISOString())
        .not('date_submitted', 'is', null);

      if (monthError) throw monthError;

      // Fetch site submits for this year
      const { count: yearCount, error: yearError } = await supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('date_submitted', startOfYear.toISOString())
        .not('date_submitted', 'is', null);

      if (yearError) throw yearError;

      setMetrics({
        thisWeek: weekCount || 0,
        thisMonth: monthCount || 0,
        thisYear: yearCount || 0
      });
    } catch (err) {
      console.error('Error loading metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({
    title,
    value,
    icon,
    color,
    bgColor,
    borderColor
  }: {
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    borderColor: string;
  }) => (
    <div className={`bg-white rounded-lg shadow-md border-2 ${borderColor} p-6 hover:shadow-lg transition-shadow`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
        <div className={`${bgColor} ${color} p-3 rounded-lg`}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline">
        <p className={`text-4xl font-bold ${color}`}>{value}</p>
        <span className="ml-2 text-gray-500 text-sm">site submits</span>
      </div>
    </div>
  );

  const CalendarIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );

  const TrendingUpIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );

  const ChartBarIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold">KPI Dashboard</h1>
            <p className="text-slate-300 mt-1">Site Submit Performance Metrics</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading metrics...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold">KPI Dashboard</h1>
            <p className="text-slate-300 mt-1">Site Submit Performance Metrics</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">Error Loading Metrics</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">KPI Dashboard</h1>
              <p className="text-slate-300 mt-1">Site Submit Performance Metrics</p>
            </div>
            <button
              onClick={() => loadMetrics()}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MetricCard
            title="This Week"
            value={metrics.thisWeek}
            icon={<CalendarIcon />}
            color="text-blue-600"
            bgColor="bg-blue-100"
            borderColor="border-blue-200"
          />
          <MetricCard
            title="This Month"
            value={metrics.thisMonth}
            icon={<TrendingUpIcon />}
            color="text-green-600"
            bgColor="bg-green-100"
            borderColor="border-green-200"
          />
          <MetricCard
            title="This Year"
            value={metrics.thisYear}
            icon={<ChartBarIcon />}
            color="text-purple-600"
            bgColor="bg-purple-100"
            borderColor="border-purple-200"
          />
        </div>

        {/* Additional Info */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">About These Metrics</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                <strong>This Week:</strong> Site submits sent to clients from Sunday to now (week starts on Sunday)
              </p>
            </div>
            <div className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                <strong>This Month:</strong> Site submits sent to clients from the 1st of the current month to now
              </p>
            </div>
            <div className="flex items-start">
              <svg className="w-5 h-5 text-purple-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                <strong>This Year:</strong> Site submits sent to clients from January 1st to now
              </p>
            </div>
            <div className="flex items-start pt-2 border-t border-gray-200">
              <svg className="w-5 h-5 text-gray-500 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-xs">
                All metrics are based on the <code className="bg-gray-100 px-1 py-0.5 rounded">date_submitted</code> field in the site_submit table. Only site submits with a date_submitted value are counted.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPIDashboardPage;
