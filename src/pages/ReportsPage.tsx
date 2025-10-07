import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

interface ReportCard {
  id: string;
  name: string;
  description: string;
  route: string;
  icon: string;
}

export default function ReportsPage() {
  const navigate = useNavigate();

  // Set page title
  useEffect(() => {
    document.title = "Reports | OVIS";
  }, []);

  const reports: ReportCard[] = [
    {
      id: "deal-compare",
      name: "Deal Compare Report",
      description: "Export all deals with commission details for Salesforce comparison",
      route: "/reports/deal-compare",
      icon: "💼"
    },
    {
      id: "deal-compare-salesforce",
      name: "Deal Compare to Salesforce",
      description: "Compare CRM deals with Salesforce data side-by-side, highlighting discrepancies",
      route: "/reports/deal-compare-salesforce",
      icon: "🔍"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="mt-2 text-gray-600">
            Select a report to view or export data
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <button
              key={report.id}
              onClick={() => navigate(report.route)}
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
