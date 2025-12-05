import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert } from '../lib/supabaseHelpers';
import { useAuth } from '../contexts/AuthContext';
import {
  CalendarDaysIcon,
  ClockIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFollowUpCreated?: () => void;
  contactId: string;
  contactName: string;
  contactCompany?: string;
  // Optional: link to a related object (deal, property, etc.)
  relatedObjectId?: string;
  relatedObjectType?: string;
}

const FollowUpModal: React.FC<FollowUpModalProps> = ({
  isOpen,
  onClose,
  onFollowUpCreated,
  contactId,
  contactName,
  contactCompany,
  relatedObjectId,
  relatedObjectType
}) => {
  const { user } = useAuth();
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);
  const [customFollowUpDate, setCustomFollowUpDate] = useState('');

  // Default subject includes company if available
  const defaultSubject = contactCompany
    ? `Follow-up with ${contactName} - ${contactCompany}`
    : `Follow-up with ${contactName}`;
  const [followUpSubject, setFollowUpSubject] = useState(defaultSubject);

  // Reset subject when modal opens with new contact
  React.useEffect(() => {
    if (isOpen) {
      const newSubject = contactCompany
        ? `Follow-up with ${contactName} - ${contactCompany}`
        : `Follow-up with ${contactName}`;
      setFollowUpSubject(newSubject);
      setCustomFollowUpDate('');
    }
  }, [isOpen, contactName, contactCompany]);

  const createFollowUp = async (daysFromNow: number | 'custom') => {
    setIsCreatingFollowUp(true);
    try {
      // Calculate the follow-up date
      let followUpDate: Date;
      if (daysFromNow === 'custom') {
        if (!customFollowUpDate) {
          setIsCreatingFollowUp(false);
          return;
        }
        followUpDate = new Date(customFollowUpDate);
      } else {
        followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + daysFromNow);
      }

      // Get Task activity type
      const { data: taskType, error: typeError } = await supabase
        .from('activity_type')
        .select('id')
        .eq('name', 'Task')
        .single();

      if (typeError || !taskType) {
        throw new Error('Could not find Task activity type');
      }

      // Get Not Started or Open status
      const { data: openStatus, error: statusError } = await supabase
        .from('activity_status')
        .select('id')
        .or('name.eq.Not Started,name.eq.Open')
        .limit(1)
        .single();

      if (statusError || !openStatus) {
        throw new Error('Could not find open status');
      }

      // Get current user ID
      let ownerId = null;
      if (user?.email) {
        const { data: userData } = await supabase
          .from('user')
          .select('id')
          .eq('email', user.email)
          .single();
        ownerId = userData?.id;
      }
      if (!ownerId) {
        // Development fallback
        ownerId = 'd4903827-c034-4acf-8765-2c1c65eac655';
      }

      // Create the follow-up task
      const taskData: any = {
        subject: followUpSubject || `Follow-up with ${contactName}`,
        activity_type_id: taskType.id,
        status_id: openStatus.id,
        activity_date: followUpDate.toISOString(),
        contact_id: contactId,
        owner_id: ownerId
      };

      // Add related object if provided
      if (relatedObjectType && relatedObjectId) {
        switch (relatedObjectType) {
          case 'deal':
            taskData.deal_id = relatedObjectId;
            break;
          case 'client':
            taskData.client_id = relatedObjectId;
            break;
          case 'property':
            taskData.property_id = relatedObjectId;
            break;
          case 'site_submit':
            taskData.site_submit_id = relatedObjectId;
            break;
        }
      }

      const { error: insertError } = await supabase
        .from('activity')
        .insert(prepareInsert(taskData));

      if (insertError) {
        throw insertError;
      }

      console.log('✅ Follow-up task created successfully');
      onFollowUpCreated?.();
      onClose();
    } catch (error) {
      console.error('Error creating follow-up:', error);
      alert('Failed to create follow-up. Please try again.');
    } finally {
      setIsCreatingFollowUp(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Schedule Follow-up</h3>
              <p className="mt-1 text-sm text-gray-600">
                Create a follow-up task for {contactName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Follow-up Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Follow-up Subject
            </label>
            <input
              type="text"
              value={followUpSubject}
              onChange={(e) => setFollowUpSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Follow-up task subject"
            />
          </div>

          {/* Quick Options */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Quick Schedule:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => createFollowUp(1)}
                disabled={isCreatingFollowUp}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <ClockIcon className="w-4 h-4" />
                Tomorrow
              </button>
              <button
                onClick={() => createFollowUp(3)}
                disabled={isCreatingFollowUp}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <ClockIcon className="w-4 h-4" />
                In 3 Days
              </button>
              <button
                onClick={() => createFollowUp(7)}
                disabled={isCreatingFollowUp}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <CalendarDaysIcon className="w-4 h-4" />
                In 1 Week
              </button>
              <button
                onClick={() => createFollowUp(14)}
                disabled={isCreatingFollowUp}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <CalendarDaysIcon className="w-4 h-4" />
                In 2 Weeks
              </button>
            </div>
          </div>

          {/* Custom Date */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Or pick a specific date:</p>
            <div className="flex gap-2">
              <input
                type="date"
                value={customFollowUpDate}
                onChange={(e) => setCustomFollowUpDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => createFollowUp('custom')}
                disabled={isCreatingFollowUp || !customFollowUpDate}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Schedule
              </button>
            </div>
          </div>

          {/* Cancel Button */}
          <div className="pt-2 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={isCreatingFollowUp}
              className="w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default FollowUpModal;
