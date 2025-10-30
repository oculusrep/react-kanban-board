import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import SiteSubmitFormModal from './SiteSubmitFormModal';
import SiteSubmitSidebar from './SiteSubmitSidebar';
import SiteSubmitItem from './sidebar/SiteSubmitItem';

type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];

interface AssignmentSidebarProps {
  assignmentId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onSiteSubmitModalChange?: (isOpen: boolean) => void;
}

// Sidebar Module Component (reused from PropertySidebar)
interface SidebarModuleProps {
  title: string;
  count: number;
  onAddNew: () => void;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  icon?: string;
  isEmpty?: boolean;
}

const SidebarModule: React.FC<SidebarModuleProps> = ({
  title,
  count,
  onAddNew,
  children,
  isExpanded = true,
  onToggle,
  icon,
  isEmpty = false
}) => (
  <div className={`bg-white border border-gray-200 rounded-lg mb-3 shadow-sm ${isEmpty ? 'opacity-60' : ''}`}>
    <div className={`flex items-center justify-between p-3 border-b border-gray-100 ${
      isEmpty ? 'bg-gray-50' : 'bg-gradient-to-r from-slate-50 to-gray-50'
    }`}>
      <button
        onClick={onToggle}
        className="flex items-center space-x-2 flex-1 text-left hover:bg-white/50 -mx-3 px-3 py-1 rounded-t-lg transition-colors"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {icon && (
          <div className="w-4 h-4 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
        )}
        <h4 className="font-medium text-gray-900 text-sm">{title}</h4>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
          isEmpty ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'
        }`}>
          {count}
        </span>
        {isEmpty && (
          <span className="text-xs text-gray-500 italic">(Empty)</span>
        )}
      </button>
      <button
        onClick={onAddNew}
        className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ml-2"
      >
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>
    </div>
    {isExpanded && (
      <div className="max-h-[560px] overflow-y-auto">
        {count === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
              {icon && (
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
              )}
            </div>
            No {title.toLowerCase()} yet
          </div>
        ) : (
          children
        )}
      </div>
    )}
  </div>
);

const AssignmentSidebar: React.FC<AssignmentSidebarProps> = ({
  assignmentId,
  isMinimized = false,
  onMinimize,
  onSiteSubmitModalChange
}) => {
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSiteSubmitModal, setShowSiteSubmitModal] = useState(false); // For creating new
  const [siteSubmitSidebarOpen, setSiteSubmitSidebarOpen] = useState(false); // For viewing existing
  const [siteSubmitSidebarId, setSiteSubmitSidebarId] = useState<string | null>(null);
  const [siteSubmitSidebarMinimized, setSiteSubmitSidebarMinimized] = useState(false);

  // Expansion state for site submits
  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem(`expandedSidebarModules_assignment_${assignmentId}`);
    return saved ? JSON.parse(saved) : { siteSubmits: true };
  });

  // Load site submits data
  useEffect(() => {
    if (!assignmentId || assignmentId === 'new') {
      // For new assignments, start with empty data but still show sidebar
      setSiteSubmits([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load site submits associated with this assignment
        const { data: siteSubmitsData, error: siteSubmitsError } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (
              client_name
            ),
            property_unit (
              property_unit_name
            ),
            submit_stage!site_submit_submit_stage_id_fkey (
              name
            )
          `)
          .eq('assignment_id', assignmentId)
          .order('created_at', { ascending: false });

        if (siteSubmitsError) throw siteSubmitsError;
        setSiteSubmits(siteSubmitsData || []);

      } catch (err) {
        console.error('Error loading assignment sidebar data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [assignmentId]);

  // Update expansion state when data changes
  useEffect(() => {
    if (!loading) {
      setExpandedSidebarModules(prev => {
        const defaults = { siteSubmits: siteSubmits.length > 0 };
        const saved = localStorage.getItem(`expandedSidebarModules_assignment_${assignmentId}`);
        return saved ? JSON.parse(saved) : defaults;
      });
    }
  }, [siteSubmits.length, loading, assignmentId]);

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    const newState = {
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    };
    setExpandedSidebarModules(newState);
    localStorage.setItem(`expandedSidebarModules_assignment_${assignmentId}`, JSON.stringify(newState));
  };


  return (
    <>
      <div 
        className={`fixed right-0 bg-white border-l border-gray-200 shadow-xl transition-all duration-300 ${
          isMinimized ? 'w-12' : 'w-[500px]'
        } z-40 ${isMinimized ? 'overflow-hidden' : 'overflow-visible'}`}
        style={{ 
          top: '180px',
          height: isMinimized ? '60px' : `${Math.min(120 + (siteSubmits.length * 52), 120 + (10 * 52))}px`
        }}
      >
        {/* Header with minimize/expand controls */}
        <div className={`flex items-center ${isMinimized ? 'justify-center' : 'justify-between'} p-2 border-b border-gray-200 bg-gray-50`}>
          {!isMinimized && (
            <h3 className="text-sm font-medium text-gray-700">Assignment Info</h3>
          )}
          <button
            onClick={onMinimize}
            className={`p-2 hover:bg-blue-100 hover:text-blue-600 rounded-md transition-colors group ${
              isMinimized ? 'text-gray-600' : 'text-gray-500'
            }`}
            title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMinimized ? (
                // Expand icon - panel expand right
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M4 12h16" />
              ) : (
                // Minimize icon - panel collapse right  
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M20 12H4" />
              )}
            </svg>
          </button>
        </div>
        
        {/* Sidebar Content */}
        {!isMinimized && (
          <div className="p-3">
            {loading ? (
              <div className="p-4 space-y-3">
                <div className="animate-pulse">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-red-600">
                <p className="font-medium">Error loading data</p>
                <p className="text-sm">{error}</p>
              </div>
            ) : (
              <>
                {/* Site Submits - Only module in assignment sidebar */}
                <SidebarModule
                  title="Associated Site Submits"
                  count={siteSubmits.length}
                  onAddNew={() => {
                    if (assignmentId === 'new') {
                      alert('Please save the assignment first before adding site submits.');
                      return;
                    }
                    setShowSiteSubmitModal(true);
                    onSiteSubmitModalChange?.(true);
                  }}
                  isExpanded={expandedSidebarModules.siteSubmits}
                  onToggle={() => toggleSidebarModule('siteSubmits')}
                  icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  isEmpty={siteSubmits.length === 0}
                >
                  {siteSubmits.map(siteSubmit => (
                    <SiteSubmitItem
                      key={siteSubmit.id}
                      siteSubmit={siteSubmit}
                      onClick={(id) => {
                        setSiteSubmitSidebarId(id);
                        setSiteSubmitSidebarOpen(true);
                        setSiteSubmitSidebarMinimized(false);
                        onSiteSubmitModalChange?.(true);
                      }}
                    />
                  ))}
                </SidebarModule>
              </>
            )}
          </div>
        )}
      </div>

      {/* Site Submit Form Modal - For creating new site submits */}
      {assignmentId !== 'new' && (
        <SiteSubmitFormModal
          isOpen={showSiteSubmitModal}
          onClose={() => {
            setShowSiteSubmitModal(false);
            onSiteSubmitModalChange?.(false);
          }}
          assignmentId={assignmentId}
          onSave={(newSiteSubmit) => {
            setSiteSubmits(prev => [newSiteSubmit, ...prev]);
            setShowSiteSubmitModal(false);
            onSiteSubmitModalChange?.(false);
          }}
        />
      )}

      {/* Site Submit Sidebar - For viewing existing site submits */}
      {siteSubmitSidebarOpen && siteSubmitSidebarId && (
        <SiteSubmitSidebar
          siteSubmitId={siteSubmitSidebarId}
          isMinimized={siteSubmitSidebarMinimized}
          onMinimize={() => setSiteSubmitSidebarMinimized(!siteSubmitSidebarMinimized)}
          onClose={() => {
            setSiteSubmitSidebarOpen(false);
            setSiteSubmitSidebarId(null);
            onSiteSubmitModalChange?.(false);
          }}
        />
      )}
    </>
  );
};

export default AssignmentSidebar;