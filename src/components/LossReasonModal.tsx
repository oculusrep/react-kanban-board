import React, { useState, useEffect } from 'react';

interface LossReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (lossReason: string) => void;
  dealName: string;
  currentLossReason?: string | null;
}

const LossReasonModal: React.FC<LossReasonModalProps> = ({
  isOpen,
  onClose,
  onSave,
  dealName,
  currentLossReason
}) => {
  const [lossReason, setLossReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLossReason(currentLossReason || '');
    }
  }, [isOpen, currentLossReason]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (lossReason.trim()) {
      onSave(lossReason);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1-1.962-1-2.732 0L3.732 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">Loss Reason Required</h3>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-3">
            Please enter a Loss Reason in order to move this deal to the LOST stage
          </p>
          <textarea
            value={lossReason}
            onChange={(e) => setLossReason(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter the reason why this deal was lost..."
            rows={4}
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
            disabled={!lossReason.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default LossReasonModal;
