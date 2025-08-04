// src/deal-test.tsx
import DealDetailsForm from "./components/DealDetailsForm";

const mockDeal = {
  id: "test-id-123",
  deal_name: "Test Deal",
  client_id: null,
  assignment_id: null,
  source: "",
  transaction_type_id: null,
  property_id: null,
  property_unit_id: null,
  site_submit_id: null,
  property_type_id: null,
  size_sqft: null,
  size_acres: null,
  representation_id: null,
  record_type: null,
  owner_id: null,
  assigned_to_id: null,
  deal_value: 500000,
  commission_rate: 0.03,
  flat_fee_override: null,
  fee: 15000,
  stage_id: "stage-123",
  probability: 80,
  target_close_date: "2025-10-31",
  loi_signed_date: "2025-08-10",
  closed_date: null,
};

export default function DealTestPage() {
  return (
    <div className="max-w-4xl mx-auto mt-8">
      <DealDetailsForm
        deal={mockDeal}
        onSave={(updated) => {
          console.log("Saved deal:", updated);
        }}
      />
    </div>
  );
}
