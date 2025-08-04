// components/DealDetailsForm.tsx
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

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
  record_type: string | null;
  owner_id: string | null;
  assigned_to_id: string | null;
  deal_value: number | null;
  commission_rate: number | null;
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

  useEffect(() => {
    setForm(deal);
  }, [deal]);

  const updateField = (field: keyof Deal, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const calculatedFee = form.flat_fee_override ?? (form.deal_value ?? 0) * (form.commission_rate ?? 0);

  const handleSave = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("deal")
      .update({ ...form, fee: calculatedFee })
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
      <Input label="Deal Value" type="number" value={form.deal_value} onChange={(v) => updateField("deal_value", Number(v))} />

      <Input label="Commission %" type="number" value={form.commission_rate} onChange={(v) => updateField("commission_rate", Number(v))} />
      <Input label="Flat Fee Override" type="number" value={form.flat_fee_override} onChange={(v) => updateField("flat_fee_override", Number(v))} />

      <div className="col-span-2">
        <label className="block text-sm font-medium">Calculated Fee</label>
        <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
          {calculatedFee.toLocaleString("en-US", { style: "currency", currency: "USD" })}
        </div>
      </div>

      <Input label="Target Close Date" type="date" value={form.target_close_date || ""} onChange={(v) => updateField("target_close_date", v)} />
      <Input label="LOI Signed Date" type="date" value={form.loi_signed_date || ""} onChange={(v) => updateField("loi_signed_date", v)} />
      <Input label="Closed Date" type="date" value={form.closed_date || ""} onChange={(v) => updateField("closed_date", v)} />
      <Input label="Probability %" type="number" value={form.probability} onChange={(v) => updateField("probability", Number(v))} />

      {/* Add FK dropdowns here later */}

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
