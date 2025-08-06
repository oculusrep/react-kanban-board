// components/DealDetailsForm.tsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatCurrency, formatPercent, formatIntegerPercent } from "../utils/format";
import FormattedInput from "./FormattedInput";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { parseISO, format as formatDateFn } from "date-fns";

interface Deal {
  id: string;
  deal_name: string;
  client_id: string | null;
  assignment_id: string | null;
  source: string | null;
  transaction_type_id: string | null;
  property_id: string | null;
  site_submit_id: string | null;
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
  stage_id: string;
  probability: number | null;
  target_close_date: string | null;
  loi_signed_date: string | null;
  closed_date: string | null;
}

interface Props {
  deal: Deal;
  onSave: (updatedDeal: Deal) => void;
}

export default function DealDetailsForm({ deal, onSave }: Props) {
  const [form, setForm] = useState<Deal>(deal);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [stageOptions, setStageOptions] = useState<{ id: string; label: string }[]>([]);
  const [teamOptions, setTeamOptions] = useState<{ id: string; label: string }[]>([]);

  const [clientSearch, setClientSearch] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState<{ id: string; label: string }[]>([]);
  const [propertySearch, setPropertySearch] = useState("");
  const [propertySuggestions, setPropertySuggestions] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    setForm(deal);
  }, [deal]);

  useEffect(() => {
    supabase.from("deal_stage").select("id, label").then(({ data }) => data && setStageOptions(data));
    supabase.from("deal_team").select("id, label").then(({ data }) => data && setTeamOptions(data));

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

    if (deal.property_id) {
      supabase
        .from("property")
        .select("property_name")
        .eq("id", deal.property_id)
        .maybeSingle()
        .then(({ data }) => data?.property_name && setPropertySearch(data.property_name));
    } else {
      setPropertySearch("");
    }
  }, [deal.client_id, deal.property_id]);

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

  useEffect(() => {
    const run = async () => {
      const term = propertySearch.trim();
      if (!term) return setPropertySuggestions([]);
      const { data } = await supabase
        .from("property")
        .select("id, property_name")
        .ilike("property_name", `%${term}%`)
        .order("property_name", { ascending: true })
        .limit(5);
      if (data) setPropertySuggestions(data.map(p => ({ id: p.id, label: p.property_name })));
    };
    const handle = setTimeout(run, 150);
    return () => clearTimeout(handle);
  }, [propertySearch]);

  const updateField = (field: keyof Deal, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const calculatedFee =
    form.flat_fee_override ?? (form.deal_value ?? 0) * ((form.commission_percent ?? 0) / 100);

  const handleSave = async () => {
    setSaving(true);
    const updatePayload = {
      deal_name: form.deal_name,
      client_id: form.client_id,
      property_id: form.property_id,
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
    };
    const { data, error } = await supabase
      .from("deal")
      .update(updatePayload)
      .eq("id", form.id)
      .select()
      .single();
    setSaving(false);
    if (error) alert("Error saving: " + error.message);
    else if (data) onSave(data);
  };

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-white rounded shadow">
      <h2 className="col-span-2 text-lg font-bold">Deal Details</h2>

      <Input label="Opportunity Name" value={form.deal_name} onChange={(v) => updateField("deal_name", v)} />

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
      />

      <AlwaysEditableAutocomplete
        label="Property"
        search={propertySearch}
        setSearch={setPropertySearch}
        suggestions={propertySuggestions}
        onSelect={(id, label) => {
          updateField("property_id", id);
          setPropertySearch(label);
          setPropertySuggestions([]);
        }}
      />

      <FormattedInput label="Deal Value" value={form.deal_value} onChange={(v) => updateField("deal_value", v === "" ? null : parseFloat(v))} format={(val) => formatCurrency(val, 2)} editingField={editingField} setEditingField={setEditingField} fieldKey="deal_value" />
      <FormattedInput label="Commission %" value={form.commission_percent} onChange={(v) => updateField("commission_percent", v === "" ? null : parseFloat(v))} format={(val) => formatPercent(val, 2)} editingField={editingField} setEditingField={setEditingField} fieldKey="commission_percent" />
      <FormattedInput label="Flat Fee Override" value={form.flat_fee_override} onChange={(v) => updateField("flat_fee_override", v === "" ? null : parseFloat(v))} format={(val) => (val === null ? "" : formatCurrency(val, 2))} editingField={editingField} setEditingField={setEditingField} fieldKey="flat_fee_override" />

      <Select label="Stage" value={form.stage_id} onChange={(v) => updateField("stage_id", v)} options={stageOptions} />
      <Select label="Deal Team" value={form.deal_team_id} onChange={(v) => updateField("deal_team_id", v)} options={teamOptions} />

      <div className="col-span-2">
        <label className="block text-sm font-medium">Calculated Fee</label>
        <div className="mt-1 p-2 bg-gray-100 rounded text-sm">{isNaN(calculatedFee) ? "" : formatCurrency(calculatedFee, 2)}</div>
      </div>

      <DateInput label="Target Close Date" value={form.target_close_date} onChange={(v) => updateField("target_close_date", v)} />
      <DateInput label="LOI Signed Date" value={form.loi_signed_date} onChange={(v) => updateField("loi_signed_date", v)} />
      <DateInput label="Closed Date" value={form.closed_date} onChange={(v) => updateField("closed_date", v)} />

      <FormattedInput label="Probability %" value={form.probability} onChange={(v) => updateField("probability", v === "" ? null : parseFloat(v))} format={(val) => formatIntegerPercent(val)} editingField={editingField} setEditingField={setEditingField} fieldKey="probability" />

      <div className="col-span-2">
        <button onClick={handleSave} disabled={saving} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {saving ? "Saving..." : "Save Deal"}
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (v: any) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm" />
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const parsedDate = value ? parseISO(value) : null;
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <DatePicker selected={parsedDate} onChange={(date) => onChange(date ? formatDateFn(date, "yyyy-MM-dd") : null)} className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm" dateFormat="MM/dd/yyyy" isClearable />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string | null; onChange: (v: string) => void; options: { id: string; label: string }[]; }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm">
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
}: {
  label: string;
  search: string;
  setSearch: (v: string) => void;
  suggestions: { id: string; label: string }[];
  onSelect: (id: string, label: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={handleFocus}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
      />
      {suggestions
        .filter((s) => s.label !== search) // 🔹 Filter out the current selected value
        .map((s) => (
          <ul key={s.id} className="bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto">
            <li
              onClick={() => onSelect(s.id, s.label)}
              className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
            >
              {s.label}
            </li>
          </ul>
        ))}
    </div>
  );
}
