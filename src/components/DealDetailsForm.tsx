// components/DealDetailsForm.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { formatCurrency, formatPercent, formatIntegerPercent } from "../utils/format";
import FormattedInput from "./FormattedInput";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { parseISO, format as formatDateFn } from "date-fns";
import SiteSubmitSelector from "./SiteSubmitSelector";
import PropertyUnitSelector from "./PropertyUnitSelector";
import PropertySelector from "./PropertySelector";
import { getDropboxPropertySyncService } from "../services/dropboxPropertySync";

// 🔹 Stage → Default Probability map (integer percent 0..100)
const STAGE_PROBABILITY: Record<string, number> = {
  "Negotiating LOI": 50,
  "At Lease/PSA": 75,
  "Under Contract / Contingent": 85,
  "Booked": 90,
  "Executed Payable": 95,
  "Closed Paid": 100,
  "Lost": 0,
};

interface Deal {
  id: string;
  deal_name: string;
  client_id: string | null;
  assignment_id: string | null;
  source: string | null;
  transaction_type_id: string | null;
  property_id: string | null;
  site_submit_id: string | null;
  property_unit_id: string | null;
  property_type_id: string | null;
  size_sqft: number | null;
  size_acres: number | null;
  representation_id: string | null;
  owner_id: string | null;
  deal_team_id: string | null;
  deal_value: number | null;
  commission_percent: number | null;
  flat_fee_override: number | null;
  fee: number | null;
  house_percent: number | null;
  origination_percent: number | null;
  site_percent: number | null;
  deal_percent: number | null;
  number_of_payments: number | null;
  stage_id: string;
  probability: number | null;
  target_close_date: string | null;
  loi_signed_date: string | null;
  closed_date: string | null;
  updated_by_id?: string | null;
  updated_at?: string | null;
}

interface Props {
  deal: Deal;
  onSave: (updatedDeal: Deal) => void;
  onViewSiteSubmitDetails?: (siteSubmitId: string) => void;
}

export default function DealDetailsForm({ deal, onSave, onViewSiteSubmitDetails }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Deal>(deal);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [stageOptions, setStageOptions] = useState<{ id: string; label: string }[]>([]);
  const [teamOptions, setTeamOptions] = useState<{ id: string; label: string }[]>([]);
  const [updatedByName, setUpdatedByName] = useState<string>("");
  const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);
  const [originalDealName, setOriginalDealName] = useState<string>(deal.deal_name);

  const [clientSearch, setClientSearch] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState<{ id: string; label: string }[]>([]);

  // 🔹 UX: validation + change-highlighting states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [probabilityFlash, setProbabilityFlash] = useState(false);

  // 🔹 Manual override tracking + first-load/stage-change guards
  const [probabilityManuallySet, setProbabilityManuallySet] = useState(false);
  const prevStageIdRef = useRef<string | null>(null);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    setForm(deal);
    setErrors({});
    setProbabilityManuallySet(false);
    prevStageIdRef.current = deal.stage_id ?? null;
    isFirstLoadRef.current = true;
  }, [deal]);

  // Lookups + prefill client/property search boxes
  useEffect(() => {
    supabase.from("deal_stage").select("id, label").then(({ data }) => data && setStageOptions(data));
    supabase.from("deal_team").select("id, label").then(({ data }) => data && setTeamOptions(data));
    // Fetch updated_by user name if exists
    if (deal.updated_by_id) {
      supabase
        .from("user")
        .select("name")
        .eq("id", deal.updated_by_id)
        .maybeSingle()
        .then(({ data }) => data?.name && setUpdatedByName(data.name));
    }

    if (deal.client_id) {
      supabase
        .from("client")
        .select("client_name")
        .eq("id", deal.client_id)
        .maybeSingle()
        .then(({ data }) => data?.client_name && setClientSearch(data.client_name));
    } else {
      setClientSearch("");
    }
  }, [deal.client_id, deal.property_id]);

  // Autocomplete: client
  useEffect(() => {
    const run = async () => {
      const term = clientSearch.trim();
      if (!term) return setClientSuggestions([]);
      const { data } = await supabase
        .from("client")
        .select("id, client_name")
        .ilike("client_name", `%${term}%`)
        .order("client_name", { ascending: true })
        .limit(5);
      if (data) setClientSuggestions(data.map(c => ({ id: c.id, label: c.client_name })));
    };
    const handle = setTimeout(run, 150);
    return () => clearTimeout(handle);
  }, [clientSearch]);

  const updateField = (field: keyof Deal, value: any) => {
    if (field === "probability") {
      setProbabilityManuallySet(true);
    }
    
    // Update form state
    const updatedForm = { ...form, [field]: value };
    setForm(updatedForm);
    
    // FIXED: Only validate the specific field that changed
    if (["deal_name", "deal_value", "commission_percent"].includes(field as string)) {
      const fieldErrors = validateField(field as keyof Deal, value);
      setErrors(prev => {
  const newErrors = { ...prev };
  const fieldError = fieldErrors[field as string];
  if (fieldError) {
    newErrors[field as string] = fieldError;  // ✅ Set error string
  } else {
    delete newErrors[field as string];        // ✅ Remove error completely
  }
  return newErrors;
});
    }
    
    // FIXED: Auto-save commission_percent changes immediately to sync with Commission tab
    if (field === "commission_percent") {
      // Calculate the fee with the new commission percentage
      const calculatedFee = updatedForm.flat_fee_override ?? 
        (updatedForm.deal_value ?? 0) * ((value ?? 0) / 100);
      
      // Save to database immediately
      const saveCommissionChange = async () => {
        // Don't auto-save for new deals (id is null)
        if (!form.id) {
          console.log("Skipping auto-save for new deal");
          return;
        }

        const { data, error } = await supabase
          .from("deal")
          .update({ 
            commission_percent: value,
            fee: calculatedFee
          })
          .eq("id", form.id)
          .select()
          .single();
        
        if (error) {
          console.error("Error auto-saving commission:", error);
        } else if (data) {
          // Update parent state to sync with Commission tab
          onSave(data);
        }
      };
      
      saveCommissionChange();
    }
  };

  const calculatedFee =
    form.flat_fee_override ?? (form.deal_value ?? 0) * ((form.commission_percent ?? 0) / 100);

  // Helper: get current stage label
  const getStageLabel = () => stageOptions.find(s => s.id === form.stage_id)?.label;

  // 🔹 Auto-fill Probability
  // Rules:
  // - On first load: if a saved probability exists, DO NOT overwrite it. If it's null, fill from stage.
  // - On stage change (in-session): always set to the new stage default, regardless of prior manual override.
  useEffect(() => {
    if (!form.stage_id || stageOptions.length === 0) return;
    const label = getStageLabel();
    if (!label) return;
    const defaultProb = STAGE_PROBABILITY[label];

    // First load behavior
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      if (form.probability == null && typeof defaultProb === "number") {
        setForm(prev => ({ ...prev, probability: defaultProb }));
        setProbabilityFlash(true);
        const t = setTimeout(() => setProbabilityFlash(false), 800);
        return () => clearTimeout(t);
      }
      return; // keep saved value
    }

    // Subsequent changes: detect stage change
    const prevStageId = prevStageIdRef.current;
    if (prevStageId !== form.stage_id) {
      if (typeof defaultProb === "number") {
        setForm(prev => ({ ...prev, probability: defaultProb }));
        setProbabilityManuallySet(false); // reset manual flag on stage change
        setProbabilityFlash(true);
        const t = setTimeout(() => setProbabilityFlash(false), 800);
        prevStageIdRef.current = form.stage_id;
        return () => clearTimeout(t);
      }
    }

    // Keep ref in sync
    prevStageIdRef.current = form.stage_id;
  }, [form.stage_id, stageOptions]);

  // 🔹 Validation helpers
  const validateField = (field: keyof Deal, value: any): Record<string, string> => {
    const out: Record<string, string> = {};
    if (field === "deal_name") {
      if (!value || String(value).trim().length === 0) out.deal_name = "Deal Name is required.";
    }
    if (field === "deal_value") {
      if (value === null || value === "" || isNaN(Number(value))) out.deal_value = "Enter a number.";
      else if (Number(value) < 0) out.deal_value = "Must be ≥ 0.";
    }
    if (field === "commission_percent") {
      const num = Number(value);
      if (value === null || value === "" || isNaN(num)) out.commission_percent = "Enter a percent.";
      else if (num < 0 || num > 100) out.commission_percent = "0–100 only.";
    }
    return out;
  };

  const validateAll = (f: Deal): Record<string, string> => {
    const out: Record<string, string> = {};
    Object.assign(out, validateField("deal_name", f.deal_name));
    Object.assign(out, validateField("deal_value", f.deal_value));
    Object.assign(out, validateField("commission_percent", f.commission_percent));
    return out;
  };

  const handleRetryDropboxSync = async () => {
    if (!form.id || !form.deal_name) return;

    const syncService = getDropboxPropertySyncService();
    const { currentFolderName } = await syncService.checkSyncStatus(
      form.id,
      'deal',
      form.deal_name
    );

    if (currentFolderName) {
      const result = await syncService.syncDealName(
        form.id,
        currentFolderName,
        form.deal_name
      );

      if (!result.success) {
        setDropboxSyncError(result.error || 'Failed to sync folder name');
      } else {
        setOriginalDealName(form.deal_name);
        setDropboxSyncError(null);
      }
    }
  };

  const handleSave = async () => {
    const v = validateAll(form);
    setErrors(v);
    if (Object.keys(v).length > 0) return; // stop save on validation errors

    setSaving(true);
    const dealPayload = {
      deal_name: form.deal_name,
      client_id: form.client_id,
      property_id: form.property_id,
      property_unit_id: form.property_unit_id,
      site_submit_id: form.site_submit_id,
      deal_value: form.deal_value,
      commission_percent: form.commission_percent,
      flat_fee_override: form.flat_fee_override,
      fee: calculatedFee,
      target_close_date: form.target_close_date,
      loi_signed_date: form.loi_signed_date,
      closed_date: form.closed_date,
      probability: form.probability,
      deal_team_id: form.deal_team_id,
      stage_id: form.stage_id,
      house_percent: form.house_percent,
      origination_percent: form.origination_percent,
      site_percent: form.site_percent,
      deal_percent: form.deal_percent,
      number_of_payments: form.number_of_payments,
      updated_at: new Date().toISOString(),
    };

    let data, error;
    
    if (form.id) {
      // Update existing deal
      const result = await supabase
        .from("deal")
        .update(dealPayload)
        .eq("id", form.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Insert new deal
      dealPayload.created_at = new Date().toISOString();
      const result = await supabase
        .from("deal")
        .insert([dealPayload])
        .select()
        .single();
      data = result.data;
      error = result.error;
    }
    
    setSaving(false);

    if (error) {
      alert("Error saving: " + error.message);
      return;
    }

    if (data) {
      // If deal_name changed, sync to Dropbox
      const nameChanged = originalDealName !== form.deal_name;
      if (nameChanged && originalDealName && form.deal_name && data.id) {
        const syncService = getDropboxPropertySyncService();
        const result = await syncService.syncDealName(
          data.id,
          originalDealName,
          form.deal_name
        );

        if (!result.success) {
          setDropboxSyncError(result.error || 'Failed to sync folder name to Dropbox');
          console.warn('Dropbox sync failed:', result.error);
        } else {
          setOriginalDealName(form.deal_name);
          setDropboxSyncError(null);
          console.log('✅ Deal name synced to Dropbox successfully');
        }
      }

      onSave(data);
    }
  };

  // 🔹 Conditional enablement
  const stageLabel = getStageLabel();
  const closedEnabled = stageLabel === "Closed Paid"; // Only allow Closed Date when stage is Closed Paid

  return (
    <div className="relative">
      {/* SECTION: Deal Context */}
      <Section title="Deal Context" help="Name the opportunity, choose the client, property, and deal team.">
        <div className="grid grid-cols-2 gap-4">
          {/* Row 1: Opportunity (left) + Client (right) */}
          <div>
            <Input
              label="Deal Name"
              value={form.deal_name}
              onChange={(v) => updateField("deal_name", v)}
            />
            {/* Show Dropbox sync error with retry button */}
            {dropboxSyncError && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs text-yellow-800 font-medium">Dropbox Sync Warning</p>
                    <p className="text-xs text-yellow-700 mt-1">{dropboxSyncError}</p>
                    <button
                      onClick={handleRetryDropboxSync}
                      className="mt-2 text-xs font-medium text-yellow-800 hover:text-yellow-900 underline"
                    >
                      Retry Sync
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <AlwaysEditableAutocomplete
            label="Client"
            search={clientSearch}
            setSearch={setClientSearch}
            suggestions={clientSuggestions}
            onSelect={(id, label) => {
              updateField("client_id", id);
              setClientSearch(label);
              setClientSuggestions([]);
            }}
            selectedId={form.client_id}
            onNavigate={(id) => navigate(`/client/${id}`)}
          />

          {/* Row 2: Property (left) + Property Unit (right) */}
          <PropertySelector
            value={form.property_id}
            onChange={(id) => updateField("property_id", id)}
            label="Property"
          />
          <PropertyUnitSelector
            value={form.property_unit_id}
            onChange={(id) => updateField("property_unit_id", id)}
            propertyId={form.property_id} // Filter units by selected property
            label="Property Unit"
          />

          {/* Row 3: Site Submit (left) + Deal Team (right) */}
          <SiteSubmitSelector
            value={form.site_submit_id}
            onChange={(id) => updateField("site_submit_id", id)}
            label="Site Submit"
            onViewDetails={onViewSiteSubmitDetails}
          />
          <Select
            label="Deal Team"
            value={form.deal_team_id}
            onChange={(v) => updateField("deal_team_id", v)}
            options={teamOptions}
          />

          {errors.deal_name && <FieldError msg={errors.deal_name} className="col-span-2" />}
        </div>
      </Section>

      {/* SECTION: Financials */}
      <Section title="Financials" help="Set value and commission. Fee auto-calculates unless a flat fee is set.">
        <div className="grid grid-cols-2 gap-4">
          <FormattedInput
            label="Deal Value"
            value={form.deal_value}
            onChange={(v) => updateField("deal_value", v === "" ? null : parseFloat(v))}
            format={(val) => formatCurrency(val, 2)}
            editingField={editingField}
            setEditingField={setEditingField}
            fieldKey="deal_value"
          />
          {errors.deal_value && <FieldError msg={errors.deal_value} />}

          <FormattedInput
            label="Commission %"
            value={form.commission_percent}
            onChange={(v) => updateField("commission_percent", v === "" ? null : parseFloat(v))}
            format={(val) => formatPercent(val, 2)}
            editingField={editingField}
            setEditingField={setEditingField}
            fieldKey="commission_percent"
          />
          {errors.commission_percent && <FieldError msg={errors.commission_percent} />}

          <FormattedInput
            label="Flat Fee Override"
            value={form.flat_fee_override}
            onChange={(v) => updateField("flat_fee_override", v === "" ? null : parseFloat(v))}
            format={(val) => (val === null ? "" : formatCurrency(val, 2))}
            editingField={editingField}
            setEditingField={setEditingField}
            fieldKey="flat_fee_override"
          />

          <div>
            <label className="block text-sm font-medium">Calculated Fee</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {isNaN(calculatedFee) ? "" : formatCurrency(calculatedFee, 2)}
            </div>
          </div>
        </div>
      </Section>

      {/* SECTION: Stage & Probability */}
      <Section title="Stage & Probability" help="Choosing a stage will set a default probability. You can override it.">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Stage"
            value={form.stage_id}
            onChange={(v) => updateField("stage_id", v)}
            options={stageOptions}
          />

          <div
            className={
              "rounded transition-colors duration-700 " +
              (probabilityFlash ? "bg-yellow-50" : "bg-transparent")
            }
          >
            <FormattedInput
              label="Probability %"
              value={form.probability}
              onChange={(v) => updateField("probability", v === "" ? null : parseFloat(v))}
              format={(val) => formatIntegerPercent(val)}
              editingField={editingField}
              setEditingField={setEditingField}
              fieldKey="probability"
            />
          </div>
        </div>
      </Section>

      {/* SECTION: Dates / Timeline */}
      <Section title="Timeline" help="Target and actual dates. Closed Date enabled only at Closed Paid.">
        <div className="grid grid-cols-2 gap-4">
          <DateInput
            label="Target Close Date"
            value={form.target_close_date}
            onChange={(v) => updateField("target_close_date", v)}
          />
          <DateInput
            label="LOI Signed Date"
            value={form.loi_signed_date}
            onChange={(v) => updateField("loi_signed_date", v)}
          />
          <DateInput
            label="Closed Date"
            value={form.closed_date}
            onChange={(v) => updateField("closed_date", v)}
            disabled={!closedEnabled}
            tooltip={!closedEnabled ? "Set Stage to 'Closed Paid' to enable" : undefined}
          />
        </div>
      </Section>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t mt-6 p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {form.updated_at ? (
            <>
              <span>Last Updated by</span>
              <span className="font-medium">{updatedByName || "Unknown"}</span>
              <span>{new Date(form.updated_at).toLocaleDateString()} {new Date(form.updated_at).toLocaleTimeString()}</span>
            </>
          ) : (
            <span>Not yet saved</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {stageLabel ? `Stage: ${stageLabel}` : "No stage selected"}
          </span>
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(errors).length > 0}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========= Reusable helpers / primitives ========= */
function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-md border p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {help && (
          <span
            className="text-gray-500 text-xs border rounded-full w-4 h-4 inline-flex items-center justify-center"
            title={help}
            aria-label={help}
          >
            i
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function FieldError({ msg, className = "" }: { msg: string; className?: string }) {
  return <p className={"text-xs text-red-600 mt-1 " + className}>{msg}</p>;
}

function Input({ label, value, onChange, type = "text", className = "" }: { label: string; value: any; onChange: (v: any) => void; type?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
      />
    </div>
  );
}

function DateInput({ label, value, onChange, disabled, tooltip }: { label: string; value: string | null; onChange: (v: string | null) => void; disabled?: boolean; tooltip?: string }) {
  const parsedDate = value ? parseISO(value) : null;
  return (
    <div title={tooltip}>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <DatePicker
        selected={parsedDate}
        onChange={(date) => onChange(date ? formatDateFn(date, "yyyy-MM-dd") : null)}
        className={`mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
        dateFormat="MM/dd/yyyy"
        isClearable
        disabled={disabled}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string | null; onChange: (v: string) => void; options: { id: string; label: string }[]; }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
      >
        <option value="">-- Select --</option>
        {options.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
      </select>
    </div>
  );
}

function AlwaysEditableAutocomplete({
  label,
  search,
  setSearch,
  suggestions,
  onSelect,
  selectedId,
  onNavigate,
}: {
  label: string;
  search: string;
  setSearch: (v: string) => void;
  suggestions: { id: string; label: string }[];
  onSelect: (id: string, label: string) => void;
  selectedId?: string | null;
  onNavigate?: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const hasSelectedItem = selectedId && search.trim();

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center space-x-2">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={handleFocus}
          placeholder={`Search ${label.toLowerCase()}...`}
          className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
        {hasSelectedItem && onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(selectedId)}
            className="mt-1 inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            title={`View ${label}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
      </div>
      {suggestions.filter((s) => s.label !== search).length > 0 && (
        <ul className="bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto">
          {suggestions
            .filter((s) => s.label !== search)
            .map((s) => (
              <li
                key={s.id}
                onClick={() => onSelect(s.id, s.label)}
                className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
              >
                {s.label}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

