import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ChevronDown, ChevronUp, Download, X, Filter } from "lucide-react";
import PinDetailsSlideout from "../components/mapping/slideouts/PinDetailsSlideout";
import { LayerManagerProvider } from "../components/mapping/layers/LayerManager";

interface SiteSubmitReportRow {
  id: string;
  site_submit_name: string | null;
  property_id: string;
  property_name: string | null;
  property_address: string | null;
  property_unit_id: string | null;
  property_unit_name: string | null;
  // Property-level data
  property_sqft: number | null;
  property_nnn: number | null;
  // Unit-level data
  unit_sqft: number | null;
  unit_nnn: number | null;
  // Computed fields
  display_sqft: number | null;
  display_nnn: number | null;
  // Status/stage
  submit_stage_id: string | null;
  submit_stage_name: string | null;
  // Client info
  client_id: string | null;
  client_name: string | null;
  // Assignment info
  assignment_id: string | null;
  assignment_name: string | null;
  created_at: string | null;
  // Property data for slideout
  property?: any;
}

type SortField = "site_submit_name" | "property_name" | "display_sqft" | "display_nnn" | "submit_stage_name" | "client_name" | "created_at";
type SortDirection = "asc" | "desc";

export default function SiteSubmitDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SiteSubmitReportRow[]>([]);
  const [filteredData, setFilteredData] = useState<SiteSubmitReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]); // Changed to array for multi-select
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedClientName, setSelectedClientName] = useState<string>("");
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [quickFilter, setQuickFilter] = useState<string>("all"); // For button strip

  // Auto-suggest state (client only)
  const [clientQuery, setClientQuery] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const clientInputRef = useRef<HTMLInputElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Stage multi-select state
  const [showStageMultiSelect, setShowStageMultiSelect] = useState(false);
  const stageMultiSelectRef = useRef<HTMLDivElement>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("site_submit_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Slideout states
  const [isPinDetailsOpen, setIsPinDetailsOpen] = useState(false);
  const [selectedPinData, setSelectedPinData] = useState<any>(null);
  const [selectedPinType, setSelectedPinType] = useState<'property' | 'site_submit' | null>(null);

  // Site Submit Details slideout (for viewing site submit from property)
  const [isSiteSubmitDetailsOpen, setIsSiteSubmitDetailsOpen] = useState(false);
  const [selectedSiteSubmitData, setSelectedSiteSubmitData] = useState<any>(null);

  // Set page title
  useEffect(() => {
    document.title = "Site Submit Dashboard | OVIS";
  }, []);

  // Load initial data
  useEffect(() => {
    fetchReportData();
  }, []);

  // Apply filters and sorting when data or filters change
  useEffect(() => {
    applyFiltersAndSort();
  }, [data, selectedStageIds, selectedClientId, sortField, sortDirection, quickFilter]);

  // Handle clicking outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        stageMultiSelectRef.current &&
        !stageMultiSelectRef.current.contains(event.target as Node)
      ) {
        setShowStageMultiSelect(false);
      }
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(event.target as Node) &&
        !clientInputRef.current?.contains(event.target as Node)
      ) {
        setShowClientDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 Fetching site submits data...');

      // Fetch all site submits with related data (excluding assignment to avoid potential FK issues)
      const { data: siteSubmitData, error: queryError } = await supabase
        .from("site_submit")
        .select(`
          id,
          site_submit_name,
          property_id,
          property_unit_id,
          submit_stage_id,
          client_id,
          assignment_id,
          created_at,
          property!site_submit_property_id_fkey (
            id,
            property_name,
            address,
            building_sqft,
            nnn_psf,
            latitude,
            longitude,
            verified_latitude,
            verified_longitude
          ),
          property_unit!site_submit_property_unit_id_fkey (
            id,
            property_unit_name,
            sqft,
            nnn
          ),
          submit_stage!site_submit_submit_stage_id_fkey (
            id,
            name
          ),
          client!site_submit_client_id_fkey (
            id,
            client_name
          )
        `)
        .order("created_at", { ascending: false });

      if (queryError) {
        console.error('❌ Error fetching site submits:', queryError);
        throw queryError;
      }

      if (!siteSubmitData) {
        console.log('⚠️ No site submit data returned');
        setData([]);
        return;
      }

      console.log(`✅ Fetched ${siteSubmitData.length} site submits`);

      // Fetch assignments separately if needed
      const assignmentIds = [...new Set(siteSubmitData.map(s => s.assignment_id).filter(Boolean))];
      const assignmentsMap = new Map();

      if (assignmentIds.length > 0) {
        const { data: assignmentData } = await supabase
          .from('assignment')
          .select('id, assignment_name')
          .in('id', assignmentIds);

        assignmentData?.forEach(a => assignmentsMap.set(a.id, a));
      }

      // Transform data with computed fields
      const transformedData: SiteSubmitReportRow[] = siteSubmitData.map(submit => {
        const property = submit.property as any;
        const unit = submit.property_unit as any;
        const stage = submit.submit_stage as any;
        const client = submit.client as any;
        const assignment = submit.assignment_id ? assignmentsMap.get(submit.assignment_id) : null;

        // Logic: Use unit data if available, otherwise use property data
        const display_sqft = unit?.sqft ?? property?.building_sqft ?? null;
        const display_nnn = unit?.nnn ?? property?.nnn_psf ?? null;

        return {
          id: submit.id,
          site_submit_name: submit.site_submit_name,
          property_id: submit.property_id,
          property_name: property?.property_name ?? null,
          property_address: property?.address ?? null,
          property_unit_id: submit.property_unit_id,
          property_unit_name: unit?.property_unit_name ?? null,
          property_sqft: property?.building_sqft ?? null,
          property_nnn: property?.nnn_psf ?? null,
          unit_sqft: unit?.sqft ?? null,
          unit_nnn: unit?.nnn ?? null,
          display_sqft,
          display_nnn,
          submit_stage_id: submit.submit_stage_id,
          submit_stage_name: stage?.name ?? null,
          client_id: submit.client_id,
          client_name: client?.client_name ?? null,
          assignment_id: submit.assignment_id,
          assignment_name: assignment?.assignment_name ?? null,
          created_at: submit.created_at,
          property: property
        };
      });

      setData(transformedData);

      // Extract unique stages and clients for filters
      const uniqueStages = new Map<string, string>();
      const uniqueClients = new Map<string, string>();

      transformedData.forEach(row => {
        if (row.submit_stage_id && row.submit_stage_name) {
          uniqueStages.set(row.submit_stage_id, row.submit_stage_name);
        }
        if (row.client_id && row.client_name) {
          uniqueClients.set(row.client_id, row.client_name);
        }
      });

      setStages(
        Array.from(uniqueStages.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setClients(
        Array.from(uniqueClients.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

    } catch (err) {
      console.error('❌ Error in fetchReportData:', err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let result = [...data];

    // Apply quick filter first (button strip)
    if (quickFilter !== 'all') {
      // Map quick filter keys to actual stage names
      const stageMap: Record<string, string> = {
        'submitted-reviewing': 'Submitted Reviewing',
        'pursuing': 'Pursuing',
        'ownership': 'Ownership',
        'pass': 'Pass',
        'conflict': 'Conflict',
        'not-available': 'Not Available'
      };
      const stageName = stageMap[quickFilter];
      if (stageName) {
        result = result.filter(row => row.submit_stage_name === stageName);
      }
    } else if (selectedStageIds.length > 0) {
      // Apply multi-select filter only if no quick filter is active
      result = result.filter(row => row.submit_stage_id && selectedStageIds.includes(row.submit_stage_id));
    }

    if (selectedClientId) {
      result = result.filter(row => row.client_id === selectedClientId);
    }

    // Apply sorting
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    setFilteredData(result);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction or clear sort
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortField("site_submit_name");
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const clearFilters = () => {
    setSelectedStageIds([]);
    setQuickFilter("all");
    setSelectedClientId("");
    setSelectedClientName("");
    setClientQuery("");
  };

  // Filter clients based on query
  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(clientQuery.toLowerCase())
  );

  // Handle quick filter button clicks
  const handleQuickFilter = (filter: string) => {
    setQuickFilter(filter);
    setSelectedStageIds([]); // Clear multi-select when using quick filter
  };

  // Handle multi-select stage toggle
  const handleToggleStage = (stageId: string) => {
    setQuickFilter("all"); // Clear quick filter when using multi-select
    setSelectedStageIds(prev => {
      if (prev.includes(stageId)) {
        return prev.filter(id => id !== stageId);
      } else {
        return [...prev, stageId];
      }
    });
  };

  const handleSelectClient = (client: { id: string; name: string }) => {
    setSelectedClientId(client.id);
    setSelectedClientName(client.name);
    setClientQuery(client.name);
    setShowClientDropdown(false);
  };

  const exportToCSV = () => {
    if (filteredData.length === 0) {
      alert("No data to export");
      return;
    }

    const headers = [
      "Site Submit Name",
      "Property Name",
      "Unit",
      "SQFT",
      "NNN ($/SF)",
      "Stage",
      "Client",
      "Assignment",
      "Created Date"
    ];

    const rows = filteredData.map(row => [
      row.site_submit_name || "",
      row.property_name || "",
      row.property_unit_name || "",
      row.display_sqft?.toLocaleString() || "",
      row.display_nnn?.toFixed(2) || "",
      row.submit_stage_name || "",
      row.client_name || "",
      row.assignment_name || "",
      row.created_at ? new Date(row.created_at).toLocaleDateString() : ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `site-submit-dashboard-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Pagination
  const paginatedData = filteredData.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  // Handle opening slideouts
  const handlePropertyClick = (row: SiteSubmitReportRow) => {
    if (!row.property) return;

    setSelectedPinData(row.property);
    setSelectedPinType('property');
    setIsPinDetailsOpen(true);
  };

  const handleSiteSubmitClick = (row: SiteSubmitReportRow) => {
    // Construct full site submit object for slideout
    const siteSubmitData = {
      id: row.id,
      site_submit_name: row.site_submit_name,
      property_id: row.property_id,
      property_unit_id: row.property_unit_id,
      submit_stage_id: row.submit_stage_id,
      client_id: row.client_id,
      assignment_id: row.assignment_id,
      created_at: row.created_at,
      property: row.property,
      submit_stage: row.submit_stage_name ? { id: row.submit_stage_id!, name: row.submit_stage_name } : undefined,
      client: row.client_name ? { client_name: row.client_name } : undefined,
      property_unit: row.property_unit_name ? { property_unit_name: row.property_unit_name } : undefined
    };

    setSelectedPinData(siteSubmitData);
    setSelectedPinType('site_submit');
    setIsPinDetailsOpen(true);
  };

  const handlePinDetailsClose = () => {
    setIsPinDetailsOpen(false);
    setSelectedPinData(null);
    setSelectedPinType(null);
  };

  const handleDataUpdate = async () => {
    // Refresh data after updates
    await fetchReportData();
  };

  // Handle viewing site submit details from property slideout
  const handleViewSiteSubmitDetails = async (siteSubmit: any) => {
    console.log('📋 Opening site submit details slideout:', siteSubmit);

    // Fetch fresh site submit data from database to ensure we have latest values
    try {
      const { data: freshSiteSubmitData, error } = await supabase
        .from('site_submit')
        .select(`
          *,
          client!site_submit_client_id_fkey (id, client_name),
          submit_stage!site_submit_submit_stage_id_fkey (id, name),
          property_unit!site_submit_property_unit_id_fkey (property_unit_name),
          property!site_submit_property_id_fkey (*, property_record_type (*))
        `)
        .eq('id', siteSubmit.id)
        .single();

      if (error) {
        console.error('❌ Error fetching fresh site submit data:', error);
        // Fall back to cached data if fetch fails
        setSelectedSiteSubmitData(siteSubmit);
      } else {
        console.log('✅ Fetched fresh site submit data:', freshSiteSubmitData);
        setSelectedSiteSubmitData(freshSiteSubmitData);
      }
    } catch (err) {
      console.error('❌ Exception fetching fresh site submit data:', err);
      // Fall back to cached data if fetch fails
      setSelectedSiteSubmitData(siteSubmit);
    }

    setIsSiteSubmitDetailsOpen(true);
  };

  const handleSiteSubmitDetailsClose = () => {
    setIsSiteSubmitDetailsOpen(false);
    setSelectedSiteSubmitData(null);
  };

  const handleSiteSubmitDataUpdate = async () => {
    // Refresh data after site submit update
    await fetchReportData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading site submits...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p className="text-xl font-semibold">Error loading data</p>
          <p className="mt-2">{error}</p>
          <button
            onClick={() => navigate("/reports")}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Reports
          </button>
        </div>
      </div>
    );
  }

  return (
    <LayerManagerProvider>
      <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Site Submit Dashboard</h1>
            <p className="mt-2 text-gray-600">
              View and filter all site submits with property details
            </p>
          </div>
          <button
            onClick={() => navigate("/reports")}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            ← Back to Reports
          </button>
        </div>

        {/* Quick Filter Button Strip */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={18} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filter By</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleQuickFilter("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                quickFilter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All Submits
            </button>
            <button
              onClick={() => handleQuickFilter("submitted-reviewing")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                quickFilter === "submitted-reviewing"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Submitted Reviewing
            </button>
            <button
              onClick={() => handleQuickFilter("pursuing")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                quickFilter === "pursuing"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Pursuing
            </button>
            <button
              onClick={() => handleQuickFilter("ownership")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                quickFilter === "ownership"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Ownership
            </button>
            <button
              onClick={() => handleQuickFilter("pass")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                quickFilter === "pass"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Pass
            </button>
            <button
              onClick={() => handleQuickFilter("conflict")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                quickFilter === "conflict"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Conflict
            </button>
            <button
              onClick={() => handleQuickFilter("not-available")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                quickFilter === "not-available"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Not Available
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={18} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            {(selectedStageIds.length > 0 || selectedClientId || quickFilter !== 'all') && (
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
            {/* Stage Multi-Select Filter */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter by Stage (Multi-select)
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowStageMultiSelect(!showStageMultiSelect)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm text-left flex items-center justify-between bg-white hover:bg-gray-50"
                >
                  <span className={selectedStageIds.length === 0 ? "text-gray-400" : "text-gray-900"}>
                    {selectedStageIds.length === 0
                      ? "Select stages..."
                      : `${selectedStageIds.length} stage${selectedStageIds.length > 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
                {selectedStageIds.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStageIds([]);
                    }}
                    className="absolute right-8 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Multi-Select Dropdown */}
              {showStageMultiSelect && (
                <div
                  ref={stageMultiSelectRef}
                  className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                >
                  {stages.map((stage) => (
                    <div
                      key={stage.id}
                      onClick={() => handleToggleStage(stage.id)}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStageIds.includes(stage.id)}
                        onChange={() => {}} // Handled by parent div onClick
                        className="h-4 w-4 text-blue-600 rounded border-gray-300"
                      />
                      <span>{stage.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
          </div>
        </div>

        {/* Results Summary and Export */}
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-600">
            Showing {paginatedData.length} of {filteredData.length} site submits
            {(selectedStageIds.length > 0 || selectedClientId || quickFilter !== 'all') && " (filtered)"}
          </p>
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => handleSort("site_submit_name")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Site Submit Name</span>
                      {sortField === "site_submit_name" && (
                        sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("property_name")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Property</span>
                      {sortField === "property_name" && (
                        sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("display_sqft")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center space-x-1">
                      <span>SQFT</span>
                      {sortField === "display_sqft" && (
                        sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("display_nnn")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center space-x-1">
                      <span>NNN ($/SF)</span>
                      {sortField === "display_nnn" && (
                        sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("submit_stage_name")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Stage</span>
                      {sortField === "submit_stage_name" && (
                        sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("client_name")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Client</span>
                      {sortField === "client_name" && (
                        sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("created_at")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Created</span>
                      {sortField === "created_at" && (
                        sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleSiteSubmitClick(row)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                      >
                        {row.site_submit_name || <span className="text-gray-400">Unnamed</span>}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handlePropertyClick(row)}
                        className="text-left"
                      >
                        <div className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                          {row.property_name || <span className="text-gray-400">Unknown Property</span>}
                        </div>
                        {row.property_unit_name && (
                          <div className="text-xs text-gray-500 mt-1">
                            Unit: {row.property_unit_name}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.display_sqft ? row.display_sqft.toLocaleString() : <span className="text-red-500">Missing</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.display_nnn ? `$${row.display_nnn.toFixed(2)}` : <span className="text-red-500">Missing</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.submit_stage_name || <span className="text-gray-400">No Stage</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.client_name || <span className="text-gray-400">No Client</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pin Details Slideout */}
      <PinDetailsSlideout
        isOpen={isPinDetailsOpen}
        onClose={handlePinDetailsClose}
        data={selectedPinData}
        type={selectedPinType}
        onDataUpdate={handleDataUpdate}
        onViewSiteSubmitDetails={handleViewSiteSubmitDetails}
        rightOffset={isSiteSubmitDetailsOpen ? 500 : 0} // Shift left when site submit details is open
      />

      {/* Site Submit Details Slideout (for viewing site submit from property) */}
      <PinDetailsSlideout
        isOpen={isSiteSubmitDetailsOpen}
        onClose={handleSiteSubmitDetailsClose}
        data={selectedSiteSubmitData}
        type="site_submit"
        onDataUpdate={handleSiteSubmitDataUpdate}
      />
    </div>
    </LayerManagerProvider>
  );
}
