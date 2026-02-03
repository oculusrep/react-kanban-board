import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ArtyDrawReport from '../components/reports/ArtyDrawReport';

export default function ArtyDrawReportPage() {
  const navigate = useNavigate();

  // Set page title
  useEffect(() => {
    document.title = "Arty's Draw Account | OVIS";
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4 flex items-center">
            <button
              onClick={() => navigate('/reports')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Reports
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ArtyDrawReport />
      </div>
    </div>
  );
}
