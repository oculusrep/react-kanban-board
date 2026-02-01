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
  property_unit_id: string | null;
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
  property_unit: {
    id: string;
    property_unit_name: string | null;
    sqft: number | null;
    rent: number | null;
    nnn: number | null;
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
 * Read-only for clients, inline editable for brokers (click pencil to edit)
 */
export default function PortalDataTab({ siteSubmit, isEditable, onUpdate }: PortalDataTabProps) {
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>(null);

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

  const startEditing = (table: string, field: string, currentValue: any) => {
    setEditingField(`${table}.${field}`);
    setEditValue(currentValue);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue(null);
  };

  const saveField = async (table: 'site_submit' | 'property' | 'property_unit', field: string) => {
    setSaving(true);
    try {
      if (table === 'site_submit') {
        const { error } = await supabase
          .from('site_submit')
          .update({ [field]: editValue })
          .eq('id', siteSubmit.id);
        if (error) throw error;
        onUpdate({ [field]: editValue });
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
  };

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
    table?: 'site_submit' | 'property' | 'property_unit';
    field?: string;
    isCurrency?: boolean;
    isNumber?: boolean;
    suffix?: string;
  }) => {
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

    // Pencil icon for editable fields
    const PencilButton = () => (
      <button
        onClick={() => startEditing(table!, field!, value)}
        className="ml-2 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        title="Edit"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );

    // Save/Cancel buttons for editing mode
    const EditActions = () => (
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={() => saveField(table!, field!)}
          disabled={saving}
          className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
          title="Save"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button
          onClick={cancelEditing}
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
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value || null)}
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
                  onChange={(e) => setEditValue(e.target.value ? parseFloat(e.target.value) : null)}
                  className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              ) : type === 'date' ? (
                <input
                  type="date"
                  value={editValue || ''}
                  onChange={(e) => setEditValue(e.target.value || null)}
                  className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  value={editValue || ''}
                  onChange={(e) => setEditValue(e.target.value || null)}
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
  };

  return (
    <div className="p-4 overflow-y-auto">
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

        // Check if we have unit data - use unit values when available
        const hasUnit = !!siteSubmit.property_unit;
        const unitName = siteSubmit.property_unit?.property_unit_name || 'Unit';

        return (
        <FieldGroup title={hasUnit ? `Deal Details (${unitName})` : 'Deal Details'}>
          {/* Property Fields */}
          {siteSubmit.property && (
            <>
              {/* Available Sqft - Use unit sqft if available, otherwise property available_sqft */}
              {!isLand && (
                hasUnit && siteSubmit.property_unit?.sqft != null ? (
                  <Field
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
                  label="Asking Purchase Price"
                  value={siteSubmit.property.asking_purchase_price}
                  type="number"
                  isCurrency
                  table="property"
                  field="asking_purchase_price"
                />
              )}
              {/* Rent PSF - Use unit rent if available, otherwise property rent_psf */}
              {!isLand && (
                hasUnit && siteSubmit.property_unit?.rent != null ? (
                  <Field
                    label="Rent PSF"
                    value={siteSubmit.property_unit.rent}
                    type="number"
                    isCurrency
                    table="property_unit"
                    field="rent"
                  />
                ) : (
                  <Field
                    label="Rent PSF"
                    value={siteSubmit.property.rent_psf}
                    type="number"
                    isCurrency
                    table="property"
                    field="rent_psf"
                  />
                )
              )}
              {/* NNN PSF - Use unit nnn if available, otherwise property nnn_psf */}
              {!isLand && (
                hasUnit && siteSubmit.property_unit?.nnn != null ? (
                  <Field
                    label="NNN PSF"
                    value={siteSubmit.property_unit.nnn}
                    type="number"
                    isCurrency
                    table="property_unit"
                    field="nnn"
                  />
                ) : (
                  <Field
                    label="NNN PSF"
                    value={siteSubmit.property.nnn_psf}
                    type="number"
                    isCurrency
                    table="property"
                    field="nnn_psf"
                  />
                )
              )}
              {/* All-in Rent - Always calculated, not editable */}
              {!isLand && (() => {
                // Calculate all-in rent from unit values if available, otherwise use property value
                const allInRent = hasUnit && siteSubmit.property_unit?.rent != null && siteSubmit.property_unit?.nnn != null
                  ? siteSubmit.property_unit.rent + siteSubmit.property_unit.nnn
                  : siteSubmit.property.all_in_rent;
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

          {/* Site Submit Fields */}
          <Field
            label="Delivery Timeframe"
            value={siteSubmit.delivery_timeframe}
            table="site_submit"
            field="delivery_timeframe"
          />
          <Field
            label="TI (Tenant Improvement)"
            value={siteSubmit.ti}
            type="number"
            isCurrency
            table="site_submit"
            field="ti"
          />
          <Field
            label="Year 1 Rent"
            value={siteSubmit.year_1_rent}
            type="number"
            isCurrency
            table="site_submit"
            field="year_1_rent"
          />
          <Field
            label="Notes"
            value={siteSubmit.notes}
            type="textarea"
            table="site_submit"
            field="notes"
          />
          <Field
            label="Competitor Data"
            value={siteSubmit.competitor_data}
            type="textarea"
            table="site_submit"
            field="competitor_data"
          />
        </FieldGroup>
        );
      })()}
    </div>
  );
}
