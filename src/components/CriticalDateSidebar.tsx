import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

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
}

// Predefined critical date subjects based on deal type
const CRITICAL_DATE_SUBJECTS = [
  // Purchase Deal Defaults
  'Contract X Date (Lease/PSA Effective Date)',
  'Delivery Date',
  'Contingency Date Expiration',
  'Booked Date',
  'Closed Date',
  'Estimated Open Date',
  'LOI Signed Date',
  // Lease Deal Defaults
  'Contingency Removal Date',
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
  onSave
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [criticalDate, setCriticalDate] = useState<CriticalDate | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const { userTableId } = useAuth();

  // Form fields
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [criticalDateValue, setCriticalDateValue] = useState('');
  const [description, setDescription] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sendEmailDaysPrior, setSendEmailDaysPrior] = useState('');

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

      // Populate form fields
      setSubject(CRITICAL_DATE_SUBJECTS.includes(data.subject) ? data.subject : 'Custom');
      setCustomSubject(CRITICAL_DATE_SUBJECTS.includes(data.subject) ? '' : data.subject);
      setCriticalDateValue(data.critical_date || '');
      setDescription(data.description || '');
      setSendEmail(data.send_email);
      setSendEmailDaysPrior(data.send_email_days_prior?.toString() || '');
    } catch (err) {
      console.error('Error fetching critical date:', err);
      showToast(err instanceof Error ? err.message : 'Failed to load critical date', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCriticalDate(null);
    setSubject('');
    setCustomSubject('');
    setCriticalDateValue('');
    setDescription('');
    setSendEmail(false);
    setSendEmailDaysPrior('');
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Determine final subject (use custom if selected)
      const finalSubject = subject === 'Custom' ? customSubject.trim() : subject;

      if (!finalSubject) {
        showToast('Please enter a subject for the critical date', { type: 'error' });
        return;
      }

      // Validate send_email_days_prior if send_email is checked
      if (sendEmail && !sendEmailDaysPrior) {
        showToast('Please specify how many days prior to send the email reminder', { type: 'error' });
        return;
      }

      const payload: any = {
        deal_id: dealId,
        subject: finalSubject,
        critical_date: criticalDateValue || null,
        description: description.trim() || null,
        send_email: sendEmail,
        send_email_days_prior: sendEmail && sendEmailDaysPrior ? parseInt(sendEmailDaysPrior) : null,
        updated_at: new Date().toISOString(),
        updated_by_id: userTableId || null
      };

      if (criticalDateId) {
        // Update existing
        const { error } = await supabase
          .from('critical_date')
          .update(payload)
          .eq('id', criticalDateId);

        if (error) throw error;
      } else {
        // Create new
        payload.created_at = new Date().toISOString();
        payload.created_by_id = userTableId || null;
        payload.is_default = false;

        const { error } = await supabase
          .from('critical_date')
          .insert([payload]);

        if (error) throw error;
      }

      showToast(criticalDateId ? 'Critical date updated successfully' : 'Critical date created successfully', { type: 'success' });
      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving critical date:', err);
      showToast(err instanceof Error ? err.message : 'Failed to save critical date', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

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
        <h3 className="text-sm font-semibold text-gray-800">
          {criticalDateId ? 'Edit Critical Date' : 'New Critical Date'}
        </h3>
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
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            >
              <option value="">Select a critical date type</option>
              {CRITICAL_DATE_SUBJECTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Custom Subject Input (shown when "Custom" is selected) */}
          {subject === 'Custom' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Custom Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
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
              value={criticalDateValue}
              onChange={(e) => setCriticalDateValue(e.target.value)}
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
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
          {sendEmail && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Send Email Days Prior <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                name="days-prior-notification"
                value={sendEmailDaysPrior}
                onChange={(e) => setSendEmailDaysPrior(e.target.value)}
                onFocus={(e) => e.target.removeAttribute('readonly')}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                placeholder="e.g., 7"
                autoComplete="new-password"
                readOnly
              />
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
              {criticalDateId && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
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
