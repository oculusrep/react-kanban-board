import React, { useState, useRef, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { supabase } from '../../lib/supabaseClient';

interface HandoffDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  currentDate: string | null;
  documentType: 'LOI' | 'Lease' | null;
  holder: 'us' | 'll' | null;
  onUpdate?: () => void;
}

/**
 * HandoffDatePicker - Modal for backdating a handoff
 *
 * Allows the user to edit the date of the most recent handoff entry,
 * storing the original date in `original_changed_at` for audit purposes.
 */
export default function HandoffDatePicker({
  isOpen,
  onClose,
  dealId,
  currentDate,
  documentType,
  holder,
  onUpdate,
}: HandoffDatePickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize date when modal opens
  useEffect(() => {
    if (isOpen && currentDate) {
      setSelectedDate(new Date(currentDate));
    } else if (isOpen) {
      setSelectedDate(new Date());
    }
  }, [isOpen, currentDate]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!selectedDate || !holder || isUpdating) return;

    setIsUpdating(true);

    try {
      // Format date in local timezone
      const formattedDate = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

      // Get the most recent handoff for this deal to update
      const { data: latestHandoff, error: fetchError } = await supabase
        .from('document_handoff')
        .select('id, changed_at, original_changed_at')
        .eq('deal_id', dealId)
        .order('changed_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) {
        console.error('Error fetching handoff:', fetchError);
        return;
      }

      // Update the handoff with new date
      // If this is the first backdate, store the original date
      const updateData: any = {
        changed_at: formattedDate,
      };

      // Only set original_changed_at if it's not already set (first backdate)
      if (!latestHandoff.original_changed_at) {
        updateData.original_changed_at = latestHandoff.changed_at;
      }

      const { error: updateError } = await supabase
        .from('document_handoff')
        .update(updateData)
        .eq('id', latestHandoff.id);

      if (updateError) {
        console.error('Error updating handoff date:', updateError);
        return;
      }

      // Also update the denormalized date on the deal table
      const { error: dealError } = await supabase
        .from('deal')
        .update({ current_handoff_date: formattedDate })
        .eq('id', dealId);

      if (dealError) {
        console.error('Error updating deal handoff date:', dealError);
      }

      if (onUpdate) {
        onUpdate();
      }
      onClose();
    } catch (error) {
      console.error('Error saving handoff date:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl p-4 max-w-sm w-full mx-4"
      >
        <h3 className="text-lg font-semibold mb-4">Edit Handoff Date</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {documentType || 'Document'} handed to {holder === 'us' ? 'Us' : 'LL'} on:
          </label>
          <DatePicker
            selected={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            dateFormat="MMM d, yyyy"
            maxDate={new Date()}
            inline
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={isUpdating}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedDate || isUpdating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isUpdating ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
