import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

interface ReportCard {
  id: string;
  name: string;
  description: string;
  route: string;
  icon: string;
  adminOnly?: boolean;
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  // Set page title
  useEffect(() => {
    document.title = "Reports | OVIS";
  }, []);

  const reports: ReportCard[] = [
    {
      id: "deal-reconciliation",
      name: "Deal Reconciliation",
      description: "Compare OVIS deals with Salesforce at deal level: values, fees, commission rates, and key dates",
      route: "/reports/deal-reconciliation",
      icon: "📊"
    },
    {
      id: "payment-reconciliation",
      name: "Payment Reconciliation",
      description: "Compare OVIS payments with Salesforce data, track variances, and reconcile commission splits",
      route: "/reports/payment-reconciliation",
      icon: "💰"
    },
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
    },
    {
      id: "property-data-quality",
      name: "Property Data Quality",
      description: "Review properties with missing location (lat/long) or address data",
      route: "/reports/property-data-quality",
      icon: "🏢"
    },
    {
      id: "assignments",
      name: "Assignments Report",
      description: "View and filter all assignments by client and trade area",
      route: "/reports/assignments",
      icon: "📋"
    },
    {
      id: "site-submit-dashboard",
      name: "Site Submit Dashboard",
      description: "View and filter site submits with property details, SQFT, and NNN",
      route: "/reports/site-submit-dashboard",
      icon: "📍"
    },
    {
      id: "dropbox-sync-admin",
      name: "Dropbox Sync Status",
      description: "Monitor and fix property name sync issues between CRM and Dropbox (Admin Only)",
      route: "/reports/dropbox-sync-admin",
      icon: "☁️",
      adminOnly: true
    }
  ];

  // Filter reports based on user role
  const visibleReports = reports.filter(report => {
    if (report.adminOnly) {
      console.log('🔍 Admin-only report:', report.name, 'User role:', userRole, 'Is admin:', userRole === 'admin');
      return userRole === 'admin';
    }
    return true;
  });

  console.log('👤 Current user role:', userRole);
  console.log('📊 Total reports:', reports.length, 'Visible reports:', visibleReports.length);

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
          {visibleReports.map((report) => (
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
