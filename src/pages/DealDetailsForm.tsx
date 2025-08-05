import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Utility formatters (optional: extract to lib/formatUtils.ts if reused)
const formatCurrency = (value: number | null | undefined, decimals = 2) =>
  typeof value === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)
    : "";

const formatPercent = (value: number | null | undefined, decimals = 2) =>
  typeof value === "number" ? `${value.toFixed(decimals)}%` : "";

const formatIntegerPercent = (value: number | null | undefined) =>
  typeof value === "number" ? `${Math.round(value)}%` : "";

export default function DealDetailsForm({
  deal,
  onSave,
}: {
  deal: any;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState(deal || {});

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleBlur = (field: string) => {
    if (["deal_value", "flat_fee_override", "commission_percent"].includes(field)) {
      setFormData((prev: any) => ({
        ...prev,
        [field]: prev[field] !== "" ? parseFloat(prev[field]) : null,
      }));
    }
    if (field === "probability") {
      setFormData((prev: any) => ({
        ...prev,
        [field]: prev[field] !== "" ? parseInt(prev[field], 10) : null,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from("deal").update(formData).eq("id", deal.id);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Edit Deal</h2>

      <div>
        <label className="block text-sm font-medium">Deal Value</label>
        <input
          type="text"
          value={formData.deal_value ?? ""}
          onChange={(e) => handleChange("deal_value", e.target.value)}
          onBlur={() => handleBlur("deal_value")}
          placeholder="$"
          className="border p-2 rounded w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Flat Fee Override</label>
        <input
          type="text"
          value={formData.flat_fee_override ?? ""}
          onChange={(e) => handleChange("flat_fee_override", e.target.value)}
          onBlur={() => handleBlur("flat_fee_override")}
          placeholder="$"
          className="border p-2 rounded w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Commission Percent</label>
        <input
          type="text"
          value={formData.commission_percent ?? ""}
          onChange={(e) => handleChange("commission_percent", e.target.value)}
          onBlur={() => handleBlur("commission_percent")}
          placeholder="%"
          className="border p-2 rounded w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Probability</label>
        <input
          type="text"
          value={formData.probability ?? ""}
          onChange={(e) => handleChange("probability", e.target.value)}
          onBlur={() => handleBlur("probability")}
          placeholder="%"
          className="border p-2 rounded w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Target Close Date</label>
        <input
          type="date"
          value={formData.target_close_date || ""}
          onChange={(e) => handleChange("target_close_date", e.target.value)}
          className="border p-2 rounded w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Closed Date</label>
        <input
          type="date"
          value={formData.closed_date || ""}
          onChange={(e) => handleChange("closed_date", e.target.value)}
          className="border p-2 rounded w-full"
        />
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Save
      </button>
    </form>
  );
}
