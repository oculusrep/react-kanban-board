import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

interface PropertyReportRow {
  id: string;
  property_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  verified_latitude: number | null;
  verified_longitude: number | null;
  sf_id: string | null;
  // Salesforce comparison fields
  sf_address: string | null;
  sf_city: string | null;
  sf_state: string | null;
  sf_zip: string | null;
  sf_latitude: number | null;
  sf_longitude: number | null;
}

type FilterType = "missing_location" | "missing_address" | "missing_verified" | "all";
type ViewMode = "issues" | "comparison";

export default function PropertyDataQualityReportPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PropertyReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("missing_location");
  const [viewMode, setViewMode] = useState<ViewMode>("issues");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 100;

  // Set page title
  useEffect(() => {
    document.title = "Property Data Quality Report | OVIS";
  }, []);

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when filter or view changes
  }, [filterType, viewMode]);

  useEffect(() => {
    fetchReportData();
  }, [filterType, viewMode, currentPage]);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);

    try {
      // First, get the total count
      let countQuery = supabase
        .from("property")
        .select("id", { count: 'exact', head: true });

      // Apply same filters to count query
      if (filterType === "missing_location") {
        countQuery = countQuery.or("latitude.is.null,longitude.is.null");
      } else if (filterType === "missing_address") {
        countQuery = countQuery.is("address", null);
      } else if (filterType === "missing_verified") {
        countQuery = countQuery
          .is("latitude", null)
          .is("longitude", null)
          .is("verified_latitude", null)
          .is("verified_longitude", null);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotalCount(count || 0);

      // Now fetch the data with pagination
      let query = supabase
        .from("property")
        .select("id, property_name, address, city, state, zip, latitude, longitude, verified_latitude, verified_longitude, sf_id")
        .order("property_name")
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      // Apply filters based on selected filter type
      if (filterType === "missing_location") {
        query = query.or("latitude.is.null,longitude.is.null");
      } else if (filterType === "missing_address") {
        query = query.is("address", null);
      } else if (filterType === "missing_verified") {
        // Missing BOTH regular and verified lat/long
        query = query
          .is("latitude", null)
          .is("longitude", null)
          .is("verified_latitude", null)
          .is("verified_longitude", null);
      }
      // "all" shows all properties

      const { data: propertyData, error: queryError } = await query;

      if (queryError) throw queryError;

      // If comparison mode, fetch Salesforce data
      if (viewMode === "comparison") {
        const sfIds = (propertyData || [])
          .map((prop) => prop.sf_id)
          .filter((id) => id !== null);

        const salesforceMap = new Map<string, any>();

        if (sfIds.length > 0) {
          const { data: sfData } = await supabase
            .from("salesforce_Property__c")
            .select(`
              Id,
              Site_Address__c,
              Site_City__c,
              Site_State__c,
              Site_Zip__c,
              Lat_Long__Latitude__s,
              Lat_Long__Longitude__s,
              Verified_Latitude__c,
              Verified_Longitude__c
            `)
            .in("Id", sfIds);

          if (sfData) {
            sfData.forEach((sf: any) => {
              salesforceMap.set(sf.Id, sf);
            });
          }
        }

        // Merge Salesforce data with property data
        const mergedData: PropertyReportRow[] = (propertyData || []).map((prop) => {
          const sfData = prop.sf_id ? salesforceMap.get(prop.sf_id) : null;

          // Prefer Verified lat/long, fallback to regular lat/long
          const sf_latitude = sfData?.Verified_Latitude__c ?? sfData?.Lat_Long__Latitude__s ?? null;
          const sf_longitude = sfData?.Verified_Longitude__c ?? sfData?.Lat_Long__Longitude__s ?? null;

          return {
            ...prop,
            sf_address: sfData?.Site_Address__c ?? null,
            sf_city: sfData?.Site_City__c ?? null,
            sf_state: sfData?.Site_State__c ?? null,
            sf_zip: sfData?.Site_Zip__c ?? null,
            sf_latitude,
            sf_longitude,
          };
        });

        setData(mergedData);
      } else {
        // Issues mode - no need to fetch Salesforce data
        setData((propertyData || []).map(prop => ({
          ...prop,
          verified_latitude: prop.verified_latitude ?? null,
          verified_longitude: prop.verified_longitude ?? null,
          sf_address: null,
          sf_city: null,
          sf_state: null,
          sf_zip: null,
          sf_latitude: null,
          sf_longitude: null,
        })));
      }
    } catch (err: any) {
      console.error("Error fetching report data:", err);
      setError(err.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (data.length === 0) {
      alert("No data to export");
      return;
    }

    const headers = viewMode === "comparison"
      ? [
          "Property ID",
          "Property Name",
          "OVIS Address",
          "SF Address",
          "OVIS City",
          "SF City",
          "OVIS State",
          "SF State",
          "OVIS ZIP",
          "SF ZIP",
          "OVIS Latitude",
          "SF Latitude",
          "OVIS Longitude",
          "SF Longitude",
          "Salesforce ID",
        ]
      : [
          "Property ID",
          "Property Name",
          "Address",
          "City",
          "State",
          "ZIP",
          "Latitude",
          "Longitude",
          "Verified Latitude",
          "Verified Longitude",
          "Salesforce ID",
        ];

    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        viewMode === "comparison"
          ? [
              row.id,
              `"${row.property_name || ""}"`,
              `"${row.address || ""}"`,
              `"${row.sf_address || ""}"`,
              `"${row.city || ""}"`,
              `"${row.sf_city || ""}"`,
              `"${row.state || ""}"`,
              `"${row.sf_state || ""}"`,
              `"${row.zip || ""}"`,
              `"${row.sf_zip || ""}"`,
              row.latitude ?? "",
              row.sf_latitude ?? "",
              row.longitude ?? "",
              row.sf_longitude ?? "",
              row.sf_id || "",
            ].join(",")
          : [
              row.id,
              `"${row.property_name || ""}"`,
              `"${row.address || ""}"`,
              `"${row.city || ""}"`,
              `"${row.state || ""}"`,
              `"${row.zip || ""}"`,
              row.latitude ?? "",
              row.longitude ?? "",
              row.verified_latitude ?? "",
              row.verified_longitude ?? "",
              row.sf_id || "",
            ].join(",")
      ),
    ];

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `property-data-quality-${viewMode}-${filterType}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFilterLabel = () => {
    switch (filterType) {
      case "missing_location":
        return "Missing Lat/Long";
      case "missing_address":
        return "Missing Address";
      case "missing_verified":
        return "Missing Both Lat/Long & Verified";
      case "all":
        return "All Properties";
      default:
        return "";
    }
  };

  const hasIssue = (row: PropertyReportRow, type: "location" | "address") => {
    if (type === "location") {
      return row.latitude === null || row.longitude === null;
    }
    return row.address === null || row.address.trim() === "";
  };

  const valuesDiffer = (ovisValue: any, sfValue: any): boolean => {
    // Consider null, undefined, and empty string as equivalent
    const normalizeValue = (val: any) => {
      if (val === null || val === undefined || val === "") return null;
      if (typeof val === "string") return val.trim();
      if (typeof val === "number") return val;
      return val;
    };

    const normalizedOvis = normalizeValue(ovisValue);
    const normalizedSf = normalizeValue(sfValue);

    if (normalizedOvis === null && normalizedSf === null) return false;
    if (normalizedOvis === null || normalizedSf === null) return true;

    // For numbers (lat/long), consider them different if they differ by more than 0.000001
    if (typeof normalizedOvis === "number" && typeof normalizedSf === "number") {
      return Math.abs(normalizedOvis - normalizedSf) > 0.000001;
    }

    return normalizedOvis !== normalizedSf;
  };

  const ComparisonCell = ({ ovisValue, sfValue, type = "text" }: { ovisValue: any; sfValue: any; type?: "text" | "number" }) => {
    const differs = valuesDiffer(ovisValue, sfValue);
    const ovisDisplay = type === "number" && ovisValue !== null ? ovisValue.toFixed(6) : (ovisValue || "—");
    const sfDisplay = type === "number" && sfValue !== null ? sfValue.toFixed(6) : (sfValue || "—");

    return (
      <div className="flex flex-col gap-1">
        <div className={`${differs && ovisValue !== null ? "font-semibold" : ""}`}>
          <span className="text-xs text-gray-500 mr-1">OVIS:</span>
          {ovisValue === null || ovisValue === "" ? (
            <span className="text-red-600 font-semibold">Missing</span>
          ) : (
            <span>{ovisDisplay}</span>
          )}
        </div>
        <div className={`${differs && sfValue !== null ? "font-semibold text-blue-700" : "text-gray-600"}`}>
          <span className="text-xs text-gray-500 mr-1">SF:</span>
          {sfValue === null || sfValue === "" ? (
            <span className="text-gray-400">Missing</span>
          ) : (
            <span>{sfDisplay}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate("/reports")}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center"
            >
              ← Back to Reports
            </button>
            <h1 className="text-3xl font-bold text-gray-900">
              Property Data Quality Report
            </h1>
            <p className="mt-2 text-gray-600">
              Review properties with missing location or address data
            </p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={data.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Export to CSV
          </button>
        </div>

        {/* View Mode Tabs */}
        <div className="bg-white rounded-lg shadow mb-4">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setViewMode("issues")}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  viewMode === "issues"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Issues Only
              </button>
              <button
                onClick={() => setViewMode("comparison")}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  viewMode === "comparison"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                OVIS vs Salesforce Comparison
              </button>
            </nav>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter By
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterType("missing_location")}
                  className={`px-4 py-2 rounded ${
                    filterType === "missing_location"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Missing Lat/Long
                </button>
                <button
                  onClick={() => setFilterType("missing_address")}
                  className={`px-4 py-2 rounded ${
                    filterType === "missing_address"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Missing Address
                </button>
                <button
                  onClick={() => setFilterType("missing_verified")}
                  className={`px-4 py-2 rounded ${
                    filterType === "missing_verified"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  No Coordinates at All
                </button>
                <button
                  onClick={() => setFilterType("all")}
                  className={`px-4 py-2 rounded ${
                    filterType === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  All Properties
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Summary and Pagination */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                Showing: <span className="font-semibold">{getFilterLabel()}</span>
                {viewMode === "comparison" && <span className="ml-2 text-blue-600">(with Salesforce comparison)</span>}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {totalCount.toLocaleString()} Total {totalCount === 1 ? "Property" : "Properties"}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Page {currentPage} of {Math.ceil(totalCount / PAGE_SIZE)} (showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, totalCount)})
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {Math.ceil(totalCount / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE)}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(Math.ceil(totalCount / PAGE_SIZE))}
                disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE)}
                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">Loading report data...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Data Table - Issues View */}
        {!loading && !error && viewMode === "issues" && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      City
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ZIP
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Latitude
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Longitude
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verified Lat
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verified Long
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issues
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                        No properties found matching the selected filter
                      </td>
                    </tr>
                  ) : (
                    data.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <a
                            href={`/property/${row.id}`}
                            className="text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.property_name || "Unnamed Property"}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.address || (
                            <span className="text-red-600 font-semibold">Missing</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.city || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.state || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.zip || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.latitude !== null ? (
                            row.latitude.toFixed(6)
                          ) : (
                            <span className="text-red-600 font-semibold">Missing</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.longitude !== null ? (
                            row.longitude.toFixed(6)
                          ) : (
                            <span className="text-red-600 font-semibold">Missing</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.verified_latitude !== null ? (
                            <span className="text-green-700 font-semibold">{row.verified_latitude.toFixed(6)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {row.verified_longitude !== null ? (
                            <span className="text-green-700 font-semibold">{row.verified_longitude.toFixed(6)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-col gap-1">
                            {hasIssue(row, "location") && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                Missing Location
                              </span>
                            )}
                            {hasIssue(row, "address") && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                Missing Address
                              </span>
                            )}
                            {!hasIssue(row, "location") && !hasIssue(row, "address") && (
                              <span className="text-green-600">✓ Complete</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Data Table - Comparison View */}
        {!loading && !error && viewMode === "comparison" && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Address
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      City
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ZIP
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Latitude
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Longitude
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No properties found matching the selected filter
                      </td>
                    </tr>
                  ) : (
                    data.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <a
                            href={`/property/${row.id}`}
                            className="text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {row.property_name || "Unnamed Property"}
                          </a>
                          {!row.sf_id && (
                            <div className="text-xs text-red-600 mt-1">No SF ID</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <ComparisonCell ovisValue={row.address} sfValue={row.sf_address} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <ComparisonCell ovisValue={row.city} sfValue={row.sf_city} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <ComparisonCell ovisValue={row.state} sfValue={row.sf_state} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <ComparisonCell ovisValue={row.zip} sfValue={row.sf_zip} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <ComparisonCell ovisValue={row.latitude} sfValue={row.sf_latitude} type="number" />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <ComparisonCell ovisValue={row.longitude} sfValue={row.sf_longitude} type="number" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
