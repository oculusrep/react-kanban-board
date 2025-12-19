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
  concept_name: string;
  website: string | null;
  industry_segment: string | null;
  signal_strength: 'HOT' | 'WARM+' | 'WARM' | 'COOL';
  status: 'new' | 'enriching' | 'ready' | 'outreach_drafted' | 'contacted' | 'converted' | 'dismissed' | 'watching';
  score_reasoning: string | null;
  target_geography: string[] | null;
  geo_relevance: string | null;
  key_person_name: string | null;
  key_person_title: string | null;
  first_seen_at: string;
  last_signal_at: string;
  created_at: string;
  updated_at: string;
  outreach_drafts: {
    id: string;
    status: string;
    outreach_type: string;
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
  { value: 'enriching', label: 'Enriching', color: 'bg-blue-100 text-blue-800' },
  { value: 'ready', label: 'Ready', color: 'bg-purple-100 text-purple-800' },
  { value: 'outreach_drafted', label: 'Outreach Drafted', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'contacted', label: 'Contacted', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'converted', label: 'Converted', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'dismissed', label: 'Dismissed', color: 'bg-gray-100 text-gray-800' },
  { value: 'watching', label: 'Watching', color: 'bg-cyan-100 text-cyan-800' }
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
          outreach_drafts:hunter_outreach_draft(
            id,
            status,
            outreach_type,
            created_at
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setLead(data);
      document.title = `${data.concept_name} | Hunter | OVIS`;
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
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (error) throw error;
      setLead({ ...lead, status: newStatus as HunterLead['status'] });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function convertToContact() {
    if (!lead || !lead.key_person_name) {
      alert('No contact information available to convert.');
      return;
    }

    setConverting(true);
    try {
      // Parse name into first/last
      const nameParts = (lead.key_person_name || lead.concept_name).split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || lead.concept_name;

      // Create contact with Hunter source type and link to lead
      const { data: newContact, error: contactError } = await supabase
        .from('contact')
        .insert({
          first_name: firstName,
          last_name: lastName,
          title: lead.key_person_title || null,
          company: lead.concept_name,
          website: lead.website || null,
          source_type: 'Hunter',
          hunter_lead_id: lead.id,
          contact_tags: `Hunter Lead, ${lead.signal_strength}`,
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
          status: 'converted',
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
                <h1 className="text-2xl font-bold text-gray-900">{lead.concept_name}</h1>
                <span className={`px-3 py-1 text-sm font-medium rounded-full border ${GEO_BADGE_COLORS[lead.signal_strength]}`}>
                  {lead.signal_strength}
                </span>
              </div>
              <p className="text-gray-500 mt-1">
                Discovered {new Date(lead.first_seen_at).toLocaleDateString()}
                {lead.industry_segment && ` • ${lead.industry_segment}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={lead.status}
                onChange={(e) => updateStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              {lead.status !== 'converted' && lead.key_person_name && (
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
            {/* Score Reasoning */}
            {lead.score_reasoning && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Why This Lead?</h2>
                <p className="text-gray-700 leading-relaxed">{lead.score_reasoning}</p>
              </div>
            )}

            {/* Target Geography */}
            {lead.target_geography && lead.target_geography.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Target Geography</h2>
                <div className="flex flex-wrap gap-2">
                  {lead.target_geography.map((geo, idx) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      <MapPinIcon className="w-4 h-4" />
                      {geo}
                    </span>
                  ))}
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
                        <span className="text-gray-700 capitalize">{draft.outreach_type.replace('_', ' ')}</span>
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
            {/* Key Person Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Contact</h2>
              {lead.key_person_name ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <UserPlusIcon className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{lead.key_person_name}</p>
                      {lead.key_person_title && (
                        <p className="text-sm text-gray-500">{lead.key_person_title}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No contact information available yet</p>
              )}
            </div>

            {/* Brand Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Details</h2>
              <div className="space-y-4">
                {lead.website && (
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-blue-600 hover:text-blue-800"
                  >
                    <LinkIcon className="w-5 h-5" />
                    {(() => { try { return new URL(lead.website).hostname; } catch { return lead.website; } })()}
                  </a>
                )}
                {lead.industry_segment && (
                  <div className="flex items-center gap-3">
                    <BuildingStorefrontIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-700">{lead.industry_segment}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <CalendarIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-700">
                    Last signal: {new Date(lead.last_signal_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
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

            {lead.key_person_name && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium">{lead.key_person_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Company:</span>
                  <span className="font-medium">{lead.concept_name}</span>
                </div>
                {lead.key_person_title && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Title:</span>
                    <span className="font-medium">{lead.key_person_title}</span>
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
