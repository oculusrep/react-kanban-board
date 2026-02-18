/**
 * Master Prospecting Scorecard
 *
 * Comprehensive view of outreach vs connections metrics across multiple time periods.
 * Can be used as:
 * - Full page in Hunter Dashboard
 * - Standalone report page
 * - Embedded widget in Coach Dashboard
 */

import { useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useScorecardMetrics } from '../../hooks/useScorecardMetrics';
import { MasterScorecardProps, ScorecardPeriod } from '../../types/scorecard';
import ScorecardSummaryCards from './ScorecardSummaryCards';
import OutreachConnectionsChart from './OutreachConnectionsChart';
import ActivityTrendChart from './ActivityTrendChart';

export default function MasterScorecard({
  mode = 'full',
  readOnly = false,
  defaultPeriod = 'week',
  userId,
  className = ''
}: MasterScorecardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<ScorecardPeriod>(defaultPeriod);
  const [trendView, setTrendView] = useState<'daily' | 'weekly'>('daily');

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
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Emails</span>
                    <span className="font-medium text-gray-900">{selectedData.outreach.emails}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">LinkedIn</span>
                    <span className="font-medium text-gray-900">{selectedData.outreach.linkedin}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">SMS</span>
                    <span className="font-medium text-gray-900">{selectedData.outreach.sms}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Voicemails</span>
                    <span className="font-medium text-gray-900">{selectedData.outreach.voicemail}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
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
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Calls</span>
                    <span className="font-medium text-gray-900">{selectedData.connections.calls}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Meetings</span>
                    <span className="font-medium text-gray-900">{selectedData.connections.meetings}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Email Replies</span>
                    <span className="font-medium text-gray-900">{selectedData.connections.emailResponses}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">LinkedIn Replies</span>
                    <span className="font-medium text-gray-900">{selectedData.connections.linkedinResponses}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">SMS Replies</span>
                    <span className="font-medium text-gray-900">{selectedData.connections.smsResponses}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Return Calls</span>
                    <span className="font-medium text-gray-900">{selectedData.connections.returnCalls}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
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
    </div>
  );
}
