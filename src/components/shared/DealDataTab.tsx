/**
 * DealDataTab - Data tab for site submits with associated deals
 *
 * Shows deal-specific fields (LOI Written Date, negotiated sizes/pricing)
 * with a collapsible section for original site submit / property values.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SiteSubmitData } from './SiteSubmitSidebar';

interface DealData {
  id: string;
  deal_name: string | null;
  loi_written_date: string | null;
  deal_available_sqft: number | null;
  deal_building_sqft: number | null;
  deal_acres: number | null;
  deal_asking_lease_price: number | null;
  deal_rent_psf: number | null;
  deal_nnn_psf: number | null;
  deal_all_in_rent: number | null;
  deal_asking_purchase_price: number | null;
  deal_asking_ground_lease_price: number | null;
  deal_nnn: number | null;
}

interface DealDataTabProps {
  siteSubmit: SiteSubmitData;
  dealId: string;
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
  // Parse the date string as local time to avoid timezone offset issues
  // Input format is YYYY-MM-DD from database DATE columns
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return '-';
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString();
};

// FieldGroup component
function FieldGroup({
  title,
  children,
  collapsible = false,
  defaultCollapsed = false,
  headerColor = '#f1f5f9',
  textColor = '#475569'
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  headerColor?: string;
  textColor?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="mb-6">
      <button
        onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
        className={`w-full text-left text-xs font-semibold uppercase tracking-wider mb-3 px-4 py-2 -mx-4 flex items-center justify-between ${collapsible ? 'cursor-pointer hover:opacity-80' : ''}`}
        style={{ backgroundColor: headerColor, color: textColor }}
        disabled={!collapsible}
      >
        <span>{title}</span>
        {collapsible && (
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {!collapsed && (
        <div className="space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

// Field component for inline editing
interface FieldProps {
  label: string;
  value: any;
  type?: 'text' | 'number' | 'date' | 'textarea';
  isCurrency?: boolean;
  isNumber?: boolean;
  suffix?: string;
  isEditable: boolean;
  editingField: string | null;
  editValue: any;
  saving: boolean;
  fieldKey: string;
  onStartEditing: (fieldKey: string, currentValue: any) => void;
  onCancelEditing: () => void;
  onSaveField: (fieldKey: string) => void;
  onEditValueChange: (value: any) => void;
}

function Field({
  label,
  value,
  type = 'text',
  isCurrency = false,
  isNumber = false,
  suffix = '',
  isEditable,
  editingField,
  editValue,
  saving,
  fieldKey,
  onStartEditing,
  onCancelEditing,
  onSaveField,
  onEditValueChange,
}: FieldProps) {
  const isCurrentlyEditing = fieldKey === editingField;

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
      onClick={() => onStartEditing(fieldKey, value)}
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
        onClick={() => onSaveField(fieldKey)}
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
            {isEditable && <PencilButton />}
          </>
        )}
      </div>
    </div>
  );
}

// Read-only field for displaying original values
function ReadOnlyField({
  label,
  value,
  isCurrency = false,
  isNumber = false,
  suffix = ''
}: {
  label: string;
  value: any;
  isCurrency?: boolean;
  isNumber?: boolean;
  suffix?: string;
}) {
  const baseFormattedValue = isCurrency
    ? formatCurrency(value)
    : isNumber
    ? formatNumber(value)
    : value || '-';

  const formattedValue = baseFormattedValue !== '-' && suffix
    ? `${baseFormattedValue} ${suffix}`
    : baseFormattedValue;

  return (
    <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-gray-500">{formattedValue}</span>
    </div>
  );
}

export default function DealDataTab({ siteSubmit, dealId, isEditable, onUpdate }: DealDataTabProps) {
  const [deal, setDeal] = useState<DealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>(null);

  // Fetch deal data
  useEffect(() => {
    async function fetchDeal() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('deal')
          .select(`
            id,
            deal_name,
            loi_written_date,
            deal_available_sqft,
            deal_building_sqft,
            deal_acres,
            deal_asking_lease_price,
            deal_rent_psf,
            deal_nnn_psf,
            deal_all_in_rent,
            deal_asking_purchase_price,
            deal_asking_ground_lease_price,
            deal_nnn
          `)
          .eq('id', dealId)
          .single();

        if (error) throw error;
        setDeal(data);
      } catch (err) {
        console.error('Error fetching deal:', err);
      } finally {
        setLoading(false);
      }
    }

    if (dealId) {
      fetchDeal();
    }
  }, [dealId]);

  const handleStartEditing = useCallback((fieldKey: string, currentValue: any) => {
    setEditingField(fieldKey);
    setEditValue(currentValue);
  }, []);

  const handleCancelEditing = useCallback(() => {
    setEditingField(null);
    setEditValue(null);
  }, []);

  const handleSaveField = useCallback(async (fieldKey: string) => {
    if (!deal) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('deal')
        .update({ [fieldKey]: editValue })
        .eq('id', deal.id);

      if (error) throw error;

      // Update local state
      setDeal({ ...deal, [fieldKey]: editValue });
      setEditingField(null);
      setEditValue(null);
    } catch (err) {
      console.error('Error saving deal field:', err);
    } finally {
      setSaving(false);
    }
  }, [deal, editValue]);

  const handleEditValueChange = useCallback((value: any) => {
    setEditValue(value);
  }, []);

  // Determine property type for conditional field display
  const recordTypeLabel = siteSubmit.property?.property_record_type?.label?.toLowerCase() || '';
  const isLand = recordTypeLabel.includes('land');

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-4 text-center text-gray-500">
        Could not load deal details
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto flex-1">
      {/* Deal Details Section */}
      <FieldGroup title="Deal Details" headerColor="#dcfce7" textColor="#166534">
        {/* LOI Written Date - required for deals */}
        <Field
          {...fieldProps}
          label="LOI Written Date"
          value={deal.loi_written_date}
          type="date"
          fieldKey="loi_written_date"
        />

        {/* Client (read-only display) */}
        <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 odd:bg-[#f0f3f7] rounded items-center">
          <span className="text-sm text-gray-500">Client</span>
          <span className="text-sm font-medium text-gray-900">
            {siteSubmit.client?.client_name || '-'}
          </span>
        </div>

        {/* Fields based on property type */}
        {isLand ? (
          // Land-specific fields
          <>
            <Field
              {...fieldProps}
              label="Acres"
              value={deal.deal_acres}
              type="number"
              isNumber
              fieldKey="deal_acres"
            />
            <Field
              {...fieldProps}
              label="Asking Purchase Price"
              value={deal.deal_asking_purchase_price}
              type="number"
              isCurrency
              fieldKey="deal_asking_purchase_price"
            />
            <Field
              {...fieldProps}
              label="Asking Ground Lease"
              value={deal.deal_asking_ground_lease_price}
              type="number"
              isCurrency
              fieldKey="deal_asking_ground_lease_price"
            />
            <Field
              {...fieldProps}
              label="NNN"
              value={deal.deal_nnn}
              type="number"
              isCurrency
              fieldKey="deal_nnn"
            />
          </>
        ) : (
          // Building types (Shopping Center, Office, Industrial, etc.)
          <>
            <Field
              {...fieldProps}
              label="Available Sqft"
              value={deal.deal_available_sqft}
              type="number"
              isNumber
              suffix="sqft"
              fieldKey="deal_available_sqft"
            />
            <Field
              {...fieldProps}
              label="Building Sqft"
              value={deal.deal_building_sqft}
              type="number"
              isNumber
              suffix="sqft"
              fieldKey="deal_building_sqft"
            />
            <Field
              {...fieldProps}
              label="Asking Lease Price"
              value={deal.deal_asking_lease_price}
              type="number"
              isCurrency
              fieldKey="deal_asking_lease_price"
            />
            <Field
              {...fieldProps}
              label="Rent PSF"
              value={deal.deal_rent_psf}
              type="number"
              isCurrency
              fieldKey="deal_rent_psf"
            />
            <Field
              {...fieldProps}
              label="NNN PSF"
              value={deal.deal_nnn_psf}
              type="number"
              isCurrency
              fieldKey="deal_nnn_psf"
            />
            {/* All-in Rent - calculated */}
            {(() => {
              const allInRent = deal.deal_rent_psf != null && deal.deal_nnn_psf != null
                ? deal.deal_rent_psf + deal.deal_nnn_psf
                : deal.deal_all_in_rent;
              const availableSqft = deal.deal_available_sqft;

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
      </FieldGroup>

      {/* Original Property Values - Collapsible */}
      <FieldGroup
        title="Original Property Values"
        collapsible
        defaultCollapsed
        headerColor="#e5e7eb"
        textColor="#6b7280"
      >
        {siteSubmit.property && (
          <>
            {isLand ? (
              // Land original values
              <>
                <ReadOnlyField
                  label="Acres"
                  value={siteSubmit.property.acres}
                  isNumber
                />
                <ReadOnlyField
                  label="Asking Purchase Price"
                  value={siteSubmit.property.asking_purchase_price}
                  isCurrency
                />
                <ReadOnlyField
                  label="Asking Lease Price"
                  value={siteSubmit.property.asking_lease_price}
                  isCurrency
                />
              </>
            ) : (
              // Building original values
              <>
                <ReadOnlyField
                  label="Available Sqft"
                  value={siteSubmit.property.available_sqft}
                  isNumber
                  suffix="sqft"
                />
                <ReadOnlyField
                  label="Building Sqft"
                  value={siteSubmit.property.building_sqft}
                  isNumber
                  suffix="sqft"
                />
                <ReadOnlyField
                  label="Asking Lease Price"
                  value={siteSubmit.property.asking_lease_price}
                  isCurrency
                />
                <ReadOnlyField
                  label="Rent PSF"
                  value={siteSubmit.property.rent_psf}
                  isCurrency
                />
                <ReadOnlyField
                  label="NNN PSF"
                  value={siteSubmit.property.nnn_psf}
                  isCurrency
                />
                <ReadOnlyField
                  label="All-in Rent"
                  value={siteSubmit.property.all_in_rent}
                  isCurrency
                />
              </>
            )}
          </>
        )}

        {/* Original site submit values */}
        <ReadOnlyField
          label="Date Submitted"
          value={siteSubmit.date_submitted}
        />
        <ReadOnlyField
          label="TI"
          value={siteSubmit.ti}
          isCurrency
        />
        <ReadOnlyField
          label="Year 1 Rent"
          value={siteSubmit.year_1_rent}
          isCurrency
        />
        {siteSubmit.notes && (
          <div className="py-2 px-2 -mx-2">
            <span className="text-sm text-gray-400 block mb-1">Notes</span>
            <p className="text-sm text-gray-500 whitespace-pre-wrap">{siteSubmit.notes}</p>
          </div>
        )}
      </FieldGroup>
    </div>
  );
}
