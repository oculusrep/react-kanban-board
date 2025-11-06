import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { useAutosave } from '../hooks/useAutosave';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';
import AutosaveIndicator from './AutosaveIndicator';
import CriticalDateEmailPreviewModal from './CriticalDateEmailPreviewModal';

interface CriticalDate {
  id: string;
  deal_id: string;
  subject: string;
  critical_date: string | null;
  description: string | null;
  send_email: boolean;
  send_email_days_prior: number | null;
  sent_at: string | null;
  is_default: boolean;
  is_timeline_linked: boolean;
  deal_field_name: string | null;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_by?: { name: string | null };
  updated_by?: { name: string | null };
}

interface CriticalDateSidebarProps {
  dealId: string;
  dealName: string;
  criticalDateId: string | null; // null means creating new
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onUpdate?: (criticalDateId: string, updates: any) => void; // Update parent state immediately
}

// Predefined critical date subjects
// Timeline-linked dates (synced with deal Timeline section) come first
const CRITICAL_DATE_SUBJECTS = [
  // Timeline-Linked Dates (auto-created, synced with Details tab)
  'Target Close Date',
  'LOI X Date',
  'Effective Date (Contract X)',
  'Booked Date',
  'Closed Date',
  // Other Critical Date Types (user-managed)
  'Delivery Date',
  'Contingency Date Expiration',
  'Contingency Removal Date',
  'Estimated Open Date',
  'Lease Signed Date',
  'Rent Commencement Date',
  // Custom option
  'Custom'
];

const CriticalDateSidebar: React.FC<CriticalDateSidebarProps> = ({
  dealId,
  dealName,
  criticalDateId,
  isOpen,
  onClose,
  onSave,
  onUpdate
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [criticalDate, setCriticalDate] = useState<CriticalDate | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailToggleKey, setEmailToggleKey] = useState(0); // Counter to track email toggle changes
  const { toast, showToast, hideToast} = useToast();
  const { userTableId } = useAuth();

  // Form data - single state object to prevent multiple re-renders
  const [formData, setFormData] = useState({
    subject: '',
    customSubject: '',
    criticalDateValue: '',
    description: '',
    sendEmail: false,
    sendEmailDaysPrior: '',
  });

  // Fetch existing critical date if editing
  useEffect(() => {
    if (criticalDateId) {
      fetchCriticalDate();
    } else {
      // Reset form for new critical date
      resetForm();
    }
  }, [criticalDateId]);

  const fetchCriticalDate = async () => {
    if (!criticalDateId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('critical_date')
        .select(`
          *,
          created_by:created_by_id(name),
          updated_by:updated_by_id(name)
        `)
        .eq('id', criticalDateId)
        .single();

      if (error) throw error;

      setCriticalDate(data);

      // Convert critical_date to YYYY-MM-DD format for date input
      // IMPORTANT: Use substring to avoid timezone conversion issues
      // If we use new Date().toISOString(), it converts to UTC which can shift the date by a day
      let dateValue = '';
      if (data.critical_date) {
        // Extract just the date part (YYYY-MM-DD) without timezone conversion
        dateValue = data.critical_date.substring(0, 10);
      }

      // Populate form data - all at once to prevent multiple re-renders
      setFormData({
        subject: CRITICAL_DATE_SUBJECTS.includes(data.subject) ? data.subject : 'Custom',
        customSubject: CRITICAL_DATE_SUBJECTS.includes(data.subject) ? '' : data.subject,
        criticalDateValue: dateValue,
        description: data.description || '',
        sendEmail: data.send_email,
        sendEmailDaysPrior: data.send_email_days_prior?.toString() || '',
      });
    } catch (err) {
      console.error('Error fetching critical date:', err);
      showToast(err instanceof Error ? err.message : 'Failed to load critical date', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCriticalDate(null);
    setFormData({
      subject: '',
      customSubject: '',
      criticalDateValue: '',
      description: '',
      sendEmail: false,
      sendEmailDaysPrior: '',
    });
  };

  // Helper to update form data
  const updateFormData = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Save function for autosave
  const handleSave = useCallback(async (data: typeof formData) => {
    // Determine final subject (use custom if selected)
    const finalSubject = data.subject === "Custom" ? data.customSubject.trim() : data.subject;

    if (!finalSubject) {
      throw new Error('Please enter a subject for the critical date');
    }

    // Validate send_email_days_prior if send_email is checked
    if (data.sendEmail && !data.sendEmailDaysPrior) {
      throw new Error('Please specify how many days prior to send the email reminder');
    }

    const payload: any = {
      deal_id: dealId,
      subject: finalSubject,
      critical_date: data.criticalDateValue || null,
      description: data.description.trim() || null,
      send_email: data.sendEmail,
      send_email_days_prior: data.sendEmail && data.sendEmailDaysPrior ? parseInt(data.sendEmailDaysPrior) : null,
      updated_at: new Date().toISOString(),
      updated_by_id: userTableId || null
    };

    if (criticalDateId) {
      // Update existing
      console.log('Updating critical date:', criticalDateId, 'with payload:', payload);
      const { error } = await supabase
        .from('critical_date')
        .update(payload)
        .eq('id', criticalDateId);

      if (error) throw error;

      // TWO-WAY SYNC: If this is a timeline-linked critical date, update the deal table
      if (criticalDate?.is_timeline_linked && criticalDate?.deal_field_name) {
        const dealUpdatePayload: any = {
          [criticalDate.deal_field_name]: data.criticalDateValue || null,
          updated_at: new Date().toISOString(),
          updated_by_id: userTableId || null
        };

        const { error: dealError } = await supabase
          .from('deal')
          .update(dealUpdatePayload)
          .eq('id', dealId);

        if (dealError) {
          throw new Error(`Failed to sync to deal Timeline: ${dealError.message}`);
        }
      }

      // Update parent state immediately (no fetch needed)
      onUpdate?.(criticalDateId, payload);
    } else {
      // Create new
      payload.created_at = new Date().toISOString();
      payload.created_by_id = userTableId || null;
      payload.is_default = false;

      const { error, data: newData } = await supabase
        .from('critical_date')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      // Update the criticalDateId so subsequent saves are updates
      if (newData) {
        setCriticalDate(newData);
      }
    }
  }, [dealId, criticalDateId, userTableId, criticalDate]);

  // Autosave hook - does NOT call onSave to avoid infinite loop
  // The real-time subscription in CriticalDatesTab handles table refresh
  const { status, lastSavedAt } = useAutosave({
    data: formData,
    onSave: handleSave,
    delay: 1500,
    enabled: !loading && !!criticalDateId, // Only autosave for existing records
  });

  const handleDelete = async () => {
    if (!criticalDateId) return;
    setShowDeleteConfirm(false);

    try {
      setSaving(true);
      const { error } = await supabase
        .from('critical_date')
        .delete()
        .eq('id', criticalDateId);

      if (error) throw error;

      showToast('Critical date deleted successfully', { type: 'success' });
      onSave();
      onClose();
    } catch (err) {
      console.error('Error deleting critical date:', err);
      showToast(err instanceof Error ? err.message : 'Failed to delete critical date', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (dateStr: string | null): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl w-[600px] z-50 overflow-y-auto"
      style={{
        top: '180px',
        height: 'calc(100vh - 180px)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800">
            {criticalDateId ? 'Edit Critical Date' : 'New Critical Date'}
          </h3>
          {criticalDateId && <AutosaveIndicator status={status} lastSavedAt={lastSavedAt} />}
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-md transition-colors text-gray-500 hover:text-gray-700"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} autoComplete="off" data-form-type="other">
          {/* Hidden honeypot fields to prevent autofill */}
          <input type="text" name="fakeusername" style={{ position: 'absolute', left: '-9999px' }} tabIndex={-1} autoComplete="off" readOnly />
          <input type="password" name="fakepassword" style={{ position: 'absolute', left: '-9999px' }} tabIndex={-1} autoComplete="new-password" readOnly />

          <div className="p-4 pb-8 space-y-4">
          {/* Deal Name (Read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Deal
            </label>
            <div className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700">
              {dealName}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
              {criticalDate?.is_timeline_linked && (
                <span className="ml-2 text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                  Timeline-Linked
                </span>
              )}
            </label>
            {criticalDate?.is_timeline_linked ? (
              // Timeline-linked dates have locked subjects
              <div className="px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700">
                {formData.subject}
              </div>
            ) : (
              // Regular critical dates can change subject
              <select
                value={formData.subject}
                onChange={(e) => updateFormData("subject", e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              >
                <option value="">Select a critical date type</option>
                {CRITICAL_DATE_SUBJECTS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>

          {/* Custom Subject Input (shown when "Custom" is selected) */}
          {formData.subject === "Custom" && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Custom Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.customSubject}
                onChange={(e) => updateFormData("customSubject", e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                placeholder="Enter custom subject"
                autoComplete="off"
              />
            </div>
          )}

          {/* Critical Date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Critical Date
            </label>
            <input
              type="date"
              value={formData.criticalDateValue}
              onChange={(e) => updateFormData("criticalDateValue", e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              autoComplete="off"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">Leave blank if date is TBD</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => updateFormData("description", e.target.value)}
              rows={3}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-xs"
              placeholder="Add any notes or details about this critical date..."
              autoComplete="off"
            />
          </div>

          {/* Send Email Checkbox */}
          <div className="flex items-start space-x-2">
            <input
              type="checkbox"
              id="send-email"
              checked={formData.sendEmail}
              onChange={(e) => {
                updateFormData("sendEmail", e.target.checked);
                // Clear days prior when unchecking
                if (!e.target.checked) {
                  updateFormData("sendEmailDaysPrior", "");
                }
                // Increment toggle key to force modal remount
                setEmailToggleKey(prev => prev + 1);
              }}
              className="mt-0.5 h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
            />
            <div className="flex-1">
              <label htmlFor="send-email" className="block text-xs font-medium text-gray-700 cursor-pointer">
                Send email reminder
              </label>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Email will be sent to contacts with "Critical Dates Reminders" role, the deal owner, and admin
              </p>
            </div>
          </div>

          {/* Send Email Days Prior (only shown when Send Email is checked) */}
          {formData.sendEmail && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Send Email Days Prior <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  name="days-prior-notification"
                  value={formData.sendEmailDaysPrior}
                  onChange={(e) => updateFormData("sendEmailDaysPrior", e.target.value)}
                  onFocus={(e) => e.target.removeAttribute('readonly')}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  placeholder="e.g., 7"
                  autoComplete="new-password"
                  readOnly
                />
                <button
                  type="button"
                  onClick={() => setShowEmailPreview(true)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors flex items-center space-x-1"
                  title="Preview email template"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>Preview Email</span>
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Number of days before the critical date to send the reminder
              </p>
            </div>
          )}

          {/* Metadata (shown only when editing existing record) */}
          {criticalDate && (
            <div className="border-t border-gray-200 pt-4 space-y-2">
              {criticalDate.is_default && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                  <span className="text-[10px] font-medium text-blue-800">
                    Default Critical Date
                  </span>
                  <p className="text-[10px] text-blue-600 mt-0.5">
                    This critical date was auto-created based on the deal type
                  </p>
                </div>
              )}

              {criticalDate.sent_at && (
                <div>
                  <label className="block text-[10px] font-medium text-gray-600">Email Sent</label>
                  <div className="text-xs text-green-600 font-medium">
                    {formatDateTime(criticalDate.sent_at)}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-gray-600">Created</label>
                  <div className="text-xs text-gray-700">{formatDateTime(criticalDate.created_at)}</div>
                  {criticalDate.created_by?.name && (
                    <div className="text-[10px] text-gray-500">by {criticalDate.created_by.name}</div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-600">Last Updated</label>
                  <div className="text-xs text-gray-700">{formatDateTime(criticalDate.updated_at)}</div>
                  {criticalDate.updated_by?.name && (
                    <div className="text-[10px] text-gray-500">by {criticalDate.updated_by.name}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
            <div>
              {/* Only show delete for non-timeline-linked critical dates */}
              {criticalDateId && !criticalDate?.is_timeline_linked && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={status === 'saving'}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              )}
              {/* Show info message for timeline-linked dates */}
              {criticalDate?.is_timeline_linked && (
                <div className="text-[10px] text-gray-500 italic">
                  Timeline dates cannot be deleted, only cleared
                </div>
              )}
            </div>
            <div className="flex space-x-2">
              {criticalDateId ? (
                // Existing record - autosave enabled, just show Close
                <button
                  onClick={onClose}
                  disabled={status === 'saving'}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Close
                </button>
              ) : (
                // New record - show Cancel and Create
                <>
                  <button
                    onClick={onClose}
                    disabled={status === 'saving'}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      await handleSave(formData);
                      onSave(); // Refresh parent list after creating
                      onClose(); // Close sidebar after creating
                    }}
                    disabled={status === 'saving'}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === 'saving' ? 'Creating...' : 'Create'}
                  </button>
                </>
              )}
            </div>
          </div>
          </div>
        </form>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Critical Date"
        message="Are you sure you want to delete this critical date? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Email Preview Modal */}
      <CriticalDateEmailPreviewModal
        key={`${criticalDateId}-${emailToggleKey}`}
        isOpen={showEmailPreview}
        onClose={() => setShowEmailPreview(false)}
        criticalDateId={criticalDateId}
        dealId={dealId}
        dealName={dealName}
        subject={formData.subject === "Custom" ? formData.customSubject : formData.subject}
        criticalDate={formData.criticalDateValue}
        description={formData.description}
        daysPrior={formData.sendEmailDaysPrior}
      />

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
};

export default CriticalDateSidebar;
