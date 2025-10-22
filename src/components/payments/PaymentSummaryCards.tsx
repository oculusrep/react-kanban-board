// Payment Summary Cards
// src/components/payments/PaymentSummaryCards.tsx

import React from 'react';
import { PaymentSummaryStats } from '../../types/payment-dashboard';

interface PaymentSummaryCardsProps {
  stats: PaymentSummaryStats;
}

const PaymentSummaryCards: React.FC<PaymentSummaryCardsProps> = ({ stats }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const cards = [
    {
      title: 'Total Payments',
      value: stats.total_payments,
      subtitle: formatCurrency(stats.total_payment_amount),
      description: 'All payment records',
      color: 'blue',
    },
    {
      title: 'Payments Received',
      value: stats.payments_received,
      subtitle: formatCurrency(stats.payments_received_amount),
      description: `${stats.total_payments > 0 ? Math.round((stats.payments_received / stats.total_payments) * 100) : 0}% of total`,
      color: 'green',
    },
    {
      title: 'Broker Payouts Paid',
      value: `${stats.broker_payouts_paid} / ${stats.total_broker_payouts}`,
      subtitle: formatCurrency(stats.broker_payouts_paid_amount),
      description: `${stats.total_broker_payouts > 0 ? Math.round((stats.broker_payouts_paid / stats.total_broker_payouts) * 100) : 0}% completed`,
      color: 'purple',
    },
    {
      title: 'Referral Fees Paid',
      value: `${stats.referral_fees_paid} / ${stats.total_referral_fees}`,
      subtitle: formatCurrency(stats.referral_fees_paid_amount),
      description: `${stats.total_referral_fees > 0 ? Math.round((stats.referral_fees_paid / stats.total_referral_fees) * 100) : 0}% completed`,
      color: 'orange',
    },
  ];

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
      blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'bg-blue-100' },
      green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'bg-green-100' },
      purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'bg-purple-100' },
      orange: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'bg-orange-100' },
    };
    return colorMap[color] || colorMap.blue;
  };

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      {cards.map((card, index) => {
        const colors = getColorClasses(card.color);
        return (
          <div key={index} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 rounded-md p-3 ${colors.icon}`}>
                  <svg
                    className={`h-6 w-6 ${colors.text}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {index === 0 && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    )}
                    {index === 1 && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    )}
                    {index === 2 && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    )}
                    {index === 3 && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    )}
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{card.title}</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">{card.value}</div>
                    </dd>
                    <dd className="text-sm font-medium text-gray-600">{card.subtitle}</dd>
                    <dd className="text-xs text-gray-500 mt-1">{card.description}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PaymentSummaryCards;
