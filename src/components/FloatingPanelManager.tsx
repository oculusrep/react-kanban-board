// components/FloatingPanelManager.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

export type PanelType = 'contacts' | 'notes' | 'files' | 'activity' | 'payments';

interface PanelState {
  activePanel: PanelType | null;
  openPanel: (panel: PanelType) => void;
  closePanel: () => void;
  togglePanel: (panel: PanelType) => void;
}

const PanelContext = createContext<PanelState | null>(null);

export const usePanelManager = () => {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelManager must be used within a FloatingPanelManager');
  }
  return context;
};

interface FloatingPanelManagerProps {
  children: ReactNode;
}

export const FloatingPanelManager: React.FC<FloatingPanelManagerProps> = ({ children }) => {
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);

  const openPanel = (panel: PanelType) => {
    setActivePanel(panel);
  };

  const closePanel = () => {
    setActivePanel(null);
  };

  const togglePanel = (panel: PanelType) => {
    if (activePanel === panel) {
      closePanel();
    } else {
      openPanel(panel);
    }
  };

  return (
    <PanelContext.Provider value={{ activePanel, openPanel, closePanel, togglePanel }}>
      {children}
    </PanelContext.Provider>
  );
};