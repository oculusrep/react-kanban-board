import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface ProspectingActivity {
  id: string;
  completed_at: string | null;
  subject: string | null;
  is_prospecting_call: boolean | null;
  completed_call: boolean | null;
  meeting_held: boolean | null;
  status_id: string | null;
  contact_id: string | null;
  activity_type_id: string | null;
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

  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01T00:00:00`;

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      // Query activities with prospecting flags and completed_at this year
      // Filter: is_prospecting_call OR completed_call OR meeting_held = true
      // AND completed_at >= this year
      const { data, error } = await supabase
        .from('activity')
        .select(`
          id,
          completed_at,
          subject,
          is_prospecting_call,
          completed_call,
          meeting_held,
          status_id,
          contact_id,
          activity_type_id,
          activity_status!fk_activity_status_id(id, name, is_closed),
          contact!fk_activity_contact_id(
            id,
            first_name,
            last_name,
            company
          ),
          activity_type(id, name)
        `)
        .or('is_prospecting_call.eq.true,completed_call.eq.true,meeting_held.eq.true')
        .gte('completed_at', yearStart)
        .order('completed_at', { ascending: false });

      if (error) {
        console.error('Error fetching prospecting activities:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return;
      }

      console.log('Fetched activities:', data?.length, data);
      setActivities(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
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

  const sortedActivities = [...activities].sort((a, b) => {
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
      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  };

  // Calculate summary stats
  const totalActivities = activities.length;
  const prospectingCalls = activities.filter(a => a.is_prospecting_call).length;
  const completedCalls = activities.filter(a => a.completed_call).length;
  const meetingsHeld = activities.filter(a => a.meeting_held).length;

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
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Prospecting Activities - {currentYear}</h2>
            <p className="text-sm text-gray-500">
              Activities with prospecting call, completed call, or meeting held checked
            </p>
          </div>
          <button
            onClick={fetchActivities}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Refresh
          </button>
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
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  No prospecting activities found for {currentYear}
                </td>
              </tr>
            ) : (
              sortedActivities.map((activity) => (
                <tr key={activity.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(activity.completed_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {getCompanyName(activity.contact)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {activity.contact ? (
                      <button
                        onClick={() => navigate(`/contact/${activity.contact?.id}`)}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {getContactName(activity.contact)}
                      </button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {activity.activity_type?.name || '-'}
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
        <p>Showing {sortedActivities.length} activities with completed_at date in {currentYear}</p>
      </div>
    </div>
  );
}
