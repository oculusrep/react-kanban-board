// components/CommissionDetailsSection.tsx
import React from 'react';
import { Deal } from '../lib/types';
import PercentageInput from './PercentageInput';
import ReferralPayeeAutocomplete from './ReferralPayeeAutocomplete';

interface CommissionDetailsSectionProps {
  deal: Deal;
  onFieldUpdate: (field: string, value: any) => void;
}

interface SectionProps {
  title: string;
  help?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, help, children }) => {
  return (
    <section className="bg-white rounded-md border p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {help && (
          <span
            className="text-gray-500 text-xs border rounded-full w-4 h-4 inline-flex items-center justify-center"
            title={help}
            aria-label={help}
          >
            i
          </span>
        )}
      </div>
      {children}
    </section>
  );
};

const CommissionDetailsSection: React.FC<CommissionDetailsSectionProps> = ({
  deal,
  onFieldUpdate
}) => {
  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (percent: number | null): string => {
    if (percent === null || percent === undefined) return '0.0%';
    return `${percent.toFixed(1)}%`;
  };

  return (
    <Section title="Commission Details" help="Set commission percentages and amounts. Click any percentage to edit.">
      <div className="space-y-4">
        {/* Top Row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Deal Fee</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.fee)}
            </div>
          </div>
          
          <PercentageInput
            label="Commission Rate %"
            value={deal.commission_percent}
            onChange={(v) => onFieldUpdate('commission_percent', v)}
          />
          
          <PercentageInput
            label="Referral Fee %"
            value={deal.referral_fee_percent}
            onChange={(v) => onFieldUpdate('referral_fee_percent', v)}
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Referral Fee $</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.referral_fee_usd)}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Number of Payments</label>
            <input
              type="number"
              step="1"
              min="1"
              value={deal.number_of_payments || 1}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                onFieldUpdate('number_of_payments', parseInt(e.target.value) || 1)
              }
              className="mt-1 block w-full rounded border-gray-300 shadow-sm cursor-pointer hover:bg-blue-50 px-3 py-2 transition-colors border border-transparent hover:border-blue-200 text-sm"
            />
          </div>
        </div>

        {/* Second Row: Referral Payee and GCI/AGCI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ReferralPayeeAutocomplete
            value={deal.referral_payee_client_id}
            onChange={(clientId) => onFieldUpdate('referral_payee_client_id', clientId)}
            label="Referral Payee"
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700">GCI</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.gci)}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">AGCI</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.agci)}
            </div>
          </div>
        </div>

        {/* Third Row: House */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PercentageInput
            label="House %"
            value={deal.house_percent}
            onChange={(v) => onFieldUpdate('house_percent', v)}
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700">House $</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.house_usd)}
            </div>
          </div>
        </div>

        {/* Fourth Row: Origination */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PercentageInput
            label="Origination %"
            value={deal.origination_percent}
            onChange={(v) => onFieldUpdate('origination_percent', v)}
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Origination $</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.origination_usd)}
            </div>
          </div>
        </div>

        {/* Fifth Row: Site */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PercentageInput
            label="Site %"
            value={deal.site_percent}
            onChange={(v) => onFieldUpdate('site_percent', v)}
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Site $</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.site_usd)}
            </div>
          </div>
        </div>

        {/* Sixth Row: Deal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PercentageInput
            label="Deal %"
            value={deal.deal_percent}
            onChange={(v) => onFieldUpdate('deal_percent', v)}
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Deal $</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(deal.deal_usd)}
            </div>
          </div>
        </div>

        {/* Broker Percentage Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-xs font-medium text-blue-800 mb-2">Broker Split Summary (Origination + Site + Deal)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-blue-700">Origination:</span> {formatPercent(deal.origination_percent)}
            </div>
            <div>
              <span className="text-blue-700">Site:</span> {formatPercent(deal.site_percent)}
            </div>
            <div>
              <span className="text-blue-700">Deal:</span> {formatPercent(deal.deal_percent)}
            </div>
            <div className="font-semibold">
              <span className="text-blue-700">Total:</span> {formatPercent(
                (deal.origination_percent || 0) + 
                (deal.site_percent || 0) + 
                (deal.deal_percent || 0)
              )}
            </div>
          </div>
          <div className="mt-2 text-xs text-blue-600">
            House % is separate and not included in the 100% split validation.
          </div>
        </div>
      </div>
    </Section>
  );
};

export default CommissionDetailsSection;