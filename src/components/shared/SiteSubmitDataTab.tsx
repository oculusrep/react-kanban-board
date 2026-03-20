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

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString();
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
};

// FieldGroup component
function FieldGroup({
  title,
  children,
  action
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
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
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-1 mt-3">
        {children}
      </div>
    </div>
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

// Demographics Modal Component
function DemographicsModal({
  property,
  onClose,
}: {
  property: SiteSubmitData['property'];
  onClose: () => void;
}) {
  if (!property) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold" style={{ color: '#002147' }}>
            Demographics
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Tapestry Segment Card */}
          {property.tapestry_segment_code && (
            <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#f8fafc', border: '1px solid #8FA9C8' }}>
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: '#002147' }}
                >
                  {property.tapestry_segment_code}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{property.tapestry_segment_name}</div>
                  {property.tapestry_lifemodes && (
                    <div className="text-sm" style={{ color: '#4A6B94' }}>{property.tapestry_lifemodes}</div>
                  )}
                  {property.tapestry_segment_description && (
                    <p className="text-sm text-gray-600 mt-2">{property.tapestry_segment_description}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Demographics Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-3 pr-4 text-left font-semibold text-gray-700">Metric</th>
                  <th className="py-3 px-3 text-right font-semibold text-gray-700">1 Mile</th>
                  <th className="py-3 px-3 text-right font-semibold text-gray-700">3 Mile</th>
                  <th className="py-3 px-3 text-right font-semibold text-gray-700">5 Mile</th>
                  <th className="py-3 pl-3 text-right font-semibold text-gray-700">10-Min Drive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">Population</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.pop_1_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.pop_3_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.pop_5_mile)}</td>
                  <td className="py-2 pl-3 text-right font-medium">{formatNumber(property.pop_10min_drive)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">Households</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.households_1_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.households_3_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.households_5_mile)}</td>
                  <td className="py-2 pl-3 text-right font-medium">{formatNumber(property.households_10min_drive)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">Daytime Pop</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.daytime_pop_1_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.daytime_pop_3_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.daytime_pop_5_mile)}</td>
                  <td className="py-2 pl-3 text-right font-medium">{formatNumber(property.daytime_pop_10min_drive)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">Employees</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.employees_1_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.employees_3_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatNumber(property.employees_5_mile)}</td>
                  <td className="py-2 pl-3 text-right font-medium">{formatNumber(property.employees_10min_drive)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">Avg HH Income</td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(property.hh_income_avg_1_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(property.hh_income_avg_3_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(property.hh_income_avg_5_mile)}</td>
                  <td className="py-2 pl-3 text-right font-medium">{formatCurrency(property.hh_income_avg_10min_drive)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">Median HH Income</td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(property.hh_income_median_1_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(property.hh_income_median_3_mile)}</td>
                  <td className="py-2 px-3 text-right font-medium">{formatCurrency(property.hh_income_median_5_mile)}</td>
                  <td className="py-2 pl-3 text-right font-medium">{formatCurrency(property.hh_income_median_10min_drive)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">Median Age</td>
                  <td className="py-2 px-3 text-right font-medium">
                    {property.median_age_1_mile != null ? property.median_age_1_mile.toFixed(1) : '-'}
                  </td>
                  <td className="py-2 px-3 text-right font-medium">
                    {property.median_age_3_mile != null ? property.median_age_3_mile.toFixed(1) : '-'}
                  </td>
                  <td className="py-2 px-3 text-right font-medium">
                    {property.median_age_5_mile != null ? property.median_age_5_mile.toFixed(1) : '-'}
                  </td>
                  <td className="py-2 pl-3 text-right font-medium">
                    {property.median_age_10min_drive != null ? property.median_age_10min_drive.toFixed(1) : '-'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Last Enriched */}
          {property.esri_enriched_at && (
            <div className="mt-4 text-xs text-gray-400 text-right">
              Data as of {formatDate(property.esri_enriched_at)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SiteSubmitDataTab({ siteSubmit, isEditable, onUpdate }: SiteSubmitDataTabProps) {
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [showDemographicsModal, setShowDemographicsModal] = useState(false);

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

        {/* Year 1 Rent */}
        <Field
          {...fieldProps}
          label="Year 1 Rent"
          value={siteSubmit.year_1_rent}
          type="number"
          isCurrency
          table="site_submit"
          field="year_1_rent"
        />
      </FieldGroup>

      {/* Notes Section */}
      <FieldGroup title="Notes">
        <Field
          {...fieldProps}
          label="Notes"
          value={siteSubmit.notes}
          type="textarea"
          table="site_submit"
          field="notes"
        />
        <Field
          {...fieldProps}
          label="Competitor Data"
          value={siteSubmit.competitor_data}
          type="textarea"
          table="site_submit"
          field="competitor_data"
        />
      </FieldGroup>

      {/* Demographics Section - from ESRI GeoEnrichment */}
      {siteSubmit.property && (
        <FieldGroup
          title="Demographics"
          action={
            siteSubmit.property.esri_enriched_at ? (
              <button
                onClick={() => setShowDemographicsModal(true)}
                className="text-xs font-medium hover:underline transition-colors"
                style={{ color: '#4A6B94' }}
              >
                View All →
              </button>
            ) : null
          }
        >
          {/* Tapestry Segment */}
          {siteSubmit.property.tapestry_segment_code && (
            <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
              <span className="text-gray-600">Tapestry Segment</span>
              <span className="text-gray-900 font-medium">
                {siteSubmit.property.tapestry_segment_code} - {siteSubmit.property.tapestry_segment_name}
                {siteSubmit.property.tapestry_lifemodes && (
                  <span className="text-gray-500 text-xs ml-1">({siteSubmit.property.tapestry_lifemodes})</span>
                )}
              </span>
            </div>
          )}

          {/* Population */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Population (3 mi)</span>
            <span className="text-gray-900 font-medium">
              {siteSubmit.property.pop_3_mile != null ? formatNumber(siteSubmit.property.pop_3_mile) : '-'}
            </span>
          </div>

          {/* Population - 10 min drive */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Population (10-min drive)</span>
            <span className="text-gray-900 font-medium">
              {siteSubmit.property.pop_10min_drive != null ? formatNumber(siteSubmit.property.pop_10min_drive) : '-'}
            </span>
          </div>

          {/* Households */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Households (3 mi)</span>
            <span className="text-gray-900 font-medium">
              {siteSubmit.property.households_3_mile != null ? formatNumber(siteSubmit.property.households_3_mile) : '-'}
            </span>
          </div>

          {/* Daytime Population */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Daytime Pop (3 mi)</span>
            <span className="text-gray-900 font-medium">
              {siteSubmit.property.daytime_pop_3_mile != null ? formatNumber(siteSubmit.property.daytime_pop_3_mile) : '-'}
            </span>
          </div>

          {/* Median HH Income */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Median HH Income (3 mi)</span>
            <span className="text-gray-900 font-medium">
              {siteSubmit.property.hh_income_median_3_mile != null ? formatCurrency(siteSubmit.property.hh_income_median_3_mile) : '-'}
            </span>
          </div>

          {/* Avg HH Income */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Avg HH Income (3 mi)</span>
            <span className="text-gray-900 font-medium">
              {siteSubmit.property.hh_income_avg_3_mile != null ? formatCurrency(siteSubmit.property.hh_income_avg_3_mile) : '-'}
            </span>
          </div>

          {/* Median Age */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
            <span className="text-gray-600">Median Age (3 mi)</span>
            <span className="text-gray-900 font-medium">
              {siteSubmit.property.median_age_3_mile != null ? siteSubmit.property.median_age_3_mile.toFixed(1) : '-'}
            </span>
          </div>

          {/* Last Enriched */}
          {siteSubmit.property.esri_enriched_at && (
            <div className="flex justify-between py-1.5 text-sm text-gray-400 text-xs mt-2">
              <span>Data as of</span>
              <span>{formatDate(siteSubmit.property.esri_enriched_at)}</span>
            </div>
          )}

          {/* No data message */}
          {!siteSubmit.property.esri_enriched_at && (
            <div className="py-2 text-sm text-gray-400 italic">
              No demographic data available. Enrich property from the Property Detail page.
            </div>
          )}
        </FieldGroup>
      )}

      {/* Demographics Modal */}
      {showDemographicsModal && siteSubmit.property && (
        <DemographicsModal
          property={siteSubmit.property}
          onClose={() => setShowDemographicsModal(false)}
        />
      )}
    </div>
  );
}
