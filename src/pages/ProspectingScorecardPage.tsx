/**
 * Prospecting Scorecard Report Page
 *
 * Standalone report page showing the Master Prospecting Scorecard
 * with full metrics and charts.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { MasterScorecard } from '../components/scorecard';

export default function ProspectingScorecardPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Prospecting Scorecard | OVIS';
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => navigate('/reports')}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Reports
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <MasterScorecard mode="full" />
      </div>
    </div>
  );
}
