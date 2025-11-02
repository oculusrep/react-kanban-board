/**
 * Google Maps Ruler Tool - Mobile-Friendly
 *
 * Mimics the native Google Maps "Measure distance" feature
 * Click/tap to add points, shows distance between points and total distance
 * Optimized for both desktop and mobile devices
 */

import React from 'react';

interface RulerToolProps {
  isActive: boolean;
  onToggle: () => void;
}

export const RulerTool: React.FC<RulerToolProps> = ({ isActive, onToggle }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '70px', // Position below GPS controls
        right: '10px',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '3px',
          boxShadow: '0 2px 6px rgba(0,0,0,.3)',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={onToggle}
          title={isActive ? "Stop measuring" : "Measure distance"}
          aria-label={isActive ? "Stop measuring" : "Measure distance"}
          style={{
            backgroundColor: isActive ? '#1a73e8' : 'transparent',
            color: isActive ? '#fff' : 'rgb(25,25,25)',
            border: 'none',
            cursor: 'pointer',
            padding: '12px',
            minWidth: '48px',
            minHeight: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Roboto,Arial,sans-serif',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s',
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation',
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.backgroundColor = '#f8f9fa';
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 4 L20 20" />
            <circle cx="4" cy="4" r="2" fill="currentColor" stroke="none" />
            <circle cx="20" cy="20" r="2" fill="currentColor" stroke="none" />
            <line x1="8" y1="8" x2="9" y2="9" />
            <line x1="12" y1="12" x2="13" y2="13" />
            <line x1="16" y1="16" x2="17" y2="17" />
          </svg>
        </button>
      </div>

      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: '56px',
            right: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            fontFamily: 'Roboto,Arial,sans-serif',
            boxShadow: '0 2px 6px rgba(0,0,0,.3)',
            pointerEvents: 'none',
          }}
        >
          Tap/click on map to measure
          <br />
          <span style={{ fontSize: '11px', opacity: 0.8 }}>
            Tap points to remove them
          </span>
        </div>
      )}
    </div>
  );
};
