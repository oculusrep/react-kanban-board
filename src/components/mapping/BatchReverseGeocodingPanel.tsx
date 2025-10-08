import React, { useState, useEffect } from 'react';
import { useReverseGeocodingBatch } from '../../hooks/useReverseGeocodingBatch';

interface BatchReverseGeocodingPanelProps {
  className?: string;
}

const BatchReverseGeocodingPanel: React.FC<BatchReverseGeocodingPanelProps> = ({ className = '' }) => {
  const isCompact = className.includes('compact');
  const {
    isRunning,
    isPaused,
    progress,
    logs,
    startBatch,
    pauseBatch,
    resumeBatch,
    stopBatch,
    clearResults,
    refreshPropertiesCount,
  } = useReverseGeocodingBatch();

  const [batchLimit, setBatchLimit] = useState(50);
  const [propertiesCount, setPropertiesCount] = useState(0);
  const [showLogs, setShowLogs] = useState(false);

  // Refresh count on component mount
  useEffect(() => {
    const loadCount = async () => {
      const count = await refreshPropertiesCount();
      setPropertiesCount(count);
    };
    loadCount();
  }, [refreshPropertiesCount]);

  // Refresh count when batch completes
  useEffect(() => {
    if (!isRunning && progress.processed > 0) {
      const refreshCount = async () => {
        const count = await refreshPropertiesCount();
        setPropertiesCount(count);
      };
      refreshCount();
    }
  }, [isRunning, progress.processed, refreshPropertiesCount]);

  const handleStartBatch = async () => {
    await startBatch(batchLimit);
  };

  const getProgressPercentage = () => {
    if (progress.total === 0) return 0;
    return Math.round((progress.processed / progress.total) * 100);
  };

  const getStatusColor = () => {
    if (isRunning && !isPaused) return 'bg-blue-500';
    if (isPaused) return 'bg-yellow-500';
    if (progress.processed > 0 && !isRunning) return 'bg-green-500';
    return 'bg-gray-400';
  };

  const getStatusText = () => {
    if (isRunning && !isPaused) return 'Running...';
    if (isPaused) return 'Paused';
    if (progress.processed > 0 && !isRunning) return 'Complete';
    return 'Ready';
  };

  return (
    <div className={`bg-white ${isCompact ? '' : 'rounded-lg border shadow-sm'} ${className}`}>
      {/* Header */}
      <div className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} border-b border-gray-200`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className={`${isCompact ? 'text-sm' : 'text-lg'} font-semibold text-gray-900`}>🔄 Batch Reverse Geocoding</h3>
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
              <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600`}>{getStatusText()}</span>
            </div>
          </div>
          <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500`}>
            {propertiesCount} need addresses
          </div>
        </div>
        <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 mt-1`}>
          Get addresses from coordinates (lat/long → address)
        </p>
      </div>

      {/* Controls */}
      <div className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} bg-gray-50 border-b border-gray-200`}>
        <div className={`flex items-center ${isCompact ? 'flex-col space-y-2' : 'justify-between'}`}>
          <div className={`flex items-center ${isCompact ? 'space-x-2' : 'space-x-4'}`}>
            <div className="flex items-center space-x-1">
              <label className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-gray-700`}>Batch:</label>
              <select
                value={batchLimit}
                onChange={(e) => setBatchLimit(Number(e.target.value))}
                disabled={isRunning}
                className={`px-1 py-1 border border-gray-300 rounded ${isCompact ? 'text-xs' : 'text-sm'} disabled:opacity-50`}
              >
                <option value={10}>10 properties</option>
                <option value={25}>25 properties</option>
                <option value={50}>50 properties</option>
                <option value={100}>100 properties</option>
                <option value={200}>200 properties</option>
              </select>
            </div>

            {!isRunning && (
              <button
                onClick={handleStartBatch}
                disabled={propertiesCount === 0}
                className={`px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed ${isCompact ? 'text-xs' : 'text-sm'} font-medium`}
              >
                Start Reverse Geocoding
              </button>
            )}

            {isRunning && !isPaused && (
              <button
                onClick={pauseBatch}
                className={`px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 ${isCompact ? 'text-xs' : 'text-sm'} font-medium`}
              >
                Pause
              </button>
            )}

            {isRunning && isPaused && (
              <button
                onClick={resumeBatch}
                className={`px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 ${isCompact ? 'text-xs' : 'text-sm'} font-medium`}
              >
                Resume
              </button>
            )}

            {isRunning && (
              <button
                onClick={stopBatch}
                className={`px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 ${isCompact ? 'text-xs' : 'text-sm'} font-medium`}
              >
                Stop
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {progress.processed > 0 && !isRunning && (
              <button
                onClick={clearResults}
                className={`px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 ${isCompact ? 'text-xs' : 'text-sm'} font-medium`}
              >
                Clear Results
              </button>
            )}

            <button
              onClick={() => setShowLogs(!showLogs)}
              className={`px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 ${isCompact ? 'text-xs' : 'text-sm'} font-medium`}
            >
              {showLogs ? 'Hide' : 'Show'} Logs
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      {progress.total > 0 && (
        <div className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} border-b border-gray-200`}>
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>

            {/* Stats */}
            <div className={`grid grid-cols-4 gap-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
              <div>
                <div className="text-gray-500">Total</div>
                <div className="font-semibold">{progress.total}</div>
              </div>
              <div>
                <div className="text-gray-500">Processed</div>
                <div className="font-semibold">{progress.processed}</div>
              </div>
              <div>
                <div className="text-gray-500">Success</div>
                <div className="font-semibold text-green-600">{progress.successful}</div>
              </div>
              <div>
                <div className="text-gray-500">Failed</div>
                <div className="font-semibold text-red-600">{progress.failed}</div>
              </div>
            </div>

            {/* Current property */}
            {progress.currentProperty && (
              <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600`}>
                Current: {progress.currentProperty}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logs */}
      {showLogs && (
        <div className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} bg-gray-900 text-gray-100 overflow-y-auto`} style={{ maxHeight: '300px' }}>
          {logs.length === 0 ? (
            <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-400`}>No logs yet</div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`${isCompact ? 'text-xs' : 'text-sm'} font-mono ${
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'success'
                      ? 'text-green-400'
                      : log.type === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500">
                    [{log.timestamp.toLocaleTimeString()}]
                  </span>{' '}
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      {!isRunning && progress.processed === 0 && (
        <div className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} bg-blue-50 border-t border-blue-200`}>
          <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-blue-800`}>
            <strong>Note:</strong> Reverse geocoding converts coordinates (lat/long) to addresses. This uses OpenStreetMap Nominatim (free) with a rate limit of ~1 request per second. For {propertiesCount} properties, this will take approximately {Math.ceil(propertiesCount * 1.2 / 60)} minutes.
          </p>
        </div>
      )}
    </div>
  );
};

export default BatchReverseGeocodingPanel;
