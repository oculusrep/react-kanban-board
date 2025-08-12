// components/FloatingPanelContainer.tsx
import React, { ReactNode } from 'react';
import { usePanelManager, PanelType } from './FloatingPanelManager';

interface FloatingPanelContainerProps {
  children: ReactNode;
}

interface PanelButtonProps {
  type: PanelType;
  icon: string;
  count?: number;
  label: string;
  position: number; // 0 = top, 1 = second, etc.
}

const PanelButton: React.FC<PanelButtonProps> = ({ type, icon, count, label, position }) => {
  const { activePanel, togglePanel } = usePanelManager();
  const isActive = activePanel === type;

  return (
    <button
      onClick={() => togglePanel(type)}
      className={`
        relative group flex items-center justify-center w-12 h-12 rounded-l-lg shadow-lg
        transition-all duration-200 ease-in-out hover:w-16
        ${isActive 
          ? 'bg-blue-600 text-white shadow-xl scale-105' 
          : 'bg-white text-gray-600 hover:bg-gray-50 hover:shadow-xl border border-gray-200'
        }
      `}
      style={{ 
        right: 0,
        top: `${60 + (position * 60)}px`,
        zIndex: 1000 
      }}
      title={label}
    >
      <span className="text-lg">{icon}</span>
      
      {/* Count Badge */}
      {count !== undefined && count > 0 && (
        <span className={`
          absolute -top-1 -left-1 flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full
          ${isActive ? 'bg-white text-blue-600' : 'bg-red-500 text-white'}
        `}>
          {count > 99 ? '99+' : count}
        </span>
      )}

      {/* Tooltip */}
      <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
        {label}
      </div>
    </button>
  );
};

export const FloatingPanelContainer: React.FC<FloatingPanelContainerProps> = ({ children }) => {
  return (
    <div className="relative">
      {/* Main Content */}
      {children}

      {/* Floating Panel Buttons */}
      <div className="fixed right-0 top-1/2 transform -translate-y-1/2 space-y-2" style={{ zIndex: 1000 }}>
        <PanelButton type="contacts" icon="👥" count={3} label="Contact Roles" position={0} />
        <PanelButton type="notes" icon="📝" count={2} label="Notes" position={1} />
        <PanelButton type="files" icon="📎" count={4} label="Files" position={2} />
        <PanelButton type="activity" icon="📈" count={1} label="Activity" position={3} />
        <PanelButton type="payments" icon="💰" count={0} label="Payments" position={4} />
      </div>
    </div>
  );
};