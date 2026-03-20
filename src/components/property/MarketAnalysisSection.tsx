import React, { useState } from 'react';
import { Database } from '../../../database-schema';
import PropertyInputField from './PropertyInputField';
import TapestrySegmentCard from './TapestrySegmentCard';
import { usePropertyGeoenrichment, formatEnrichmentDate, isEnrichmentStale } from '../../hooks/usePropertyGeoenrichment';

type Property = Database['public']['Tables']['property']['Row'];

interface MarketAnalysisSectionProps {
  property: Property;
  onFieldUpdate: (field: keyof Property, value: any) => void;
  onPropertyRefresh?: () => void;
}

const MarketAnalysisSection: React.FC<MarketAnalysisSectionProps> = ({
  property,
  onFieldUpdate,
  onPropertyRefresh
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { isEnriching, enrichError, enrichProperty, saveEnrichmentToProperty, clearError } = usePropertyGeoenrichment();

  // Check if property has coordinates for enrichment
  const hasCoordinates = !!(property.latitude && property.longitude);

  // Check if property has existing enrichment data
  const hasEnrichmentData = !!property.esri_enriched_at;

  // Check if data is stale (> 1 year old)
  const dataIsStale = isEnrichmentStale(property.esri_enriched_at);

  // Handle enrichment button click
  const handleEnrich = async (forceRefresh = false) => {
    if (!hasCoordinates) return;

    clearError();

    const result = await enrichProperty(
      property.id,
      property.latitude!,
      property.longitude!,
      forceRefresh
    );

    if (result) {
      const saved = await saveEnrichmentToProperty(property.id, result);
      if (saved && onPropertyRefresh) {
        onPropertyRefresh();
      }
    }
  };

  // Format currency for display
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format number with commas
  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US').format(value);
  };

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

          {/* ESRI Demographics Section */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">Demographics (ESRI)</h4>
              <div className="flex items-center gap-2">
                {hasEnrichmentData && (
                  <span className="text-xs text-gray-500">
                    Last updated: {formatEnrichmentDate(property.esri_enriched_at)}
                    {dataIsStale && (
                      <span className="text-amber-600 ml-1">(stale)</span>
                    )}
                  </span>
                )}
                <button
                  onClick={() => handleEnrich(hasEnrichmentData)}
                  disabled={!hasCoordinates || isEnriching}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    !hasCoordinates
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : hasEnrichmentData
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-[#002147] text-white hover:bg-[#002147]/90'
                  }`}
                  title={!hasCoordinates ? 'Add coordinates to enable enrichment' : ''}
                >
                  {isEnriching ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Enriching...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {hasEnrichmentData ? 'Re-enrich' : 'Enrich with Demographics'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {enrichError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">{enrichError}</p>
                <button
                  onClick={clearError}
                  className="text-xs text-red-600 hover:text-red-800 mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Tapestry Segment Card */}
            {(property.tapestry_segment_code || property.tapestry_segment_name) && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tapestry Segment</p>
                <TapestrySegmentCard
                  code={property.tapestry_segment_code}
                  name={property.tapestry_segment_name}
                  description={property.tapestry_segment_description}
                  lifemodes={property.tapestry_lifemodes}
                />
              </div>
            )}

            {/* Demographics Grid */}
            {hasEnrichmentData && (
              <div className="space-y-4 mb-4">
                {/* Summary Row - Key Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#002147]/5 rounded-lg p-3 border border-[#002147]/10">
                    <p className="text-xs text-gray-500 mb-1">3 Mile Population</p>
                    <p className="text-xl font-bold text-[#002147]">
                      {formatNumber(property.pop_3_mile)}
                    </p>
                  </div>
                  <div className="bg-[#002147]/5 rounded-lg p-3 border border-[#002147]/10">
                    <p className="text-xs text-gray-500 mb-1">3 Mile Households</p>
                    <p className="text-xl font-bold text-[#002147]">
                      {formatNumber(property.households_3_mile)}
                    </p>
                  </div>
                  <div className="bg-[#002147]/5 rounded-lg p-3 border border-[#002147]/10">
                    <p className="text-xs text-gray-500 mb-1">Median HH Income (3 mi)</p>
                    <p className="text-xl font-bold text-[#4A6B94]">
                      {formatCurrency(property.hh_income_median_3_mile)}
                    </p>
                  </div>
                  <div className="bg-[#002147]/5 rounded-lg p-3 border border-[#002147]/10">
                    <p className="text-xs text-gray-500 mb-1">10 Min Drive Population</p>
                    <p className="text-xl font-bold text-[#002147]">
                      {formatNumber(property.pop_10min_drive)}
                    </p>
                  </div>
                </div>

                {/* Detailed Demographics Table */}
                <details className="text-sm">
                  <summary className="text-gray-600 cursor-pointer hover:text-gray-800 font-medium">
                    View All Demographics
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 pr-4 font-medium text-gray-700">Metric</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-700">1 Mile</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-700">3 Mile</th>
                          <th className="text-right py-2 px-3 font-medium text-gray-700">5 Mile</th>
                          <th className="text-right py-2 pl-3 font-medium text-gray-700">10 Min Drive</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr>
                          <td className="py-2 pr-4 text-gray-600">Population</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.pop_1_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.pop_3_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.pop_5_mile)}</td>
                          <td className="py-2 pl-3 text-right font-medium">{formatNumber(property.pop_10min_drive)}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 text-gray-600">Households</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.households_1_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.households_3_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.households_5_mile)}</td>
                          <td className="py-2 pl-3 text-right font-medium">{formatNumber(property.households_10min_drive)}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 text-gray-600">Avg HH Income</td>
                          <td className="py-2 px-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_avg_1_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_avg_3_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_avg_5_mile)}</td>
                          <td className="py-2 pl-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_avg_10min_drive)}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 text-gray-600">Median HH Income</td>
                          <td className="py-2 px-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_median_1_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_median_3_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_median_5_mile)}</td>
                          <td className="py-2 pl-3 text-right font-medium text-[#4A6B94]">{formatCurrency(property.hh_income_median_10min_drive)}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 text-gray-600">Employees</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.employees_1_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.employees_3_mile)}</td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(property.employees_5_mile)}</td>
                          <td className="py-2 pl-3 text-right font-medium">{formatNumber(property.employees_10min_drive)}</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 text-gray-600">Median Age</td>
                          <td className="py-2 px-3 text-right font-medium">{property.median_age_1_mile ? property.median_age_1_mile.toFixed(1) : '-'}</td>
                          <td className="py-2 px-3 text-right font-medium">{property.median_age_3_mile ? property.median_age_3_mile.toFixed(1) : '-'}</td>
                          <td className="py-2 px-3 text-right font-medium">{property.median_age_5_mile ? property.median_age_5_mile.toFixed(1) : '-'}</td>
                          <td className="py-2 pl-3 text-right font-medium">{property.median_age_10min_drive ? property.median_age_10min_drive.toFixed(1) : '-'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            {/* No coordinates message */}
            {!hasCoordinates && !hasEnrichmentData && (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm text-gray-600">Add property coordinates to enable demographic enrichment</p>
              </div>
            )}

            {/* Has coordinates but no data yet */}
            {hasCoordinates && !hasEnrichmentData && (
              <div className="bg-[#002147]/5 rounded-lg p-4 text-center">
                <svg className="w-8 h-8 text-[#4A6B94] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm text-gray-600 mb-2">
                  Click "Enrich with Demographics" to pull Tapestry segmentation and demographic data from ESRI
                </p>
                <p className="text-xs text-gray-500">
                  Includes population, households, income, and psychographic profiles
                </p>
              </div>
            )}
          </div>

          {/* Legacy Demographics Notes */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Demographics Notes</h4>
            <div className="space-y-4">
              <PropertyInputField
                label="Additional Notes"
                value={property.demographics}
                onChange={(value) => onFieldUpdate('demographics', value)}
                placeholder="Additional demographic information, trade area notes, etc."
                multiline={true}
                rows={3}
              />

              {/* Legacy manual entry fields - keep for backward compatibility */}
              <details className="text-sm">
                <summary className="text-gray-500 cursor-pointer hover:text-gray-700">
                  Manual Entry Fields (legacy)
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                  <PropertyInputField
                    label="1 Mile Population (manual)"
                    value={property['1_mile_pop']}
                    onChange={(value) => onFieldUpdate('1_mile_pop', value)}
                    type="number"
                    inputMode="numeric"
                    placeholder="Enter population count"
                  />

                  <PropertyInputField
                    label="HH Income - Median 3 Mile (manual)"
                    value={property.hh_income_median_3_mile}
                    onChange={(value) => onFieldUpdate('hh_income_median_3_mile', value)}
                    type="number"
                    inputMode="numeric"
                    placeholder="Enter median income"
                  />

                  <PropertyInputField
                    label="3 Mile Population (manual)"
                    value={property['3_mile_pop']}
                    onChange={(value) => onFieldUpdate('3_mile_pop', value)}
                    type="number"
                    inputMode="numeric"
                    placeholder="Enter population count"
                  />
                </div>
              </details>
            </div>
          </div>

        </div>
      )}
    </section>
  );
};

export default MarketAnalysisSection;
