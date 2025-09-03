import React from 'react';
import { Database } from '../../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];

interface FinancialSectionProps {
  property: Property;
  isEditing: boolean;
  onFieldUpdate: (field: keyof Property, value: any) => void;
}

const FinancialSection: React.FC<FinancialSectionProps> = ({
  property,
  isEditing,
  onFieldUpdate
}) => {
  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPSF = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleCurrencyBlur = (field: keyof Property, value: string) => {
    const numericValue = parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
    onFieldUpdate(field, numericValue);
  };

  const handlePSFBlur = (field: keyof Property, value: string) => {
    const numericValue = parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
    onFieldUpdate(field, numericValue);
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900">Financial Information</h3>
      </div>

      {/* Asking Prices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Asking Lease Price
          </label>
          {isEditing ? (
            <input
              type="text"
              inputMode="decimal"
              value={property.asking_lease_price ? property.asking_lease_price.toString() : ''}
              onChange={(e) => onFieldUpdate('asking_lease_price', e.target.value)}
              onBlur={(e) => handleCurrencyBlur('asking_lease_price', e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
            />
          ) : (
            <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center text-lg font-semibold text-green-700">
              {formatCurrency(property.asking_lease_price)}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">Annual lease amount</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Asking Purchase Price
          </label>
          {isEditing ? (
            <input
              type="text"
              inputMode="decimal"
              value={property.asking_purchase_price ? property.asking_purchase_price.toString() : ''}
              onChange={(e) => onFieldUpdate('asking_purchase_price', e.target.value)}
              onBlur={(e) => handleCurrencyBlur('asking_purchase_price', e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
            />
          ) : (
            <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center text-lg font-semibold text-blue-700">
              {formatCurrency(property.asking_purchase_price)}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">Total purchase price</p>
        </div>
      </div>

      {/* Per Square Foot Rates */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Per Square Foot Rates</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rent PSF
            </label>
            {isEditing ? (
              <input
                type="text"
                inputMode="decimal"
                value={property.rent_psf ? property.rent_psf.toString() : ''}
                onChange={(e) => onFieldUpdate('rent_psf', e.target.value)}
                onBlur={(e) => handlePSFBlur('rent_psf', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
              />
            ) : (
              <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center font-medium">
                {formatPSF(property.rent_psf)} / SF
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Base rent per square foot</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              NNN PSF
            </label>
            {isEditing ? (
              <input
                type="text"
                inputMode="decimal"
                value={property.nnn_psf ? property.nnn_psf.toString() : ''}
                onChange={(e) => onFieldUpdate('nnn_psf', e.target.value)}
                onBlur={(e) => handlePSFBlur('nnn_psf', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
              />
            ) : (
              <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center font-medium">
                {formatPSF(property.nnn_psf)} / SF
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Triple net charges per square foot</p>
          </div>
        </div>

        {/* Calculate total rent if both values available */}
        {property.rent_psf && property.nnn_psf && property.available_sqft && (
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <div className="text-sm font-medium text-blue-900 mb-1">All-In Rent Calculation</div>
            <div className="text-lg font-bold text-blue-700">
              {formatPSF((property.rent_psf + property.nnn_psf))} / SF
            </div>
            <div className="text-sm text-blue-600">
              Total annual: {formatCurrency((property.rent_psf + property.nnn_psf) * property.available_sqft)}
            </div>
          </div>
        )}
      </div>

      {/* Square Footage for Context */}
      <div className="border-t border-gray-200 pt-4 mt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Square Footage</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Building Size
            </label>
            {isEditing ? (
              <input
                type="number"
                value={property.building_sqft || ''}
                onChange={(e) => onFieldUpdate('building_sqft', parseInt(e.target.value) || null)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
              />
            ) : (
              <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center">
                {property.building_sqft ? `${property.building_sqft.toLocaleString()} SF` : 'Not set'}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Total building square footage</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Available Size
            </label>
            {isEditing ? (
              <input
                type="number"
                value={property.available_sqft || ''}
                onChange={(e) => onFieldUpdate('available_sqft', parseInt(e.target.value) || null)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
              />
            ) : (
              <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center">
                {property.available_sqft ? `${property.available_sqft.toLocaleString()} SF` : 'Not set'}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Available square footage for lease</p>
          </div>
        </div>

        {/* Occupancy percentage if both values available */}
        {property.building_sqft && property.available_sqft && (
          <div className="mt-3 p-2 bg-gray-50 rounded-md">
            <div className="text-sm text-gray-600">
              Occupancy: {(((property.building_sqft - property.available_sqft) / property.building_sqft) * 100).toFixed(1)}% 
              ({property.building_sqft - property.available_sqft} SF occupied)
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default FinancialSection;