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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>
          </div>

          {/* Demographics */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Demographics</h4>
            <PropertyInputField
              label="Demographic Information"
              value={property.demographics}
              onChange={(value) => onFieldUpdate('demographics', value)}
              placeholder="Population, income levels, age groups, household composition, etc."
              multiline={true}
              rows={4}
            />
          </div>

          {/* Population Data (if available) */}
          {(property['1_mile_pop'] || property['3_mile_pop']) && (
            <div className="border-t border-gray-200 pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Population Radius Data</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-blue-800">1-Mile Population</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {property['1_mile_pop'] ? property['1_mile_pop'].toLocaleString() : 'N/A'}
                      </div>
                    </div>
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-green-800">3-Mile Population</div>
                      <div className="text-2xl font-bold text-green-900">
                        {property['3_mile_pop'] ? property['3_mile_pop'].toLocaleString() : 'N/A'}
                      </div>
                    </div>
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* Population density comparison */}
              {property['1_mile_pop'] && property['3_mile_pop'] && (
                <div className="mt-3 p-3 bg-gray-50 rounded-md">
                  <div className="text-sm text-gray-700">
                    <strong>Population Density Analysis:</strong>
                    <div className="mt-1 text-xs text-gray-600">
                      • 1-mile radius: ~{Math.round(property['1_mile_pop'] / 3.14).toLocaleString()} people per sq mile
                      <br />
                      • 3-mile radius: ~{Math.round(property['3_mile_pop'] / 28.27).toLocaleString()} people per sq mile
                      <br />
                      • Inner ring density: {property['1_mile_pop'] > (property['3_mile_pop'] / 9) ? 'High urban concentration' : 'Suburban spread pattern'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional Traffic Info */}
          {property.total_traffic && (
            <div className="border-t border-gray-200 pt-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm font-medium text-orange-800">Total Traffic Volume</div>
                </div>
                <div className="text-lg font-bold text-orange-900">
                  {property.total_traffic.toLocaleString()} vehicles/day
                </div>
                <div className="text-xs text-orange-700 mt-1">
                  Combined traffic from all access points and nearby roads
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default MarketAnalysisSection;