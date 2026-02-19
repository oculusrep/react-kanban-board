// Modal for logging prospecting time
// src/components/hunter/TimeEntryModal.tsx

import { useState, useEffect } from 'react';
import { XMarkIcon, CalendarIcon } from '@heroicons/react/24/outline';

interface TimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (date: string, minutes: number, notes?: string) => Promise<boolean>;
  onMarkVacation: (date: string, reason?: string) => Promise<boolean>;
  initialDate?: string;
  initialMinutes?: number;
  initialNotes?: string;
  dailyGoalMinutes?: number;
}

export default function TimeEntryModal({
  isOpen,
  onClose,
  onSave,
  onMarkVacation,
  initialDate,
  initialMinutes = 0,
  initialNotes = '',
  dailyGoalMinutes = 120
}: TimeEntryModalProps) {
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [hours, setHours] = useState(Math.floor(initialMinutes / 60));
  const [minutes, setMinutes] = useState(initialMinutes % 60);
  const [notes, setNotes] = useState(initialNotes);
  const [isVacation, setIsVacation] = useState(false);
  const [vacationReason, setVacationReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDate(initialDate || new Date().toISOString().split('T')[0]);
      setHours(Math.floor(initialMinutes / 60));
      setMinutes(initialMinutes % 60);
      setNotes(initialNotes);
      setIsVacation(false);
      setVacationReason('');
    }
  }, [isOpen, initialDate, initialMinutes, initialNotes]);

  const totalMinutes = hours * 60 + minutes;
  const percentage = Math.min(100, Math.round((totalMinutes / dailyGoalMinutes) * 100));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (isVacation) {
        const success = await onMarkVacation(date, vacationReason || undefined);
        if (success) onClose();
      } else {
        const success = await onSave(date, totalMinutes, notes || undefined);
        if (success) onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[80]" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4 relative z-[81]">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Log Prospecting Time</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Date Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>

            {/* Vacation Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="vacation"
                checked={isVacation}
                onChange={(e) => setIsVacation(e.target.checked)}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <label htmlFor="vacation" className="text-sm text-gray-700">
                Mark as vacation day (protects streak)
              </label>
            </div>

            {isVacation ? (
              // Vacation reason
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={vacationReason}
                  onChange={(e) => setVacationReason(e.target.value)}
                  placeholder="e.g., Conference, PTO, Holiday"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            ) : (
              <>
                {/* Time Spent */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time Spent
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="12"
                        value={hours}
                        onChange={(e) => setHours(Math.max(0, Math.min(12, parseInt(e.target.value) || 0)))}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                      <span className="text-sm text-gray-500">hours</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="59"
                        step="5"
                        value={minutes}
                        onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                      <span className="text-sm text-gray-500">minutes</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-500">Progress toward daily goal</span>
                    <span className={`font-medium ${percentage >= 100 ? 'text-green-600' : 'text-gray-700'}`}>
                      {Math.floor(totalMinutes / 60)}:{String(totalMinutes % 60).padStart(2, '0')} / {Math.floor(dailyGoalMinutes / 60)}:{String(dailyGoalMinutes % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${percentage >= 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What did you work on?"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || (!isVacation && totalMinutes === 0)}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : isVacation ? 'Mark Vacation' : 'Save Time Entry'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
