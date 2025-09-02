import React, { useState, useEffect } from 'react';
import { Payment, Deal, Client, Broker, PaymentSplit, CommissionSplit } from '../../lib/types';
import DisbursementCheckItem from './DisbursementCheckItem';
import { formatCurrency } from '../../utils/formatters';

interface PaymentDisbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment;
  deal: Deal;
  clients: Client[];
  brokers: Broker[];
  paymentSplits: PaymentSplit[];
  onUpdateReferralPaid: (paymentId: string, paid: boolean) => Promise<void>;
  onUpdatePaymentSplitPaid: (splitId: string, paid: boolean) => Promise<void>;
}

interface DisbursementItem {
  id: string;
  type: 'referral' | 'broker';
  payeeName: string;
  amount: number;
  paid: boolean;
}

const PaymentDisbursementModal: React.FC<PaymentDisbursementModalProps> = ({
  isOpen,
  onClose,
  payment,
  deal,
  clients,
  brokers,
  paymentSplits,
  onUpdateReferralPaid,
  onUpdatePaymentSplitPaid
}) => {
  const [disbursementItems, setDisbursementItems] = useState<DisbursementItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Calculate disbursement items when modal opens
  useEffect(() => {
    if (isOpen) {
      const items: DisbursementItem[] = [];

      // Add referral payment if applicable (proportionally calculated for this payment)
      if (deal.referral_payee_client_id && deal.referral_fee_usd && deal.referral_fee_usd > 0) {
        const referralClient = clients.find(c => c.id === deal.referral_payee_client_id);
        
        // Calculate proportional referral fee for this payment
        // Referral fee should be split proportionally based on payment amount vs total deal amount
        const dealAmount = deal.fee || deal.deal_usd || 0;
        const paymentAmount = payment.payment_amount || 0;
        const proportionalReferralFee = dealAmount > 0 
          ? (deal.referral_fee_usd * (paymentAmount / dealAmount))
          : 0;
        
        if (proportionalReferralFee > 0) {
          items.push({
            id: `referral-${payment.id}`,
            type: 'referral',
            payeeName: referralClient?.client_name || 'Unknown Referral Client',
            amount: proportionalReferralFee,
            paid: payment.referral_fee_paid || false
          });
        }
      }

      // Add broker commission splits
      console.log('🔍 Payment splits for disbursement modal:', paymentSplits);
      paymentSplits.forEach(split => {
        const broker = brokers.find(b => b.id === split.broker_id);
        // Get the broker paid status directly from the payment split
        const brokerPaid = split.paid || false;
        
        console.log('🔍 Processing split:', { 
          paymentSplitId: split.id, 
          brokerName: broker?.name, 
          brokerPaid, 
          amount: split.split_broker_total
        });
        
        if (split.split_broker_total && split.split_broker_total > 0) {
          items.push({
            id: split.id,
            type: 'broker',
            payeeName: broker?.name || 'Unknown Broker',
            amount: split.split_broker_total,
            paid: brokerPaid
          });
        }
      });

      setDisbursementItems(items);
    }
  }, [isOpen, payment, deal, clients, brokers, paymentSplits]);

  const handleTogglePaid = async (item: DisbursementItem, paid: boolean) => {
    setLoading(true);
    try {
      if (item.type === 'referral') {
        await onUpdateReferralPaid(payment.id, paid);
      } else {
        await onUpdatePaymentSplitPaid(item.id, paid);
      }
      
      // Update local state
      setDisbursementItems(items => 
        items.map(i => i.id === item.id ? { ...i, paid } : i)
      );
    } catch (error) {
      console.error('Error updating disbursement status:', error);
      // TODO: Add user-friendly error handling
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totalAmount = payment.payment_amount || 0;
  const totalDisbursed = disbursementItems.reduce((sum, item) => sum + (item.paid ? item.amount : 0), 0);
  const remainingBalance = totalAmount - totalDisbursed;
  const paidCount = disbursementItems.filter(item => item.paid).length;
  const totalCount = disbursementItems.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white text-sm">💰</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Payment Disbursement</h2>
              <p className="text-sm text-gray-600">
                Payment {payment.payment_sequence} - {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            disabled={loading}
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Summary */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              Disbursement Progress: {paidCount} of {totalCount} checks written
            </span>
            <span className="text-sm text-gray-600">
              {Math.round((paidCount / Math.max(totalCount, 1)) * 100)}% Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(paidCount / Math.max(totalCount, 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Disbursement Items */}
        <div className="flex-1 overflow-y-auto p-6">
          {disbursementItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-gray-400 text-2xl">💸</span>
              </div>
              <p className="text-gray-700 font-medium mb-2">No Disbursements Required</p>
              <p className="text-sm text-gray-500">
                This payment has no referral fees or broker commissions to disburse.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Referral Payments Section */}
              {disbursementItems.some(item => item.type === 'referral') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">
                    Referral Payments
                  </h3>
                  <div className="space-y-2">
                    {disbursementItems
                      .filter(item => item.type === 'referral')
                      .map(item => (
                        <DisbursementCheckItem
                          key={item.id}
                          payeeName={item.payeeName}
                          amount={item.amount}
                          paid={item.paid}
                          onTogglePaid={(paid) => handleTogglePaid(item, paid)}
                          disabled={loading}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Broker Commission Section */}
              {disbursementItems.some(item => item.type === 'broker') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">
                    Broker Commissions
                  </h3>
                  <div className="space-y-2">
                    {disbursementItems
                      .filter(item => item.type === 'broker')
                      .map(item => (
                        <DisbursementCheckItem
                          key={item.id}
                          payeeName={item.payeeName}
                          amount={item.amount}
                          paid={item.paid}
                          onTogglePaid={(paid) => handleTogglePaid(item, paid)}
                          disabled={loading}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Totals */}
        {disbursementItems.length > 0 && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Payment Received:</span>
                <p className="font-semibold text-gray-900">{formatCurrency(totalAmount)}</p>
              </div>
              <div>
                <span className="text-gray-600">Disbursed:</span>
                <p className="font-semibold text-green-600">{formatCurrency(totalDisbursed)}</p>
              </div>
              <div>
                <span className="text-gray-600">Remaining:</span>
                <p className={`font-semibold ${remainingBalance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                  {formatCurrency(remainingBalance)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentDisbursementModal;