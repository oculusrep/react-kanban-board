import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

interface DealReportRow {
  deal_id: string;
  deal_name: string | null;
  client_name: string | null;
  property_name: string | null;
  property_unit_name: string | null;
  property_display: string | null;
  deal_value: number | null;
  fee: number | null;
  stage: string | null;
  referral_fee_usd: number | null;
  referral_payee_name: string | null;
  gci: number | null;
  agci: number | null;
  house_percent: number | null;
  house_usd: number | null;
  origination_percent: number | null;
  origination_usd: number | null;
  site_percent: number | null;
  site_usd: number | null;
  deal_percent: number | null;
  deal_usd: number | null;
}

type SortField = keyof DealReportRow;
type SortDirection = "asc" | "desc" | null;

export default function DealCompareReportPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DealReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [stages, setStages] = useState<string[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);

  // Sorting
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  useEffect(() => {
    fetchReportData();
    fetchFilterOptions();
  }, [selectedStage, selectedClient]);

  const fetchFilterOptions = async () => {
    try {
      // Fetch stages
      const { data: stagesData } = await supabase
        .from("deal_stage")
        .select("label")
        .order("label");

      if (stagesData) {
        setStages(stagesData.map(s => s.label));
      }

      // Fetch clients
      const { data: clientsData } = await supabase
        .from("client")
        .select("id, client_name")
        .order("client_name");

      if (clientsData) {
        setClients(clientsData.map(c => ({ id: c.id, name: c.client_name || 'Unnamed' })));
      }
    } catch (err) {
      console.error("Error fetching filter options:", err);
    }
  };

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("deal")
        .select(`
          id,
          deal_name,
          deal_value,
          fee,
          referral_fee_usd,
          house_percent,
          house_usd,
          origination_percent,
          origination_usd,
          site_percent,
          site_usd,
          deal_percent,
          deal_usd,
          property_unit_id,
          client:client_id (client_name),
          property:property_id (property_name),
          stage:stage_id (label),
          referral_payee:referral_payee_client_id (client_name)
        `)
        .order("deal_name");

      // Apply filters
      if (selectedStage) {
        const { data: stageData } = await supabase
          .from("deal_stage")
          .select("id")
          .eq("label", selectedStage)
          .single();

        if (stageData) {
          query = query.eq("stage_id", stageData.id);
        }
      }

      if (selectedClient) {
        query = query.eq("client_id", selectedClient);
      }

      const { data: dealsData, error: dealsError } = await query;

      if (dealsError) throw dealsError;

      // Fetch property units for deals that have them
      const propertyUnitIds = (dealsData || [])
        .map((deal: any) => deal.property_unit_id)
        .filter((id: any) => id !== null);

      const propertyUnitsMap = new Map<string, string>();

      if (propertyUnitIds.length > 0) {
        const { data: unitsData } = await supabase
          .from("property_unit")
          .select("id, property_unit_name")
          .in("id", propertyUnitIds);

        if (unitsData) {
          unitsData.forEach((unit: any) => {
            propertyUnitsMap.set(unit.id, unit.property_unit_name);
          });
        }
      }

      // Transform the data for display
      const transformedData: DealReportRow[] = (dealsData || []).map((deal: any) => {
        // Calculate GCI and AGCI
        const fee = deal.fee || 0;
        const referralFee = deal.referral_fee_usd || 0;
        const gci = fee;
        const agci = fee - referralFee;

        // Build property display: "Property Name - Unit Name" or just "Property Name"
        const propertyName = deal.property?.property_name || null;
        const unitName = deal.property_unit_id ? propertyUnitsMap.get(deal.property_unit_id) || null : null;
        const propertyDisplay = propertyName && unitName
          ? `${propertyName} - ${unitName}`
          : propertyName;

        return {
          deal_id: deal.id,
          deal_name: deal.deal_name,
          client_name: deal.client?.client_name || null,
          property_name: propertyName,
          property_unit_name: unitName,
          property_display: propertyDisplay,
          deal_value: deal.deal_value,
          fee: deal.fee,
          stage: deal.stage?.label || null,
          referral_fee_usd: deal.referral_fee_usd,
          referral_payee_name: deal.referral_payee?.client_name || null,
          gci,
          agci,
          house_percent: deal.house_percent,
          house_usd: deal.house_usd,
          origination_percent: deal.origination_percent,
          origination_usd: deal.origination_usd,
          site_percent: deal.site_percent,
          site_usd: deal.site_usd,
          deal_percent: deal.deal_percent,
          deal_usd: deal.deal_usd,
        };
      });

      setData(transformedData);
    } catch (err) {
      console.error("Error fetching report data:", err);
      setError(err instanceof Error ? err.message : "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortField || !sortDirection) return 0;

    const aValue = a[sortField];
    const bValue = b[sortField];

    // Handle null values - always sort them to the end
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    // Compare values based on type
    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    }

    // String comparison
    const aString = String(aValue).toLowerCase();
    const bString = String(bValue).toLowerCase();

    if (sortDirection === "asc") {
      return aString.localeCompare(bString);
    } else {
      return bString.localeCompare(aString);
    }
  });

  const exportToCSV = () => {
    if (sortedData.length === 0) {
      alert("No data to export");
      return;
    }

    // Define headers
    const headers = [
      "Deal Name",
      "Client",
      "Property",
      "Deal Value",
      "Fee",
      "Stage",
      "Referral Fee",
      "Referral Payee",
      "GCI",
      "AGCI",
      "House %",
      "House USD",
      "Origination %",
      "Origination USD",
      "Site %",
      "Site USD",
      "Deal %",
      "Deal USD"
    ];

    // Convert data to CSV rows (use sorted data)
    const csvRows = [
      headers.join(","),
      ...sortedData.map(row => [
        escapeCsvValue(row.deal_name),
        escapeCsvValue(row.client_name),
        escapeCsvValue(row.property_display),
        formatNumber(row.deal_value),
        formatNumber(row.fee),
        escapeCsvValue(row.stage),
        formatNumber(row.referral_fee_usd),
        escapeCsvValue(row.referral_payee_name),
        formatNumber(row.gci),
        formatNumber(row.agci),
        formatNumber(row.house_percent),
        formatNumber(row.house_usd),
        formatNumber(row.origination_percent),
        formatNumber(row.origination_usd),
        formatNumber(row.site_percent),
        formatNumber(row.site_usd),
        formatNumber(row.deal_percent),
        formatNumber(row.deal_usd)
      ].join(","))
    ];

    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deal-compare-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const escapeCsvValue = (value: string | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const stringValue = String(value);
    if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const formatNumber = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    return String(value);
  };

  const formatCurrency = (value: number | null): string => {
    if (value === null || value === undefined) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatCurrencyForCSV = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number | null): string => {
    if (value === null || value === undefined) return "-";
    return `${value.toFixed(2)}%`;
  };

  const formatPercentForCSV = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    return `${value.toFixed(2)}%`;
  };

  const SortableHeader = ({
    field,
    label,
    align = "left",
    sticky = false
  }: {
    field: SortField;
    label: string;
    align?: "left" | "right";
    sticky?: boolean;
  }) => {
    const isActive = sortField === field;
    const showUpArrow = isActive && sortDirection === "asc";
    const showDownArrow = isActive && sortDirection === "desc";

    return (
      <th
        onClick={() => handleSort(field)}
        className={`px-4 py-3 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors ${
          sticky ? "sticky left-0 bg-gray-50 z-10" : ""
        } ${isActive ? "bg-blue-50" : ""}`}
      >
        <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
          <span>{label}</span>
          <span className="inline-flex flex-col">
            <svg
              className={`w-3 h-3 ${showUpArrow ? "text-blue-600" : "text-gray-400"}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" />
            </svg>
            <svg
              className={`w-3 h-3 -mt-1 ${showDownArrow ? "text-blue-600" : "text-gray-400"}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" />
            </svg>
          </span>
        </div>
      </th>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading report data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Deal Compare Report</h1>
            <p className="mt-1 text-gray-600">
              Showing {data.length} deal{data.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={data.length === 0}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            📥 Export to CSV
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stage
              </label>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Stages</option>
                {stages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client
              </label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader field="deal_name" label="Deal Name" sticky />
                  <SortableHeader field="client_name" label="Client" />
                  <SortableHeader field="property_name" label="Property" />
                  <SortableHeader field="deal_value" label="Deal Value" align="right" />
                  <SortableHeader field="fee" label="Fee" align="right" />
                  <SortableHeader field="stage" label="Stage" />
                  <SortableHeader field="referral_fee_usd" label="Referral Fee" align="right" />
                  <SortableHeader field="referral_payee_name" label="Referral Payee" />
                  <SortableHeader field="gci" label="GCI" align="right" />
                  <SortableHeader field="agci" label="AGCI" align="right" />
                  <SortableHeader field="house_percent" label="House %" align="right" />
                  <SortableHeader field="house_usd" label="House USD" align="right" />
                  <SortableHeader field="origination_percent" label="Orig %" align="right" />
                  <SortableHeader field="origination_usd" label="Orig USD" align="right" />
                  <SortableHeader field="site_percent" label="Site %" align="right" />
                  <SortableHeader field="site_usd" label="Site USD" align="right" />
                  <SortableHeader field="deal_percent" label="Deal %" align="right" />
                  <SortableHeader field="deal_usd" label="Deal USD" align="right" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedData.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm sticky left-0 bg-white whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/deal/${row.deal_id}`)}
                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                      >
                        {row.deal_name || "-"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {row.client_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {row.property_display || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.deal_value)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.fee)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {row.stage || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.referral_fee_usd)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {row.referral_payee_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.gci)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.agci)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatPercent(row.house_percent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.house_usd)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatPercent(row.origination_percent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.origination_usd)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatPercent(row.site_percent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.site_usd)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatPercent(row.deal_percent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(row.deal_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {data.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No deals found matching the selected filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
