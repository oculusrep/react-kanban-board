/**
 * QuickBooks service for frontend operations
 * Handles invoice sync operations with the QuickBooks Edge Functions
 */

import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  qbInvoiceId?: string;
  qbInvoiceNumber?: string;
  wasUpdate?: boolean;
}

/**
 * Resync a payment's invoice to QuickBooks
 * This updates an existing invoice with current data from OVIS
 * @param paymentId - The payment ID to resync
 * @param sendEmail - Whether to also send the invoice via email
 * @returns SyncResult with success status and details
 */
export async function resyncInvoice(paymentId: string, sendEmail: boolean = false): Promise<SyncResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { success: false, error: 'You must be logged in to sync to QuickBooks' };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/quickbooks-sync-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey
      },
      body: JSON.stringify({
        paymentId,
        sendEmail,
        forceResync: true
      })
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
      return { success: false, error: result?.error || 'Failed to sync invoice' };
    }

    return {
      success: true,
      message: result.message,
      qbInvoiceId: result.qbInvoiceId,
      qbInvoiceNumber: result.qbInvoiceNumber,
      wasUpdate: result.wasUpdate
    };
  } catch (error: any) {
    console.error('QuickBooks resync error:', error);
    return { success: false, error: error.message || 'Failed to sync to QuickBooks' };
  }
}

/**
 * Automatically resync all invoices for a deal when bill-to fields change
 * Only resyncs payments that already have a qb_invoice_id
 * @param dealId - The deal ID whose payments should be resynced
 * @returns Array of results for each payment
 */
export async function resyncDealInvoices(dealId: string): Promise<{ paymentId: string; result: SyncResult }[]> {
  try {
    // Fetch all payments for this deal that have a QB invoice
    const { data: payments, error } = await supabase
      .from('payment')
      .select('id, qb_invoice_id')
      .eq('deal_id', dealId)
      .not('qb_invoice_id', 'is', null);

    if (error) {
      console.error('Error fetching payments for deal:', error);
      return [];
    }

    if (!payments || payments.length === 0) {
      console.log('No synced invoices found for deal:', dealId);
      return [];
    }

    // Resync each payment
    const results: { paymentId: string; result: SyncResult }[] = [];
    for (const payment of payments) {
      console.log('Auto-resyncing invoice for payment:', payment.id);
      const result = await resyncInvoice(payment.id);
      results.push({ paymentId: payment.id, result });
    }

    return results;
  } catch (error: any) {
    console.error('Error resyncing deal invoices:', error);
    return [];
  }
}

/**
 * Check if a payment has a synced QuickBooks invoice
 * @param paymentId - The payment ID to check
 * @returns true if the payment has a QB invoice
 */
export async function hasQBInvoice(paymentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('payment')
      .select('qb_invoice_id')
      .eq('id', paymentId)
      .single();

    if (error || !data) return false;
    return !!data.qb_invoice_id;
  } catch {
    return false;
  }
}

/**
 * Delete a QuickBooks invoice linked to a payment
 * This removes the invoice from QBO and clears the link in OVIS
 * @param paymentId - The payment ID whose invoice should be deleted
 * @returns SyncResult with success status and details
 */
export async function deleteQBInvoice(paymentId: string): Promise<SyncResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return { success: false, error: 'You must be logged in to delete QuickBooks invoices' };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/quickbooks-sync-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': anonKey
      },
      body: JSON.stringify({
        paymentId,
        deleteOnly: true
      })
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
      return { success: false, error: result?.error || 'Failed to delete invoice' };
    }

    return {
      success: true,
      message: result.message
    };
  } catch (error: any) {
    console.error('QuickBooks delete error:', error);
    return { success: false, error: error.message || 'Failed to delete QuickBooks invoice' };
  }
}
