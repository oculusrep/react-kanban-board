import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal } from '../lib/types';
import CriticalDateSidebar from './CriticalDateSidebar';
import { useToast } from '../hooks/useToast';
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
  is_timeline_linked: boolean;
  deal_field_name: string | null;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_by?: { name: string | null };
  updated_by?: { name: string | null };
}

interface CriticalDatesTabProps {
  dealId: string;
  deal: Deal;
}

const CriticalDatesTab: React.FC<CriticalDatesTabProps> = ({ dealId, deal }) => {
  const [criticalDates, setCriticalDates] = useState<CriticalDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCriticalDateId, setSelectedCriticalDateId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof CriticalDate>('critical_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { toast, showToast, hideToast } = useToast();

  // Stable callbacks for sidebar
  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
    setSelectedCriticalDateId(null);
  }, []);

  // Update local state immediately when sidebar saves (no fetch needed)
  const handleSidebarUpdate = useCallback((criticalDateId: string, updates: any) => {
    setCriticalDates(prev => prev.map(cd =>
      cd.id === criticalDateId ? { ...cd, ...updates } : cd
    ));
  }, []);

  // Fetch critical dates for this deal
  const fetchCriticalDates = useCallback(async () => {
    if (!dealId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('critical_date')
        .select(`
          *,
          created_by:created_by_id(name),
          updated_by:updated_by_id(name)
        `)
        .eq('deal_id', dealId)
        .order('critical_date', { ascending: true, nullsFirst: false });

      if (fetchError) throw fetchError;

      setCriticalDates(data || []);
    } catch (err) {
      console.error('Error fetching critical dates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load critical dates');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchCriticalDates();
  }, [fetchCriticalDates]);

  // Real-time subscription for critical date changes
  // ONLY active when sidebar is closed to avoid infinite loop
  useEffect(() => {
    if (!dealId || sidebarOpen) return; // Don't subscribe while sidebar is open

    console.log('Setting up real-time subscription for critical dates, deal:', dealId);

    const subscription = supabase
      .channel(`critical-date-changes-${dealId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'critical_date',
        filter: `deal_id=eq.${dealId}`
      }, (payload) => {
        console.log('Critical date change detected:', payload.eventType);
        fetchCriticalDates();
      })
      .subscribe();

    return () => {
      console.log('Cleaning up critical date subscription');
      supabase.removeChannel(subscription);
    };
  }, [dealId, fetchCriticalDates, sidebarOpen]);

  // Update a field in a critical date
  const updateField = async (criticalDateId: string, field: string, value: any) => {
    try {
      const updates: any = {
        [field]: value,
        updated_at: new Date().toISOString()
      };

      // Handle send_email checkbox changes
      if (field === 'send_email') {
        if (value === true) {
          // If enabling send_email and send_email_days_prior is null, set a default value
          const criticalDate = criticalDates.find(cd => cd.id === criticalDateId);
          if (criticalDate && criticalDate.send_email_days_prior === null) {
            updates.send_email_days_prior = 7; // Default to 7 days prior

            // Immediately open the days_prior field for editing so user can change the default
            setTimeout(() => {
              startEditing(criticalDateId, 'send_email_days_prior', 7);
            }, 100);
          }
        } else {
          // If disabling send_email, clear the days_prior value
          updates.send_email_days_prior = null;
        }
      }

      const { error: updateError } = await supabase
        .from('critical_date')
        .update(updates)
        .eq('id', criticalDateId);

      if (updateError) throw updateError;

      // TWO-WAY SYNC: If this is a timeline-linked critical date and we're updating the date, sync to deal table
      const criticalDate = criticalDates.find(cd => cd.id === criticalDateId);
      if (criticalDate?.is_timeline_linked && criticalDate?.deal_field_name && updates.critical_date !== undefined) {
        console.log('🔄 Syncing timeline-linked date to deal field:', criticalDate.deal_field_name);
        const dealUpdatePayload: any = {
          [criticalDate.deal_field_name]: updates.critical_date || null,
          updated_at: new Date().toISOString(),
        };
        console.log('📤 Deal update payload:', dealUpdatePayload);

        const { error: dealError } = await supabase
          .from('deal')
          .update(dealUpdatePayload)
          .eq('id', dealId);

        if (dealError) {
          console.error('❌ Failed to sync to deal Timeline:', dealError);
          throw new Error(`Failed to sync to deal Timeline: ${dealError.message}`);
        }
        console.log('✅ Deal Timeline field updated successfully');
      }

      // Update local state
      setCriticalDates(prev => prev.map(cd =>
        cd.id === criticalDateId ? { ...cd, ...updates } : cd
      ));

      setEditingField(null);
      setEditValue('');
      showToast('Critical date updated successfully', { type: 'success' });
    } catch (err) {
      console.error('Error updating critical date:', err);
      showToast(err instanceof Error ? err.message : 'Failed to update critical date', { type: 'error' });
    }
  };

  // Delete a critical date
  const deleteCriticalDate = async () => {
    if (!deleteConfirmId) return;

    setOpenMenuId(null); // Close menu
    setDeleteConfirmId(null); // Close confirm dialog

    try {
      const { error: deleteError } = await supabase
        .from('critical_date')
        .delete()
        .eq('id', deleteConfirmId);

      if (deleteError) throw deleteError;

      setCriticalDates(prev => prev.filter(cd => cd.id !== deleteConfirmId));
      showToast('Critical date deleted successfully', { type: 'success' });
    } catch (err) {
      console.error('Error deleting critical date:', err);
      showToast(err instanceof Error ? err.message : 'Failed to delete critical date', { type: 'error' });
    }
  };

  // Open sidebar to view details
  const viewDetails = (criticalDateId: string) => {
    setOpenMenuId(null); // Close menu
    setEditingField(null); // Cancel any inline editing
    setSelectedCriticalDateId(criticalDateId);
    setSidebarOpen(true);
  };

  // Toggle menu dropdown
  const toggleMenu = (criticalDateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === criticalDateId ? null : criticalDateId);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId]);

  // Start editing a field
  const startEditing = (criticalDateId: string, field: string, currentValue: any) => {
    setEditingField({ id: criticalDateId, field });

    // Format the value for editing
    if (field === 'critical_date' && currentValue) {
      // Extract YYYY-MM-DD for date input without timezone conversion
      setEditValue(currentValue.substring(0, 10));
    } else if (field === 'send_email_days_prior' && currentValue !== null) {
      setEditValue(currentValue.toString());
    } else {
      setEditValue(currentValue || '');
    }
  };

  // Save the edited field
  const saveField = (criticalDateId: string, field: string) => {
    let finalValue: any = editValue;

    // Parse values based on field type
    if (field === 'send_email_days_prior') {
      const numValue = parseInt(editValue);
      finalValue = isNaN(numValue) ? null : numValue;
    } else if (field === 'critical_date') {
      finalValue = editValue || null;
    }

    updateField(criticalDateId, field, finalValue);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Format date for display
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'TBD';

    // Extract date without timezone conversion using substring
    const datePart = dateStr.substring(0, 10); // YYYY-MM-DD
    const [year, month, day] = datePart.split('-');

    // Create date string manually to avoid timezone issues
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
  };

  // Handle column sorting
  const handleSort = (field: keyof CriticalDate) => {
    if (sortField === field) {
      // Toggle direction if clicking same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with ascending as default
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort critical dates based on current sort settings
  const sortedCriticalDates = [...criticalDates].sort((a, b) => {
    // Get the values we're sorting by
    const aValue = a[sortField];
    const bValue = b[sortField];

    // ALWAYS put null/TBD dates at the bottom, regardless of sort direction
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;  // a goes to bottom
    if (bValue === null) return -1; // b goes to bottom

    // Compare values
    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
      comparison = aValue === bValue ? 0 : aValue ? 1 : -1;
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-gray-600">Loading critical dates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-red-800 mb-2">Error Loading Critical Dates</h3>
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchCriticalDates}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Critical Dates</h2>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          onClick={() => {
            setSelectedCriticalDateId(null); // null = creating new
            setSidebarOpen(true);
          }}
        >
          + New Critical Date
        </button>
      </div>

      {/* Empty State */}
      {criticalDates.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-gray-500 text-lg mb-2">No critical dates yet</div>
          <div className="text-gray-400 text-sm">
            Click "+ New Critical Date" to add important milestones and deadlines for this deal
          </div>
        </div>
      )}

      {/* Critical Dates Table */}
      {criticalDates.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('subject')}
                >
                  <div className="flex items-center space-x-0.5">
                    <span>Subject</span>
                    {sortField === 'subject' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th
                  className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('critical_date')}
                >
                  <div className="flex items-center space-x-0.5">
                    <span>Critical Date</span>
                    {sortField === 'critical_date' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th
                  className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('description')}
                >
                  <div className="flex items-center space-x-0.5">
                    <span>Description</span>
                    {sortField === 'description' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th
                  className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('send_email')}
                >
                  <div className="flex items-center justify-center space-x-0.5">
                    <span>Send Email</span>
                    {sortField === 'send_email' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th
                  className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('send_email_days_prior')}
                >
                  <div className="flex items-center justify-center space-x-0.5">
                    <span>Days Prior</span>
                    {sortField === 'send_email_days_prior' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th
                  className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('sent_at')}
                >
                  <div className="flex items-center justify-center space-x-0.5">
                    <span>Sent</span>
                    {sortField === 'sent_at' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'asc' ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  {/* Actions - no label needed, three dots are intuitive */}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedCriticalDates.map((cd, index) => (
                <tr
                  key={cd.id}
                  className="hover:bg-gray-50"
                >
                  {/* Subject */}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {cd.is_timeline_linked ? (
                      // Timeline-linked dates have locked subjects (cannot be edited)
                      <div className="px-1.5 py-0.5 text-xs font-medium text-gray-900 flex items-center">
                        {cd.subject}
                        <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          Timeline
                        </span>
                      </div>
                    ) : editingField?.id === cd.id && editingField?.field === 'subject' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveField(cd.id, 'subject')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveField(cd.id, 'subject');
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="w-full px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(cd.id, 'subject', cd.subject);
                        }}
                        className="cursor-pointer hover:bg-blue-50 px-1.5 py-0.5 rounded text-xs font-medium text-gray-900"
                        title="Click to edit"
                      >
                        {cd.subject}
                        {cd.is_default && (
                          <span className="ml-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            Default
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Critical Date */}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {editingField?.id === cd.id && editingField?.field === 'critical_date' ? (
                      <input
                        type="date"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveField(cd.id, 'critical_date')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveField(cd.id, 'critical_date');
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="w-full px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(cd.id, 'critical_date', cd.critical_date);
                        }}
                        className="cursor-pointer hover:bg-blue-50 px-1.5 py-0.5 rounded text-xs text-gray-700"
                        title="Click to edit"
                      >
                        {formatDate(cd.critical_date)}
                      </div>
                    )}
                  </td>

                  {/* Description */}
                  <td className="px-2 py-1.5">
                    {editingField?.id === cd.id && editingField?.field === 'description' ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveField(cd.id, 'description')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveField(cd.id, 'description');
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="w-full px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(cd.id, 'description', cd.description);
                        }}
                        className="cursor-pointer hover:bg-blue-50 px-1.5 py-0.5 rounded text-xs text-gray-600 truncate max-w-md"
                        title={cd.description || 'Click to add description'}
                      >
                        {cd.description || <span className="text-gray-400 italic text-[10px]">No description</span>}
                      </div>
                    )}
                  </td>

                  {/* Send Email Checkbox */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={cd.send_email}
                      onChange={(e) => updateField(cd.id, 'send_email', e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    />
                  </td>

                  {/* Send Email Days Prior */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    {editingField?.id === cd.id && editingField?.field === 'send_email_days_prior' ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveField(cd.id, 'send_email_days_prior')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveField(cd.id, 'send_email_days_prior');
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="w-16 px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-center"
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(cd.id, 'send_email_days_prior', cd.send_email_days_prior);
                        }}
                        className="inline-block px-1.5 py-0.5 rounded text-xs cursor-pointer hover:bg-blue-50 text-gray-900"
                        title="Click to edit"
                      >
                        {cd.send_email_days_prior !== null ? cd.send_email_days_prior : '-'}
                      </div>
                    )}
                  </td>

                  {/* Sent At */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap text-xs text-gray-600">
                    {cd.sent_at ? (
                      <span className="text-green-600 font-medium">
                        {formatDate(cd.sent_at)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-1.5 text-center whitespace-nowrap relative">
                    <button
                      onClick={(e) => toggleMenu(cd.id, e)}
                      className="p-1 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700"
                      title="More options"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {openMenuId === cd.id && (
                      <div className={`absolute right-0 w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10 ${
                        index >= sortedCriticalDates.length - 2 ? 'bottom-full mb-1' : 'mt-1'
                      }`}>
                        <div className="py-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              viewDetails(cd.id);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span>View Details</span>
                          </button>
                          {/* Only show delete for non-timeline-linked dates */}
                          {!cd.is_timeline_linked && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(cd.id);
                                setOpenMenuId(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Section */}
      {criticalDates.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Email Reminder System</h3>
              <div className="mt-1 text-xs text-blue-700">
                <p>
                  • Check "Send Email" to enable reminders for a critical date<br />
                  • Set "Days Prior" to specify when the reminder should be sent<br />
                  • Emails will be sent to contacts with "Critical Dates Reminders" role, the deal owner, and admin<br />
                  • "Sent" column shows when the email was sent
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Critical Date Sidebar */}
      <CriticalDateSidebar
        dealId={dealId}
        dealName={deal.deal_name || 'Unnamed Deal'}
        criticalDateId={selectedCriticalDateId}
        isOpen={sidebarOpen}
        onClose={handleSidebarClose}
        onSave={fetchCriticalDates}
        onUpdate={handleSidebarUpdate}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Critical Date"
        message="Are you sure you want to delete this critical date? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={deleteCriticalDate}
        onCancel={() => setDeleteConfirmId(null)}
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

export default CriticalDatesTab;
