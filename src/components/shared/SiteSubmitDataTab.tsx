/**
 * SiteSubmitDataTab - Enhanced data tab for site submit details
 *
 * Based on PortalDataTab with additional editable fields:
 * - Date Submitted
 * - Assignment selector
 * - Property Unit selector
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AssignmentSelector from '../mapping/AssignmentSelector';
import PropertyUnitSelector from '../PropertyUnitSelector';
import { AssignmentSearchResult } from '../../hooks/useAssignmentSearch';
import { SiteSubmitData } from './SiteSubmitSidebar';
import { usePropertyGeoenrichment } from '../../hooks/usePropertyGeoenrichment';

interface SiteSubmitDataTabProps {
  siteSubmit: SiteSubmitData;
  isEditable: boolean;
  onUpdate: (updated: Partial<SiteSubmitData>) => void;
}

// Helper functions
const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatCompactCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
};

const formatCompactNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString();
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
};

// FieldGroup component
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3 px-4 py-2 -mx-4"
        style={{ backgroundColor: '#f1f5f9', color: '#475569' }}
      >
        {title}
      </h3>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
}

// Compact stat card for demographics
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  tooltip?: string;
}

function StatCard({ icon, label, value, subValue, tooltip }: StatCardProps) {
  return (
    <div
      className="flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-lg hover:border-gray-200 transition-colors"
      title={tooltip}
    >
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500 truncate">{label}</div>
        <div className="text-sm font-semibold text-gray-900">{value}</div>
        {subValue && <div className="text-xs text-gray-400">{subValue}</div>}
      </div>
    </div>
  );
}

// Icons for demographics
const PopulationIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const HouseholdsIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const IncomeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const EmployeesIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const TrafficIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const TapestryIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
  </svg>
);

// Refresh/spinner icon for enrich button
const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
  <svg
    className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// Demographics section component
interface DemographicsSectionProps {
  property: SiteSubmitData['property'];
  propertyId: string | null;
  onPropertyUpdate: (updatedProperty: Partial<NonNullable<SiteSubmitData['property']>>) => void;
}

function DemographicsSection({ property, propertyId, onPropertyUpdate }: DemographicsSectionProps) {
  const { isEnriching, enrichError, enrichProperty, saveEnrichmentToProperty, clearError } = usePropertyGeoenrichment();

  const handleEnrich = async () => {
    if (!propertyId || !property?.latitude || !property?.longitude) return;

    clearError();
    const result = await enrichProperty(
      propertyId,
      property.latitude,
      property.longitude,
      true // force refresh
    );

    if (result) {
      // Save to database
      const saved = await saveEnrichmentToProperty(propertyId, result);
      if (saved) {
        // Update local state with new data
        onPropertyUpdate({
          esri_enriched_at: new Date().toISOString(),
          pop_3_mile: result.demographics.pop_3_mile,
          pop_5_mile: result.demographics.pop_5_mile,
          pop_10min_drive: result.demographics.pop_10min_drive,
          households_3_mile: result.demographics.households_3_mile,
          households_5_mile: result.demographics.households_5_mile,
          households_10min_drive: result.demographics.households_10min_drive,
          hh_income_median_3_mile: result.demographics.hh_income_median_3_mile,
          hh_income_median_5_mile: result.demographics.hh_income_median_5_mile,
          hh_income_median_10min_drive: result.demographics.hh_income_median_10min_drive,
          employees_3_mile: result.demographics.employees_3_mile,
          employees_5_mile: result.demographics.employees_5_mile,
          employees_10min_drive: result.demographics.employees_10min_drive,
          tapestry_segment_name: result.tapestry.name,
          tapestry_lifemodes: result.tapestry.lifemodes,
        });
      }
    }
  };

  const hasCoordinates = property?.latitude && property?.longitude;
  const hasData = property?.esri_enriched_at || property?.traffic_count;

  // No property data at all
  if (!property) return null;

  // No data state - show enrich button
  if (!hasData) {
    return (
      <FieldGroup title="Demographics">
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 mb-3">No demographic data available</p>
          {hasCoordinates ? (
            <button
              onClick={handleEnrich}
              disabled={isEnriching}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#002147' }}
            >
              <RefreshIcon spinning={isEnriching} />
              {isEnriching ? 'Enriching...' : 'Enrich with Demographics'}
            </button>
          ) : (
            <p className="text-xs text-gray-400 italic">Property coordinates required</p>
          )}
          {enrichError && (
            <p className="mt-2 text-xs text-red-500">{enrichError}</p>
          )}
        </div>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup title="Demographics">
      {/* Primary stats grid - 2 columns */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatCard
          icon={<PopulationIcon />}
          label="Population (3 mi)"
          value={formatCompactNumber(property.pop_3_mile)}
          subValue={property.pop_10min_drive ? `${formatCompactNumber(property.pop_10min_drive)} 10-min` : undefined}
          tooltip={property.pop_3_mile ? `3 mi: ${formatNumber(property.pop_3_mile)} | 5 mi: ${formatNumber(property.pop_5_mile)} | 10-min: ${formatNumber(property.pop_10min_drive)}` : undefined}
        />
        <StatCard
          icon={<HouseholdsIcon />}
          label="Households (3 mi)"
          value={formatCompactNumber(property.households_3_mile)}
          subValue={property.households_10min_drive ? `${formatCompactNumber(property.households_10min_drive)} 10-min` : undefined}
          tooltip={property.households_3_mile ? `3 mi: ${formatNumber(property.households_3_mile)} | 5 mi: ${formatNumber(property.households_5_mile)} | 10-min: ${formatNumber(property.households_10min_drive)}` : undefined}
        />
        <StatCard
          icon={<IncomeIcon />}
          label="Median HH Income"
          value={formatCompactCurrency(property.hh_income_median_3_mile)}
          subValue="3 mile radius"
          tooltip={property.hh_income_median_3_mile ? `3 mi: ${formatCurrency(property.hh_income_median_3_mile)} | 5 mi: ${formatCurrency(property.hh_income_median_5_mile)} | 10-min: ${formatCurrency(property.hh_income_median_10min_drive)}` : undefined}
        />
        <StatCard
          icon={<EmployeesIcon />}
          label="Employees (3 mi)"
          value={formatCompactNumber(property.employees_3_mile)}
          subValue={property.employees_10min_drive ? `${formatCompactNumber(property.employees_10min_drive)} 10-min` : undefined}
          tooltip={property.employees_3_mile ? `Daytime workers: 3 mi: ${formatNumber(property.employees_3_mile)} | 5 mi: ${formatNumber(property.employees_5_mile)} | 10-min: ${formatNumber(property.employees_10min_drive)}` : undefined}
        />
      </div>

      {/* Traffic count if available */}
      {property.traffic_count && (
        <div className="mb-3">
          <StatCard
            icon={<TrafficIcon />}
            label="Traffic Count"
            value={formatCompactNumber(property.traffic_count)}
            subValue="vehicles/day"
          />
        </div>
      )}

      {/* Tapestry segment if available */}
      {property.tapestry_segment_name && (
        <div className="p-2 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
              <TapestryIcon />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-indigo-600 font-medium">Tapestry Segment</div>
              <div className="text-sm font-semibold text-gray-900 truncate" title={property.tapestry_segment_name}>
                {property.tapestry_segment_name}
              </div>
              {property.tapestry_lifemodes && (
                <div className="text-xs text-gray-500 truncate" title={property.tapestry_lifemodes}>
                  {property.tapestry_lifemodes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Last enriched timestamp with refresh button */}
      <div className="mt-2 flex items-center justify-end gap-2">
        {enrichError && (
          <span className="text-xs text-red-500">{enrichError}</span>
        )}
        {property.esri_enriched_at && (
          <span className="text-xs text-gray-400">
            Updated {new Date(property.esri_enriched_at).toLocaleDateString()}
          </span>
        )}
        {hasCoordinates && (
          <button
            onClick={handleEnrich}
            disabled={isEnriching}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            title="Refresh demographics"
          >
            <RefreshIcon spinning={isEnriching} />
            {isEnriching ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>
    </FieldGroup>
  );
}

// Field component for inline editing
interface FieldProps {
  label: string;
  value: any;
  type?: 'text' | 'number' | 'date' | 'textarea';
  table?: 'site_submit' | 'property' | 'property_unit';
  field?: string;
  isCurrency?: boolean;
  isNumber?: boolean;
  suffix?: string;
  isEditable: boolean;
  editingField: string | null;
  editValue: any;
  saving: boolean;
  onStartEditing: (table: string, field: string, currentValue: any) => void;
  onCancelEditing: () => void;
  onSaveField: (table: 'site_submit' | 'property' | 'property_unit', field: string) => void;
  onEditValueChange: (value: any) => void;
}

function Field({
  label,
  value,
  type = 'text',
  table,
  field,
  isCurrency = false,
  isNumber = false,
  suffix = '',
  isEditable,
  editingField,
  editValue,
  saving,
  onStartEditing,
  onCancelEditing,
  onSaveField,
  onEditValueChange,
}: FieldProps) {
  const editKey = table && field ? `${table}.${field}` : null;
  const isCurrentlyEditing = editKey === editingField;

  const baseFormattedValue = isCurrency
    ? formatCurrency(value)
    : isNumber
    ? formatNumber(value)
    : type === 'date'
    ? formatDate(value)
    : value || '-';

  const formattedValue = baseFormattedValue !== '-' && suffix
    ? `${baseFormattedValue} ${suffix}`
    : baseFormattedValue;

  const PencilButton = () => (
    <button
      onClick={() => onStartEditing(table!, field!, value)}
      className="ml-2 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
      title="Edit"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );

  const EditActions = () => (
    <div className="flex items-center gap-1 ml-2">
      <button
        onClick={() => onSaveField(table!, field!)}
        disabled={saving}
        className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
        title="Save"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </button>
      <button
        onClick={onCancelEditing}
        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
        title="Cancel"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  // Textarea field layout (stacked)
  if (type === 'textarea') {
    return (
      <div className="py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-500">{label}</span>
          {isEditable && table && field && !isCurrentlyEditing && <PencilButton />}
          {isCurrentlyEditing && <EditActions />}
        </div>
        {isCurrentlyEditing ? (
          <textarea
            value={editValue ?? ''}
            onChange={(e) => onEditValueChange(e.target.value)}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            autoFocus
          />
        ) : (
          <div className="text-sm font-medium text-gray-900 whitespace-pre-wrap bg-white border border-gray-100 rounded-lg p-3">
            {value || '-'}
          </div>
        )}
      </div>
    );
  }

  // Regular field layout (grid)
  return (
    <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex items-center">
        {isCurrentlyEditing ? (
          <>
            {type === 'number' ? (
              <input
                type="number"
                value={editValue ?? ''}
                onChange={(e) => onEditValueChange(e.target.value ? parseFloat(e.target.value) : null)}
                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            ) : type === 'date' ? (
              <input
                type="date"
                value={editValue ?? ''}
                onChange={(e) => onEditValueChange(e.target.value || null)}
                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            ) : (
              <input
                type="text"
                value={editValue ?? ''}
                onChange={(e) => onEditValueChange(e.target.value)}
                className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            )}
            <EditActions />
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-gray-900 flex-1">
              {formattedValue}
            </span>
            {isEditable && table && field && <PencilButton />}
          </>
        )}
      </div>
    </div>
  );
}

export default function SiteSubmitDataTab({ siteSubmit, isEditable, onUpdate }: SiteSubmitDataTabProps) {
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>(null);

  const handleStartEditing = useCallback((table: string, field: string, currentValue: any) => {
    setEditingField(`${table}.${field}`);
    setEditValue(currentValue);
  }, []);

  const handleCancelEditing = useCallback(() => {
    setEditingField(null);
    setEditValue(null);
  }, []);

  const handleSaveField = useCallback(async (table: 'site_submit' | 'property' | 'property_unit', field: string) => {
    setSaving(true);
    try {
      if (table === 'site_submit') {
        const { error } = await supabase
          .from('site_submit')
          .update({ [field]: editValue })
          .eq('id', siteSubmit.id);
        if (error) throw error;
        onUpdate({ [field]: editValue } as any);
      } else if (table === 'property' && siteSubmit.property_id) {
        const { error } = await supabase
          .from('property')
          .update({ [field]: editValue })
          .eq('id', siteSubmit.property_id);
        if (error) throw error;
        onUpdate({
          property: siteSubmit.property ? { ...siteSubmit.property, [field]: editValue } : null,
        });
      } else if (table === 'property_unit' && siteSubmit.property_unit_id) {
        const { error } = await supabase
          .from('property_unit')
          .update({ [field]: editValue })
          .eq('id', siteSubmit.property_unit_id);
        if (error) throw error;
        onUpdate({
          property_unit: siteSubmit.property_unit ? { ...siteSubmit.property_unit, [field]: editValue } : null,
        });
      }
      setEditingField(null);
      setEditValue(null);
    } catch (err) {
      console.error('Error saving:', err);
    } finally {
      setSaving(false);
    }
  }, [editValue, siteSubmit.id, siteSubmit.property_id, siteSubmit.property_unit_id, siteSubmit.property, siteSubmit.property_unit, onUpdate]);

  const handleEditValueChange = useCallback((value: any) => {
    setEditValue(value);
  }, []);

  // Handle assignment change
  const handleAssignmentChange = async (assignment: AssignmentSearchResult | null) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('site_submit')
        .update({ assignment_id: assignment?.id || null })
        .eq('id', siteSubmit.id);
      if (error) throw error;
      onUpdate({
        assignment_id: assignment?.id || null,
        assignment: assignment ? { id: assignment.id, assignment_name: assignment.assignment_name } : null,
      });
    } catch (err) {
      console.error('Error updating assignment:', err);
    } finally {
      setSaving(false);
    }
  };

  // Handle property unit change
  const handlePropertyUnitChange = async (unitId: string | null) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('site_submit')
        .update({ property_unit_id: unitId })
        .eq('id', siteSubmit.id);
      if (error) throw error;

      // Fetch the unit details if selected
      let unitData = null;
      if (unitId) {
        const { data } = await supabase
          .from('property_unit')
          .select('id, property_unit_name, sqft, rent, nnn')
          .eq('id', unitId)
          .single();
        unitData = data;
      }

      onUpdate({
        property_unit_id: unitId,
        property_unit: unitData,
      });
    } catch (err) {
      console.error('Error updating property unit:', err);
    } finally {
      setSaving(false);
    }
  };

  // Common props for Field components
  const fieldProps = {
    isEditable,
    editingField,
    editValue,
    saving,
    onStartEditing: handleStartEditing,
    onCancelEditing: handleCancelEditing,
    onSaveField: handleSaveField,
    onEditValueChange: handleEditValueChange,
  };

  // Determine property type for conditional field display
  const recordTypeLabel = siteSubmit.property?.property_record_type?.label?.toLowerCase() || '';
  const isLand = recordTypeLabel.includes('land');
  const isShoppingCenter = recordTypeLabel.includes('shopping') || recordTypeLabel.includes('retail');

  // Check if we have unit data
  const hasUnit = !!siteSubmit.property_unit;
  const unitName = siteSubmit.property_unit?.property_unit_name || 'Unit';

  return (
    <div className="p-4 overflow-y-auto flex-1">
      {/* Submit Details Section */}
      <FieldGroup title="Submit Details">
        {/* Client (read-only display) */}
        <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
          <span className="text-sm text-gray-500">Client</span>
          <span className="text-sm font-medium text-gray-900">
            {siteSubmit.client?.client_name || '-'}
          </span>
        </div>

        {/* Date Submitted - editable */}
        <Field
          {...fieldProps}
          label="Date Submitted"
          value={siteSubmit.date_submitted}
          type="date"
          table="site_submit"
          field="date_submitted"
        />

        {/* Assignment - editable selector */}
        <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
          <span className="text-sm text-gray-500">Assignment</span>
          {isEditable ? (
            <AssignmentSelector
              selectedAssignment={siteSubmit.assignment ? {
                id: siteSubmit.assignment.id,
                assignment_name: siteSubmit.assignment.assignment_name || '',
                client_id: siteSubmit.client_id || undefined,
                client_name: siteSubmit.client?.client_name || undefined,
              } : null}
              onAssignmentSelect={handleAssignmentChange}
              clientId={siteSubmit.client_id}
              placeholder="Select assignment..."
              className="text-sm"
            />
          ) : (
            <span className="text-sm font-medium text-gray-900">
              {siteSubmit.assignment?.assignment_name || '-'}
            </span>
          )}
        </div>

        {/* Property Unit - editable selector */}
        {siteSubmit.property_id && (
          <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
            <span className="text-sm text-gray-500">Property Unit</span>
            {isEditable ? (
              <PropertyUnitSelector
                value={siteSubmit.property_unit_id}
                onChange={handlePropertyUnitChange}
                propertyId={siteSubmit.property_id}
                label=""
              />
            ) : (
              <span className="text-sm font-medium text-gray-900">
                {siteSubmit.property_unit?.property_unit_name || '-'}
              </span>
            )}
          </div>
        )}

        {/* Delivery Timeframe */}
        <Field
          {...fieldProps}
          label="Delivery Timeframe"
          value={siteSubmit.delivery_timeframe}
          table="site_submit"
          field="delivery_timeframe"
        />
      </FieldGroup>

      {/* Deal Details Section */}
      <FieldGroup title={hasUnit ? `Deal Details (${unitName})` : 'Deal Details'}>
        {siteSubmit.property && (
          <>
            {/* Available Sqft */}
            {!isLand && (
              hasUnit && siteSubmit.property_unit?.sqft != null ? (
                <Field
                  {...fieldProps}
                  label="Available Sqft"
                  value={siteSubmit.property_unit.sqft}
                  type="number"
                  isNumber
                  suffix="sqft"
                  table="property_unit"
                  field="sqft"
                />
              ) : (
                <Field
                  {...fieldProps}
                  label="Available Sqft"
                  value={siteSubmit.property.available_sqft}
                  type="number"
                  isNumber
                  suffix="sqft"
                  table="property"
                  field="available_sqft"
                />
              )
            )}

            {/* Building Sqft - Hide for Shopping Center */}
            {!isShoppingCenter && (
              <Field
                {...fieldProps}
                label="Building Sqft"
                value={siteSubmit.property.building_sqft}
                type="number"
                isNumber
                suffix="sqft"
                table="property"
                field="building_sqft"
              />
            )}

            {/* Acres - Hide for Shopping Center */}
            {!isShoppingCenter && (
              <Field
                {...fieldProps}
                label="Acres"
                value={siteSubmit.property.acres}
                type="number"
                isNumber
                table="property"
                field="acres"
              />
            )}

            {/* Asking Lease Price - Hide for Shopping Center */}
            {!isShoppingCenter && (
              <Field
                {...fieldProps}
                label="Asking Lease Price"
                value={siteSubmit.property.asking_lease_price}
                type="number"
                isCurrency
                table="property"
                field="asking_lease_price"
              />
            )}

            {/* Asking Purchase Price - Hide for Shopping Center */}
            {!isShoppingCenter && (
              <Field
                {...fieldProps}
                label="Asking Purchase Price"
                value={siteSubmit.property.asking_purchase_price}
                type="number"
                isCurrency
                table="property"
                field="asking_purchase_price"
              />
            )}

            {/* Rent PSF */}
            {!isLand && (
              hasUnit && siteSubmit.property_unit?.rent != null ? (
                <Field
                  {...fieldProps}
                  label="Rent PSF"
                  value={siteSubmit.property_unit.rent}
                  type="number"
                  isCurrency
                  table="property_unit"
                  field="rent"
                />
              ) : (
                <Field
                  {...fieldProps}
                  label="Rent PSF"
                  value={siteSubmit.property.rent_psf}
                  type="number"
                  isCurrency
                  table="property"
                  field="rent_psf"
                />
              )
            )}

            {/* NNN PSF */}
            {!isLand && (
              hasUnit && siteSubmit.property_unit?.nnn != null ? (
                <Field
                  {...fieldProps}
                  label="NNN PSF"
                  value={siteSubmit.property_unit.nnn}
                  type="number"
                  isCurrency
                  table="property_unit"
                  field="nnn"
                />
              ) : (
                <Field
                  {...fieldProps}
                  label="NNN PSF"
                  value={siteSubmit.property.nnn_psf}
                  type="number"
                  isCurrency
                  table="property"
                  field="nnn_psf"
                />
              )
            )}

            {/* All-in Rent - calculated, not editable */}
            {!isLand && (() => {
              let allInRent: number | null = null;
              if (hasUnit && siteSubmit.property_unit?.rent != null && siteSubmit.property_unit?.nnn != null) {
                allInRent = siteSubmit.property_unit.rent + siteSubmit.property_unit.nnn;
              } else if (siteSubmit.property.rent_psf != null && siteSubmit.property.nnn_psf != null) {
                allInRent = siteSubmit.property.rent_psf + siteSubmit.property.nnn_psf;
              } else {
                allInRent = siteSubmit.property.all_in_rent;
              }
              const availableSqft = hasUnit && siteSubmit.property_unit?.sqft != null
                ? siteSubmit.property_unit.sqft
                : siteSubmit.property.available_sqft;

              return (
                <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
                  <span className="text-sm text-gray-500">All-in Rent</span>
                  <span className="text-sm font-medium text-gray-900">
                    {allInRent != null ? (
                      <>
                        {formatCurrency(allInRent)}/sf
                        {availableSqft != null && (
                          <span className="text-gray-500 ml-2 text-xs italic">
                            ({formatCurrency(allInRent * availableSqft)}/yr)
                          </span>
                        )}
                      </>
                    ) : '-'}
                  </span>
                </div>
              );
            })()}
          </>
        )}

        {/* TI */}
        <Field
          {...fieldProps}
          label="TI (Tenant Improvement)"
          value={siteSubmit.ti}
          type="number"
          isCurrency
          table="site_submit"
          field="ti"
        />
      </FieldGroup>

      {/* Demographics Section */}
      <DemographicsSection
        property={siteSubmit.property}
        propertyId={siteSubmit.property_id}
        onPropertyUpdate={(updatedProperty) => {
          onUpdate({
            property: siteSubmit.property ? { ...siteSubmit.property, ...updatedProperty } : null,
          });
        }}
      />
    </div>
  );
}
