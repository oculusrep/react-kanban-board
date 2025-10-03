import React from 'react';

interface SidebarModuleProps {
  title: string;
  count: number;
  onAddNew?: () => void;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  icon?: string;
  isEmpty?: boolean;
  showAddButton?: boolean;
}

const SidebarModule: React.FC<SidebarModuleProps> = ({
  title,
  count,
  onAddNew,
  children,
  isExpanded = true,
  onToggle,
  icon,
  isEmpty = false,
  showAddButton = true
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
      {showAddButton && onAddNew && (
        <button
          onClick={onAddNew}
          className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ml-2"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      )}
    </div>
    {isExpanded && (
      <div className="max-h-96 overflow-y-auto">
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

export default SidebarModule;
