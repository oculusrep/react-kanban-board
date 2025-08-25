import React from 'react';
import { PaymentStatusSummary } from '../hooks/usePaymentStatus';

interface PaymentStatusCardProps {
  statusSummary: PaymentStatusSummary;
  hasOverdue: boolean;
  completionRate: number;
}

const PaymentStatusCard: React.FC<PaymentStatusCardProps> = ({ 
  statusSummary, 
  hasOverdue,
  completionRate 
}) => {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-medium text-gray-600 mb-3">
        Payment Status
        {statusSummary.total > 0 && (
          <span className="ml-2 text-xs text-gray-500">
            ({Math.round(completionRate)}% complete)
          </span>
        )}
      </div>
      
      {/* Dynamic grid that only shows non-zero statuses */}
      <div className="flex flex-wrap gap-2 text-sm">
        {statusSummary.received > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-green-100 rounded min-w-0 flex-1">
            <span className="text-green-800">✅ Received</span>
            <span className="font-bold text-green-900 ml-2">{statusSummary.received}</span>
          </div>
        )}
        
        {statusSummary.sent > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-blue-100 rounded min-w-0 flex-1">
            <span className="text-blue-800">📧 Sent</span>
            <span className="font-bold text-blue-900 ml-2">{statusSummary.sent}</span>
          </div>
        )}
        
        {statusSummary.pending > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-yellow-100 rounded min-w-0 flex-1">
            <span className="text-yellow-800">⏳ Pending</span>
            <span className="font-bold text-yellow-900 ml-2">{statusSummary.pending}</span>
          </div>
        )}
        
        {statusSummary.overdue > 0 && (
          <div className="flex items-center justify-between px-3 py-2 bg-red-100 rounded min-w-0 flex-1">
            <span className="text-red-800">⚠️ Overdue</span>
            <span className="font-bold text-red-900 ml-2">{statusSummary.overdue}</span>
          </div>
        )}
      </div>
      
      {/* Overdue Alert */}
      {hasOverdue && (
        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <strong>Action needed:</strong> {statusSummary.overdue} payment{statusSummary.overdue !== 1 ? 's' : ''} 
          {statusSummary.overdue === 1 ? ' is' : ' are'} overdue and require{statusSummary.overdue === 1 ? 's' : ''} attention.
        </div>
      )}
      
      {/* Progress Bar (optional visual enhancement) */}
      {statusSummary.total > 0 && (
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentStatusCard;