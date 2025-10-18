import React, { useState, useEffect } from 'react';

interface BookedDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bookedDate: string) => void;
  dealName: string;
  currentBookedDate?: string | null;
}

const BookedDateModal: React.FC<BookedDateModalProps> = ({
  isOpen,
  onClose,
  onSave,
  dealName,
  currentBookedDate
}) => {
  const [bookedDate, setBookedDate] = useState('');

  useEffect(() => {
    if (isOpen) {
      // If there's a current date, use it; otherwise default to today
      if (currentBookedDate) {
        setBookedDate(currentBookedDate.split('T')[0]); // Extract YYYY-MM-DD
      } else {
        const today = new Date().toISOString().split('T')[0];
        setBookedDate(today);
      }
    }
  }, [isOpen, currentBookedDate]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (bookedDate) {
      onSave(bookedDate);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && bookedDate) {
      handleSave();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">Booked Date Required</h3>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-3">
            Please enter a Booked Date in order to move this deal to the BOOKED stage
          </p>
          <input
            type="date"
            value={bookedDate}
            onChange={(e) => setBookedDate(e.target.value)}
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
            disabled={!bookedDate}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookedDateModal;
