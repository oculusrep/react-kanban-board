/**
 * Google Maps Ruler Tool - Mobile-Friendly
 *
 * Mimics the native Google Maps "Measure distance" feature
 * Click/tap to add points, shows distance between points and total distance
 * Optimized for both desktop and mobile devices
 */

import React from 'react';
import { Ruler } from 'lucide-react';

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
        left: '240px', // Position to the right of GPS controls (152px + 40px + 4px gap + 40px + 4px gap)
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
            backgroundColor: isActive ? '#1a73e8' : '#fff',
            color: isActive ? '#fff' : 'rgb(25,25,25)',
            border: 'none',
            cursor: 'pointer',
            padding: '0',
            width: '40px',
            height: '40px',
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
              e.currentTarget.style.backgroundColor = '#fff';
            }
          }}
        >
          <Ruler size={24} strokeWidth={2} style={{ transform: 'rotate(90deg)' }} />
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
          Click points to measure distance
          <br />
          <span style={{ fontSize: '11px', opacity: 0.8 }}>
            Press ESC or click ruler to finish
          </span>
        </div>
      )}
    </div>
  );
};
