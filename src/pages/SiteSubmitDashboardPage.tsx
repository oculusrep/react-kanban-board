import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ChevronDown, ChevronUp, Download, X, Filter, Check } from "lucide-react";
import PinDetailsSlideout from "../components/mapping/slideouts/PinDetailsSlideout";
import SiteSubmitSlideOut from "../components/SiteSubmitSlideOut";

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
  date_submitted: string | null;
  // Property data for slideout
  property?: any;
  // Full site submit data for slideout (preserves all fields)
  _fullSiteSubmit?: any;
}

interface ClientSubmitReportRow {
  id: string;
  property_id: string;
  property_name: string | null;
  city: string | null;
  // Coordinates - use verified if available, otherwise regular
  latitude: number | null;
  longitude: number | null;
  map_link: string | null;
  // Site submit data
  submit_stage_name: string | null;
  date_submitted: string | null;
  loi_date: string | null;
  notes: string | null;
  // For filtering
  submit_stage_id: string | null;
  client_id: string | null;
  client_name: string | null;
  // For slideouts
  property?: any;
  _fullSiteSubmit?: any;
}

type ActiveTab = "dashboard" | "client-submit-report";

type SortField = "site_submit_name" | "property_name" | "display_sqft" | "display_nnn" | "submit_stage_name" | "client_name" | "created_at";
type ClientSubmitSortField = "property_name" | "city" | "submit_stage_name" | "date_submitted" | "loi_date";
type SortDirection = "asc" | "desc";

export default function SiteSubmitDashboardPage() {
  const navigate = useNavigate();

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");

  // Dashboard tab data
  const [data, setData] = useState<SiteSubmitReportRow[]>([]);
  const [filteredData, setFilteredData] = useState<SiteSubmitReportRow[]>([]);

  // Client Submit Report tab data
  const [clientSubmitData, setClientSubmitData] = useState<ClientSubmitReportRow[]>([]);
  const [filteredClientSubmitData, setFilteredClientSubmitData] = useState<ClientSubmitReportRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]); // Changed to array for multi-select
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedClientName, setSelectedClientName] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [quickFilter, setQuickFilter] = useState<string>("all"); // For button strip

  // Auto-suggest state (client only)
  const [clientQuery, setClientQuery] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const clientInputRef = useRef<HTMLInputElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Stage multi-select state
  const [showStageMultiSelect, setShowStageMultiSelect] = useState(false);
  const stageMultiSelectRef = useRef<HTMLDivElement>(null);

  // Sorting (Dashboard tab)
  const [sortField, setSortField] = useState<SortField>("site_submit_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Sorting (Client Submit Report tab)
  const [clientSubmitSortField, setClientSubmitSortField] = useState<ClientSubmitSortField>("property_name");
  const [clientSubmitSortDirection, setClientSubmitSortDirection] = useState<SortDirection>("asc");

  // Inline editing state for Client Submit Report
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Slideout states
  const [isPinDetailsOpen, setIsPinDetailsOpen] = useState(false);
  const [selectedPinData, setSelectedPinData] = useState<any>(null);
  const [selectedPinType, setSelectedPinType] = useState<'property' | 'site_submit' | null>(null);

  // Property Details slideout (for viewing property from site submit)
  const [isPropertyDetailsOpen, setIsPropertyDetailsOpen] = useState(false);
  const [selectedPropertyData, setSelectedPropertyData] = useState<any>(null);

  // Full Site Submit slideout (for viewing full site submit record)
  const [isFullSiteSubmitOpen, setIsFullSiteSubmitOpen] = useState(false);
  const [fullSiteSubmitId, setFullSiteSubmitId] = useState<string>("");

  // Bulk selection state
  const [selectedSiteSubmitIds, setSelectedSiteSubmitIds] = useState<Set<string>>(new Set());
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignmentId, setBulkAssignmentId] = useState<string>("");
  const [bulkAssignmentName, setBulkAssignmentName] = useState<string>("");
  const [assignments, setAssignments] = useState<{ id: string; name: string }[]>([]);
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [showAssignmentDropdown, setShowAssignmentDropdown] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const assignmentInputRef = useRef<HTMLInputElement>(null);
  const assignmentDropdownRef = useRef<HTMLDivElement>(null);

  // Set page title
  useEffect(() => {
    document.title = "Site Submit Dashboard | OVIS";
  }, []);

  // Load initial data
  useEffect(() => {
    fetchReportData();
    fetchAssignments();
  }, []);

  // Apply filters and sorting when data or filters change
  useEffect(() => {
    applyFiltersAndSort();
  }, [data, selectedStageIds, selectedClientId, sortField, sortDirection, quickFilter]);

  // Apply filters for Client Submit Report tab
  useEffect(() => {
    applyClientSubmitFilters();
  }, [clientSubmitData, selectedStageIds, selectedClientId, selectedCity, quickFilter, clientSubmitSortField, clientSubmitSortDirection]);

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
      if (
        assignmentDropdownRef.current &&
        !assignmentDropdownRef.current.contains(event.target as Node) &&
        !assignmentInputRef.current?.contains(event.target as Node)
      ) {
        setShowAssignmentDropdown(false);
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
          date_submitted,
          year_1_rent,
          ti,
          notes,
          customer_comments,
          sf_property_unit,
          loi_written,
          loi_date,
          delivery_date,
          delivery_timeframe,
          created_by_id,
          updated_at,
          updated_by_id,
          property!site_submit_property_id_fkey (
            id,
            property_name,
            address,
            city,
            state,
            zip,
            building_sqft,
            nnn_psf,
            latitude,
            longitude,
            verified_latitude,
            verified_longitude,
            property_record_type_id,
            property_type_id,
            property_type!fk_property_type_id (
              id,
              label
            )
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
          date_submitted: submit.date_submitted,
          property: property,
          _fullSiteSubmit: submit // Store the full original object
        };
      });

      setData(transformedData);

      // Transform data for Client Submit Report tab
      const clientSubmitRows: ClientSubmitReportRow[] = siteSubmitData.map(submit => {
        const property = submit.property as any;
        const stage = submit.submit_stage as any;
        const client = submit.client as any;

        // Use verified coordinates if available, otherwise use regular lat/long
        const lat = property?.verified_latitude ?? property?.latitude ?? null;
        const lng = property?.verified_longitude ?? property?.longitude ?? null;

        // Generate Google Maps link if we have coordinates
        const mapLink = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

        return {
          id: submit.id,
          property_id: submit.property_id,
          property_name: property?.property_name ?? null,
          city: property?.city ?? null,
          latitude: lat,
          longitude: lng,
          map_link: mapLink,
          submit_stage_name: stage?.name ?? null,
          date_submitted: submit.date_submitted,
          loi_date: submit.loi_date,
          notes: submit.notes,
          submit_stage_id: submit.submit_stage_id,
          client_id: submit.client_id,
          client_name: client?.client_name ?? null,
          property: property,
          _fullSiteSubmit: submit,
        };
      });

      setClientSubmitData(clientSubmitRows);

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

      // Extract unique cities for filters
      const uniqueCities = new Set<string>();
      clientSubmitRows.forEach(row => {
        if (row.city) {
          uniqueCities.add(row.city);
        }
      });
      setCities(Array.from(uniqueCities).sort((a, b) => a.localeCompare(b)));

    } catch (err) {
      console.error('❌ Error in fetchReportData:', err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = useCallback(() => {
    let result = [...data];

    // Apply quick filter first (button strip)
    if (quickFilter !== 'all') {
      // Map quick filter keys to actual stage names
      const stageMap: Record<string, string> = {
        'submitted-reviewing': 'Submitted-Reviewing',
        'pursuing': 'Pursuing Ownership',
        'pass': 'Pass',
        'conflict': 'Use Conflict',
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
  }, [data, selectedStageIds, selectedClientId, sortField, sortDirection, quickFilter]);

  const applyClientSubmitFilters = useCallback(() => {
    let result = [...clientSubmitData];

    // Apply quick filter first (button strip)
    if (quickFilter !== 'all') {
      const stageMap: Record<string, string> = {
        'submitted-reviewing': 'Submitted-Reviewing',
        'pursuing': 'Pursuing Ownership',
        'pass': 'Pass',
        'conflict': 'Use Conflict',
        'not-available': 'Not Available'
      };
      const stageName = stageMap[quickFilter];
      if (stageName) {
        result = result.filter(row => row.submit_stage_name === stageName);
      }
    } else if (selectedStageIds.length > 0) {
      result = result.filter(row => row.submit_stage_id && selectedStageIds.includes(row.submit_stage_id));
    }

    if (selectedClientId) {
      result = result.filter(row => row.client_id === selectedClientId);
    }

    if (selectedCity) {
      result = result.filter(row => row.city === selectedCity);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: string | null = null;
      let bVal: string | null = null;

      if (clientSubmitSortField === "property_name") {
        aVal = a.property_name;
        bVal = b.property_name;
      } else if (clientSubmitSortField === "city") {
        aVal = a.city;
        bVal = b.city;
      } else if (clientSubmitSortField === "submit_stage_name") {
        aVal = a.submit_stage_name;
        bVal = b.submit_stage_name;
      } else if (clientSubmitSortField === "date_submitted") {
        aVal = a.date_submitted;
        bVal = b.date_submitted;
      } else if (clientSubmitSortField === "loi_date") {
        aVal = a.loi_date;
        bVal = b.loi_date;
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      let comparison = 0;
      // For date fields, compare as dates
      if (clientSubmitSortField === "date_submitted" || clientSubmitSortField === "loi_date") {
        comparison = new Date(aVal).getTime() - new Date(bVal).getTime();
      } else {
        comparison = aVal.localeCompare(bVal);
      }

      return clientSubmitSortDirection === "asc" ? comparison : -comparison;
    });

    setFilteredClientSubmitData(result);
  }, [clientSubmitData, selectedStageIds, selectedClientId, selectedCity, quickFilter, clientSubmitSortField, clientSubmitSortDirection]);

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

  const handleClientSubmitSort = (field: ClientSubmitSortField) => {
    if (clientSubmitSortField === field) {
      if (clientSubmitSortDirection === "asc") {
        setClientSubmitSortDirection("desc");
      } else {
        setClientSubmitSortField("property_name");
        setClientSubmitSortDirection("asc");
      }
    } else {
      setClientSubmitSortField(field);
      setClientSubmitSortDirection("asc");
    }
  };

  const clearFilters = () => {
    setSelectedStageIds([]);
    setQuickFilter("all");
    setSelectedClientId("");
    setSelectedClientName("");
    setSelectedCity("");
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

  const exportClientSubmitToCSV = () => {
    if (filteredClientSubmitData.length === 0) {
      alert("No data to export");
      return;
    }

    const headers = [
      "Property Name",
      "City",
      "Map Link",
      "Latitude",
      "Longitude",
      "Submit Stage",
      "Date Submitted",
      "LOI Date",
      "Notes"
    ];

    const rows = filteredClientSubmitData.map(row => [
      row.property_name || "",
      row.city || "",
      row.map_link || "",
      row.latitude?.toString() || "",
      row.longitude?.toString() || "",
      row.submit_stage_name || "",
      row.date_submitted ? new Date(row.date_submitted).toLocaleDateString() : "",
      row.loi_date ? new Date(row.loi_date).toLocaleDateString() : "",
      row.notes || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `client-submit-report-${new Date().toISOString().split('T')[0]}.csv`;
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
    // Use the full site submit object which preserves all fields from the database
    const siteSubmitData = row._fullSiteSubmit || {
      // Fallback if _fullSiteSubmit is not available
      id: row.id,
      site_submit_name: row.site_submit_name,
      property_id: row.property_id,
      property_unit_id: row.property_unit_id,
      submit_stage_id: row.submit_stage_id,
      client_id: row.client_id,
      assignment_id: row.assignment_id,
      created_at: row.created_at,
      date_submitted: row.date_submitted,
      property: row.property,
      submit_stage: row.submit_stage_name ? { id: row.submit_stage_id!, name: row.submit_stage_name } : undefined,
      client: row.client_name ? { client_name: row.client_name } : undefined,
      property_unit: row.property_unit_name ? { property_unit_name: row.property_unit_name } : undefined
    };

    setSelectedPinData(siteSubmitData);
    setSelectedPinType('site_submit');
    setIsPinDetailsOpen(true);
  };

  // Handler for Client Submit Report - opens both property and site submit slideouts
  const handleClientSubmitRowClick = useCallback(async (row: ClientSubmitReportRow) => {
    console.log('📋 Opening property and site submit slideouts for:', row.property_name);

    // Open the site submit slideout (using the full site submit record)
    if (row._fullSiteSubmit) {
      setSelectedPinData(row._fullSiteSubmit);
      setSelectedPinType('site_submit');
      setIsPinDetailsOpen(true);
    }

    // Also open the property details slideout
    if (row.property?.id) {
      try {
        const { data: freshPropertyData, error } = await supabase
          .from('property')
          .select('*')
          .eq('id', row.property.id)
          .single();

        if (error) {
          console.error('❌ Error fetching fresh property data:', error);
          setSelectedPropertyData(row.property);
        } else {
          setSelectedPropertyData(freshPropertyData);
        }
      } catch (err) {
        console.error('❌ Exception fetching fresh property data:', err);
        setSelectedPropertyData(row.property);
      }
      setIsPropertyDetailsOpen(true);
    }
  }, []);

  // Inline editing handlers for Client Submit Report
  const startEditing = (rowId: string, field: string, currentValue: string) => {
    setEditingRowId(rowId);
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingField(null);
    setEditValue("");
  };

  const saveInlineEdit = async (rowId: string, field: string, value: string) => {
    setSavingEdit(true);
    try {
      const updateData: Record<string, any> = {};

      if (field === "submit_stage_id") {
        updateData.submit_stage_id = value || null;
      } else if (field === "date_submitted") {
        updateData.date_submitted = value || null;
      } else if (field === "notes") {
        updateData.notes = value || null;
      }

      const { error } = await supabase
        .from("site_submit")
        .update(updateData)
        .eq("id", rowId);

      if (error) throw error;

      // Helper to update a row based on field
      const updateRow = <T extends { id: string; submit_stage_id?: string | null; submit_stage_name?: string | null; date_submitted?: string | null; notes?: string | null }>(row: T): T => {
        if (row.id !== rowId) return row;

        if (field === "submit_stage_id") {
          const stage = stages.find(s => s.id === value);
          return { ...row, submit_stage_id: value || null, submit_stage_name: stage?.name || null };
        } else if (field === "date_submitted") {
          return { ...row, date_submitted: value || null };
        } else if (field === "notes") {
          return { ...row, notes: value || null };
        }
        return row;
      };

      // Update source data
      setClientSubmitData(prev => prev.map(updateRow));

      // Also update filtered data directly to avoid any timing issues
      setFilteredClientSubmitData(prev => prev.map(updateRow));

      // Also update the main Dashboard data if the field affects it
      if (field === "submit_stage_id" || field === "date_submitted" || field === "notes") {
        setData(prev => prev.map(row => {
          if (row.id !== rowId) return row;

          if (field === "submit_stage_id") {
            const stage = stages.find(s => s.id === value);
            return { ...row, submit_stage_id: value || null, submit_stage_name: stage?.name || null };
          } else if (field === "date_submitted") {
            return { ...row, date_submitted: value || null };
          }
          // notes is not in the Dashboard tab data, so skip
          return row;
        }));
      }

      cancelEditing();
    } catch (err) {
      console.error("Error saving edit:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePinDetailsClose = useCallback(() => {
    setIsPinDetailsOpen(false);
    setSelectedPinData(null);
    setSelectedPinType(null);
  }, []);

  const handleDataUpdate = useCallback(async () => {
    // Don't refetch all data on every autosave - causes infinite loop
    // The slideout manages its own state. Only refetch if user explicitly requests it.
    console.log('📝 Data updated in slideout (not refetching dashboard data)');
  }, []);

  // Handle viewing property details from site submit slideout
  const handleViewPropertyDetails = useCallback(async (property: any) => {
    console.log('🏢 Opening property details slideout:', property);

    // Validate property has an ID
    if (!property || !property.id) {
      console.error('❌ Cannot open property details: invalid property data', property);
      return;
    }

    // Fetch fresh property data from database to ensure we have latest values
    try {
      const { data: freshPropertyData, error } = await supabase
        .from('property')
        .select('*')
        .eq('id', property.id)
        .single();

      if (error) {
        console.error('❌ Error fetching fresh property data:', error);
        // Fall back to cached data if fetch fails
        setSelectedPropertyData(property);
      } else {
        console.log('✅ Fetched fresh property data:', freshPropertyData);
        setSelectedPropertyData(freshPropertyData);
      }
    } catch (err) {
      console.error('❌ Exception fetching fresh property data:', err);
      // Fall back to cached data if fetch fails
      setSelectedPropertyData(property);
    }

    setIsPropertyDetailsOpen(true);
  }, []);

  const handlePropertyDetailsClose = useCallback(() => {
    setIsPropertyDetailsOpen(false);
    setSelectedPropertyData(null);
  }, []);

  const handlePropertyDataUpdate = useCallback(async () => {
    // Don't refetch all data on every autosave - causes infinite loop
    // The slideout manages its own state. Only refetch if user explicitly requests it.
    console.log('📝 Property data updated (not refetching dashboard data)');
  }, []);

  const handleOpenFullSiteSubmit = useCallback((siteSubmitId: string) => {
    console.log('🔍 Opening full site submit record:', siteSubmitId);
    setFullSiteSubmitId(siteSubmitId);
    setIsFullSiteSubmitOpen(true);
  }, []);

  const handleFullSiteSubmitClose = useCallback(() => {
    setIsFullSiteSubmitOpen(false);
    setFullSiteSubmitId("");
  }, []);

  const fetchAssignments = async () => {
    try {
      const { data: assignmentData, error } = await supabase
        .from('assignment')
        .select('id, assignment_name')
        .order('assignment_name');

      if (error) throw error;

      setAssignments(
        (assignmentData || []).map(a => ({
          id: a.id,
          name: a.assignment_name || 'Unnamed Assignment'
        }))
      );
    } catch (err) {
      console.error('Error fetching assignments:', err);
    }
  };

  // Bulk selection handlers
  const handleToggleSelect = (siteSubmitId: string) => {
    setSelectedSiteSubmitIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteSubmitId)) {
        newSet.delete(siteSubmitId);
      } else {
        newSet.add(siteSubmitId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedSiteSubmitIds.size === paginatedData.length) {
      // Deselect all
      setSelectedSiteSubmitIds(new Set());
    } else {
      // Select all on current page
      setSelectedSiteSubmitIds(new Set(paginatedData.map(row => row.id)));
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignmentId || selectedSiteSubmitIds.size === 0) {
      alert('Please select an assignment and at least one site submit');
      return;
    }

    setBulkAssigning(true);
    try {
      const updates = Array.from(selectedSiteSubmitIds).map(siteSubmitId => ({
        id: siteSubmitId,
        assignment_id: bulkAssignmentId
      }));

      const { error } = await supabase
        .from('site_submit')
        .upsert(updates, { onConflict: 'id' });

      if (error) throw error;

      // Refresh data to show updated assignments
      await fetchReportData();

      // Clear selection and close modal
      setSelectedSiteSubmitIds(new Set());
      setShowBulkAssignModal(false);
      setBulkAssignmentId("");
      setBulkAssignmentName("");
      setAssignmentQuery("");

      alert(`Successfully assigned ${updates.length} site submit(s) to ${bulkAssignmentName}`);
    } catch (err) {
      console.error('Error bulk assigning:', err);
      alert('Error assigning site submits. Please try again.');
    } finally {
      setBulkAssigning(false);
    }
  };

  const filteredAssignments = assignments.filter(assignment =>
    assignment.name.toLowerCase().includes(assignmentQuery.toLowerCase())
  );

  const handleSelectAssignment = (assignment: { id: string; name: string }) => {
    setBulkAssignmentId(assignment.id);
    setBulkAssignmentName(assignment.name);
    setAssignmentQuery(assignment.name);
    setShowAssignmentDropdown(false);
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

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "dashboard"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("client-submit-report")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "client-submit-report"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Client Submit Report
            </button>
          </nav>
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
            {(selectedStageIds.length > 0 || selectedClientId || selectedCity || quickFilter !== 'all') && (
              <button
                onClick={clearFilters}
                className="ml-auto text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <X size={14} />
                Clear Filters
              </button>
            )}
          </div>

          <div className={`grid grid-cols-1 gap-4 ${activeTab === "client-submit-report" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
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

            {/* City Filter (only for Client Submit Report tab) */}
            {activeTab === "client-submit-report" && (
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter by City
                </label>
                <div className="relative">
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="">All Cities</option>
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                  {selectedCity && (
                    <button
                      onClick={() => setSelectedCity("")}
                      className="absolute right-8 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Tab Content */}
        {activeTab === "dashboard" && (
          <>
            {/* Bulk Actions Bar */}
            {selectedSiteSubmitIds.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-900">
                        {selectedSiteSubmitIds.size} site submit{selectedSiteSubmitIds.size > 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedSiteSubmitIds(new Set())}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      Clear selection
                    </button>
                  </div>
                  <button
                    onClick={() => setShowBulkAssignModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Assign to Assignment
                  </button>
                </div>
              </div>
            )}

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
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={paginatedData.length > 0 && selectedSiteSubmitIds.size === paginatedData.length}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                      aria-label="Select all site submits on this page"
                    />
                  </th>
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
                      <input
                        type="checkbox"
                        checked={selectedSiteSubmitIds.has(row.id)}
                        onChange={() => handleToggleSelect(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                        aria-label={`Select ${row.site_submit_name || 'unnamed site submit'}`}
                      />
                    </td>
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
          </>
        )}

        {/* Client Submit Report Tab Content */}
        {activeTab === "client-submit-report" && (
          <>
            {/* Results Summary and Export */}
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-600">
                Showing {filteredClientSubmitData.length} site submits
                {(selectedStageIds.length > 0 || selectedClientId || selectedCity || quickFilter !== 'all') && " (filtered)"}
              </p>
              <button
                onClick={exportClientSubmitToCSV}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Client Submit Report Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        onClick={() => handleClientSubmitSort("property_name")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-1">
                          <span>Property Name</span>
                          {clientSubmitSortField === "property_name" && (
                            clientSubmitSortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleClientSubmitSort("city")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-1">
                          <span>City</span>
                          {clientSubmitSortField === "city" && (
                            clientSubmitSortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Map
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Latitude
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Longitude
                      </th>
                      <th
                        onClick={() => handleClientSubmitSort("submit_stage_name")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-1">
                          <span>Submit Stage</span>
                          {clientSubmitSortField === "submit_stage_name" && (
                            clientSubmitSortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleClientSubmitSort("date_submitted")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-1">
                          <span>Date Submitted</span>
                          {clientSubmitSortField === "date_submitted" && (
                            clientSubmitSortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleClientSubmitSort("loi_date")}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      >
                        <div className="flex items-center space-x-1">
                          <span>LOI Date</span>
                          {clientSubmitSortField === "loi_date" && (
                            clientSubmitSortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredClientSubmitData.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        {/* Property Name - clickable to open slideouts */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleClientSubmitRowClick(row)}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                          >
                            {row.property_name || <span className="text-gray-400">Unknown</span>}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.city || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {row.map_link ? (
                            <a
                              href={row.map_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              View Map
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.latitude?.toFixed(6) || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.longitude?.toFixed(6) || <span className="text-gray-400">—</span>}
                        </td>
                        {/* Submit Stage - inline editable */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {editingRowId === row.id && editingField === "submit_stage_id" ? (
                            <div className="flex items-center gap-1">
                              <select
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                                disabled={savingEdit}
                              >
                                <option value="">No Stage</option>
                                {stages.map((stage) => (
                                  <option key={stage.id} value={stage.id}>
                                    {stage.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => saveInlineEdit(row.id, "submit_stage_id", editValue)}
                                disabled={savingEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={cancelEditing}
                                disabled={savingEdit}
                                className="text-gray-400 hover:text-gray-600 p-1"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(row.id, "submit_stage_id", row.submit_stage_id || "")}
                              className="text-gray-900 hover:text-blue-600 hover:underline cursor-pointer"
                              title="Click to edit"
                            >
                              {row.submit_stage_name || <span className="text-gray-400">No Stage</span>}
                            </button>
                          )}
                        </td>
                        {/* Date Submitted - inline editable */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {editingRowId === row.id && editingField === "date_submitted" ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="date"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                                disabled={savingEdit}
                              />
                              <button
                                onClick={() => saveInlineEdit(row.id, "date_submitted", editValue)}
                                disabled={savingEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={cancelEditing}
                                disabled={savingEdit}
                                className="text-gray-400 hover:text-gray-600 p-1"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(row.id, "date_submitted", row.date_submitted ? row.date_submitted.split('T')[0] : "")}
                              className="text-gray-500 hover:text-blue-600 hover:underline cursor-pointer"
                              title="Click to edit"
                            >
                              {row.date_submitted ? new Date(row.date_submitted).toLocaleDateString() : <span className="text-gray-400">—</span>}
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {row.loi_date ? new Date(row.loi_date).toLocaleDateString() : "—"}
                        </td>
                        {/* Notes - inline editable */}
                        <td className="px-6 py-4 text-sm max-w-xs">
                          {editingRowId === row.id && editingField === "notes" ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500 w-full"
                                autoFocus
                                disabled={savingEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveInlineEdit(row.id, "notes", editValue);
                                  if (e.key === "Escape") cancelEditing();
                                }}
                              />
                              <button
                                onClick={() => saveInlineEdit(row.id, "notes", editValue)}
                                disabled={savingEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={cancelEditing}
                                disabled={savingEdit}
                                className="text-gray-400 hover:text-gray-600 p-1"
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(row.id, "notes", row.notes || "")}
                              className="text-gray-900 hover:text-blue-600 hover:underline cursor-pointer truncate block max-w-xs text-left"
                              title={row.notes ? `${row.notes} (Click to edit)` : "Click to add notes"}
                            >
                              {row.notes || <span className="text-gray-400">—</span>}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pin Details Slideout */}
      <PinDetailsSlideout
        isOpen={isPinDetailsOpen}
        onClose={handlePinDetailsClose}
        data={selectedPinData}
        type={selectedPinType}
        onDataUpdate={handleDataUpdate}
        onViewPropertyDetails={handleViewPropertyDetails}
        onOpenFullSiteSubmit={handleOpenFullSiteSubmit}
        rightOffset={isFullSiteSubmitOpen ? 800 : (isPropertyDetailsOpen ? 500 : 0)} // Shift left when full site submit or property details is open
      />

      {/* Property Details Slideout (for viewing property from site submit) */}
      <PinDetailsSlideout
        isOpen={isPropertyDetailsOpen}
        onClose={handlePropertyDetailsClose}
        data={selectedPropertyData}
        type="property"
        onDataUpdate={handlePropertyDataUpdate}
        onOpenFullSiteSubmit={handleOpenFullSiteSubmit}
        rightOffset={isFullSiteSubmitOpen ? 800 : 0} // Shift left when full site submit is open
      />

      {/* Full Site Submit Slideout (for viewing full site submit record) */}
      {fullSiteSubmitId && (
        <SiteSubmitSlideOut
          isOpen={isFullSiteSubmitOpen}
          onClose={handleFullSiteSubmitClose}
          siteSubmitId={fullSiteSubmitId}
          rightOffset={0} // Always at the right edge
        />
      )}

      {/* Bulk Assignment Modal */}
      {showBulkAssignModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={() => setShowBulkAssignModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Assign to Assignment
                  </h3>
                  <button
                    onClick={() => setShowBulkAssignModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Assign {selectedSiteSubmitIds.size} selected site submit{selectedSiteSubmitIds.size > 1 ? 's' : ''} to an assignment:
                  </p>

                  {/* Assignment Autocomplete */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Assignment
                    </label>
                    <div className="relative">
                      <input
                        ref={assignmentInputRef}
                        type="text"
                        value={assignmentQuery}
                        onChange={(e) => {
                          setAssignmentQuery(e.target.value);
                          setShowAssignmentDropdown(true);
                          if (!e.target.value) {
                            setBulkAssignmentId("");
                            setBulkAssignmentName("");
                          }
                        }}
                        onFocus={() => setShowAssignmentDropdown(true)}
                        placeholder="Search assignments..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                      {bulkAssignmentId && (
                        <button
                          onClick={() => {
                            setBulkAssignmentId("");
                            setBulkAssignmentName("");
                            setAssignmentQuery("");
                            assignmentInputRef.current?.focus();
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>

                    {/* Assignment Dropdown */}
                    {showAssignmentDropdown && filteredAssignments.length > 0 && (
                      <div
                        ref={assignmentDropdownRef}
                        className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
                      >
                        {filteredAssignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            onClick={() => handleSelectAssignment(assignment)}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          >
                            {assignment.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowBulkAssignModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                    disabled={bulkAssigning}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkAssign}
                    disabled={!bulkAssignmentId || bulkAssigning}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {bulkAssigning ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Assigning...
                      </>
                    ) : (
                      <>Assign {selectedSiteSubmitIds.size} Site Submit{selectedSiteSubmitIds.size > 1 ? 's' : ''}</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
