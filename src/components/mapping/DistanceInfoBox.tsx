/**
 * Custom Distance Info Box Component
 *
 * Replaces Google Maps InfoWindow with a custom React component
 * for complete styling control and tight spacing
 */

import React from 'react';
import { X } from 'lucide-react';
import { formatDistance, StraightLineDistance, DrivingDistanceResult } from '../../services/distanceService';

interface DistanceInfoBoxProps {
  position: { x: number; y: number }; // Pixel coordinates on screen
  straightDistance: StraightLineDistance;
  drivingDistance: DrivingDistanceResult | null;
  selectedTime: 'now' | 'morning' | 'evening' | 'weekend';
  onTimeChange: (time: 'now' | 'morning' | 'evening' | 'weekend') => void;
  onClose: () => void;
}

export const DistanceInfoBox: React.FC<DistanceInfoBoxProps> = ({
  position,
  straightDistance,
  drivingDistance,
  selectedTime,
  onTimeChange,
  onClose,
}) => {
  const getTimeLabel = (time: 'now' | 'morning' | 'evening' | 'weekend'): string => {
    switch (time) {
      case 'now': return 'Now';
      case 'morning': return 'Morning';
      case 'evening': return 'Evening';
      case 'weekend': return 'Weekend';
      default: return 'Now';
    }
  };

  const timeLabel = getTimeLabel(selectedTime);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)', // Center horizontally, position above point
        marginTop: '-10px', // Add small gap above the point
        zIndex: 10000,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '4px',
          boxShadow: '0 2px 7px 1px rgba(0,0,0,0.3)',
          fontFamily: 'Roboto, Arial, sans-serif',
          minWidth: '220px',
          position: 'relative',
        }}
      >
        {/* Header with close button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '13px',
              fontWeight: 600,
              color: '#202124',
            }}
          >
            Distance Details
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '2px',
              color: '#5f6368',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f1f3f4';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '8px 10px 10px 10px' }}>
          {/* Straight line distance */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span style={{ color: '#5f6368', fontSize: '12px' }}>As crow flies:</span>
            <strong style={{ color: '#202124', fontSize: '12px' }}>
              {formatDistance(straightDistance)}
            </strong>
          </div>

          {/* Driving distance and time */}
          {drivingDistance ? (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                }}
              >
                <span style={{ color: '#5f6368', fontSize: '12px' }}>Driving distance:</span>
                <strong style={{ color: '#1a73e8', fontSize: '12px' }}>
                  {drivingDistance.distance.text}
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span style={{ color: '#5f6368', fontSize: '12px' }}>
                  Travel time ({timeLabel}):
                </span>
                <strong
                  style={{
                    color:
                      drivingDistance.durationInTraffic &&
                      drivingDistance.durationInTraffic.value > drivingDistance.duration.value
                        ? '#ea4335'
                        : '#202124',
                    fontSize: '12px',
                  }}
                >
                  {drivingDistance.durationInTraffic
                    ? drivingDistance.durationInTraffic.text
                    : drivingDistance.duration.text}
                </strong>
              </div>

              {/* Time selector buttons */}
              <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '8px' }}>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#5f6368',
                    marginBottom: '6px',
                  }}
                >
                  Check traffic at:
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '4px',
                  }}
                >
                  {(['now', 'morning', 'evening', 'weekend'] as const).map((time) => (
                    <button
                      key={time}
                      onClick={() => onTimeChange(time)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        border: '1px solid #dadce0',
                        borderRadius: '3px',
                        backgroundColor: selectedTime === time ? '#e8f0fe' : '#fff',
                        cursor: 'pointer',
                        color: '#202124',
                        fontFamily: 'Roboto, Arial, sans-serif',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedTime !== time) {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedTime !== time) {
                          e.currentTarget.style.backgroundColor = '#fff';
                        }
                      }}
                    >
                      {time === 'now' && 'Now'}
                      {time === 'morning' && 'Morning (8 AM)'}
                      {time === 'evening' && 'Evening (5 PM)'}
                      {time === 'weekend' && 'Weekend'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: '#5f6368', fontSize: '12px', fontStyle: 'italic' }}>
              Loading driving data...
            </div>
          )}
        </div>

        {/* Triangle pointer */}
        <div
          style={{
            position: 'absolute',
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid #fff',
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))',
          }}
        />
      </div>
    </div>
  );
};
