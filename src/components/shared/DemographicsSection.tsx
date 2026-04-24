/**
 * DemographicsSection - Demographics block for a site submit.
 *
 * Renders the ESRI-enriched property demographics + any site-submit-specific
 * client demographics, and exposes re-enrich controls. Used in both
 * SiteSubmitDataTab (pre-deal) and DealDataTab (once the submit becomes a deal),
 * so client-specific demographics stay available after conversion.
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SiteSubmitData } from './SiteSubmitSidebar';
import {
  ClientDemographicsData,
  isEnrichmentStale,
  formatEnrichmentDate,
  usePropertyGeoenrichment,
} from '../../hooks/usePropertyGeoenrichment';
import DemographicsModal from './DemographicsModal';

interface DemographicsSectionProps {
  siteSubmit: SiteSubmitData;
  isEditable: boolean;
  onUpdate: (updated: Partial<SiteSubmitData>) => void;
}

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString();
};

export default function DemographicsSection({
  siteSubmit,
  isEditable,
  onUpdate,
}: DemographicsSectionProps) {
  const [showDemographicsModal, setShowDemographicsModal] = useState(false);

  const {
    isEnriching,
    enrichError,
    enrichProperty,
    saveEnrichmentToProperty,
    enrichForClient,
    saveClientDemographicsToSiteSubmit,
    clearError,
  } = usePropertyGeoenrichment();

  const enrichmentLatitude =
    siteSubmit.property?.verified_latitude ?? siteSubmit.property?.latitude;
  const enrichmentLongitude =
    siteSubmit.property?.verified_longitude ?? siteSubmit.property?.longitude;
  const hasCoordinates = !!(enrichmentLatitude && enrichmentLongitude);
  const hasEnrichmentData = !!siteSubmit.property?.esri_enriched_at;
  const dataIsStale = isEnrichmentStale(siteSubmit.property?.esri_enriched_at ?? null);
  const hasClientDemographics = !!siteSubmit.client_demographics;

  const handleEnrichDemographics = async (forceRefresh = false) => {
    if (!siteSubmit.property_id || !hasCoordinates) return;
    clearError();

    const result = await enrichProperty(
      siteSubmit.property_id,
      enrichmentLatitude!,
      enrichmentLongitude!,
      forceRefresh
    );

    if (!result) return;

    const saved = await saveEnrichmentToProperty(
      siteSubmit.property_id,
      result,
      enrichmentLatitude!,
      enrichmentLongitude!
    );
    if (!saved) return;

    const { data: updatedProperty } = await supabase
      .from('property')
      .select(
        `
        id,
        property_name,
        address,
        city,
        state,
        zip,
        available_sqft,
        building_sqft,
        acres,
        asking_lease_price,
        asking_purchase_price,
        rent_psf,
        nnn_psf,
        all_in_rent,
        latitude,
        longitude,
        verified_latitude,
        verified_longitude,
        esri_enriched_at,
        tapestry_segment_code,
        tapestry_segment_name,
        tapestry_segment_description,
        tapestry_lifemodes,
        pop_1_mile,
        pop_3_mile,
        pop_5_mile,
        pop_10min_drive,
        households_1_mile,
        households_3_mile,
        households_5_mile,
        households_10min_drive,
        hh_income_median_1_mile,
        hh_income_median_3_mile,
        hh_income_median_5_mile,
        hh_income_median_10min_drive,
        hh_income_avg_1_mile,
        hh_income_avg_3_mile,
        hh_income_avg_5_mile,
        hh_income_avg_10min_drive,
        daytime_pop_1_mile,
        daytime_pop_3_mile,
        daytime_pop_5_mile,
        daytime_pop_10min_drive,
        employees_1_mile,
        employees_3_mile,
        employees_5_mile,
        employees_10min_drive,
        median_age_1_mile,
        median_age_3_mile,
        median_age_5_mile,
        median_age_10min_drive,
        property_record_type:property_record_type_id (
          id,
          label
        )
      `
      )
      .eq('id', siteSubmit.property_id)
      .single();

    if (updatedProperty) {
      onUpdate({ property: updatedProperty as any });
    }
  };

  const handleClientEnrichDemographics = async () => {
    if (!siteSubmit.property_id || !siteSubmit.client_id || !hasCoordinates) return;
    clearError();

    const { data: clientConfig } = await supabase
      .from('client')
      .select(
        'demographics_radii, demographics_drive_times, demographics_sidebar_radius'
      )
      .eq('id', siteSubmit.client_id)
      .single();

    const radii = clientConfig?.demographics_radii || [1, 3, 5];
    const driveTimes = clientConfig?.demographics_drive_times || [10];
    const sidebarRadius = clientConfig?.demographics_sidebar_radius || null;

    const result = await enrichForClient(
      siteSubmit.property_id,
      enrichmentLatitude!,
      enrichmentLongitude!,
      radii,
      driveTimes
    );

    if (!result) return;

    const saved = await saveClientDemographicsToSiteSubmit(
      siteSubmit.id,
      result,
      radii,
      driveTimes,
      sidebarRadius
    );
    if (!saved) return;

    const { data: updatedSiteSubmit } = await supabase
      .from('site_submit')
      .select('client_demographics')
      .eq('id', siteSubmit.id)
      .single();

    if (updatedSiteSubmit) {
      onUpdate({ client_demographics: updatedSiteSubmit.client_demographics });
    }
  };

  if (!siteSubmit.property) return null;

  const cd = siteSubmit.client_demographics as ClientDemographicsData | null | undefined;
  const displayRadius = cd?.sidebar_radius ?? 3;
  const radiusKey = `${displayRadius}_mile`;
  const radiusLabel = `${displayRadius} mi`;

  const displayDriveTime = cd?.drive_times?.[0] ?? 10;
  const driveTimeKey = `${displayDriveTime}min_drive`;
  const driveTimeLabel = `${displayDriveTime}-min drive`;

  const getValue = (prefix: string, key: string): number | null => {
    if (cd?.data) {
      const v = cd.data[`${prefix}_${key}`];
      return v != null ? (v as number) : null;
    }
    const propKey = `${prefix}_${key}`;
    return ((siteSubmit.property as Record<string, unknown>)?.[propKey] as number | null) ?? null;
  };

  const tapCode = cd?.tapestry?.code || siteSubmit.property.tapestry_segment_code;
  const tapName = cd?.tapestry?.name || siteSubmit.property.tapestry_segment_name;
  const tapLifemodes = cd?.tapestry?.lifemodes || siteSubmit.property.tapestry_lifemodes;

  return (
    <div className="mb-6">
      <div
        className="flex items-center justify-between px-4 py-2 -mx-4"
        style={{ backgroundColor: '#f1f5f9' }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#475569' }}
        >
          Demographics
        </h3>
        <div className="flex items-center gap-2">
          {hasEnrichmentData && (
            <button
              onClick={() => setShowDemographicsModal(true)}
              className="text-xs font-medium hover:underline transition-colors"
              style={{ color: '#4A6B94' }}
            >
              View All →
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1 mt-3">
        {tapCode && (
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Tapestry Segment</span>
            <span className="text-gray-900 font-medium">
              {tapCode} - {tapName}
              {tapLifemodes && (
                <span className="text-gray-500 text-xs ml-1">({tapLifemodes})</span>
              )}
            </span>
          </div>
        )}

        <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
          <span className="text-gray-600">Population ({radiusLabel})</span>
          <span className="text-gray-900 font-medium">
            {getValue('pop', radiusKey) != null
              ? formatNumber(getValue('pop', radiusKey)!)
              : '-'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
          <span className="text-gray-600">Population ({driveTimeLabel})</span>
          <span className="text-gray-900 font-medium">
            {getValue('pop', driveTimeKey) != null
              ? formatNumber(getValue('pop', driveTimeKey)!)
              : '-'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
          <span className="text-gray-600">Households ({radiusLabel})</span>
          <span className="text-gray-900 font-medium">
            {getValue('households', radiusKey) != null
              ? formatNumber(getValue('households', radiusKey)!)
              : '-'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
          <span className="text-gray-600">Daytime Pop ({radiusLabel})</span>
          <span className="text-gray-900 font-medium">
            {getValue('daytime_pop', radiusKey) != null
              ? formatNumber(getValue('daytime_pop', radiusKey)!)
              : '-'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
          <span className="text-gray-600">Median HH Income ({radiusLabel})</span>
          <span className="text-gray-900 font-medium">
            {getValue('hh_income_median', radiusKey) != null
              ? formatCurrency(getValue('hh_income_median', radiusKey)!)
              : '-'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
          <span className="text-gray-600">Avg HH Income ({radiusLabel})</span>
          <span className="text-gray-900 font-medium">
            {getValue('hh_income_avg', radiusKey) != null
              ? formatCurrency(getValue('hh_income_avg', radiusKey)!)
              : '-'}
          </span>
        </div>

        <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
          <span className="text-gray-600">Median Age ({radiusLabel})</span>
          <span className="text-gray-900 font-medium">
            {getValue('median_age', radiusKey) != null
              ? getValue('median_age', radiusKey)!.toFixed(1)
              : '-'}
          </span>
        </div>

        {hasEnrichmentData && (
          <div className="flex justify-between items-center py-1.5 text-sm mt-2">
            <span className="text-gray-400 text-xs">
              Data as of {formatEnrichmentDate(siteSubmit.property.esri_enriched_at)}
              {dataIsStale && <span className="text-amber-600 ml-1">(stale)</span>}
            </span>
            {isEditable && hasCoordinates && (
              <button
                onClick={() => handleEnrichDemographics(true)}
                disabled={isEnriching}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                title="Re-enrich demographics data"
              >
                {isEnriching ? (
                  <>
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Enriching...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Re-enrich
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {isEditable && hasCoordinates && siteSubmit.client_id && (
          <div className="mt-2">
            <button
              onClick={handleClientEnrichDemographics}
              disabled={isEnriching}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#002147', color: '#ffffff' }}
              title={
                hasClientDemographics
                  ? 'Re-enrich with client-specific demographics'
                  : 'Enrich with client-specific demographics'
              }
            >
              {isEnriching ? (
                <>
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Enriching Client Demographics...
                </>
              ) : (
                <>
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {hasClientDemographics
                    ? 'Re-enrich Client Demographics'
                    : 'Enrich with Client Demographics'}
                </>
              )}
            </button>
          </div>
        )}

        {enrichError && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {enrichError}
            <button onClick={clearError} className="ml-2 underline">
              Dismiss
            </button>
          </div>
        )}

        {!hasEnrichmentData && (
          <div className="py-3">
            {hasCoordinates && isEditable ? (
              <button
                onClick={() => handleEnrichDemographics(false)}
                disabled={isEnriching}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#002147', color: '#ffffff' }}
              >
                {isEnriching ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Enriching Demographics...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    Enrich with Demographics
                  </>
                )}
              </button>
            ) : !hasCoordinates ? (
              <div className="text-sm text-gray-400 italic text-center">
                No coordinates available for demographic enrichment.
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic text-center">
                No demographic data available.
              </div>
            )}
          </div>
        )}
      </div>

      {showDemographicsModal && (
        <DemographicsModal
          data={siteSubmit.property as any}
          clientDemographics={cd ?? undefined}
          onClose={() => setShowDemographicsModal(false)}
        />
      )}
    </div>
  );
}
