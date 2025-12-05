import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProspectingDashboard from '../components/reports/ProspectingDashboard';
import TodaysPlan from '../components/prospecting/TodaysPlan';
import TargetList from '../components/prospecting/TargetList';
import {
  CalendarDaysIcon,
  ChartBarIcon,
  BuildingOffice2Icon
} from '@heroicons/react/24/outline';

type TabType = 'today' | 'activity' | 'targets';

export default function ProspectingDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabType) || 'today';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    document.title = "Prospecting | OVIS";
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const tabs = [
    {
      id: 'today' as TabType,
      label: "Today's Plan",
      icon: CalendarDaysIcon,
      description: 'Your daily prospecting plan'
    },
    {
      id: 'activity' as TabType,
      label: 'Activity Report',
      icon: ChartBarIcon,
      description: 'Track completed activities'
    },
    {
      id: 'targets' as TabType,
      label: 'Target List',
      icon: BuildingOffice2Icon,
      description: 'Manage prospecting targets'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Prospecting</h1>
            <p className="mt-1 text-gray-600">
              Manage your business development pipeline
            </p>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 border-b border-gray-200 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'today' && <TodaysPlan />}
        {activeTab === 'activity' && <ProspectingDashboard />}
        {activeTab === 'targets' && <TargetList />}
      </div>
    </div>
  );
}
