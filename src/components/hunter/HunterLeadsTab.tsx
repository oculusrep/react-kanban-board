import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  FireIcon,
  ArrowTrendingUpIcon,
  MapPinIcon,
  BuildingStorefrontIcon,
  ChevronRightIcon,
  HandThumbDownIcon
} from '@heroicons/react/24/outline';

interface HunterLead {
  id: string;
  concept_name: string;
  industry_segment: string | null;
  signal_strength: 'HOT' | 'WARM+' | 'WARM' | 'COOL';
  status: 'new' | 'enriching' | 'ready' | 'outreach_drafted' | 'contacted' | 'converted' | 'dismissed' | 'watching';
  score_reasoning: string | null;
  target_geography: string[] | null;
  key_person_name: string | null;
  key_person_title: string | null;
  first_seen_at: string;
  last_signal_at: string;
  created_at: string;
}

const GEO_BADGE_COLORS = {
  'HOT': 'bg-red-100 text-red-800 border-red-200',
  'WARM+': 'bg-orange-100 text-orange-800 border-orange-200',
  'WARM': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'COOL': 'bg-blue-100 text-blue-800 border-blue-200'
};

const STATUS_COLORS: Record<string, string> = {
  'new': 'bg-green-100 text-green-800',
  'enriching': 'bg-blue-100 text-blue-800',
  'ready': 'bg-purple-100 text-purple-800',
  'outreach_drafted': 'bg-yellow-100 text-yellow-800',
  'contacted': 'bg-indigo-100 text-indigo-800',
  'converted': 'bg-emerald-100 text-emerald-800',
  'dismissed': 'bg-gray-100 text-gray-800',
  'watching': 'bg-cyan-100 text-cyan-800'
};

export default function HunterLeadsTab() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<HunterLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [geoFilter, setGeoFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cardFilter, setCardFilter] = useState<'all' | 'hot' | 'new' | 'converted' | 'dismissed'>('all');
  const [stats, setStats] = useState({
    total: 0,
    hot: 0,
    new: 0,
    converted: 0,
    dismissed: 0
  });

  useEffect(() => {
    loadLeads();
  }, [geoFilter, statusFilter]);

  async function loadLeads() {
    setLoading(true);
    try {
      let query = supabase
        .from('target')
        .select(`
          id,
          concept_name,
          industry_segment,
          signal_strength,
          status,
          score_reasoning,
          target_geography,
          key_person_name,
          key_person_title,
          first_seen_at,
          last_signal_at,
          created_at
        `)
        .order('last_signal_at', { ascending: false });

      if (geoFilter !== 'all') {
        query = query.eq('signal_strength', geoFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLeads(data || []);

      // Load stats
      const { data: statsData } = await supabase
        .from('target')
        .select('signal_strength, status, created_at');

      if (statsData) {
        // Calculate "new this week" - leads created in the last 7 days
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        setStats({
          total: statsData.filter(l => l.status !== 'dismissed').length,
          hot: statsData.filter(l => l.signal_strength === 'HOT' && l.status !== 'dismissed').length,
          new: statsData.filter(l => new Date(l.created_at) >= weekAgo && l.status !== 'dismissed').length,
          converted: statsData.filter(l => l.status === 'converted').length,
          dismissed: statsData.filter(l => l.status === 'dismissed').length
        });
      }
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate "new this week" threshold (7 days ago)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const filteredLeads = leads.filter(lead => {
    // Text search filter
    if (!lead.concept_name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Card filter
    switch (cardFilter) {
      case 'hot':
        return lead.signal_strength === 'HOT' && lead.status !== 'dismissed';
      case 'new':
        return new Date(lead.created_at) >= oneWeekAgo && lead.status !== 'dismissed';
      case 'converted':
        return lead.status === 'converted';
      case 'dismissed':
        return lead.status === 'dismissed';
      case 'all':
      default:
        // By default, hide dismissed leads unless explicitly filtering for them
        return lead.status !== 'dismissed';
    }
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards - Clickable Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <button
          onClick={() => setCardFilter(cardFilter === 'all' ? 'all' : 'all')}
          className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all hover:shadow-md ${
            cardFilter === 'all' ? 'border-gray-400 ring-2 ring-gray-200' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <BuildingStorefrontIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Leads</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setCardFilter(cardFilter === 'hot' ? 'all' : 'hot')}
          className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all hover:shadow-md ${
            cardFilter === 'hot' ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <FireIcon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.hot}</p>
              <p className="text-sm text-gray-500">HOT Leads</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setCardFilter(cardFilter === 'new' ? 'all' : 'new')}
          className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all hover:shadow-md ${
            cardFilter === 'new' ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-200 hover:border-green-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <ArrowTrendingUpIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.new}</p>
              <p className="text-sm text-gray-500">New This Week</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setCardFilter(cardFilter === 'converted' ? 'all' : 'converted')}
          className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all hover:shadow-md ${
            cardFilter === 'converted' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-gray-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <BuildingStorefrontIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.converted}</p>
              <p className="text-sm text-gray-500">Converted</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setCardFilter(cardFilter === 'dismissed' ? 'all' : 'dismissed')}
          className={`bg-white rounded-lg shadow-sm border-2 p-4 text-left transition-all hover:shadow-md ${
            cardFilter === 'dismissed' ? 'border-gray-400 ring-2 ring-gray-200' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <HandThumbDownIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.dismissed}</p>
              <p className="text-sm text-gray-500">Passed</p>
            </div>
          </div>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search brands..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>
          {/* Active card filter indicator */}
          {cardFilter !== 'all' && (
            <button
              onClick={() => setCardFilter('all')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                cardFilter === 'hot' ? 'bg-red-100 text-red-700' :
                cardFilter === 'new' ? 'bg-green-100 text-green-700' :
                cardFilter === 'converted' ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-100 text-gray-700'
              }`}
            >
              {cardFilter === 'hot' && 'HOT Leads'}
              {cardFilter === 'new' && 'New This Week'}
              {cardFilter === 'converted' && 'Converted'}
              {cardFilter === 'dismissed' && 'Passed Targets'}
              <span className="text-xs">&times;</span>
            </button>
          )}
          <div className="flex gap-3">
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-5 h-5 text-gray-400" />
              <select
                value={geoFilter}
                onChange={(e) => setGeoFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="all">All Regions</option>
                <option value="HOT">HOT</option>
                <option value="WARM+">WARM+</option>
                <option value="WARM">WARM</option>
                <option value="COOL">COOL</option>
              </select>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="enriching">Enriching</option>
              <option value="ready">Ready</option>
              <option value="researching">Researching</option>
              <option value="active">Active</option>
              <option value="engaged">Engaged</option>
              <option value="contacted">Contacted</option>
              <option value="converted">Converted</option>
              <option value="dismissed">Passed</option>
              <option value="nurture">Nurture</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leads List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading leads...</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center">
            <BuildingStorefrontIcon className="w-12 h-12 text-gray-300 mx-auto" />
            <h3 className="mt-2 text-lg font-medium text-gray-900">No leads found</h3>
            <p className="mt-1 text-gray-500">
              Hunter will discover new leads as it scans news sources.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredLeads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => navigate(`/hunter/lead/${lead.id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {lead.concept_name}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${GEO_BADGE_COLORS[lead.signal_strength]}`}>
                        {lead.signal_strength}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[lead.status]}`}>
                        {lead.status}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                      {lead.industry_segment && (
                        <span className="text-purple-600 font-medium">{lead.industry_segment}</span>
                      )}
                      {lead.target_geography && lead.target_geography.length > 0 && (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="w-4 h-4" />
                          {lead.target_geography.slice(0, 2).join(', ')}
                          {lead.target_geography.length > 2 && ` +${lead.target_geography.length - 2}`}
                        </span>
                      )}
                      {lead.key_person_name && (
                        <span className="text-gray-600">
                          {lead.key_person_name}{lead.key_person_title && `, ${lead.key_person_title}`}
                        </span>
                      )}
                    </div>

                    {lead.score_reasoning && (
                      <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                        {lead.score_reasoning}
                      </p>
                    )}
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
