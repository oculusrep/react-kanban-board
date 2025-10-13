import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ChevronDown, ChevronUp, Download, X, Filter } from "lucide-react";

interface AssignmentReportRow {
  id: string;
  assignment_name: string | null;
  client_id: string | null;
  client_name: string | null;
  assignment_value: number | null;
  due_date: string | null;
  scoped: boolean | null;
  site_criteria: string | null;
  owner_name: string | null;
  priority_label: string | null;
  transaction_type: string | null;
  // Trade area from properties via site submits
  trade_areas: string[];
  site_submit_count: number;
  created_at: string | null;
}

type SortField = "assignment_name" | "client_name" | "assignment_value" | "due_date" | "priority_label" | "created_at";
type SortDirection = "asc" | "desc";

export default function AssignmentsReportPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AssignmentReportRow[]>([]);
  const [filteredData, setFilteredData] = useState<AssignmentReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedClientName, setSelectedClientName] = useState<string>("");
  const [selectedTradeArea, setSelectedTradeArea] = useState<string>("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [tradeAreas, setTradeAreas] = useState<string[]>([]);

  // Auto-suggest state
  const [clientQuery, setClientQuery] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [tradeAreaQuery, setTradeAreaQuery] = useState("");
  const [showTradeAreaDropdown, setShowTradeAreaDropdown] = useState(false);

  const clientInputRef = useRef<HTMLInputElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const tradeAreaInputRef = useRef<HTMLInputElement>(null);
  const tradeAreaDropdownRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("assignment_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Set page title
  useEffect(() => {
    document.title = "Assignments Report | OVIS";
  }, []);

  // Load initial data
  useEffect(() => {
    fetchReportData();
  }, []);

  // Apply filters and sorting when data or filters change
  useEffect(() => {
    applyFiltersAndSort();
  }, [data, selectedClientId, selectedTradeArea, sortField, sortDirection]);

  // Handle clicking outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(event.target as Node) &&
        !clientInputRef.current?.contains(event.target as Node)
      ) {
        setShowClientDropdown(false);
      }
      if (
        tradeAreaDropdownRef.current &&
        !tradeAreaDropdownRef.current.contains(event.target as Node) &&
        !tradeAreaInputRef.current?.contains(event.target as Node)
      ) {
        setShowTradeAreaDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 Fetching assignments data...');

      // Fetch all assignments with related data
      const { data: assignmentData, error: queryError } = await supabase
        .from("assignment")
        .select(`
          id,
          assignment_name,
          client_id,
          assignment_value,
          due_date,
          scoped,
          site_criteria,
          created_at,
          owner_id,
          priority_id,
          transaction_type_id
        `)
        .order("assignment_name");

      if (queryError) {
        console.error('❌ Error fetching assignments:', queryError);
        throw queryError;
      }

      if (!assignmentData) {
        console.log('⚠️ No assignment data returned');
        setData([]);
        return;
      }

      console.log(`✅ Fetched ${assignmentData.length} assignments`);

      // Fetch related data separately
      const clientIds = [...new Set(assignmentData.map(a => a.client_id).filter(Boolean))];
      const ownerIds = [...new Set(assignmentData.map(a => a.owner_id).filter(Boolean))];
      const priorityIds = [...new Set(assignmentData.map(a => a.priority_id).filter(Boolean))];
      const transactionTypeIds = [...new Set(assignmentData.map(a => a.transaction_type_id).filter(Boolean))];

      // Fetch clients
      const clientsMap = new Map();
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from('client')
          .select('id, client_name')
          .in('id', clientIds);
        clients?.forEach(c => clientsMap.set(c.id, c));
      }

      // Fetch owners (users)
      const ownersMap = new Map();
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('user')
          .select('id, name')
          .in('id', ownerIds);
        owners?.forEach(o => ownersMap.set(o.id, o));
      }

      // Fetch priorities
      const prioritiesMap = new Map();
      if (priorityIds.length > 0) {
        const { data: priorities } = await supabase
          .from('assignment_priority')
          .select('id, label')
          .in('id', priorityIds);
        priorities?.forEach(p => prioritiesMap.set(p.id, p));
      }

      // Fetch transaction types
      const transactionTypesMap = new Map();
      if (transactionTypeIds.length > 0) {
        const { data: transactionTypes } = await supabase
          .from('transaction_type')
          .select('id, type_name')
          .in('id', transactionTypeIds);
        transactionTypes?.forEach(t => transactionTypesMap.set(t.id, t));
      }

      // For each assignment, get site submits and their property trade areas
      console.log('🔍 Fetching site submits and trade areas...');
      const enrichedData = await Promise.all(
        assignmentData.map(async (assignment: any) => {
          // Get site submits for this assignment
          const { data: siteSubmits } = await supabase
            .from("site_submit")
            .select(`
              id,
              property_id
            `)
            .eq("assignment_id", assignment.id);

          // Get properties for these site submits
          let tradeAreas: string[] = [];
          if (siteSubmits && siteSubmits.length > 0) {
            const propertyIds = siteSubmits.map(ss => ss.property_id).filter(Boolean);
            if (propertyIds.length > 0) {
              const { data: properties } = await supabase
                .from('property')
                .select('trade_area')
                .in('id', propertyIds);

              tradeAreas = [
                ...new Set(
                  (properties || [])
                    .map((p: any) => p.trade_area)
                    .filter((ta): ta is string => ta !== null && ta !== undefined)
                )
              ];
            }
          }

          const client = assignment.client_id ? clientsMap.get(assignment.client_id) : null;
          const owner = assignment.owner_id ? ownersMap.get(assignment.owner_id) : null;
          const priority = assignment.priority_id ? prioritiesMap.get(assignment.priority_id) : null;
          const transactionType = assignment.transaction_type_id ? transactionTypesMap.get(assignment.transaction_type_id) : null;

          return {
            id: assignment.id,
            assignment_name: assignment.assignment_name,
            client_id: assignment.client_id,
            client_name: client?.client_name || null,
            assignment_value: assignment.assignment_value,
            due_date: assignment.due_date,
            scoped: assignment.scoped,
            site_criteria: assignment.site_criteria,
            owner_name: owner?.name || null,
            priority_label: priority?.label || null,
            transaction_type: transactionType?.type_name || null,
            trade_areas: tradeAreas,
            site_submit_count: siteSubmits?.length || 0,
            created_at: assignment.created_at
          } as AssignmentReportRow;
        })
      );

      console.log(`✅ Enriched ${enrichedData.length} assignments with related data`);

      setData(enrichedData);

      // Build unique client list for filter
      const uniqueClients = Array.from(
        new Map(
          enrichedData
            .filter(a => a.client_id && a.client_name)
            .map(a => [a.client_id, { id: a.client_id!, name: a.client_name! }])
        ).values()
      ).sort((a, b) => a.name.localeCompare(b.name));
      setClients(uniqueClients);

      // Build unique trade area list for filter
      const uniqueTradeAreas = Array.from(
        new Set(enrichedData.flatMap(a => a.trade_areas))
      ).sort();
      setTradeAreas(uniqueTradeAreas);

    } catch (err) {
      console.error("Error fetching assignments report:", err);
      setError(err instanceof Error ? err.message : "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let result = [...data];

    // Apply client filter
    if (selectedClientId) {
      result = result.filter(a => a.client_id === selectedClientId);
    }

    // Apply trade area filter
    if (selectedTradeArea) {
      result = result.filter(a => a.trade_areas.includes(selectedTradeArea));
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle nulls
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // String comparison
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Number comparison
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    setFilteredData(result);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const clearFilters = () => {
    setSelectedClientId("");
    setSelectedClientName("");
    setClientQuery("");
    setSelectedTradeArea("");
    setTradeAreaQuery("");
  };

  // Filter clients based on query
  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(clientQuery.toLowerCase())
  );

  // Filter trade areas based on query
  const filteredTradeAreas = tradeAreas.filter(area =>
    area.toLowerCase().includes(tradeAreaQuery.toLowerCase())
  );

  const handleSelectClient = (client: { id: string; name: string }) => {
    setSelectedClientId(client.id);
    setSelectedClientName(client.name);
    setClientQuery(client.name);
    setShowClientDropdown(false);
  };

  const handleSelectTradeArea = (area: string) => {
    setSelectedTradeArea(area);
    setTradeAreaQuery(area);
    setShowTradeAreaDropdown(false);
  };

  const exportToCSV = () => {
    const headers = [
      "Assignment Name",
      "Client",
      "Assignment Value",
      "Due Date",
      "Priority",
      "Scoped",
      "Owner",
      "Transaction Type",
      "Site Submits",
      "Trade Areas",
      "Site Criteria",
      "Created Date"
    ];

    const rows = filteredData.map(row => [
      row.assignment_name || "",
      row.client_name || "",
      row.assignment_value ? `$${row.assignment_value.toLocaleString()}` : "",
      row.due_date ? new Date(row.due_date).toLocaleDateString() : "",
      row.priority_label || "",
      row.scoped ? "Yes" : "No",
      row.owner_name || "",
      row.transaction_type || "",
      row.site_submit_count.toString(),
      row.trade_areas.join(", "),
      row.site_criteria || "",
      row.created_at ? new Date(row.created_at).toLocaleDateString() : ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assignments-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Pagination
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp size={16} className="inline ml-1" />
    ) : (
      <ChevronDown size={16} className="inline ml-1" />
    );
  };

  const hasActiveFilters = selectedClientId !== "" || selectedTradeArea !== "";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate("/reports")}
              className="text-blue-600 hover:text-blue-800 mb-2 flex items-center text-sm"
            >
              ← Back to Reports
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Assignments Report</h1>
            <p className="mt-2 text-gray-600">
              View and filter all assignments in the system
            </p>
          </div>
          <button
            onClick={exportToCSV}
            disabled={filteredData.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={18} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <X size={14} />
                Clear Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client Filter */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter by Client
              </label>
              <div className="relative">
                <input
                  ref={clientInputRef}
                  type="text"
                  value={clientQuery}
                  onChange={(e) => {
                    setClientQuery(e.target.value);
                    setShowClientDropdown(true);
                    if (!e.target.value) {
                      setSelectedClientId("");
                      setSelectedClientName("");
                    }
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  placeholder="Search clients..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                {selectedClientId && (
                  <button
                    onClick={() => {
                      setSelectedClientId("");
                      setSelectedClientName("");
                      setClientQuery("");
                      clientInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Client Dropdown */}
              {showClientDropdown && filteredClients.length > 0 && (
                <div
                  ref={clientDropdownRef}
                  className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                >
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      onClick={() => handleSelectClient(client)}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {client.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trade Area Filter */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter by Trade Area
              </label>
              <div className="relative">
                <input
                  ref={tradeAreaInputRef}
                  type="text"
                  value={tradeAreaQuery}
                  onChange={(e) => {
                    setTradeAreaQuery(e.target.value);
                    setShowTradeAreaDropdown(true);
                    if (!e.target.value) {
                      setSelectedTradeArea("");
                    }
                  }}
                  onFocus={() => setShowTradeAreaDropdown(true)}
                  placeholder="Search trade areas..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                {selectedTradeArea && (
                  <button
                    onClick={() => {
                      setSelectedTradeArea("");
                      setTradeAreaQuery("");
                      tradeAreaInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Trade Area Dropdown */}
              {showTradeAreaDropdown && filteredTradeAreas.length > 0 && (
                <div
                  ref={tradeAreaDropdownRef}
                  className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                >
                  {filteredTradeAreas.map((area) => (
                    <div
                      key={area}
                      onClick={() => handleSelectTradeArea(area)}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {area}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            Showing {filteredData.length} of {data.length} assignments
            {hasActiveFilters && " (filtered)"}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading assignments...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">Error: {error}</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        onClick={() => handleSort("assignment_name")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        Assignment Name <SortIcon field="assignment_name" />
                      </th>
                      <th
                        onClick={() => handleSort("client_name")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        Client <SortIcon field="client_name" />
                      </th>
                      <th
                        onClick={() => handleSort("assignment_value")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        Value <SortIcon field="assignment_value" />
                      </th>
                      <th
                        onClick={() => handleSort("due_date")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        Due Date <SortIcon field="due_date" />
                      </th>
                      <th
                        onClick={() => handleSort("priority_label")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        Priority <SortIcon field="priority_label" />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Site Submits
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Trade Areas
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                          {hasActiveFilters
                            ? "No assignments match the selected filters"
                            : "No assignments found"}
                        </td>
                      </tr>
                    ) : (
                      paginatedData.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {row.assignment_name || "Unnamed Assignment"}
                            </div>
                            {row.owner_name && (
                              <div className="text-xs text-gray-500">
                                Owner: {row.owner_name}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {row.client_name || "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {row.assignment_value
                                ? `$${row.assignment_value.toLocaleString()}`
                                : "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {row.due_date
                                ? new Date(row.due_date).toLocaleDateString()
                                : "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              row.priority_label === "High"
                                ? "bg-red-100 text-red-800"
                                : row.priority_label === "Medium"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                            }`}>
                              {row.priority_label || "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                              {row.site_submit_count}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 max-w-xs">
                              {row.trade_areas.length > 0
                                ? row.trade_areas.join(", ")
                                : "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => navigate(`/assignment/${row.id}`)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-white rounded-lg shadow mt-4 px-6 py-3 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
