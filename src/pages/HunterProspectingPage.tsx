// Hunter Prospecting Dashboard Page
// src/pages/HunterProspectingPage.tsx

import { useEffect } from 'react';
import ProspectingDashboard from '../components/hunter/ProspectingDashboard';

export default function HunterProspectingPage() {
  useEffect(() => {
    document.title = "Hunter Prospecting | OVIS";
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProspectingDashboard />
      </div>
    </div>
  );
}
