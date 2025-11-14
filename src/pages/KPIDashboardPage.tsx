import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface SiteSubmitMetrics {
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
}

interface LOIMetrics {
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
}

interface SiteSubmitDetail {
  id: string;
  date_submitted: string;
  loi_date?: string | null;
  client_id: string | null;
  client_name: string | null;
  submit_stage_id: string | null;
  submit_stage_name: string | null;
  email_sent_date: string | null;
  email_description: string | null;
  property_address: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
}

type TimePeriod = 'week' | 'month' | 'year';

const KPIDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<SiteSubmitMetrics>({
    thisWeek: 0,
    thisMonth: 0,
    thisYear: 0
  });
  const [loiMetrics, setLoiMetrics] = useState<LOIMetrics>({
    thisWeek: 0,
    thisMonth: 0,
    thisYear: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod | null>(null);
  const [reportData, setReportData] = useState<SiteSubmitDetail[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [siteSubmitSlideoutId, setSiteSubmitSlideoutId] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedEmailDescription, setSelectedEmailDescription] = useState<string | null>(null);
  const [reportType, setReportType] = useState<'site_submit' | 'loi'>('site_submit');

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

      // Get the "Protected" stage ID to filter it out
      const { data: protectedStage } = await supabase
        .from('submit_stage')
        .select('id')
        .eq('name', 'Protected')
        .single();

      const protectedStageId = protectedStage?.id;

      // Fetch site submits for this week (excluding Protected stage)
      const weekQuery = supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('date_submitted', startOfWeek.toISOString())
        .not('date_submitted', 'is', null);

      if (protectedStageId) {
        weekQuery.neq('submit_stage_id', protectedStageId);
      }

      const { count: weekCount, error: weekError } = await weekQuery;
      if (weekError) throw weekError;

      // Fetch site submits for this month (excluding Protected stage)
      const monthQuery = supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('date_submitted', startOfMonth.toISOString())
        .not('date_submitted', 'is', null);

      if (protectedStageId) {
        monthQuery.neq('submit_stage_id', protectedStageId);
      }

      const { count: monthCount, error: monthError } = await monthQuery;
      if (monthError) throw monthError;

      // Fetch site submits for this year (excluding Protected stage)
      const yearQuery = supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('date_submitted', startOfYear.toISOString())
        .not('date_submitted', 'is', null);

      if (protectedStageId) {
        yearQuery.neq('submit_stage_id', protectedStageId);
      }

      const { count: yearCount, error: yearError } = await yearQuery;
      if (yearError) throw yearError;

      setMetrics({
        thisWeek: weekCount || 0,
        thisMonth: monthCount || 0,
        thisYear: yearCount || 0
      });

      // Fetch LOI metrics based on loi_date
      const loiWeekQuery = supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('loi_date', startOfWeek.toISOString())
        .not('loi_date', 'is', null);

      if (protectedStageId) {
        loiWeekQuery.neq('submit_stage_id', protectedStageId);
      }

      const { count: loiWeekCount, error: loiWeekError } = await loiWeekQuery;
      if (loiWeekError) throw loiWeekError;

      const loiMonthQuery = supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('loi_date', startOfMonth.toISOString())
        .not('loi_date', 'is', null);

      if (protectedStageId) {
        loiMonthQuery.neq('submit_stage_id', protectedStageId);
      }

      const { count: loiMonthCount, error: loiMonthError } = await loiMonthQuery;
      if (loiMonthError) throw loiMonthError;

      const loiYearQuery = supabase
        .from('site_submit')
        .select('*', { count: 'exact', head: true })
        .gte('loi_date', startOfYear.toISOString())
        .not('loi_date', 'is', null);

      if (protectedStageId) {
        loiYearQuery.neq('submit_stage_id', protectedStageId);
      }

      const { count: loiYearCount, error: loiYearError } = await loiYearQuery;
      if (loiYearError) throw loiYearError;

      setLoiMetrics({
        thisWeek: loiWeekCount || 0,
        thisMonth: loiMonthCount || 0,
        thisYear: loiYearCount || 0
      });
    } catch (err) {
      console.error('Error loading metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  const loadReportData = async (period: TimePeriod, type: 'site_submit' | 'loi' = 'site_submit') => {
    try {
      setReportLoading(true);
      setSelectedPeriod(period);
      setReportType(type);
      setReportModalOpen(true);

      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - now.getDay());
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          startDate.setHours(0, 0, 0, 0);
          break;
      }

      console.log('Loading report for period:', period);
      console.log('Start date:', startDate.toISOString());

      // Get the "Protected" stage ID to filter it out
      const { data: protectedStage } = await supabase
        .from('submit_stage')
        .select('id')
        .eq('name', 'Protected')
        .single();

      const protectedStageId = protectedStage?.id;

      // First, get just the site submits without joins (excluding Protected stage)
      const dateField = type === 'loi' ? 'loi_date' : 'date_submitted';
      const query = supabase
        .from('site_submit')
        .select('*')
        .gte(dateField, startDate.toISOString())
        .not(dateField, 'is', null)
        .order(dateField, { ascending: false });

      if (protectedStageId) {
        query.neq('submit_stage_id', protectedStageId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching site submits:', error);
        console.error('Full error object:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('Site submits fetched:', data?.length || 0);
      console.log('Sample data:', data?.[0]);

      // Check for any records without date_submitted (should not happen due to filter)
      const recordsWithoutDate = data?.filter(item => !item.date_submitted) || [];
      if (recordsWithoutDate.length > 0) {
        console.warn('WARNING: Found records without date_submitted:', recordsWithoutDate.length);
        console.warn('Sample record without date:', recordsWithoutDate[0]);
      }

      if (!data || data.length === 0) {
        setReportData([]);
        return;
      }

      // Get unique IDs for related data
      const siteSubmitIds = data.map(ss => ss.id);
      const clientIds = [...new Set(data.map(ss => ss.client_id).filter(Boolean))];
      const stageIds = [...new Set(data.map(ss => ss.submit_stage_id).filter(Boolean))];
      const propertyIds = [...new Set(data.map(ss => ss.property_id).filter(Boolean))];

      // Collect both created_by_id and email_sent_by_id for user lookups
      const createdByIds = data.map(ss => ss.created_by_id).filter(Boolean);
      const emailSentByIds = data.map((ss: any) => ss.email_sent_by_id).filter(Boolean);
      const userIds = [...new Set([...createdByIds, ...emailSentByIds])];

      // Fetch related data in parallel
      const [clientsData, stagesData, propertiesData, usersData] = await Promise.all([
        clientIds.length > 0 ? supabase.from('client').select('id, client_name').in('id', clientIds) : { data: [] },
        stageIds.length > 0 ? supabase.from('submit_stage').select('id, name').in('id', stageIds) : { data: [] },
        propertyIds.length > 0 ? supabase.from('property').select('id, address, city, state').in('id', propertyIds) : { data: [] },
        userIds.length > 0 ? supabase.from('user').select('id, first_name, last_name').in('id', userIds) : { data: [] }
      ]);

      // Create lookup maps
      const clientsMap = new Map((clientsData.data || []).map(c => [c.id, c]));
      const stagesMap = new Map((stagesData.data || []).map(s => [s.id, s]));
      const propertiesMap = new Map((propertiesData.data || []).map(p => [p.id, p]));
      const usersMap = new Map((usersData.data || []).map(u => [u.id, u]));

      console.log('Site submits with email data:', data.filter((ss: any) => ss.email_sent_at).length);

      // Transform the data
      const transformedData: SiteSubmitDetail[] = data.map((item: any) => {
        const client = item.client_id ? clientsMap.get(item.client_id) : null;
        const stage = item.submit_stage_id ? stagesMap.get(item.submit_stage_id) : null;
        const property = item.property_id ? propertiesMap.get(item.property_id) : null;
        const user = item.created_by_id ? usersMap.get(item.created_by_id) : null;
        const emailSentByUser = item.email_sent_by_id ? usersMap.get(item.email_sent_by_id) : null;

        const createdByName = user
          ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || null
          : null;

        const emailSentByName = emailSentByUser
          ? `${emailSentByUser.first_name || ''} ${emailSentByUser.last_name || ''}`.trim() || null
          : null;

        const propertyAddress = property
          ? `${property.address || ''}, ${property.city || ''}, ${property.state || ''}`.trim()
          : null;

        return {
          id: item.id,
          date_submitted: item.date_submitted,
          loi_date: item.loi_date || null,
          client_id: item.client_id,
          client_name: client?.client_name || null,
          submit_stage_id: item.submit_stage_id,
          submit_stage_name: stage?.name || null,
          email_sent_date: item.email_sent_at || null,
          email_description: emailSentByName ? `Sent by ${emailSentByName}` : null,
          property_address: propertyAddress,
          created_by_id: item.created_by_id,
          created_by_name: createdByName
        };
      });

      console.log('Transformed data count:', transformedData.length);
      console.log('Sample transformed data:', transformedData[0]);

      setReportData(transformedData);
    } catch (err) {
      console.error('Error loading report data:', err);
      // Show error to user
      alert(`Error loading report: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setReportLoading(false);
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/New_York' // Display in EST/EDT
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getPeriodTitle = (): string => {
    const prefix = reportType === 'loi' ? 'LOIs Written - ' : 'Site Submits - ';
    switch (selectedPeriod) {
      case 'week': return prefix + 'This Week';
      case 'month': return prefix + 'This Month';
      case 'year': return prefix + 'This Year';
      default: return '';
    }
  };

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
    <>
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

        {/* Main Content - Single Card */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h2 className="text-2xl font-bold text-gray-900">Site Submits Sent to Clients</h2>
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* This Week */}
              <button
                onClick={() => loadReportData('week')}
                className="group text-center p-6 rounded-lg bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-400 transition-all hover:shadow-md"
              >
                <div className="flex justify-center mb-3">
                  <CalendarIcon />
                </div>
                <div className="text-4xl font-bold text-blue-600 mb-2 group-hover:scale-110 transition-transform">
                  {metrics.thisWeek}
                </div>
                <div className="text-sm font-medium text-gray-700">This Week</div>
                <div className="text-xs text-gray-500 mt-1">Click for details</div>
              </button>

              {/* This Month */}
              <button
                onClick={() => loadReportData('month')}
                className="group text-center p-6 rounded-lg bg-green-50 hover:bg-green-100 border-2 border-green-200 hover:border-green-400 transition-all hover:shadow-md"
              >
                <div className="flex justify-center mb-3">
                  <TrendingUpIcon />
                </div>
                <div className="text-4xl font-bold text-green-600 mb-2 group-hover:scale-110 transition-transform">
                  {metrics.thisMonth}
                </div>
                <div className="text-sm font-medium text-gray-700">This Month</div>
                <div className="text-xs text-gray-500 mt-1">Click for details</div>
              </button>

              {/* This Year */}
              <button
                onClick={() => loadReportData('year')}
                className="group text-center p-6 rounded-lg bg-purple-50 hover:bg-purple-100 border-2 border-purple-200 hover:border-purple-400 transition-all hover:shadow-md"
              >
                <div className="flex justify-center mb-3">
                  <ChartBarIcon />
                </div>
                <div className="text-4xl font-bold text-purple-600 mb-2 group-hover:scale-110 transition-transform">
                  {metrics.thisYear}
                </div>
                <div className="text-sm font-medium text-gray-700">This Year</div>
                <div className="text-xs text-gray-500 mt-1">Click for details</div>
              </button>
            </div>

            <div className="mt-6 pt-6 border-t text-sm text-gray-600">
              <p className="flex items-start">
                <svg className="w-5 h-5 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Click on any metric to view a detailed report of site submits sent during that period.
              </p>
            </div>
          </div>

          {/* LOIs Written Card */}
          <div className="bg-white rounded-lg shadow-lg border-2 border-gray-200 p-8 mt-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b">
              <h2 className="text-2xl font-bold text-gray-900">LOIs Written</h2>
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* This Week */}
              <button
                onClick={() => loadReportData('week', 'loi')}
                className="group text-center p-6 rounded-lg bg-orange-50 hover:bg-orange-100 border-2 border-orange-200 hover:border-orange-400 transition-all hover:shadow-md"
              >
                <div className="flex justify-center mb-3">
                  <CalendarIcon />
                </div>
                <div className="text-4xl font-bold text-orange-600 mb-2 group-hover:scale-110 transition-transform">
                  {loiMetrics.thisWeek}
                </div>
                <div className="text-sm font-medium text-gray-700">This Week</div>
                <div className="text-xs text-gray-500 mt-1">Click for details</div>
              </button>

              {/* This Month */}
              <button
                onClick={() => loadReportData('month', 'loi')}
                className="group text-center p-6 rounded-lg bg-teal-50 hover:bg-teal-100 border-2 border-teal-200 hover:border-teal-400 transition-all hover:shadow-md"
              >
                <div className="flex justify-center mb-3">
                  <TrendingUpIcon />
                </div>
                <div className="text-4xl font-bold text-teal-600 mb-2 group-hover:scale-110 transition-transform">
                  {loiMetrics.thisMonth}
                </div>
                <div className="text-sm font-medium text-gray-700">This Month</div>
                <div className="text-xs text-gray-500 mt-1">Click for details</div>
              </button>

              {/* This Year */}
              <button
                onClick={() => loadReportData('year', 'loi')}
                className="group text-center p-6 rounded-lg bg-indigo-50 hover:bg-indigo-100 border-2 border-indigo-200 hover:border-indigo-400 transition-all hover:shadow-md"
              >
                <div className="flex justify-center mb-3">
                  <ChartBarIcon />
                </div>
                <div className="text-4xl font-bold text-indigo-600 mb-2 group-hover:scale-110 transition-transform">
                  {loiMetrics.thisYear}
                </div>
                <div className="text-sm font-medium text-gray-700">This Year</div>
                <div className="text-xs text-gray-500 mt-1">Click for details</div>
              </button>
            </div>

            <div className="mt-6 pt-6 border-t text-sm text-gray-600">
              <p className="flex items-start">
                <svg className="w-5 h-5 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Click on any metric to view a detailed report of LOIs written during that period.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{getPeriodTitle()}</h2>
                <p className="text-slate-300 text-sm mt-1">{reportData.length} {reportType === 'loi' ? 'LOIs' : 'site submits'} found</p>
              </div>
              <button
                onClick={() => setReportModalOpen(false)}
                className="text-white hover:bg-slate-600 p-2 rounded transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
              {reportLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading report data...</p>
                  </div>
                </div>
              ) : reportData.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No site submits found for this period</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {reportType === 'loi' ? 'LOI Date' : 'Date Submitted'}
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Site Submit
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Client
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Stage
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submitted By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email Sent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reportData.map((submit) => (
                        <tr key={submit.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(reportType === 'loi' ? submit.loi_date || null : submit.date_submitted)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => window.open(`/site-submit/${submit.id}`, '_blank')}
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                              {submit.property_address || 'View Submit'}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {submit.client_name || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {submit.submit_stage_name || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {submit.created_by_name || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {submit.email_sent_date ? (
                              <button
                                onClick={() => {
                                  setSelectedEmailDescription(submit.email_description);
                                  setEmailModalOpen(true);
                                }}
                                className="flex items-center text-green-600 hover:text-green-800 hover:underline cursor-pointer"
                              >
                                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                                </svg>
                                {formatDate(submit.email_sent_date)}
                              </button>
                            ) : (
                              <span className="text-gray-400">No email sent</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end border-t">
              <button
                onClick={() => setReportModalOpen(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Details Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-green-700 to-green-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <h2 className="text-xl font-bold">Email Details</h2>
              </div>
              <button
                onClick={() => {
                  setEmailModalOpen(false);
                  setSelectedEmailDescription(null);
                }}
                className="text-white hover:bg-green-600 p-2 rounded transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto max-h-[calc(80vh-120px)] p-6">
              {selectedEmailDescription ? (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Recipients and Details:</h3>
                  <div className="text-sm text-gray-900 whitespace-pre-wrap font-mono">
                    {selectedEmailDescription}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p>No email details available</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end border-t">
              <button
                onClick={() => {
                  setEmailModalOpen(false);
                  setSelectedEmailDescription(null);
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default KPIDashboardPage;
