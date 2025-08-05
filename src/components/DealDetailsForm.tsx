// components/DealDetailsForm.tsx
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatCurrency, formatPercent, formatIntegerPercent } from "../utils/format";

interface Deal {
  id: string;
  deal_name: string;
  client_id: string | null;
  assignment_id: string | null;
  source: string | null;
  transaction_type_id: string | null;
  property_id: string | null;
  property_unit_id: string | null;
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

  useEffect(() => {
    setForm(deal);
  }, [deal]);

  const updateField = (field: keyof Deal, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const calculatedFee =
  form.flat_fee_override !== null && !isNaN(form.flat_fee_override)
    ? form.flat_fee_override
    : (form.deal_value ?? 0) * ((form.commission_percent ?? 0) / 100);


  const handleSave = async () => {
    setSaving(true);

    const updatePayload = {
      deal_name: form.deal_name,
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
    if (error) {
      alert("Error saving: " + error.message);
    } else if (data) {
      onSave(data);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-white rounded shadow">
      <h2 className="col-span-2 text-lg font-bold">Deal Details</h2>

      <Input label="Opportunity Name" value={form.deal_name} onChange={(v) => updateField("deal_name", v)} />

      <FormattedInput
        label="Deal Value"
        value={form.deal_value}
        onChange={(v) => updateField("deal_value", v === "" ? null : parseFloat(v))}
        format={(val) => formatCurrency(val, 2)}
        editingField={editingField}
        setEditingField={setEditingField}
        fieldKey="deal_value"
      />

      <FormattedInput
        label="Commission %"
        value={form.commission_percent}
        onChange={(v) => updateField("commission_percent", v === "" ? null : parseFloat(v))}
        format={(val) => formatPercent(val, 2)}
        editingField={editingField}
        setEditingField={setEditingField}
        fieldKey="commission_percent"
      />

      <FormattedInput
        label="Flat Fee Override"
        value={form.flat_fee_override}
        onChange={(v) => updateField("flat_fee_override", v === "" ? null : parseFloat(v))}
        format={(val) => formatCurrency(val, 2)}
        editingField={editingField}
        setEditingField={setEditingField}
        fieldKey="flat_fee_override"
      />

      <div className="col-span-2">
        <label className="block text-sm font-medium">Calculated Fee</label>
        <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
          {isNaN(calculatedFee) ? "--" : formatCurrency(calculatedFee, 2)}
        </div>
      </div>

      <Input
        label="Target Close Date"
        type="date"
        value={form.target_close_date || ""}
        onChange={(v) => updateField("target_close_date", v)}
      />
      <Input
        label="LOI Signed Date"
        type="date"
        value={form.loi_signed_date || ""}
        onChange={(v) => updateField("loi_signed_date", v)}
      />
      <Input
        label="Closed Date"
        type="date"
        value={form.closed_date || ""}
        onChange={(v) => updateField("closed_date", v)}
      />

      <FormattedInput
        label="Probability %"
        value={form.probability}
        onChange={(v) => updateField("probability", v === "" ? null : parseFloat(v))}
        format={(val) => formatIntegerPercent(val)}
        editingField={editingField}
        setEditingField={setEditingField}
        fieldKey="probability"
      />

      <div className="col-span-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
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
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
      />
    </div>
  );
}

function FormattedInput({
  label,
  value,
  onChange,
  format,
  editingField,
  setEditingField,
  fieldKey,
}: {
  label: string;
  value: number | null;
  onChange: (v: any) => void;
  format: (val: number | null) => string;
  editingField: string | null;
  setEditingField: (f: string | null) => void;
  fieldKey: string;
}) {
  const isEditing = editingField === fieldKey;

  const handleBlur = () => {
    setEditingField(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    onChange(input === "" ? null : parseFloat(input));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {isEditing ? (
        <input
          type="number"
          value={value ?? ""}
          onBlur={handleBlur}
          onChange={handleChange}
          className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
      ) : (
        <input
          type="text"
          value={format(value)}
          onFocus={() => setEditingField(fieldKey)}
          readOnly
          className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm bg-gray-50 cursor-text"
        />
      )}
    </div>
  );
}