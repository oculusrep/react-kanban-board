import React, { useState, useEffect } from 'react';
import { useGeocodingBatch } from '../../hooks/useGeocodingBatch';

interface BatchGeocodingPanelProps {
  className?: string;
}

const BatchGeocodingPanel: React.FC<BatchGeocodingPanelProps> = ({ className = '' }) => {
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
  } = useGeocodingBatch();

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
            <h3 className={`${isCompact ? 'text-sm' : 'text-lg'} font-semibold text-gray-900`}>🏢 Batch Geocoding</h3>
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
              <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600`}>{getStatusText()}</span>
            </div>
          </div>
          <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500`}>
            {propertiesCount} need geocoding
          </div>
        </div>
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
                <option value={250}>250 properties</option>
                <option value={500}>500 properties</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              {!isRunning && (
                <button
                  onClick={handleStartBatch}
                  disabled={propertiesCount === 0}
                  className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  ▶️ Start
                </button>
              )}

              {isRunning && !isPaused && (
                <button
                  onClick={pauseBatch}
                  className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-yellow-600 text-white rounded hover:bg-yellow-700`}
                >
                  ⏸️ Pause
                </button>
              )}

              {isRunning && isPaused && (
                <button
                  onClick={resumeBatch}
                  className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-green-600 text-white rounded hover:bg-green-700`}
                >
                  ▶️ Resume
                </button>
              )}

              {isRunning && (
                <button
                  onClick={stopBatch}
                  className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-red-600 text-white rounded hover:bg-red-700`}
                >
                  ⏹️ Stop
                </button>
              )}

              {!isRunning && progress.processed > 0 && (
                <button
                  onClick={clearResults}
                  className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-gray-600 text-white rounded hover:bg-gray-700`}
                >
                  🗑️ Clear
                </button>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border`}
          >
            {showLogs ? '📄 Hide' : '📄 Logs'}
          </button>
        </div>
      </div>

      {/* Progress */}
      {progress.total > 0 && (
        <div className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} border-b border-gray-200`}>
          <div className={`${isCompact ? 'space-y-1' : 'space-y-2'}`}>
            {/* Progress Bar */}
            <div className={`flex items-center justify-between ${isCompact ? 'text-xs' : 'text-sm'}`}>
              <span className="text-gray-600">
                {progress.processed}/{progress.total} ({getProgressPercentage()}%)
              </span>
              <span className="text-gray-500">
                ✅{progress.successful} ❌{progress.failed}
              </span>
            </div>

            <div className={`w-full bg-gray-200 rounded-full ${isCompact ? 'h-1' : 'h-2'}`}>
              <div
                className={`bg-blue-600 ${isCompact ? 'h-1' : 'h-2'} rounded-full transition-all duration-300`}
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>

            {/* Current Address */}
            {progress.currentAddress && (
              <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600`}>
                <span className="font-medium">Current:</span> {isCompact ? progress.currentAddress.substring(0, 40) + '...' : progress.currentAddress}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Summary */}
      {progress.processed > 0 && !isRunning && (
        <div className="px-4 py-3 bg-green-50 border-b border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{progress.successful}</div>
              <div className="text-sm text-gray-600">Successful</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{progress.failed}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{progress.total}</div>
              <div className="text-sm text-gray-600">Total Processed</div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Panel */}
      {showLogs && (
        <div className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} bg-gray-50 ${isCompact ? 'max-h-40' : 'max-h-64'} overflow-y-auto`}>
          <div className="space-y-1">
            {logs.length === 0 && (
              <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 italic`}>No logs yet...</div>
            )}
            {logs.map((log, index) => (
              <div key={index} className={`${isCompact ? 'text-xs' : 'text-xs'} font-mono text-gray-700 border-l-2 border-gray-300 pl-2`}>
                {log}
              </div>
            ))}
          </div>
          {logs.length > 0 && (
            <div className={`${isCompact ? 'mt-1' : 'mt-2'} text-xs text-gray-500`}>
              Latest {logs.length} entries
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BatchGeocodingPanel;