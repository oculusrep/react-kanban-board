import { useState, useEffect } from 'react';
import RobReport from '../components/reports/RobReport';
import GoalDashboard from '../components/reports/GoalDashboard';

type ReportType = 'rob-report' | null;

interface ReportCard {
  id: ReportType;
  name: string;
  description: string;
  icon: string;
}

export default function CoachDashboardPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType>(null);

  useEffect(() => {
    document.title = "Coach Dashboard | OVIS";
  }, []);

  const reports: ReportCard[] = [
    {
      id: 'rob-report',
      name: 'Rob Report',
      description: 'Deal pipeline and commission summary by stage with broker net breakdowns',
      icon: '📈',
    },
    // Future reports can be added here
  ];

  // If a report is selected, show it
  if (selectedReport === 'rob-report') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mb-4">
          <button
            onClick={() => setSelectedReport(null)}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
        </div>
        <RobReport readOnly />
      </div>
    );
  }

  // Show report selection dashboard
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Coach Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Track progress and view reports
          </p>
        </div>

        {/* Goal Dashboard at the top */}
        <div className="mb-8">
          <GoalDashboard />
        </div>

        {/* Reports Section */}
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Reports</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reports.map((report) => (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 text-left border border-gray-200 hover:border-blue-500"
            >
              <div className="flex items-start space-x-4">
                <div className="text-4xl">{report.icon}</div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    {report.name}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {report.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
