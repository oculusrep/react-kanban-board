// Main Prospecting Dashboard with time tracking, metrics, and lead management
// src/components/hunter/ProspectingDashboard.tsx

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProspectingTime } from '../../hooks/useProspectingTime';
import { useProspectingMetrics } from '../../hooks/useProspectingMetrics';
import TimeEntryModal from './TimeEntryModal';
import {
  ClockIcon,
  FireIcon,
  ChartBarIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  PlusIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';

export default function ProspectingDashboard() {
  const navigate = useNavigate();
  const {
    stats: timeStats,
    settings,
    loading: timeLoading,
    loadTimeData,
    saveTimeEntry,
    markVacationDay
  } = useProspectingTime();
  const {
    data: dashboardData,
    loading: metricsLoading,
    loadDashboardData
  } = useProspectingMetrics();

  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);

  useEffect(() => {
    loadTimeData();
    loadDashboardData();
  }, [loadTimeData, loadDashboardData]);

  const loading = timeLoading || metricsLoading;
  const metrics = dashboardData.metrics;

  // Format time display
  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Prospecting Dashboard</h1>
        <button
          onClick={() => setIsTimeModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <ClockIcon className="w-5 h-5" />
          Log Time
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Today's Time */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <ClockIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold text-gray-900">
                {formatTime(timeStats.todayMinutes)}
              </p>
              <p className="text-sm text-gray-500">
                Today ({timeStats.todayPercentage}% of goal)
              </p>
            </div>
          </div>
          <div className="mt-3 w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                timeStats.todayPercentage >= 100 ? 'bg-green-500' : 'bg-orange-500'
              }`}
              style={{ width: `${Math.min(100, timeStats.todayPercentage)}%` }}
            />
          </div>
        </div>

        {/* Week Outreach */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ChartBarIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {metrics?.total_touches || 0}
              </p>
              <p className="text-sm text-gray-500">Touches This Week</p>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <FireIcon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {timeStats.streak} days
              </p>
              <p className="text-sm text-gray-500">
                Streak {timeStats.streak >= 7 ? '🔥' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Response Rate */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserGroupIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {metrics && metrics.funnel_active > 0
                  ? Math.round((metrics.funnel_engaged / metrics.funnel_active) * 100)
                  : 0}%
              </p>
              <p className="text-sm text-gray-500">Response Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Follow-up Tasks Due Today */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Follow-up Tasks Due Today</h2>
            <span className="text-sm text-gray-500">
              ({dashboardData.dueTaskCount})
            </span>
          </div>
          <div className="p-4">
            {dashboardData.dueTaskCount === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <CalendarDaysIcon className="w-10 h-10 mx-auto mb-2" />
                <p>No prospecting tasks due today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* TODO: Load and display actual tasks */}
                <p className="text-sm text-gray-500">
                  {dashboardData.dueTaskCount} tasks due today.{' '}
                  <button
                    onClick={() => navigate('/tasks')}
                    className="text-orange-600 hover:text-orange-700"
                  >
                    View all tasks →
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* New Leads to Review */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">New Leads to Review</h2>
            <span className="text-sm text-gray-500">
              ({dashboardData.newLeads.length})
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {dashboardData.newLeads.length === 0 ? (
              <div className="p-4 text-center text-gray-400 py-6">
                <EnvelopeIcon className="w-10 h-10 mx-auto mb-2" />
                <p>No new leads to review</p>
              </div>
            ) : (
              dashboardData.newLeads.slice(0, 5).map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => navigate(`/hunter/lead/${lead.id}`)}
                  className="p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className={`
                      px-2 py-0.5 text-xs font-medium rounded-full
                      ${lead.signal_strength === 'HOT' ? 'bg-red-100 text-red-700' :
                        lead.signal_strength === 'WARM+' ? 'bg-orange-100 text-orange-700' :
                        lead.signal_strength === 'WARM' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'}
                    `}>
                      {lead.signal_strength}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">{lead.concept_name}</p>
                      {lead.industry_segment && (
                        <p className="text-xs text-gray-500">{lead.industry_segment}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                </div>
              ))
            )}
            {dashboardData.newLeads.length > 5 && (
              <div className="p-3 text-center">
                <button
                  onClick={() => navigate('/hunter?tab=leads&status=new')}
                  className="text-sm text-orange-600 hover:text-orange-700"
                >
                  View all {dashboardData.newLeads.length} new leads →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stale Leads (45+ days) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
              Stale Leads (45+ days)
            </h2>
            <span className="text-sm text-gray-500">
              ({dashboardData.staleLeads.length})
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {dashboardData.staleLeads.length === 0 ? (
              <div className="p-4 text-center text-gray-400 py-6">
                <p>No stale leads - great job staying in touch!</p>
              </div>
            ) : (
              dashboardData.staleLeads.slice(0, 5).map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => navigate(`/hunter/lead/${lead.id}`)}
                  className="p-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{lead.concept_name}</p>
                    <p className="text-xs text-gray-500">
                      Last contact: {lead.days_since_contact} days ago
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/hunter/lead/${lead.id}`);
                    }}
                    className="text-sm text-orange-600 hover:text-orange-700"
                  >
                    Re-engage
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Weekly Outreach Breakdown */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Outreach This Week</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-gray-600">Emails</span>
              </div>
              <span className="font-medium text-gray-900">{metrics?.emails_sent || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <span className="text-sm text-gray-600">LinkedIn</span>
              </div>
              <span className="font-medium text-gray-900">{metrics?.linkedin_messages || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-600">SMS</span>
              </div>
              <span className="font-medium text-gray-900">{metrics?.sms_sent || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-gray-600">Voicemails</span>
              </div>
              <span className="font-medium text-gray-900">{metrics?.voicemails_left || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-4 h-4 text-emerald-600" />
                <span className="text-sm text-gray-600">Calls Completed</span>
              </div>
              <span className="font-medium text-gray-900">{metrics?.calls_completed || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserGroupIcon className="w-4 h-4 text-purple-600" />
                <span className="text-sm text-gray-600">Meetings</span>
              </div>
              <span className="font-medium text-gray-900">{metrics?.meetings_held || 0}</span>
            </div>
            <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total Touches</span>
              <span className="font-bold text-gray-900">{metrics?.total_touches || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Time Entry Modal */}
      <TimeEntryModal
        isOpen={isTimeModalOpen}
        onClose={() => setIsTimeModalOpen(false)}
        onSave={saveTimeEntry}
        onMarkVacation={markVacationDay}
        initialMinutes={timeStats.todayMinutes}
        dailyGoalMinutes={settings?.daily_time_goal_minutes || 120}
      />
    </div>
  );
}
