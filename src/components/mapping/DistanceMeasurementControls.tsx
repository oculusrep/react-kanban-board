/**
 * Distance Measurement Controls Component
 *
 * Provides UI controls for measuring distances on the map:
 * - Toggle measurement mode
 * - Change travel mode (driving, walking, bicycling, transit)
 * - Display measurement results
 * - Clear measurements
 */

import React, { useState } from 'react';
import { TravelMode } from '../../services/distanceService';

interface MeasurementInfo {
  straightLineDistance: string;
  drivingDistance?: string;
  duration?: string;
  durationInTraffic?: string;
}

interface DistanceMeasurementControlsProps {
  isActive: boolean;
  hasPoints: boolean;
  pointCount: number;
  mode: TravelMode;
  calculating: boolean;
  measurementInfo?: MeasurementInfo;
  onToggleMeasurement: () => void;
  onChangeTravelMode: (mode: TravelMode) => void;
  onClearPoints: () => void;
  onRemoveLastPoint: () => void;
}

export const DistanceMeasurementControls: React.FC<DistanceMeasurementControlsProps> = ({
  isActive,
  hasPoints,
  pointCount,
  mode,
  calculating,
  measurementInfo,
  onToggleMeasurement,
  onChangeTravelMode,
  onClearPoints,
  onRemoveLastPoint,
}) => {
  const [showModeSelector, setShowModeSelector] = useState(false);

  const travelModes: { mode: TravelMode; label: string; icon: string }[] = [
    { mode: 'DRIVING', label: 'Driving', icon: '🚗' },
    { mode: 'WALKING', label: 'Walking', icon: '🚶' },
    { mode: 'BICYCLING', label: 'Bicycling', icon: '🚴' },
    { mode: 'TRANSIT', label: 'Transit', icon: '🚇' },
  ];

  const currentModeInfo = travelModes.find(m => m.mode === mode);

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1000,
        maxWidth: '320px',
      }}
    >
      {/* Main Distance Measurement Button */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '3px',
          boxShadow: '0 2px 6px rgba(0,0,0,.3)',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={onToggleMeasurement}
          style={{
            backgroundColor: isActive ? '#1a73e8' : 'transparent',
            color: isActive ? '#fff' : 'rgb(25,25,25)',
            border: 'none',
            cursor: 'pointer',
            padding: '12px 16px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 4l7 7M20 4l-7 7M4 20l7-7" />
            <circle cx="4" cy="4" r="2" fill="currentColor" />
            <circle cx="20" cy="4" r="2" fill="currentColor" />
            <circle cx="4" cy="20" r="2" fill="currentColor" />
          </svg>
          <span>{isActive ? 'Stop Measuring' : 'Measure Distance'}</span>
        </button>
      </div>

      {/* Active Measurement Panel */}
      {isActive && (
        <>
          {/* Travel Mode Selector */}
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '3px',
              boxShadow: '0 2px 6px rgba(0,0,0,.3)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setShowModeSelector(!showModeSelector)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 16px',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'Roboto,Arial,sans-serif',
                fontSize: '13px',
                color: '#5f6368',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{currentModeInfo?.icon}</span>
                <span>{currentModeInfo?.label}</span>
              </span>
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>

            {/* Dropdown Menu */}
            {showModeSelector && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: '#fff',
                  borderRadius: '3px',
                  boxShadow: '0 4px 12px rgba(0,0,0,.3)',
                  marginTop: '4px',
                  overflow: 'hidden',
                  zIndex: 1001,
                }}
              >
                {travelModes.map(({ mode: modeOption, label, icon }) => (
                  <button
                    key={modeOption}
                    onClick={() => {
                      onChangeTravelMode(modeOption);
                      setShowModeSelector(false);
                    }}
                    style={{
                      backgroundColor: modeOption === mode ? '#e8f0fe' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '10px 16px',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontFamily: 'Roboto,Arial,sans-serif',
                      fontSize: '13px',
                      color: modeOption === mode ? '#1a73e8' : 'rgb(25,25,25)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (modeOption !== mode) {
                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (modeOption !== mode) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Measurement Info */}
          {hasPoints && (
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '3px',
                boxShadow: '0 2px 6px rgba(0,0,0,.3)',
                padding: '12px 16px',
                fontFamily: 'Roboto,Arial,sans-serif',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: '#5f6368',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {pointCount} point{pointCount !== 1 ? 's' : ''}
              </div>

              {measurementInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Straight Line Distance */}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: '#5f6368' }}>As the crow flies:</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124' }}>
                      {measurementInfo.straightLineDistance}
                    </span>
                  </div>

                  {/* Driving Distance */}
                  {calculating && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', color: '#5f6368' }}>
                        {currentModeInfo?.label} distance:
                      </span>
                      <span style={{ fontSize: '12px', color: '#5f6368', fontStyle: 'italic' }}>
                        Calculating...
                      </span>
                    </div>
                  )}

                  {!calculating && measurementInfo.drivingDistance && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#5f6368' }}>
                          {currentModeInfo?.label} distance:
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a73e8' }}>
                          {measurementInfo.drivingDistance}
                        </span>
                      </div>

                      {measurementInfo.duration && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: '#5f6368' }}>
                            {currentModeInfo?.label} time:
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 500, color: '#202124' }}>
                            {measurementInfo.duration}
                          </span>
                        </div>
                      )}

                      {measurementInfo.durationInTraffic && mode === 'DRIVING' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: '#5f6368' }}>In traffic:</span>
                          <span style={{ fontSize: '12px', fontWeight: 500, color: '#ea4335' }}>
                            {measurementInfo.durationInTraffic}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '12px',
                  borderTop: '1px solid #e8eaed',
                  paddingTop: '12px',
                }}
              >
                <button
                  onClick={onRemoveLastPoint}
                  disabled={!hasPoints}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: '1px solid #dadce0',
                    borderRadius: '4px',
                    cursor: hasPoints ? 'pointer' : 'not-allowed',
                    padding: '6px 12px',
                    fontSize: '12px',
                    color: hasPoints ? '#5f6368' : '#9aa0a6',
                    fontFamily: 'Roboto,Arial,sans-serif',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                    opacity: hasPoints ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => {
                    if (hasPoints) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                      e.currentTarget.style.borderColor = '#5f6368';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (hasPoints) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = '#dadce0';
                    }
                  }}
                >
                  Undo
                </button>

                <button
                  onClick={onClearPoints}
                  disabled={!hasPoints}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: '1px solid #dadce0',
                    borderRadius: '4px',
                    cursor: hasPoints ? 'pointer' : 'not-allowed',
                    padding: '6px 12px',
                    fontSize: '12px',
                    color: hasPoints ? '#5f6368' : '#9aa0a6',
                    fontFamily: 'Roboto,Arial,sans-serif',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                    opacity: hasPoints ? 1 : 0.5,
                  }}
                  onMouseEnter={(e) => {
                    if (hasPoints) {
                      e.currentTarget.style.backgroundColor = '#f8f9fa';
                      e.currentTarget.style.borderColor = '#5f6368';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (hasPoints) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = '#dadce0';
                    }
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Instruction Text */}
          {!hasPoints && (
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '3px',
                boxShadow: '0 2px 6px rgba(0,0,0,.3)',
                padding: '12px 16px',
                fontFamily: 'Roboto,Arial,sans-serif',
                fontSize: '12px',
                color: '#5f6368',
                lineHeight: '1.5',
              }}
            >
              Click on the map to add measurement points
            </div>
          )}
        </>
      )}
    </div>
  );
};
