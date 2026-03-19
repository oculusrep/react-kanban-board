import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { ExclamationTriangleIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

interface MissingBillToPayment {
  payment_id: string;
  payment_name: string;
  payment_amount: number;
  qb_invoice_number: string | null;
  qb_sync_status: string | null;
  deal_id: string;
  deal_name: string;
  bill_to_company_name: string | null;
  bill_to_contact_name: string | null;
  bill_to_email: string | null;
}

const MissingBillToReport: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<MissingBillToPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMissingBillToPayments();
  }, []);

  const fetchMissingBillToPayments = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch payments linked to QBO that are missing bill-to info
      const { data, error: fetchError } = await supabase
        .from('payment')
        .select(`
          id,
          payment_name,
          payment_amount,
          qb_invoice_number,
          qb_sync_status,
          deal_id,
          deal!inner (
            deal_name,
            bill_to_company_name,
            bill_to_contact_name,
            bill_to_email
          )
        `)
        .not('qb_invoice_id', 'is', null)
        .eq('is_active', true)
        .order('qb_invoice_number', { ascending: true });

      if (fetchError) throw fetchError;

      // Filter for missing bill-to info
      const missingBillTo = (data || [])
        .filter((p: any) => {
          const deal = p.deal;
          return !deal.bill_to_company_name ||
                 deal.bill_to_company_name === '' ||
                 !deal.bill_to_email ||
                 deal.bill_to_email === '';
        })
        .map((p: any) => ({
          payment_id: p.id,
          payment_name: p.payment_name,
          payment_amount: p.payment_amount,
          qb_invoice_number: p.qb_invoice_number,
          qb_sync_status: p.qb_sync_status,
          deal_id: p.deal_id,
          deal_name: p.deal.deal_name,
          bill_to_company_name: p.deal.bill_to_company_name,
          bill_to_contact_name: p.deal.bill_to_contact_name,
          bill_to_email: p.deal.bill_to_email,
        }));

      setPayments(missingBillTo);
    } catch (err: any) {
      console.error('Error fetching missing bill-to payments:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handleOpenDeal = (dealId: string) => {
    navigate(`/deals/${dealId}?tab=payments`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Error: {error}</p>
        <button
          onClick={fetchMissingBillToPayments}
          className="mt-2 text-sm text-red-600 underline hover:text-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Invoices Missing Bill-To Information</h2>
            <p className="text-sm text-gray-500">
              These invoices are synced to QuickBooks but cannot be sent or resynced without bill-to info
            </p>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          <span className="font-medium text-amber-600">{payments.length}</span> invoice{payments.length !== 1 ? 's' : ''} need attention
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-700 font-medium">All synced invoices have bill-to information</p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deal
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Missing Fields
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payments.map((payment) => {
                const missingFields: string[] = [];
                if (!payment.bill_to_company_name) missingFields.push('Company Name');
                if (!payment.bill_to_contact_name) missingFields.push('Contact Name');
                if (!payment.bill_to_email) missingFields.push('Email');

                return (
                  <tr key={payment.payment_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {payment.qb_invoice_number || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{payment.deal_name}</div>
                      <div className="text-xs text-gray-500">{payment.payment_name}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(payment.payment_amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {missingFields.map((field) => (
                          <span
                            key={field}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleOpenDeal(payment.deal_id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        Edit Deal
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Help text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">How to fix:</h3>
        <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
          <li>Click "Edit Deal" to open the deal details</li>
          <li>Go to the Payments tab and expand the Bill-To Information section</li>
          <li>Fill in the Company Name and Email (required for sending invoices)</li>
          <li>The invoice will automatically resync to QuickBooks with the updated info</li>
        </ol>
      </div>
    </div>
  );
};

export default MissingBillToReport;
