import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface SiteSubmitData {
  id: string;
  site_submit_name: string | null;
  submit_stage_id: string | null;
  date_submitted: string | null;
  notes: string | null;
  delivery_timeframe: string | null;
  ti: number | null;
  year_1_rent: number | null;
  competitor_data: string | null;
  property_id: string | null;
  property: {
    id: string;
    property_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    available_sqft: number | null;
    building_sqft: number | null;
    acres: number | null;
    asking_lease_price: number | null;
    asking_purchase_price: number | null;
    rent_psf: number | null;
    nnn_psf: number | null;
    all_in_rent: number | null;
    property_record_type: {
      id: string;
      label: string | null;
    } | null;
  } | null;
  submit_stage: {
    id: string;
    name: string;
  } | null;
}

interface PortalDataTabProps {
  siteSubmit: SiteSubmitData;
  isEditable: boolean;
  onUpdate: (updated: Partial<SiteSubmitData>) => void;
}

/**
 * PortalDataTab - Displays site submit and property data fields
 *
 * Read-only for clients, editable for brokers
 */
export default function PortalDataTab({ siteSubmit, isEditable, onUpdate }: PortalDataTabProps) {
  const [saving, setSaving] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, any>>({});

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

  const handleFieldChange = (table: 'site_submit' | 'property', field: string, value: any) => {
    setEditedFields(prev => ({
      ...prev,
      [`${table}.${field}`]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Group edits by table
      const siteSubmitUpdates: Record<string, any> = {};
      const propertyUpdates: Record<string, any> = {};

      Object.entries(editedFields).forEach(([key, value]) => {
        const [table, field] = key.split('.');
        if (table === 'site_submit') {
          siteSubmitUpdates[field] = value;
        } else if (table === 'property') {
          propertyUpdates[field] = value;
        }
      });

      // Update site_submit if there are changes
      if (Object.keys(siteSubmitUpdates).length > 0) {
        const { error } = await supabase
          .from('site_submit')
          .update(siteSubmitUpdates)
          .eq('id', siteSubmit.id);
        if (error) throw error;
      }

      // Update property if there are changes
      if (Object.keys(propertyUpdates).length > 0 && siteSubmit.property_id) {
        const { error } = await supabase
          .from('property')
          .update(propertyUpdates)
          .eq('id', siteSubmit.property_id);
        if (error) throw error;
      }

      setEditedFields({});
      // Notify parent of updates
      onUpdate({
        ...siteSubmitUpdates,
        property: siteSubmit.property ? { ...siteSubmit.property, ...propertyUpdates } : null,
      });
    } catch (err) {
      console.error('Error saving:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(editedFields).length > 0;

  const FieldGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
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

  const Field = ({
    label,
    value,
    type = 'text',
    table,
    field,
    isCurrency = false,
    isNumber = false,
    suffix = '',
  }: {
    label: string;
    value: any;
    type?: 'text' | 'number' | 'date' | 'textarea';
    table?: 'site_submit' | 'property';
    field?: string;
    isCurrency?: boolean;
    isNumber?: boolean;
    suffix?: string;
  }) => {
    const editKey = table && field ? `${table}.${field}` : null;
    const editedValue = editKey ? editedFields[editKey] : undefined;
    const displayValue = editedValue !== undefined ? editedValue : value;

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

    if (!isEditable || !table || !field) {
      // Textarea fields use stacked layout (label on top, content below)
      if (type === 'textarea') {
        return (
          <div className="py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded">
            <span className="block text-sm text-gray-500 mb-1">{label}</span>
            <div className="text-sm font-medium text-gray-900 whitespace-pre-wrap bg-white border border-gray-100 rounded-lg p-3">
              {value || '-'}
            </div>
          </div>
        );
      }
      // Other fields use grid layout for better readability
      return (
        <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded">
          <span className="text-sm text-gray-500">{label}</span>
          <span className="text-sm font-medium text-gray-900">
            {formattedValue}
          </span>
        </div>
      );
    }

    return (
      <div className="py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded">
        <label className="block text-sm text-gray-500 mb-1">{label}</label>
        {type === 'textarea' ? (
          <textarea
            value={displayValue || ''}
            onChange={(e) => handleFieldChange(table, field, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
          />
        ) : type === 'number' ? (
          <input
            type="number"
            value={displayValue || ''}
            onChange={(e) => handleFieldChange(table, field, e.target.value ? parseFloat(e.target.value) : null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        ) : type === 'date' ? (
          <input
            type="date"
            value={displayValue || ''}
            onChange={(e) => handleFieldChange(table, field, e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        ) : (
          <input
            type="text"
            value={displayValue || ''}
            onChange={(e) => handleFieldChange(table, field, e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        )}
      </div>
    );
  };

  return (
    <div className="p-4">
      {/* Save Button (for editable mode) */}
      {isEditable && hasChanges && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-yellow-800">You have unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Submit Date */}
      {siteSubmit.date_submitted && (
        <div className="mb-4">
          <span className="text-sm text-gray-500">
            Submitted On: {formatDate(siteSubmit.date_submitted)}
          </span>
        </div>
      )}

      {/* Deal Details - All fields combined */}
      {(() => {
        // Determine property type for conditional field display based on label
        const recordTypeLabel = siteSubmit.property?.property_record_type?.label?.toLowerCase() || '';
        const isLand = recordTypeLabel.includes('land');
        const isShoppingCenter = recordTypeLabel.includes('shopping') || recordTypeLabel.includes('retail');

        return (
        <FieldGroup title="Deal Details">
          {/* Property Fields */}
          {siteSubmit.property && (
            <>
              {/* Available Sqft - Hide for Land */}
              {!isLand && (
                <Field
                  label="Available Sqft"
                  value={siteSubmit.property.available_sqft}
                  type="number"
                  isNumber
                  suffix="sqft"
                  table={isEditable ? 'property' : undefined}
                  field={isEditable ? 'available_sqft' : undefined}
                />
              )}
              {/* Building Sqft - Hide for Shopping Center */}
              {!isShoppingCenter && (
                <Field
                  label="Building Sqft"
                  value={siteSubmit.property.building_sqft}
                  type="number"
                  isNumber
                  suffix="sqft"
                  table={isEditable ? 'property' : undefined}
                  field={isEditable ? 'building_sqft' : undefined}
                />
              )}
              {/* Acres - Hide for Shopping Center */}
              {!isShoppingCenter && (
                <Field
                  label="Acres"
                  value={siteSubmit.property.acres}
                  type="number"
                  isNumber
                  table={isEditable ? 'property' : undefined}
                  field={isEditable ? 'acres' : undefined}
                />
              )}
              {/* Asking Lease Price - Hide for Shopping Center */}
              {!isShoppingCenter && (
                <Field
                  label="Asking Lease Price"
                  value={siteSubmit.property.asking_lease_price}
                  type="number"
                  isCurrency
                  table={isEditable ? 'property' : undefined}
                  field={isEditable ? 'asking_lease_price' : undefined}
                />
              )}
              {/* Asking Purchase Price - Hide for Shopping Center */}
              {!isShoppingCenter && (
                <Field
                  label="Asking Purchase Price"
                  value={siteSubmit.property.asking_purchase_price}
                  type="number"
                  isCurrency
                  table={isEditable ? 'property' : undefined}
                  field={isEditable ? 'asking_purchase_price' : undefined}
                />
              )}
              {/* Rent PSF - Hide for Land */}
              {!isLand && (
                <Field
                  label="Rent PSF"
                  value={siteSubmit.property.rent_psf}
                  type="number"
                  isCurrency
                  table={isEditable ? 'property' : undefined}
                  field={isEditable ? 'rent_psf' : undefined}
                />
              )}
              {/* NNN PSF - Hide for Land */}
              {!isLand && (
                <Field
                  label="NNN PSF"
                  value={siteSubmit.property.nnn_psf}
                  type="number"
                  isCurrency
                  table={isEditable ? 'property' : undefined}
                  field={isEditable ? 'nnn_psf' : undefined}
                />
              )}
              {/* All-in Rent with calculated annual rent - Hide for Land */}
              {!isLand && (
                isEditable ? (
                  <Field
                    label="All-in Rent"
                    value={siteSubmit.property.all_in_rent}
                    type="number"
                    isCurrency
                    table="property"
                    field="all_in_rent"
                  />
                ) : (
                  <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded">
                    <span className="text-sm text-gray-500">All-in Rent</span>
                    <span className="text-sm font-medium text-gray-900">
                      {siteSubmit.property.all_in_rent != null ? (
                        <>
                          {formatCurrency(siteSubmit.property.all_in_rent)}/sf
                          {siteSubmit.property.available_sqft != null && (
                            <span className="text-gray-500 ml-2 text-xs italic">
                              ({formatCurrency(siteSubmit.property.all_in_rent * siteSubmit.property.available_sqft)}/yr)
                            </span>
                          )}
                        </>
                      ) : '-'}
                    </span>
                  </div>
                )
              )}
            </>
          )}

          {/* Site Submit Fields */}
          <Field
            label="Delivery Timeframe"
            value={siteSubmit.delivery_timeframe}
            table={isEditable ? 'site_submit' : undefined}
            field={isEditable ? 'delivery_timeframe' : undefined}
          />
          <Field
            label="TI (Tenant Improvement)"
            value={siteSubmit.ti}
            type="number"
            isCurrency
            table={isEditable ? 'site_submit' : undefined}
            field={isEditable ? 'ti' : undefined}
          />
          <Field
            label="Year 1 Rent"
            value={siteSubmit.year_1_rent}
            type="number"
            isCurrency
            table={isEditable ? 'site_submit' : undefined}
            field={isEditable ? 'year_1_rent' : undefined}
          />
          <Field
            label="Notes"
            value={siteSubmit.notes}
            type="textarea"
            table={isEditable ? 'site_submit' : undefined}
            field={isEditable ? 'notes' : undefined}
          />
          <Field
            label="Competitor Data"
            value={siteSubmit.competitor_data}
            type="textarea"
            table={isEditable ? 'site_submit' : undefined}
            field={isEditable ? 'competitor_data' : undefined}
          />
        </FieldGroup>
        );
      })()}
    </div>
  );
}
