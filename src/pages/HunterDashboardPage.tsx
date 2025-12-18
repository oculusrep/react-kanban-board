import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  UserGroupIcon,
  NewspaperIcon,
  EnvelopeIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import HunterLeadsTab from '../components/hunter/HunterLeadsTab';
import HunterSourcesTab from '../components/hunter/HunterSourcesTab';
import HunterOutreachTab from '../components/hunter/HunterOutreachTab';
import HunterStatsTab from '../components/hunter/HunterStatsTab';

type TabType = 'leads' | 'sources' | 'outreach' | 'stats';

export default function HunterDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabType) || 'leads';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    document.title = "Hunter | OVIS";
  }, []);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const tabs = [
    {
      id: 'leads' as TabType,
      label: 'Leads',
      icon: UserGroupIcon,
      description: 'View and manage AI-discovered leads'
    },
    {
      id: 'sources' as TabType,
      label: 'Sources',
      icon: NewspaperIcon,
      description: 'Monitor news scrapers and content sources'
    },
    {
      id: 'outreach' as TabType,
      label: 'Outreach',
      icon: EnvelopeIcon,
      description: 'Review and approve outreach drafts'
    },
    {
      id: 'stats' as TabType,
      label: 'Stats',
      icon: ChartBarIcon,
      description: 'Hunter performance metrics'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Hunter</h1>
                <p className="text-gray-600">
                  AI-powered prospecting agent for commercial real estate
                </p>
              </div>
            </div>
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
                      ? 'border-orange-600 text-orange-600'
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
        {activeTab === 'leads' && <HunterLeadsTab />}
        {activeTab === 'sources' && <HunterSourcesTab />}
        {activeTab === 'outreach' && <HunterOutreachTab />}
        {activeTab === 'stats' && <HunterStatsTab />}
      </div>
    </div>
  );
}
