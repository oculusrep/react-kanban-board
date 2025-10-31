import React from 'react';
import { AutosaveStatus } from '../hooks/useAutosave';

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  className?: string;
}

export default function AutosaveIndicator({
  status,
  lastSavedAt,
  className = ''
}: AutosaveIndicatorProps) {
  const getStatusDisplay = () => {
    switch (status) {
      case 'saving':
        return (
          <div className="flex items-center gap-1.5 text-blue-600">
            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-xs font-medium">Saving...</span>
          </div>
        );

      case 'saved':
        return (
          <div className="flex items-center gap-1.5 text-green-600">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs font-medium">
              Saved {lastSavedAt && getTimeAgo(lastSavedAt)}
            </span>
          </div>
        );

      case 'error':
        return (
          <div className="flex items-center gap-1.5 text-red-600">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Save failed</span>
          </div>
        );

      case 'idle':
      default:
        if (lastSavedAt) {
          return (
            <div className="flex items-center gap-1.5 text-gray-500">
              <span className="text-xs">
                Last saved {getTimeAgo(lastSavedAt)}
              </span>
            </div>
          );
        }
        return null;
    }
  };

  return (
    <div className={`transition-opacity duration-200 ${className}`}>
      {getStatusDisplay()}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
