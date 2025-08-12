// components/FloatingPanelContainer.tsx - With Dynamic Counts
import React, { ReactNode } from 'react';
import { usePanelManager, PanelType } from './FloatingPanelManager';

interface FloatingPanelContainerProps {
  children: ReactNode;
  dealId?: string; // Add dealId prop to get actual counts
  contactCount?: number;
  notesCount?: number;
  filesCount?: number;
  activityCount?: number;
  paymentsCount?: number;
}

interface PanelButtonProps {
  type: PanelType;
  icon: string;
  count?: number;
  label: string;
  position: number;
}

const PanelButton: React.FC<PanelButtonProps> = ({ type, icon, count, label, position }) => {
  const { activePanel, togglePanel } = usePanelManager();
  const isActive = activePanel === type;

  return (
    <div className="relative group">
      <button
        onClick={() => togglePanel(type)}
        className={`
          relative flex items-center justify-center w-10 h-10 rounded-full shadow-md
          transition-all duration-300 ease-out hover:scale-110 hover:shadow-lg
          backdrop-blur-sm border
          ${isActive 
            ? 'bg-blue-600 text-white border-blue-500 shadow-blue-200' 
            : 'bg-white/90 text-gray-600 hover:bg-white border-gray-200 hover:text-gray-800'
          }
        `}
        title={label}
      >
        <span className="text-sm">{icon}</span>
        
        {/* Count Badge - Only show if count > 0 */}
        {count !== undefined && count > 0 && (
          <span className={`
            absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-medium rounded-full
            border-2 border-white
            ${isActive ? 'bg-white text-blue-600' : 'bg-red-500 text-white'}
          `}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Tooltip */}
      <div className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
        {label}
        {count !== undefined && (
          <span className="ml-1 text-gray-300">({count})</span>
        )}
        <div className="absolute left-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-4 border-l-gray-900 border-t-4 border-t-transparent border-b-4 border-b-transparent"></div>
      </div>
    </div>
  );
};

export const FloatingPanelContainer: React.FC<FloatingPanelContainerProps> = ({ 
  children, 
  contactCount = 0,
  notesCount = 0,
  filesCount = 0,
  activityCount = 0,
  paymentsCount = 0
}) => {
  return (
    <div className="relative">
      {/* Main Content */}
      {children}

      {/* Floating Panel Buttons - With Real Counts */}
      <div className="fixed right-4 top-1/2 transform -translate-y-1/2 space-y-3" style={{ zIndex: 50 }}>
        <PanelButton type="contacts" icon="👥" count={contactCount} label="Contact Roles" position={0} />
        <PanelButton type="notes" icon="📝" count={notesCount} label="Notes" position={1} />
        <PanelButton type="files" icon="📎" count={filesCount} label="Files" position={2} />
        <PanelButton type="activity" icon="📈" count={activityCount} label="Activity" position={3} />
        <PanelButton type="payments" icon="💰" count={paymentsCount} label="Payments" position={4} />
      </div>
    </div>
  );
};