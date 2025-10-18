import React, { useState, useEffect } from 'react';

interface ClosedDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (closedDate: string) => void;
  dealName: string;
  currentClosedDate?: string | null;
}

const ClosedDateModal: React.FC<ClosedDateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  dealName,
  currentClosedDate
}) => {
  const [closedDate, setClosedDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      // If there's a current date, use it; otherwise default to today
      if (currentClosedDate) {
        setClosedDate(currentClosedDate.split('T')[0]); // Extract YYYY-MM-DD
      } else {
        const today = new Date().toISOString().split('T')[0];
        setClosedDate(today);
      }
    }
  }, [isOpen, currentClosedDate]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (closedDate) {
      onSave(closedDate);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && closedDate) {
      handleSave();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">Closed Date Required</h3>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-3">
            Please enter a Closed Date in order to move this deal to the CLOSED PAID stage
          </p>
          <input
            type="date"
            value={closedDate}
            onChange={(e) => setClosedDate(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!closedDate}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClosedDateModal;
