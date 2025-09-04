import React, { useState } from 'react';
import { Database } from '../../../database-schema';
import PropertyInputField from './PropertyInputField';

type Property = Database['public']['Tables']['property']['Row'];

interface MarketAnalysisSectionProps {
  property: Property;
  onFieldUpdate: (field: keyof Property, value: any) => void;
}

const MarketAnalysisSection: React.FC<MarketAnalysisSectionProps> = ({
  property,
  onFieldUpdate
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Market Analysis</h3>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-6">
          {/* Traffic Information */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Traffic Data</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <PropertyInputField
                  label="Traffic Count"
                  value={property.traffic_count}
                  onChange={(value) => onFieldUpdate('traffic_count', value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Daily vehicle count</p>
              </div>

              <div>
                <PropertyInputField
                  label="Secondary Traffic Count"
                  value={property.traffic_count_2nd}
                  onChange={(value) => onFieldUpdate('traffic_count_2nd', value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Secondary road/access point</p>
              </div>

              <div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Total Traffic</label>
                  <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-base min-h-[44px] flex items-center">
                    <span className="text-gray-900 font-medium">
                      {((property.traffic_count || 0) + (property.traffic_count_2nd || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Calculated total (vehicles/day)</p>
              </div>
            </div>
          </div>

          {/* Demographics */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Demographics</h4>
            <div className="space-y-4">
              <PropertyInputField
                label="Demographic Information"
                value={property.demographics}
                onChange={(value) => onFieldUpdate('demographics', value)}
                placeholder="Population, income levels, age groups, household composition, etc."
                multiline={true}
                rows={4}
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PropertyInputField
                  label="1 Mile Population"
                  value={property['1_mile_pop']}
                  onChange={(value) => onFieldUpdate('1_mile_pop', value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="Enter population count"
                />
                
                <PropertyInputField
                  label="HH Income - Median 3 Mile"
                  value={property.hh_income_median_3_mile}
                  onChange={(value) => onFieldUpdate('hh_income_median_3_mile', value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="Enter median income"
                />
                
                <PropertyInputField
                  label="3 Mile Population"
                  value={property['3_mile_pop']}
                  onChange={(value) => onFieldUpdate('3_mile_pop', value)}
                  type="number"
                  inputMode="numeric"
                  placeholder="Enter population count"
                />
              </div>
            </div>
          </div>

        </div>
      )}
    </section>
  );
};

export default MarketAnalysisSection;