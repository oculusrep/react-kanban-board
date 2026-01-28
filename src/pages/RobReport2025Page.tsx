import { useEffect } from 'react';
import RobReport2025 from '../components/reports/RobReport2025';

export default function RobReport2025Page() {
  useEffect(() => {
    document.title = '2025 Rob Report | OVIS';
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <RobReport2025 />
    </div>
  );
}
