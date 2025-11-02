/**
 * Google Maps Ruler Tool
 *
 * Mimics the native Google Maps "Measure distance" feature
 * Click to add points, shows distance between points and total distance
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
        top: '10px',
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
          style={{
            backgroundColor: isActive ? '#1a73e8' : 'transparent',
            color: isActive ? '#fff' : 'rgb(25,25,25)',
            border: 'none',
            cursor: 'pointer',
            padding: '10px 12px',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Roboto,Arial,sans-serif',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s',
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
          {/* Ruler icon SVG */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
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
    </div>
  );
};
