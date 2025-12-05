import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import LogCallModal from '../LogCallModal';
import AddTaskModal from '../AddTaskModal';
import FollowUpModal from '../FollowUpModal';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PhoneIcon,
  XMarkIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline';

interface ProspectingActivity {
  id: string;
  completed_at: string | null;
  subject: string | null;
  description: string | null;
  is_prospecting_call: boolean | null;
  completed_call: boolean | null;
  meeting_held: boolean | null;
  status_id: string | null;
  contact_id: string | null;
  activity_type_id: string | null;
  deal_id: string | null;
  client_id: string | null;
  property_id: string | null;
  site_submit_id: string | null;
  activity_status: {
    id: string;
    name: string;
    is_closed: boolean;
  } | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    source_type: string | null;
  } | null;
  activity_type: {
    id: string;
    name: string;
  } | null;
}

export default function ProspectingDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ProspectingActivity[]>([]);
  const [sortField, setSortField] = useState<'completed_at' | 'company' | 'contact' | 'subject'>('completed_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'today' | 'thisWeek' | 'last3Weeks' | 'ytd' | 'last30' | 'last90' | 'all' | 'custom'>('ytd');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Modal states
  const [isLogCallModalOpen, setIsLogCallModalOpen] = useState(false);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ProspectingActivity | null>(null);
  const [logCallForContact, setLogCallForContact] = useState<{ id: string; name: string; company: string | null } | null>(null);

  // Warning icon dropdown state
  const [warningDropdownContactId, setWarningDropdownContactId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Follow-up modal state
  const [followUpContact, setFollowUpContact] = useState<{ id: string; name: string; company: string | null } | null>(null);

  // Funnel expanded state
  const [funnelExpanded, setFunnelExpanded] = useState(true);

  // Follow-up status tracking: contactId -> { hasFollowUp: boolean, isOverdue: boolean }
  const [contactFollowUpStatus, setContactFollowUpStatus] = useState<Record<string, { hasFollowUp: boolean; isOverdue: boolean }>>({});

  const currentYear = new Date().getFullYear();

  // Calculate date filter
  const getDateFilter = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        return today.toISOString();
      case 'thisWeek':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        return startOfWeek.toISOString();
      case 'last3Weeks':
        const threeWeeksAgo = new Date(now);
        threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
        threeWeeksAgo.setHours(0, 0, 0, 0);
        return threeWeeksAgo.toISOString();
      case 'ytd':
        return `${currentYear}-01-01T00:00:00`;
      case 'last30':
        const last30 = new Date(now);
        last30.setDate(last30.getDate() - 30);
        return last30.toISOString();
      case 'last90':
        const last90 = new Date(now);
        last90.setDate(last90.getDate() - 90);
        return last90.toISOString();
      case 'all':
        return null;
      case 'custom':
        return customStartDate ? `${customStartDate}T00:00:00` : null;
      default:
        return `${currentYear}-01-01T00:00:00`;
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [dateRange, customStartDate, customEndDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setWarningDropdownContactId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('activity')
        .select(`
          id,
          completed_at,
          subject,
          description,
          is_prospecting_call,
          completed_call,
          meeting_held,
          status_id,
          contact_id,
          activity_type_id,
          deal_id,
          client_id,
          property_id,
          site_submit_id,
          activity_status!fk_activity_status_id(id, name, is_closed),
          contact!fk_activity_contact_id(
            id,
            first_name,
            last_name,
            company,
            source_type
          ),
          activity_type!fk_activity_type_id(id, name)
        `)
        .or('is_prospecting_call.eq.true,completed_call.eq.true,meeting_held.eq.true');

      const startDate = getDateFilter();
      if (startDate) {
        query = query.gte('completed_at', startDate);
      }

      if (dateRange === 'custom' && customEndDate) {
        query = query.lte('completed_at', `${customEndDate}T23:59:59`);
      }

      const { data, error } = await query.order('completed_at', { ascending: false });

      if (error) {
        console.error('Error fetching prospecting activities:', error);
        return;
      }

      setActivities(data || []);

      // Fetch follow-up status for all unique contacts
      if (data && data.length > 0) {
        const contactIds = [...new Set(data.filter(a => a.contact_id).map(a => a.contact_id as string))];
        await fetchFollowUpStatus(contactIds);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch follow-up status for contacts
  const fetchFollowUpStatus = async (contactIds: string[]) => {
    if (contactIds.length === 0) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      // Get all open (not closed) activities for these contacts with future or past dates
      const { data: followUps, error } = await supabase
        .from('activity')
        .select(`
          contact_id,
          activity_date,
          activity_status!fk_activity_status_id(is_closed)
        `)
        .in('contact_id', contactIds)
        .eq('activity_status.is_closed', false);

      if (error) {
        console.error('Error fetching follow-up status:', error);
        return;
      }

      // Build status map for each contact
      const statusMap: Record<string, { hasFollowUp: boolean; isOverdue: boolean }> = {};

      // Initialize all contacts as having no follow-up
      contactIds.forEach(id => {
        statusMap[id] = { hasFollowUp: false, isOverdue: false };
      });

      // Process follow-ups
      if (followUps) {
        followUps.forEach(followUp => {
          if (!followUp.contact_id || !followUp.activity_status) return;

          const contactId = followUp.contact_id;
          const activityDate = followUp.activity_date;

          if (activityDate) {
            const dateStr = activityDate.split('T')[0];
            if (dateStr >= today) {
              // Has a future follow-up
              statusMap[contactId] = { hasFollowUp: true, isOverdue: false };
            } else if (!statusMap[contactId].hasFollowUp) {
              // Has an overdue follow-up (and no future ones yet found)
              statusMap[contactId] = { hasFollowUp: true, isOverdue: true };
            }
          }
        });
      }

      setContactFollowUpStatus(statusMap);
    } catch (err) {
      console.error('Error fetching follow-up status:', err);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getContactName = (contact: ProspectingActivity['contact']) => {
    if (!contact) return '-';
    const first = contact.first_name || '';
    const last = contact.last_name || '';
    return `${first} ${last}`.trim() || '-';
  };

  const getCompanyName = (contact: ProspectingActivity['contact']) => {
    if (!contact?.company) return '-';
    return contact.company;
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter activities by search term
  const filteredActivities = useMemo(() => {
    if (!searchTerm.trim()) return activities;

    const search = searchTerm.toLowerCase();
    return activities.filter(activity => {
      const contactName = getContactName(activity.contact).toLowerCase();
      const companyName = getCompanyName(activity.contact).toLowerCase();
      const subject = (activity.subject || '').toLowerCase();

      return contactName.includes(search) ||
             companyName.includes(search) ||
             subject.includes(search);
    });
  }, [activities, searchTerm]);

  const sortedActivities = useMemo(() => {
    return [...filteredActivities].sort((a, b) => {
      let aVal: string, bVal: string;

      switch (sortField) {
        case 'completed_at':
          aVal = a.completed_at || '';
          bVal = b.completed_at || '';
          break;
        case 'company':
          aVal = getCompanyName(a.contact).toLowerCase();
          bVal = getCompanyName(b.contact).toLowerCase();
          break;
        case 'contact':
          aVal = getContactName(a.contact).toLowerCase();
          bVal = getContactName(b.contact).toLowerCase();
          break;
        case 'subject':
          aVal = (a.subject || '').toLowerCase();
          bVal = (b.subject || '').toLowerCase();
          break;
        default:
          aVal = '';
          bVal = '';
      }

      if (sortDirection === 'asc') {
        return aVal.localeCompare(bVal);
      }
      return bVal.localeCompare(aVal);
    });
  }, [filteredActivities, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const CheckIcon = ({ checked }: { checked: boolean | null }) => {
    if (!checked) return <span className="text-gray-300">-</span>;
    return (
      <svg className="w-5 h-5 text-green-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  };

  // Calculate summary stats from filtered activities
  const totalActivities = filteredActivities.length;
  const prospectingCalls = filteredActivities.filter(a => a.is_prospecting_call).length;
  const completedCalls = filteredActivities.filter(a => a.completed_call).length;
  const meetingsHeld = filteredActivities.filter(a => a.meeting_held).length;

  // Get unique contacts who had meetings (for funnel)
  const contactsWithMeetings = new Set(
    filteredActivities
      .filter(a => a.meeting_held && a.contact_id)
      .map(a => a.contact_id)
  );

  // Handle row click to edit activity
  const handleRowClick = (activity: ProspectingActivity) => {
    setSelectedActivity(activity);
    setLogCallForContact(null);
    setIsLogCallModalOpen(true);
  };

  // Handle "Log Another" click for a contact
  const handleLogAnother = (e: React.MouseEvent, activity: ProspectingActivity) => {
    e.stopPropagation();
    if (activity.contact) {
      setLogCallForContact({
        id: activity.contact.id,
        name: getContactName(activity.contact),
        company: activity.contact.company
      });
      setSelectedActivity(null);
      setIsLogCallModalOpen(true);
    }
  };

  // Handle modal close
  const handleModalClose = () => {
    setIsLogCallModalOpen(false);
    setSelectedActivity(null);
    setLogCallForContact(null);
  };

  // Handle activity saved
  const handleActivitySaved = () => {
    handleModalClose();
    fetchActivities();
  };

  // Get date range label
  const getDateRangeLabel = () => {
    switch (dateRange) {
      case 'today': return 'Today';
      case 'thisWeek': return 'This Week';
      case 'last3Weeks': return 'Last 3 Weeks';
      case 'ytd': return `Year to Date (${currentYear})`;
      case 'last30': return 'Last 30 Days';
      case 'last90': return 'Last 90 Days';
      case 'all': return 'All Time';
      case 'custom': return 'Custom Range';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Conversion Funnel */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setFunnelExpanded(!funnelExpanded)}
            className="flex items-center gap-2 hover:bg-gray-50 rounded px-2 py-1 -ml-2 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900">Prospecting Funnel</h3>
            {funnelExpanded ? (
              <ChevronDownIcon className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-500" />
            )}
          </button>

          {/* Date filter buttons for funnel */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDateRange('today')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === 'today'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange('thisWeek')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === 'thisWeek'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setDateRange('last3Weeks')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === 'last3Weeks'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Last 3 Weeks
            </button>
            <button
              onClick={() => setDateRange('ytd')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === 'ytd'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              This Year
            </button>
          </div>
        </div>

        {funnelExpanded && (
          <div className="px-6 pb-6">
            <div className="flex items-end justify-center gap-4 h-48">
              {/* Prospecting Calls */}
              <div className="flex flex-col items-center">
                <span className="text-blue-600 font-bold text-xl mb-1">{prospectingCalls}</span>
                <div
                  className="w-24 bg-blue-500 rounded-t-lg"
                  style={{ height: `${Math.max(20, (prospectingCalls / Math.max(prospectingCalls, 1)) * 100)}px` }}
                />
                <p className="text-xs text-gray-600 mt-2 text-center">Prospecting<br/>Calls</p>
              </div>

              {/* Arrow */}
              <div className="text-gray-400 text-2xl mb-8">→</div>

              {/* Completed Calls */}
              <div className="flex flex-col items-center">
                <span className="text-green-600 font-bold text-xl mb-1">{completedCalls}</span>
                <div
                  className="w-24 bg-green-500 rounded-t-lg"
                  style={{ height: `${Math.max(20, (completedCalls / Math.max(prospectingCalls, 1)) * 100)}px` }}
                />
                <p className="text-xs text-gray-600 mt-2 text-center">Completed<br/>Calls</p>
              </div>

              {/* Arrow */}
              <div className="text-gray-400 text-2xl mb-8">→</div>

              {/* Meetings Held */}
              <div className="flex flex-col items-center">
                <span className="text-purple-600 font-bold text-xl mb-1">{meetingsHeld}</span>
                <div
                  className="w-24 bg-purple-500 rounded-t-lg"
                  style={{ height: `${Math.max(20, (meetingsHeld / Math.max(prospectingCalls, 1)) * 100)}px` }}
                />
                <p className="text-xs text-gray-600 mt-2 text-center">Meetings<br/>Held</p>
              </div>

              {/* Arrow */}
              <div className="text-gray-400 text-2xl mb-8">→</div>

              {/* Unique Contacts with Meetings */}
              <div className="flex flex-col items-center">
                <span className="text-orange-600 font-bold text-xl mb-1">{contactsWithMeetings.size}</span>
                <div
                  className="w-24 bg-orange-500 rounded-t-lg"
                  style={{ height: `${Math.max(20, (contactsWithMeetings.size / Math.max(prospectingCalls, 1)) * 100)}px` }}
                />
                <p className="text-xs text-gray-600 mt-2 text-center">Unique<br/>Contacts</p>
              </div>
            </div>

            {/* Conversion rates */}
            <div className="flex justify-center gap-8 mt-4 text-sm text-gray-500">
              <span>
                Completion Rate: <strong className="text-gray-900">
                  {prospectingCalls > 0 ? Math.round((completedCalls / prospectingCalls) * 100) : 0}%
                </strong>
              </span>
              <span>
                Meeting Rate: <strong className="text-gray-900">
                  {completedCalls > 0 ? Math.round((meetingsHeld / completedCalls) * 100) : 0}%
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Dashboard */}
      <div className="bg-white rounded-lg shadow">
        {/* Header with filters */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Prospecting Activities</h2>
              <p className="text-sm text-gray-500">{getDateRangeLabel()}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search contact, company, subject..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Date Range Filter */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ytd">Year to Date</option>
                <option value="last30">Last 30 Days</option>
                <option value="last90">Last 90 Days</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Range</option>
              </select>

              {/* Custom date inputs */}
              {dateRange === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}

              {/* Add Activity Button */}
              <button
                onClick={() => {
                  setSelectedActivity(null);
                  setLogCallForContact(null);
                  setIsLogCallModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <PlusIcon className="w-4 h-4" />
                Log Call
              </button>

              {/* Refresh */}
              <button
                onClick={fetchActivities}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <ArrowPathIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{totalActivities}</p>
              <p className="text-sm text-gray-500">Total Activities</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{prospectingCalls}</p>
              <p className="text-sm text-gray-500">Prospecting Calls</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{completedCalls}</p>
              <p className="text-sm text-gray-500">Completed Calls</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{meetingsHeld}</p>
              <p className="text-sm text-gray-500">Meetings Held</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('completed_at')}
                >
                  <div className="flex items-center gap-1">
                    Completed
                    <SortIcon field="completed_at" />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('company')}
                >
                  <div className="flex items-center gap-1">
                    Company
                    <SortIcon field="company" />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('contact')}
                >
                  <div className="flex items-center gap-1">
                    Contact
                    <SortIcon field="contact" />
                  </div>
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  <PhoneIcon className="w-4 h-4 mx-auto" title="Log Call" />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source Type
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('subject')}
                >
                  <div className="flex items-center gap-1">
                    Subject
                    <SortIcon field="subject" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prospecting
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completed
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Meeting
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedActivities.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    {searchTerm ? (
                      <>No activities matching "{searchTerm}"</>
                    ) : (
                      <>No prospecting activities found</>
                    )}
                  </td>
                </tr>
              ) : (
                sortedActivities.map((activity) => (
                  <tr
                    key={activity.id}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => handleRowClick(activity)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(activity.completed_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getCompanyName(activity.contact)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {activity.contact ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/contact/${activity.contact?.id}`);
                            }}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {getContactName(activity.contact)}
                          </button>
                          {/* Follow-up warning icons - clickable with dropdown */}
                          {activity.contact_id && (() => {
                            const status = contactFollowUpStatus[activity.contact_id];
                            const showWarning = !status || !status.hasFollowUp || status.isOverdue;
                            const isOverdue = status?.isOverdue;

                            if (!showWarning) return null;

                            return (
                              <div className="relative" ref={warningDropdownContactId === activity.contact_id ? dropdownRef : undefined}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWarningDropdownContactId(
                                      warningDropdownContactId === activity.contact_id ? null : activity.contact_id
                                    );
                                  }}
                                  className={`p-0.5 rounded hover:bg-gray-100 transition-colors ${
                                    isOverdue ? 'text-red-500 hover:text-red-600' : 'text-yellow-500 hover:text-yellow-600'
                                  }`}
                                  title={isOverdue ? 'Overdue follow-up - Click to schedule' : 'No scheduled follow-up - Click to schedule'}
                                >
                                  <ExclamationTriangleIcon className="w-5 h-5" />
                                </button>

                                {/* Dropdown menu */}
                                {warningDropdownContactId === activity.contact_id && (
                                  <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setWarningDropdownContactId(null);
                                        handleLogAnother(e, activity);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-md"
                                    >
                                      <PhoneIcon className="w-4 h-4" />
                                      Log Call
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setWarningDropdownContactId(null);
                                        if (activity.contact) {
                                          setLogCallForContact({
                                            id: activity.contact.id,
                                            name: getContactName(activity.contact),
                                            company: activity.contact.company
                                          });
                                          setIsAddTaskModalOpen(true);
                                        }
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    >
                                      <ClipboardDocumentListIcon className="w-4 h-4" />
                                      Add Task
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setWarningDropdownContactId(null);
                                        if (activity.contact) {
                                          setFollowUpContact({
                                            id: activity.contact.id,
                                            name: getContactName(activity.contact),
                                            company: activity.contact.company
                                          });
                                        }
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-b-md"
                                    >
                                      <CalendarDaysIcon className="w-4 h-4" />
                                      Follow-up
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    {/* Phone icon cell - Log new call */}
                    <td className="px-3 py-4 whitespace-nowrap text-center">
                      {activity.contact && (
                        <button
                          onClick={(e) => handleLogAnother(e, activity)}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                          title={`Log new call with ${getContactName(activity.contact)}`}
                        >
                          <PhoneIcon className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {activity.contact?.source_type || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={activity.subject || ''}>
                      {activity.subject || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        activity.activity_status?.is_closed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {activity.activity_status?.name || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <CheckIcon checked={activity.is_prospecting_call} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <CheckIcon checked={activity.completed_call} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <CheckIcon checked={activity.meeting_held} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          <p>
            Showing {sortedActivities.length} of {activities.length} activities
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>
      </div>

      {/* Log Call Modal */}
      <LogCallModal
        isOpen={isLogCallModalOpen}
        onClose={handleModalClose}
        onCallLogged={handleActivitySaved}
        existingActivity={selectedActivity}
        parentObject={logCallForContact ? {
          id: logCallForContact.id,
          type: 'contact',
          name: logCallForContact.name
        } : undefined}
      />

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={isAddTaskModalOpen}
        onClose={() => {
          setIsAddTaskModalOpen(false);
          setLogCallForContact(null);
        }}
        onSave={() => {
          setIsAddTaskModalOpen(false);
          setLogCallForContact(null);
          fetchActivities();
        }}
        parentObject={logCallForContact ? {
          id: logCallForContact.id,
          type: 'contact',
          name: logCallForContact.name
        } : undefined}
      />

      {/* Follow-up Modal */}
      <FollowUpModal
        isOpen={!!followUpContact}
        onClose={() => setFollowUpContact(null)}
        onFollowUpCreated={() => {
          setFollowUpContact(null);
          fetchActivities();
        }}
        contactId={followUpContact?.id || ''}
        contactName={followUpContact?.name || ''}
        contactCompany={followUpContact?.company || undefined}
      />
    </div>
  );
}
