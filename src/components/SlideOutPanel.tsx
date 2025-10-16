import React, { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface SlideOutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string; // e.g., '500px', '50%', etc.
  canMinimize?: boolean;
}

export default function SlideOutPanel({
  isOpen,
  onClose,
  title,
  children,
  width = '600px',
  canMinimize = true
}: SlideOutPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actualWidth = isMinimized ? '48px' : width;

  return (
    <>
      {/* Overlay - only show when not minimized */}
      {!isMinimized && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-out panel */}
      <div
        className="fixed top-0 right-0 h-full bg-white shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col"
        style={{ width: actualWidth, maxWidth: isMinimized ? '48px' : '90vw' }}
      >
        {/* Minimize/Expand Button */}
        {canMinimize && (
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 bg-white border border-r-0 border-gray-300 rounded-l-lg p-2 hover:bg-gray-50 transition-colors shadow-md"
            aria-label={isMinimized ? 'Expand panel' : 'Minimize panel'}
          >
            {isMinimized ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        )}

        {/* Header */}
        {!isMinimized && (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                aria-label="Close panel"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {children}
            </div>
          </>
        )}

        {/* Minimized state - show title vertically */}
        {isMinimized && (
          <div className="flex-1 flex items-center justify-center">
            <div className="transform -rotate-90 whitespace-nowrap text-sm font-medium text-gray-700">
              {title}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
