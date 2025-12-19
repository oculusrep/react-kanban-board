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
  ChevronRightIcon
} from '@heroicons/react/24/outline';

interface HunterLead {
  id: string;
  concept_name: string;
  parent_company: string | null;
  confidence_score: number;
  signal_strength: 'HOT' | 'WARM+' | 'WARM' | 'COOL';
  status: 'new' | 'enriching' | 'ready' | 'contacted' | 'converted' | 'rejected';
  expansion_indicators: string[] | null;
  target_geography: string[] | null;
  key_person_name: string | null;
  key_person_title: string | null;
  created_at: string;
  source_signal: {
    id: string;
    source_title: string;
    source: {
      name: string;
    } | null;
  } | null;
}

const GEO_BADGE_COLORS = {
  'HOT': 'bg-red-100 text-red-800 border-red-200',
  'WARM+': 'bg-orange-100 text-orange-800 border-orange-200',
  'WARM': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'COOL': 'bg-blue-100 text-blue-800 border-blue-200'
};

const STATUS_COLORS = {
  'new': 'bg-green-100 text-green-800',
  'enriching': 'bg-blue-100 text-blue-800',
  'ready': 'bg-purple-100 text-purple-800',
  'contacted': 'bg-indigo-100 text-indigo-800',
  'converted': 'bg-emerald-100 text-emerald-800',
  'rejected': 'bg-gray-100 text-gray-800'
};

export default function HunterLeadsTab() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<HunterLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [geoFilter, setGeoFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [stats, setStats] = useState({
    total: 0,
    hot: 0,
    new: 0,
    converted: 0
  });

  useEffect(() => {
    loadLeads();
  }, [geoFilter, statusFilter]);

  async function loadLeads() {
    setLoading(true);
    try {
      let query = supabase
        .from('hunter_lead')
        .select(`
          id,
          concept_name,
          parent_company,
          confidence_score,
          signal_strength,
          status,
          expansion_indicators,
          target_geography,
          key_person_name,
          key_person_title,
          created_at,
          source_signal:hunter_signal!hunter_lead_source_signal_id_fkey(
            id,
            source_title,
            source:hunter_source!hunter_signal_source_id_fkey(
              name
            )
          )
        `)
        .order('created_at', { ascending: false });

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
        .from('hunter_lead')
        .select('signal_strength, status');

      if (statsData) {
        setStats({
          total: statsData.length,
          hot: statsData.filter(l => l.signal_strength === 'HOT').length,
          new: statsData.filter(l => l.status === 'new').length,
          converted: statsData.filter(l => l.status === 'converted').length
        });
      }
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredLeads = leads.filter(lead =>
    lead.concept_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <BuildingStorefrontIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Total Leads</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <FireIcon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.hot}</p>
              <p className="text-sm text-gray-500">HOT Leads</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <ArrowTrendingUpIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.new}</p>
              <p className="text-sm text-gray-500">New This Week</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <BuildingStorefrontIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.converted}</p>
              <p className="text-sm text-gray-500">Converted</p>
            </div>
          </div>
        </div>
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
              <option value="contacted">Contacted</option>
              <option value="converted">Converted</option>
              <option value="rejected">Rejected</option>
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
                      <span className="flex items-center gap-1">
                        <span className="font-medium">{Math.round((lead.confidence_score || 0) * 100)}%</span> confidence
                      </span>
                      {lead.target_geography && lead.target_geography.length > 0 && (
                        <span className="flex items-center gap-1">
                          <MapPinIcon className="w-4 h-4" />
                          {lead.target_geography.slice(0, 2).join(', ')}
                          {lead.target_geography.length > 2 && ` +${lead.target_geography.length - 2}`}
                        </span>
                      )}
                      {lead.parent_company && (
                        <span className="text-purple-600 font-medium">{lead.parent_company}</span>
                      )}
                    </div>

                    {lead.expansion_indicators && lead.expansion_indicators.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.expansion_indicators.slice(0, 3).map((signal, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                          >
                            {signal}
                          </span>
                        ))}
                        {lead.expansion_indicators.length > 3 && (
                          <span className="px-2 py-0.5 text-xs text-gray-400">
                            +{lead.expansion_indicators.length - 3} more
                          </span>
                        )}
                      </div>
                    )}

                    {lead.source_signal && (
                      <p className="mt-2 text-sm text-gray-400">
                        Source: {lead.source_signal.source?.name || 'Unknown'} - "{(lead.source_signal.source_title || '').substring(0, 60)}..."
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
