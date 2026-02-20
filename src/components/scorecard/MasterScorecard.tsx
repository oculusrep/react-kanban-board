/**
 * Master Prospecting Scorecard
 *
 * Comprehensive view of outreach vs connections metrics across multiple time periods.
 * Can be used as:
 * - Full page in Hunter Dashboard
 * - Standalone report page
 * - Embedded widget in Coach Dashboard
 */

import { useState, useEffect } from 'react';
import { ArrowPathIcon, ClockIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { useScorecardMetrics } from '../../hooks/useScorecardMetrics';
import { useProspectingTime } from '../../hooks/useProspectingTime';
import { MasterScorecardProps, ScorecardPeriod } from '../../types/scorecard';
import ScorecardSummaryCards from './ScorecardSummaryCards';
import OutreachConnectionsChart from './OutreachConnectionsChart';
import ActivityTrendChart from './ActivityTrendChart';
import ActivityBreakdownRow from './ActivityBreakdownRow';
import TimeHistoryModal from '../prospecting/TimeHistoryModal';

export default function MasterScorecard({
  mode = 'full',
  readOnly = false,
  defaultPeriod = 'week',
  userId,
  className = ''
}: MasterScorecardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<ScorecardPeriod>(defaultPeriod);
  const [trendView, setTrendView] = useState<'daily' | 'weekly'>('daily');

  // Time tracking state
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const {
    today,
    week,
    month,
    quarter,
    year,
    allPeriods,
    dailyTrend,
    weeklyTrend,
    loading,
    error,
    refresh
  } = useScorecardMetrics(userId);

  // Prospecting time tracking
  const { stats: timeStats, saveTimeEntry, loadTimeData } = useProspectingTime();

  // Load time data on mount
  useEffect(() => {
    loadTimeData();
  }, [loadTimeData]);

  // Sync local state with loaded data
  useEffect(() => {
    setHours(Math.floor(timeStats.todayMinutes / 60));
    setMinutes(timeStats.todayMinutes % 60);
  }, [timeStats.todayMinutes]);

  // Save time entry handler
  const handleSaveTime = async () => {
    setIsSavingTime(true);
    const totalMinutes = hours * 60 + minutes;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await saveTimeEntry(dateStr, totalMinutes);
    setIsSavingTime(false);
  };

  // Format time for display
  const formatTime = (totalMinutes: number) => {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  };

  // Get currently selected period data
  const getSelectedData = () => {
    switch (selectedPeriod) {
      case 'today': return today;
      case 'week': return week;
      case 'month': return month;
      case 'quarter': return quarter;
      case 'year': return year;
    }
  };

  const selectedData = getSelectedData();

  // Compact mode shows minimal UI
  if (mode === 'compact') {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Prospecting Scorecard</h3>
          {!readOnly && (
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 mb-2">{error}</p>
        )}

        <ScorecardSummaryCards
          today={today}
          week={week}
          month={month}
          quarter={quarter}
          year={year}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={readOnly ? undefined : setSelectedPeriod}
          compact
        />
      </div>
    );
  }

  // Embedded mode shows summary + one chart
  if (mode === 'embedded') {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Prospecting Scorecard</h3>
            {!readOnly && (
              <button
                onClick={refresh}
                disabled={loading}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <ScorecardSummaryCards
            today={today}
            week={week}
            month={month}
            quarter={quarter}
            year={year}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={readOnly ? undefined : setSelectedPeriod}
          />

          <div className="mt-6">
            <OutreachConnectionsChart data={allPeriods} height={200} />
          </div>
        </div>
      </div>
    );
  }

  // Full mode shows everything
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Master Prospecting Scorecard</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track your outreach activities and prospect engagement across time periods
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Prospecting Time Tracking */}
      {!readOnly && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Time Logged Today:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, Math.min(12, parseInt(e.target.value) || 0)))}
                  className="w-14 px-2 py-1.5 text-center border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500">hrs</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="5"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-14 px-2 py-1.5 text-center border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-500">min</span>
              </div>
              <button
                onClick={handleSaveTime}
                disabled={isSavingTime}
                className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isSavingTime ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                <CalendarDaysIcon className="w-4 h-4" />
                History
              </button>
            </div>

            <div className="flex items-center gap-6">
              {/* Weekly Total */}
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wide">This Week</div>
                <div className="text-lg font-semibold text-gray-900">{formatTime(timeStats.weekMinutes)}</div>
              </div>
              {/* Goal Progress */}
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Daily Goal</div>
                <div className="text-lg font-semibold text-gray-900">
                  {timeStats.todayPercentage}%
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    of {formatTime(timeStats.dailyGoalMinutes)}
                  </span>
                </div>
              </div>
              {/* Streak */}
              {timeStats.streak > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 rounded-lg">
                  <span className="text-lg">🔥</span>
                  <span className="text-sm font-semibold text-orange-600">{timeStats.streak} day streak</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Period Summary</h3>
        <ScorecardSummaryCards
          today={today}
          week={week}
          month={month}
          quarter={quarter}
          year={year}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={readOnly ? undefined : setSelectedPeriod}
        />

        {/* Selected Period Details */}
        {selectedData && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-8">
              {/* Outreach Breakdown */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Outreach Breakdown
                </h4>
                <div className="space-y-0">
                  <ActivityBreakdownRow
                    label="Emails"
                    count={selectedData.outreach.emails}
                    activityTypes={['email']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="LinkedIn"
                    count={selectedData.outreach.linkedin}
                    activityTypes={['linkedin']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="SMS"
                    count={selectedData.outreach.sms}
                    activityTypes={['sms']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="Voicemails"
                    count={selectedData.outreach.voicemail}
                    activityTypes={['voicemail']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="Call Connects"
                    count={selectedData.outreach.callConnects}
                    activityTypes={['call']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <div className="flex justify-between text-sm pt-2 mt-1 border-t border-gray-100">
                    <span className="font-medium text-gray-700">Total Outreach</span>
                    <span className="font-bold text-blue-600">{selectedData.outreach.total}</span>
                  </div>
                </div>
              </div>

              {/* Connections Breakdown */}
              <div>
                <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Connections Breakdown
                </h4>
                <div className="space-y-0">
                  <ActivityBreakdownRow
                    label="Call Connects"
                    count={selectedData.connections.calls}
                    activityTypes={['call']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="Meetings"
                    count={selectedData.connections.meetings}
                    activityTypes={['meeting']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="Email Replies"
                    count={selectedData.connections.emailResponses}
                    activityTypes={['email_response']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="LinkedIn Replies"
                    count={selectedData.connections.linkedinResponses}
                    activityTypes={['linkedin_response']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="SMS Replies"
                    count={selectedData.connections.smsResponses}
                    activityTypes={['sms_response']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <ActivityBreakdownRow
                    label="Return Calls"
                    count={selectedData.connections.returnCalls}
                    activityTypes={['return_call']}
                    startDate={selectedData.startDate}
                    endDate={selectedData.endDate}
                    userId={userId}
                  />
                  <div className="flex justify-between text-sm pt-2 mt-1 border-t border-gray-100">
                    <span className="font-medium text-gray-700">Total Connections</span>
                    <span className="font-bold text-green-600">{selectedData.connections.total}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Conversion Rate */}
            {selectedData.comparison && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Conversion Rate</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-gray-900">
                      {selectedData.comparison.conversionRate.toFixed(1)}%
                    </span>
                    {selectedData.comparison.previousConversionRate > 0 && (
                      <span className={`ml-2 text-sm ${
                        selectedData.comparison.conversionRate >= selectedData.comparison.previousConversionRate
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        vs {selectedData.comparison.previousConversionRate.toFixed(1)}% prev
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Comparison Bar Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Period Comparison</h3>
          <OutreachConnectionsChart data={allPeriods} height={280} />
        </div>

        {/* Activity Trend Chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Activity Trend</h3>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setTrendView('daily')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  trendView === 'daily'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setTrendView('weekly')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  trendView === 'weekly'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Weekly
              </button>
            </div>
          </div>
          <ActivityTrendChart
            data={trendView === 'daily' ? dailyTrend : weeklyTrend}
            height={280}
            showLegend
          />
        </div>
      </div>

      {/* Time History Modal */}
      <TimeHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onRefresh={loadTimeData}
      />
    </div>
  );
}
