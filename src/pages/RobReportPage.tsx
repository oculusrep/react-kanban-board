import React, { useEffect } from 'react';
import RobReport from '../components/reports/RobReport';

export default function RobReportPage() {
  useEffect(() => {
    document.title = "Rob Report | OVIS";
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <RobReport />
    </div>
  );
}
