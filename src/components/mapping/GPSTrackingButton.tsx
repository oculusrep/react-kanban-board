import React from 'react';

interface GPSTrackingButtonProps {
  isTracking: boolean;
  onToggle: () => void;
}

/**
 * Standalone GPS tracking button component
 * Fallback option if map controls don't work
 */
export const GPSTrackingButton: React.FC<GPSTrackingButtonProps> = ({ isTracking, onToggle }) => {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
    >
      {/* GPS Tracking Button */}
      <button
        onClick={onToggle}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '4px',
          border: 'none',
          backgroundColor: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          padding: '10px'
        }}
        title={isTracking ? 'Stop GPS tracking' : 'Start GPS tracking'}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f8f9fa';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#fff';
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="8"
            stroke={isTracking ? '#4285F4' : '#666'}
            strokeWidth="2"
            fill={isTracking ? '#4285F4' : 'none'}
          />
          <circle
            cx="12"
            cy="12"
            r="4"
            fill={isTracking ? 'white' : '#666'}
          />
        </svg>
      </button>
    </div>
  );
};

interface GPSControlsProps {
  isTracking: boolean;
  autoCenterEnabled: boolean;
  onToggleTracking: () => void;
  onToggleAutoCenter: () => void;
}

/**
 * Full GPS controls with auto-center button
 */
export const GPSControls: React.FC<GPSControlsProps> = ({
  isTracking,
  autoCenterEnabled,
  onToggleTracking,
  onToggleAutoCenter
}) => {
  console.log('🎮 GPSControls rendering:', { isTracking, autoCenterEnabled });

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        left: '152px', // Position flush to the right of Map/Satellite buttons (container width + margin)
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'row', // Horizontal layout
        gap: '4px',
        pointerEvents: 'auto'
      }}
      data-gps-react-controls="true"
    >
      {/* GPS Tracking Button */}
      <button
        onClick={onToggleTracking}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '3px',
          border: 'none',
          backgroundColor: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          padding: '0'
        }}
        title={isTracking ? 'Stop GPS tracking' : 'Start GPS tracking'}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f8f9fa';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#fff';
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="8"
            stroke={isTracking ? '#4285F4' : '#666'}
            strokeWidth="2"
            fill={isTracking ? '#4285F4' : 'none'}
          />
          <circle
            cx="12"
            cy="12"
            r="4"
            fill={isTracking ? 'white' : '#666'}
          />
        </svg>
      </button>

      {/* Auto-Center Button - only show when tracking */}
      {isTracking && (
        <button
          onClick={onToggleAutoCenter}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '3px',
            border: 'none',
            backgroundColor: '#fff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            padding: '0'
          }}
          title={autoCenterEnabled ? 'Auto-center: ON (click to disable)' : 'Auto-center: OFF (click to enable)'}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke={autoCenterEnabled ? '#4285F4' : '#999'}
              strokeWidth="2"
              fill="none"
            />
            <circle
              cx="12"
              cy="12"
              r="3"
              fill={autoCenterEnabled ? '#4285F4' : '#999'}
            />
          </svg>
        </button>
      )}
    </div>
  );
};
