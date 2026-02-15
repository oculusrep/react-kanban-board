import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { PaymentDashboardRow } from '../../types/payment-dashboard';
import BrokerPaymentRow from './BrokerPaymentRow';
import ReferralFeeRow from './ReferralFeeRow';
import PaymentDetailSidebar from './PaymentDetailSidebar';
import PaymentCheckProcessing from './PaymentCheckProcessing';
import PaymentAmountOverrideModal from './PaymentAmountOverrideModal';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

interface PaymentDashboardTableProps {
  payments: PaymentDashboardRow[];
  loading: boolean;
  onPaymentUpdate: () => void;
  // Selection props for bulk actions
  showSelection?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (paymentId: string) => void;
  onSelectAll?: () => void;
}

type SortField = 'deal_name' | 'payment_date_estimated' | 'payment_received' | 'disbursement' | 'orep_invoice';
type SortDirection = 'asc' | 'desc';

const PaymentDashboardTable: React.FC<PaymentDashboardTableProps> = ({
  payments,
  loading,
  onPaymentUpdate,
  showSelection = false,
  selectedIds = new Set(),
  onToggleSelect,
  onSelectAll,
}) => {
  const navigate = useNavigate();
  const [localPayments, setLocalPayments] = useState<PaymentDashboardRow[]>(payments);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedPayment, setSelectedPayment] = useState<PaymentDashboardRow | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('payment_date_estimated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const menuRef = useRef<HTMLDivElement>(null);

  // Override modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [paymentToOverride, setPaymentToOverride] = useState<PaymentDashboardRow | null>(null);

  // QB Sync state
  const [syncingPaymentId, setSyncingPaymentId] = useState<string | null>(null);
  const [qbSyncMessage, setQbSyncMessage] = useState<{ paymentId: string; type: 'success' | 'error'; text: string } | null>(null);

  // Sync local payments with parent when parent data changes and apply sorting
  useEffect(() => {
    const sorted = sortPayments([...payments], sortField, sortDirection);
    setLocalPayments(sorted);

    // Also update selectedPayment if it exists, to reflect any changes (e.g., QB sync status)
    if (selectedPayment) {
      const updatedPayment = payments.find(p => p.payment_id === selectedPayment.payment_id);
      if (updatedPayment) {
        setSelectedPayment(updatedPayment);
      }
    }
  }, [payments, sortField, sortDirection]);

  const sortPayments = (
    paymentsToSort: PaymentDashboardRow[],
    field: SortField,
    direction: SortDirection
  ): PaymentDashboardRow[] => {
    return [...paymentsToSort].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (field) {
        case 'deal_name':
          aValue = a.deal_name.toLowerCase();
          bValue = b.deal_name.toLowerCase();
          break;
        case 'payment_date_estimated':
          aValue = a.payment_date_estimated || '';
          bValue = b.payment_date_estimated || '';
          break;
        case 'payment_received':
          aValue = a.payment_received ? 1 : 0;
          bValue = b.payment_received ? 1 : 0;
          break;
        case 'disbursement':
          // Calculate disbursement status: all paid = 2, some paid = 1, none paid = 0
          const aAllPaid = a.all_brokers_paid && (a.referral_fee_usd ? a.referral_fee_paid : true);
          const bAllPaid = b.all_brokers_paid && (b.referral_fee_usd ? b.referral_fee_paid : true);
          const aSomePaid = a.broker_splits.some(s => s.paid) || a.referral_fee_paid;
          const bSomePaid = b.broker_splits.some(s => s.paid) || b.referral_fee_paid;

          aValue = aAllPaid ? 2 : (aSomePaid ? 1 : 0);
          bValue = bAllPaid ? 2 : (bSomePaid ? 1 : 0);
          break;
        case 'orep_invoice':
          aValue = (a.orep_invoice || '').toLowerCase();
          bValue = (b.orep_invoice || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection(field === 'payment_date_estimated' ? 'desc' : 'asc');
    }
  };

  const toggleRow = (paymentId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(paymentId)) {
      newExpanded.delete(paymentId);
    } else {
      newExpanded.add(paymentId);
    }
    setExpandedRows(newExpanded);
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleMarkPaymentReceived = async (paymentId: string, received: boolean) => {
    const { error } = await supabase
      .from('payment')
      .update({
        payment_received: received,
        payment_received_date: received ? new Date().toISOString().split('T')[0] : null,
      })
      .eq('id', paymentId);

    if (error) {
      console.error('Error updating payment:', error);
      alert('Failed to update payment status');
    } else {
      onPaymentUpdate();
    }
  };

  const handleUpdatePaymentField = async (paymentId: string, field: string, value: any) => {
    // Find the payment to check if it's linked to QB
    const payment = localPayments.find(p => p.payment_id === paymentId);

    // Optimistic update - update local state immediately
    setLocalPayments(prevPayments =>
      prevPayments.map(p =>
        p.payment_id === paymentId
          ? { ...p, [field]: value }
          : p
      )
    );

    // Update database in background
    const { error } = await supabase
      .from('payment')
      .update({ [field]: value })
      .eq('id', paymentId);

    if (error) {
      console.error(`Error updating payment ${field}:`, error);
      alert(`Failed to update payment ${field}`);
      // Revert on error by refetching
      onPaymentUpdate();
      return;
    }

    // If updating estimated date and payment is linked to QB, sync the due date
    if (field === 'payment_date_estimated' && payment?.qb_invoice_id && value) {
      syncDueDateToQuickBooks(paymentId, value);
    }
  };

  // Sync due date changes to QuickBooks
  const syncDueDateToQuickBooks = async (paymentId: string, dueDate: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('No session for QB sync');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-update-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ paymentId, dueDate }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error('Failed to sync due date to QB:', result.error);
        setQbSyncMessage({ paymentId, type: 'error', text: `QB sync failed: ${result.error}` });
        setTimeout(() => setQbSyncMessage(null), 4000);
        return;
      }

      setQbSyncMessage({ paymentId, type: 'success', text: 'Due date synced to QB' });
      setTimeout(() => setQbSyncMessage(null), 3000);
    } catch (error: any) {
      console.error('Error syncing due date to QB:', error);
    }
  };

  const handleUpdateBrokerSplit = (paymentId: string, splitId: string, updates: { paid?: boolean; paid_date?: string | null }) => {
    // Optimistic update - update local state immediately
    setLocalPayments(prevPayments =>
      prevPayments.map(payment =>
        payment.payment_id === paymentId
          ? {
              ...payment,
              broker_splits: payment.broker_splits.map(split =>
                split.payment_split_id === splitId
                  ? { ...split, ...updates }
                  : split
              ),
              // Recalculate all_brokers_paid
              all_brokers_paid: payment.broker_splits.every(split =>
                split.payment_split_id === splitId ? (updates.paid ?? split.paid) : split.paid
              )
            }
          : payment
      )
    );
  };

  const handleUpdateReferralFee = (paymentId: string, updates: { referral_fee_paid?: boolean; referral_fee_paid_date?: string | null }) => {
    // Optimistic update - update local state immediately
    setLocalPayments(prevPayments =>
      prevPayments.map(payment =>
        payment.payment_id === paymentId
          ? { ...payment, ...updates }
          : payment
      )
    );
  };

  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getPayoutStatusBadge = (payment: PaymentDashboardRow) => {
    const hasReferralFee = payment.referral_fee_usd && payment.referral_fee_usd > 0;
    const allBrokersPaid = payment.all_brokers_paid;
    const referralPaid = payment.referral_fee_paid;

    if (allBrokersPaid && (!hasReferralFee || referralPaid)) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Fully Paid</span>;
    } else if (payment.broker_splits.some(b => b.paid) || referralPaid) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Partial</span>;
    } else {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">Unpaid</span>;
    }
  };

  const handleOpenSidebar = (payment: PaymentDashboardRow) => {
    setSelectedPayment(payment);
    setIsSidebarOpen(true);
    setOpenMenuId(null);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setSelectedPayment(null);
  };

  const toggleMenu = (paymentId: string) => {
    setOpenMenuId(openMenuId === paymentId ? null : paymentId);
  };

  const handleDeletePayment = (paymentId: string) => {
    setPaymentToDelete(paymentId);
    setShowDeleteConfirm(true);
    setOpenMenuId(null);
  };

  const handleOpenOverrideModal = (payment: PaymentDashboardRow) => {
    setPaymentToOverride(payment);
    setShowOverrideModal(true);
    setOpenMenuId(null);
  };

  const handleClearOverride = async (paymentId: string) => {
    if (!confirm('Clear the override and allow automatic recalculation?')) return;

    try {
      const { error } = await supabase
        .from('payment')
        .update({
          amount_override: false,
          override_at: null,
          override_by: null,
        })
        .eq('id', paymentId);

      // If columns don't exist yet, just warn and close menu
      if (error && (error.message.includes('amount_override') || error.message.includes('schema cache'))) {
        console.warn('Override columns not found. Please run migrations to enable override functionality.');
        alert('Override feature requires database migrations. Please run migrations first.');
        setOpenMenuId(null);
        return;
      }

      if (error) throw error;

      onPaymentUpdate();
      setOpenMenuId(null);
    } catch (error: any) {
      console.error('Error clearing override:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Sync payment to QuickBooks
  const handleSyncToQuickBooks = async (paymentId: string) => {
    setSyncingPaymentId(paymentId);
    setQbSyncMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setQbSyncMessage({ paymentId, type: 'error', text: 'You must be logged in to sync' });
        setSyncingPaymentId(null);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            paymentId: paymentId,
            sendEmail: false,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync');
      }

      const message = result.linked
        ? `Linked to invoice #${result.qbInvoiceNumber}`
        : `Invoice #${result.qbInvoiceNumber} created`;

      setQbSyncMessage({ paymentId, type: 'success', text: message });
      onPaymentUpdate();
    } catch (error: any) {
      setQbSyncMessage({ paymentId, type: 'error', text: error.message || 'Sync failed' });
    } finally {
      setSyncingPaymentId(null);
      // Clear message after 4 seconds
      setTimeout(() => setQbSyncMessage(null), 4000);
    }
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;

    try {
      // First delete all payment splits
      const { error: splitsError } = await supabase
        .from('payment_splits')
        .delete()
        .eq('payment_id', paymentToDelete);

      if (splitsError) throw splitsError;

      // Then delete the payment
      const { error: paymentError } = await supabase
        .from('payment')
        .delete()
        .eq('id', paymentToDelete);

      if (paymentError) throw paymentError;

      // Refresh data
      onPaymentUpdate();

      // Close dialog
      setShowDeleteConfirm(false);
      setPaymentToDelete(null);
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment');
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPaymentToDelete(null);
  };

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (localPayments.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-12 text-center">
        <p className="text-gray-500">No payments found matching your filters.</p>
      </div>
    );
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <svg className="ml-1 h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="ml-1 h-3 w-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="ml-1 h-3 w-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {/* Checkbox column for selection */}
              {showSelection && (
                <th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={localPayments.length > 0 && selectedIds.size === localPayments.length}
                    onChange={onSelectAll}
                    className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded cursor-pointer"
                    title="Select all"
                  />
                </th>
              )}
              <th className="w-8 px-2 py-2"></th>
              <th
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('deal_name')}
              >
                <div className="flex items-center">
                  Deal
                  {renderSortIcon('deal_name')}
                </div>
              </th>
              <th
                className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('orep_invoice')}
              >
                <div className="flex items-center justify-center">
                  OVIS Inv #
                  {renderSortIcon('orep_invoice')}
                </div>
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                QBO Inv #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Payment
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('payment_date_estimated')}
              >
                <div className="flex items-center">
                  Est. Date
                  {renderSortIcon('payment_date_estimated')}
                </div>
              </th>
              <th
                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('payment_received')}
              >
                <div className="flex items-center">
                  Received
                  {renderSortIcon('payment_received')}
                </div>
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Brokers
              </th>
              <th
                className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('disbursement')}
              >
                <div className="flex items-center justify-center">
                  Disbursement
                  {renderSortIcon('disbursement')}
                </div>
              </th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {localPayments.map((payment) => {
              const isExpanded = expandedRows.has(payment.payment_id);
              return (
                <React.Fragment key={payment.payment_id}>
                  {/* Main Payment Row */}
                  <tr className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(payment.payment_id) ? 'bg-amber-50' : ''}`}>
                    {/* Checkbox cell for selection */}
                    {showSelection && (
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(payment.payment_id)}
                          onChange={() => onToggleSelect?.(payment.payment_id)}
                          className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-2 py-3">
                      <button
                        onClick={() => toggleRow(payment.payment_id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className={`h-5 w-5 transform transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      <div className="flex flex-col">
                        <a
                          href={`/deal/${payment.deal_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-blue-600 hover:text-blue-900 hover:underline text-left"
                        >
                          {payment.deal_name}
                        </a>
                        {payment.deal_stage && (
                          <span className="text-xs text-gray-500 mt-0.5">
                            {payment.deal_stage}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={payment.orep_invoice || ''}
                        onChange={(e) => handleUpdatePaymentField(payment.payment_id, 'orep_invoice', e.target.value || null)}
                        placeholder="-"
                        className="w-16 border-0 bg-transparent px-0 py-0 text-sm text-gray-900 text-center focus:outline-none focus:ring-0 placeholder-gray-400 cursor-text"
                      />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        {payment.qb_invoice_id ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700" title={`QB Invoice #${payment.qb_invoice_number || payment.qb_invoice_id}`}>
                            <CheckCircleIcon className="w-3 h-3" />
                            {payment.qb_invoice_number || 'Synced'}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSyncToQuickBooks(payment.payment_id)}
                            disabled={syncingPaymentId === payment.payment_id}
                            className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 disabled:opacity-50"
                            title="Sync to QuickBooks"
                          >
                            {syncingPaymentId === payment.payment_id ? '...' : 'Sync QB'}
                          </button>
                        )}
                      </div>
                      {/* QB Sync Message */}
                      {qbSyncMessage && qbSyncMessage.paymentId === payment.payment_id && (
                        <div className={`text-xs mt-1 ${qbSyncMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                          {qbSyncMessage.text}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-gray-900"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      Payment {payment.payment_sequence} of {payment.total_payments}
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {formatCurrency(payment.payment_amount)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="date"
                        value={payment.payment_date_estimated || ''}
                        onChange={(e) => handleUpdatePaymentField(payment.payment_id, 'payment_date_estimated', e.target.value || null)}
                        className="border-0 bg-transparent px-0 py-0 text-sm text-gray-900 focus:outline-none focus:ring-0 cursor-text"
                      />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        payment.payment_received
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payment.payment_received ? 'Received' : 'Not Received'}
                      </span>
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-gray-500"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {payment.broker_splits.length} broker(s)
                      <br />
                      <span className="text-xs text-gray-400">
                        {formatCurrency(payment.total_broker_amount)}
                      </span>
                    </td>
                    <td
                      className="px-2 py-3 whitespace-nowrap text-center"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {getPayoutStatusBadge(payment)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-sm relative">
                      <div className="flex items-center gap-1" ref={openMenuId === payment.payment_id ? menuRef : null}>
                        {/* Lock/Unlock Button - Admin Only (TODO: Add role check) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdatePaymentField(payment.payment_id, 'locked', !payment.locked);
                          }}
                          className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                            payment.locked ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-gray-600'
                          }`}
                          title={payment.locked ? 'Unlock payment (allows auto-updates)' : 'Lock payment (prevents auto-updates)'}
                        >
                          {payment.locked ? (
                            // Locked icon
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          ) : (
                            // Unlocked icon
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>

                        {/* Three-dot menu */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMenu(payment.payment_id);
                          }}
                          className="text-gray-400 hover:text-gray-600 p-1"
                        >
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                        {openMenuId === payment.payment_id && (
                          <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                            <div className="py-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenSidebar(payment);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                View Details
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenOverrideModal(payment);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                {(payment as any).amount_override ? '📝 Edit Override' : '🔧 Override Amount'}
                              </button>
                              {(payment as any).amount_override && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClearOverride(payment.payment_id);
                                  }}
                                  className="block w-full text-left px-4 py-2 text-sm text-orange-700 hover:bg-gray-100"
                                >
                                  🔓 Clear Override
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePayment(payment.payment_id);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                              >
                                Delete Payment
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={showSelection ? 12 : 11} className="px-0 py-0 bg-gray-50">
                        <div className="px-12 py-4">
                          {/* Payment Check Processing Section */}
                          <PaymentCheckProcessing
                            paymentReceived={payment.payment_received}
                            paymentReceivedDate={payment.payment_received_date}
                            invoiceSent={payment.invoice_sent}
                            invoiceDate={payment.payment_invoice_date}
                            onUpdateField={(field, value) => handleUpdatePaymentField(payment.payment_id, field, value)}
                          />

                          {/* Broker Splits */}
                          {payment.broker_splits.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                Broker Commission Breakdown
                              </h4>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                        Broker
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Origination
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Site
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Deal
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Total
                                      </th>
                                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                        Paid
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {payment.broker_splits.map((split) => (
                                      <BrokerPaymentRow
                                        key={split.payment_split_id}
                                        split={split}
                                        paymentId={payment.payment_id}
                                        onUpdate={onPaymentUpdate}
                                        onOptimisticUpdate={(splitId, updates) => handleUpdateBrokerSplit(payment.payment_id, splitId, updates)}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Referral Fee */}
                          {payment.referral_fee_usd && payment.referral_fee_usd > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                Referral Fee
                              </h4>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <ReferralFeeRow
                                  paymentId={payment.payment_id}
                                  payeeName={payment.referral_payee_name || 'Unknown'}
                                  amount={payment.referral_fee_usd}
                                  paid={payment.referral_fee_paid}
                                  paidDate={payment.referral_fee_paid_date}
                                  onUpdate={onPaymentUpdate}
                                  onOptimisticUpdate={(updates) => handleUpdateReferralFee(payment.payment_id, updates)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Payment Detail Sidebar */}
      {selectedPayment && (
        <PaymentDetailSidebar
          payment={selectedPayment}
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
          onUpdate={onPaymentUpdate}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Payment?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete this payment and all associated broker commission splits. This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button onClick={cancelDelete} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                Delete Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {paymentToOverride && (
        <PaymentAmountOverrideModal
          isOpen={showOverrideModal}
          onClose={() => {
            setShowOverrideModal(false);
            setPaymentToOverride(null);
          }}
          paymentId={paymentToOverride.payment_id}
          currentAmount={paymentToOverride.payment_amount}
          paymentSequence={paymentToOverride.payment_sequence}
          dealName={paymentToOverride.deal_name}
          onSuccess={() => {
            onPaymentUpdate();
            setPaymentToOverride(null);
          }}
        />
      )}
    </div>
  );
};

export default PaymentDashboardTable;
