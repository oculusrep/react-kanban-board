import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeftIcon,
  BuildingStorefrontIcon,
  MapPinIcon,
  LinkIcon,
  EnvelopeIcon,
  PhoneIcon,
  UserPlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';

interface HunterLead {
  id: string;
  brand_name: string;
  brand_website: string | null;
  confidence_score: number;
  geo_relevance: 'HOT' | 'WARM+' | 'WARM' | 'COOL';
  lead_status: 'new' | 'reviewing' | 'qualified' | 'contacted' | 'converted' | 'rejected';
  expansion_signals: string[];
  target_markets: string[];
  franchise_info: {
    is_franchise?: boolean;
    franchise_fee?: number;
    unit_count?: number;
    growth_plans?: string;
  } | null;
  contact_info: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
  } | null;
  ai_summary: string | null;
  ai_outreach_angle: string | null;
  created_at: string;
  updated_at: string;
  source_article: {
    id: string;
    title: string;
    source_name: string;
    article_url: string;
    published_at: string;
    content_snippet: string;
  } | null;
  outreach_drafts: {
    id: string;
    status: string;
    email_type: string;
    created_at: string;
  }[];
}

const GEO_BADGE_COLORS = {
  'HOT': 'bg-red-100 text-red-800 border-red-200',
  'WARM+': 'bg-orange-100 text-orange-800 border-orange-200',
  'WARM': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'COOL': 'bg-blue-100 text-blue-800 border-blue-200'
};

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-green-100 text-green-800' },
  { value: 'reviewing', label: 'Reviewing', color: 'bg-blue-100 text-blue-800' },
  { value: 'qualified', label: 'Qualified', color: 'bg-purple-100 text-purple-800' },
  { value: 'contacted', label: 'Contacted', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'converted', label: 'Converted', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'rejected', label: 'Rejected', color: 'bg-gray-100 text-gray-800' }
];

export default function HunterLeadDetailsPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState<HunterLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);

  useEffect(() => {
    if (leadId) {
      loadLead(leadId);
    }
  }, [leadId]);

  async function loadLead(id: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hunter_lead')
        .select(`
          *,
          source_article:hunter_article!hunter_lead_source_article_id_fkey(
            id,
            title,
            source_name,
            article_url,
            published_at,
            content_snippet
          ),
          outreach_drafts:hunter_outreach_draft(
            id,
            status,
            email_type,
            created_at
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setLead(data);
      document.title = `${data.brand_name} | Hunter | OVIS`;
    } catch (error) {
      console.error('Error loading lead:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!lead) return;
    try {
      const { error } = await supabase
        .from('hunter_lead')
        .update({
          lead_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (error) throw error;
      setLead({ ...lead, lead_status: newStatus as HunterLead['lead_status'] });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function convertToContact() {
    if (!lead || !lead.contact_info) {
      alert('No contact information available to convert.');
      return;
    }

    setConverting(true);
    try {
      // Parse name into first/last
      const nameParts = (lead.contact_info.name || lead.brand_name).split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || lead.brand_name;

      // Create contact with Hunter source type and link to lead
      const { data: newContact, error: contactError } = await supabase
        .from('contact')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: lead.contact_info.email || null,
          phone: lead.contact_info.phone || null,
          title: lead.contact_info.title || null,
          company: lead.brand_name,
          website: lead.brand_website || null,
          linked_in_profile_link: lead.contact_info.linkedin || null,
          source_type: 'Hunter',
          hunter_lead_id: lead.id,
          contact_tags: `Hunter Lead, ${lead.geo_relevance}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (contactError) throw contactError;

      // Update lead status to converted
      await supabase
        .from('hunter_lead')
        .update({
          lead_status: 'converted',
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      setShowConvertModal(false);

      // Navigate to the new contact
      navigate(`/contact/${newContact.id}`);
    } catch (error) {
      console.error('Error converting to contact:', error);
      alert(`Failed to convert: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setConverting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <h1 className="text-xl font-semibold text-gray-900">Lead not found</h1>
        <Link to="/hunter" className="mt-4 text-orange-600 hover:text-orange-700">
          Back to Hunter
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/hunter')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{lead.brand_name}</h1>
                <span className={`px-3 py-1 text-sm font-medium rounded-full border ${GEO_BADGE_COLORS[lead.geo_relevance]}`}>
                  {lead.geo_relevance}
                </span>
              </div>
              <p className="text-gray-500 mt-1">
                Discovered {new Date(lead.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={lead.lead_status}
                onChange={(e) => updateStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              {lead.lead_status !== 'converted' && (
                <button
                  onClick={() => setShowConvertModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <UserPlusIcon className="w-5 h-5" />
                  Convert to Contact
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Summary */}
            {lead.ai_summary && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">AI Summary</h2>
                <p className="text-gray-700 leading-relaxed">{lead.ai_summary}</p>
              </div>
            )}

            {/* Outreach Angle */}
            {lead.ai_outreach_angle && (
              <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200 p-6">
                <h2 className="text-lg font-semibold text-orange-900 mb-3">Suggested Outreach Angle</h2>
                <p className="text-orange-800 leading-relaxed">{lead.ai_outreach_angle}</p>
              </div>
            )}

            {/* Expansion Signals */}
            {lead.expansion_signals && lead.expansion_signals.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Expansion Signals</h2>
                <div className="flex flex-wrap gap-2">
                  {lead.expansion_signals.map((signal, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Source Article */}
            {lead.source_article && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Source Article</h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <DocumentTextIcon className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <a
                        href={lead.source_article.article_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {lead.source_article.title}
                      </a>
                      <p className="text-sm text-gray-500 mt-1">
                        {lead.source_article.source_name} • {new Date(lead.source_article.published_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {lead.source_article.content_snippet && (
                    <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded-lg">
                      "{lead.source_article.content_snippet}"
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Outreach History */}
            {lead.outreach_drafts && lead.outreach_drafts.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Outreach History</h2>
                <div className="space-y-3">
                  {lead.outreach_drafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <EnvelopeIcon className="w-5 h-5 text-gray-400" />
                        <span className="text-gray-700 capitalize">{draft.email_type.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          draft.status === 'sent' ? 'bg-green-100 text-green-800' :
                          draft.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {draft.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(draft.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
              {lead.contact_info ? (
                <div className="space-y-4">
                  {lead.contact_info.name && (
                    <div className="flex items-center gap-3">
                      <UserPlusIcon className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{lead.contact_info.name}</p>
                        {lead.contact_info.title && (
                          <p className="text-sm text-gray-500">{lead.contact_info.title}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {lead.contact_info.email && (
                    <a
                      href={`mailto:${lead.contact_info.email}`}
                      className="flex items-center gap-3 text-blue-600 hover:text-blue-800"
                    >
                      <EnvelopeIcon className="w-5 h-5" />
                      {lead.contact_info.email}
                    </a>
                  )}
                  {lead.contact_info.phone && (
                    <a
                      href={`tel:${lead.contact_info.phone}`}
                      className="flex items-center gap-3 text-blue-600 hover:text-blue-800"
                    >
                      <PhoneIcon className="w-5 h-5" />
                      {lead.contact_info.phone}
                    </a>
                  )}
                  {lead.contact_info.linkedin && (
                    <a
                      href={lead.contact_info.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-blue-600 hover:text-blue-800"
                    >
                      <LinkIcon className="w-5 h-5" />
                      LinkedIn Profile
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">No contact information available</p>
              )}
            </div>

            {/* Brand Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Details</h2>
              <div className="space-y-4">
                {lead.brand_website && (
                  <a
                    href={lead.brand_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-blue-600 hover:text-blue-800"
                  >
                    <LinkIcon className="w-5 h-5" />
                    {new URL(lead.brand_website).hostname}
                  </a>
                )}
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-700">
                    {Math.round(lead.confidence_score * 100)}% confidence score
                  </span>
                </div>
              </div>
            </div>

            {/* Target Markets */}
            {lead.target_markets && lead.target_markets.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Target Markets</h2>
                <div className="flex flex-wrap gap-2">
                  {lead.target_markets.map((market, idx) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                    >
                      <MapPinIcon className="w-4 h-4" />
                      {market}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Franchise Info */}
            {lead.franchise_info?.is_franchise && (
              <div className="bg-purple-50 rounded-lg border border-purple-200 p-6">
                <h2 className="text-lg font-semibold text-purple-900 mb-4">Franchise Information</h2>
                <div className="space-y-3 text-sm">
                  {lead.franchise_info.unit_count && (
                    <div className="flex justify-between">
                      <span className="text-purple-700">Unit Count:</span>
                      <span className="font-medium text-purple-900">{lead.franchise_info.unit_count}</span>
                    </div>
                  )}
                  {lead.franchise_info.franchise_fee && (
                    <div className="flex justify-between">
                      <span className="text-purple-700">Franchise Fee:</span>
                      <span className="font-medium text-purple-900">
                        ${lead.franchise_info.franchise_fee.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {lead.franchise_info.growth_plans && (
                    <div>
                      <span className="text-purple-700">Growth Plans:</span>
                      <p className="mt-1 text-purple-900">{lead.franchise_info.growth_plans}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convert to Contact Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Convert to OVIS Contact</h2>
            <p className="text-gray-600 mb-6">
              This will create a new contact in OVIS with the source type "Hunter" and link it back to this lead for ROI tracking.
            </p>

            {lead.contact_info && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium">{lead.contact_info.name || lead.brand_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Company:</span>
                  <span className="font-medium">{lead.brand_name}</span>
                </div>
                {lead.contact_info.email && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Email:</span>
                    <span className="font-medium">{lead.contact_info.email}</span>
                  </div>
                )}
                {lead.contact_info.title && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Title:</span>
                    <span className="font-medium">{lead.contact_info.title}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowConvertModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={convertToContact}
                disabled={converting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {converting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Converting...
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="w-5 h-5" />
                    Convert
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
