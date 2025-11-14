import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface SiteSubmitMetrics {
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
}

interface SiteSubmitDetail {
  id: string;
  date_submitted: string;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod | null>(null);
  const [reportData, setReportData] = useState<SiteSubmitDetail[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [siteSubmitSlideoutId, setSiteSubmitSlideoutId] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedEmailDescription, setSelectedEmailDescription] = useState<string | null>(null);

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

  const loadReportData = async (period: TimePeriod) => {
    try {
      setReportLoading(true);
      setSelectedPeriod(period);
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

      // Query site submits with related data
      const { data, error } = await supabase
        .from('site_submit')
        .select(`
          id,
          date_submitted,
          client_id,
          submit_stage_id,
          property_id,
          created_by_id,
          client:client_id (client_name),
          submit_stage:submit_stage_id (name),
          property:property_id (address, city, state),
          created_by:created_by_id (first_name, last_name)
        `)
        .gte('date_submitted', startDate.toISOString())
        .not('date_submitted', 'is', null)
        .order('date_submitted', { ascending: false });

      if (error) throw error;

      // Now fetch email data for each site submit
      const siteSubmitIds = data?.map(ss => ss.id) || [];

      let emailData: { [key: string]: { date: string; description: string } } = {};
      if (siteSubmitIds.length > 0) {
        const { data: activityData, error: activityError } = await supabase
          .from('activity')
          .select('related_object_id, activity_date, description')
          .in('related_object_id', siteSubmitIds)
          .eq('related_object_type', 'site_submit')
          .eq('activity_type_id', '018c896a-9d0d-7348-b352-c9f5ddf517f2') // Email activity type
          .order('activity_date', { ascending: false });

        if (!activityError && activityData) {
          // Group by related_object_id and take the most recent email
          activityData.forEach(activity => {
            if (activity.related_object_id && !emailData[activity.related_object_id]) {
              emailData[activity.related_object_id] = {
                date: activity.activity_date,
                description: activity.description || ''
              };
            }
          });
        }
      }

      // Transform the data
      const transformedData: SiteSubmitDetail[] = data?.map(item => {
        const emailInfo = emailData[item.id];
        const createdBy = item.created_by;
        const createdByName = createdBy
          ? `${createdBy.first_name || ''} ${createdBy.last_name || ''}`.trim() || null
          : null;

        return {
          id: item.id,
          date_submitted: item.date_submitted,
          client_id: item.client_id,
          client_name: item.client?.client_name || null,
          submit_stage_id: item.submit_stage_id,
          submit_stage_name: item.submit_stage?.name || null,
          email_sent_date: emailInfo?.date || null,
          email_description: emailInfo?.description || null,
          property_address: item.property ?
            `${item.property.address || ''}, ${item.property.city || ''}, ${item.property.state || ''}`.trim() : null,
          created_by_id: item.created_by_id,
          created_by_name: createdByName
        };
      }) || [];

      setReportData(transformedData);
    } catch (err) {
      console.error('Error loading report data:', err);
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
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getPeriodTitle = (): string => {
    switch (selectedPeriod) {
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'year': return 'This Year';
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
        </div>
      </div>

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Site Submits Report: {getPeriodTitle()}</h2>
                <p className="text-slate-300 text-sm mt-1">{reportData.length} site submits found</p>
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
                          Date Submitted
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
                            {formatDate(submit.date_submitted)}
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
