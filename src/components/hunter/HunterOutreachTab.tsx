import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  EnvelopeIcon,
  CheckIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface OutreachDraft {
  id: string;
  lead_id: string;
  outreach_type: 'email' | 'voicemail_script';
  contact_name: string;
  subject: string | null;
  body: string;
  status: 'draft' | 'approved' | 'sent' | 'rejected';
  created_at: string;
  sent_at: string | null;
  lead: {
    id: string;
    concept_name: string;
    signal_strength: string;
  } | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Review' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Approved' },
  sent: { bg: 'bg-green-100', text: 'text-green-800', label: 'Sent' },
  rejected: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Rejected' }
};

const OUTREACH_TYPE_LABELS = {
  email: 'Email',
  voicemail_script: 'Voicemail Script'
};

export default function HunterOutreachTab() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<OutreachDraft | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('draft');
  const [sending, setSending] = useState<string | null>(null);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    sent: 0,
    rejected: 0
  });

  useEffect(() => {
    loadDrafts();
  }, [statusFilter]);

  async function loadDrafts() {
    setLoading(true);
    try {
      let query = supabase
        .from('hunter_outreach_draft')
        .select(`
          *,
          lead:hunter_lead!hunter_outreach_draft_lead_id_fkey(
            id,
            concept_name,
            signal_strength
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setDrafts(data || []);

      // Load stats
      const { data: allDrafts } = await supabase
        .from('hunter_outreach_draft')
        .select('status');

      if (allDrafts) {
        setStats({
          pending: allDrafts.filter(d => d.status === 'draft').length,
          approved: allDrafts.filter(d => d.status === 'approved').length,
          sent: allDrafts.filter(d => d.status === 'sent').length,
          rejected: allDrafts.filter(d => d.status === 'rejected').length
        });
      }
    } catch (error) {
      console.error('Error loading drafts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateDraftStatus(draftId: string, newStatus: 'approved' | 'rejected') {
    try {
      const { error } = await supabase
        .from('hunter_outreach_draft')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', draftId);

      if (error) throw error;
      loadDrafts();
      setSelectedDraft(null);
    } catch (error) {
      console.error('Error updating draft:', error);
    }
  }

  async function sendEmail(draft: OutreachDraft) {
    if (!user?.email) {
      alert('No user email found. Please ensure you are logged in.');
      return;
    }

    setSending(draft.id);
    try {
      const response = await supabase.functions.invoke('hunter-send-outreach', {
        body: {
          outreach_id: draft.id,
          user_email: user.email,
          contact_name: draft.contact_name,
          subject: draft.subject,
          body: draft.body
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      loadDrafts();
      setSelectedDraft(null);
    } catch (error) {
      console.error('Error sending email:', error);
      alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSending(null);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter('draft')}
          className={`p-4 rounded-lg border text-left transition-colors ${
            statusFilter === 'draft'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-yellow-500" />
            <span className="text-2xl font-bold">{stats.pending}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Pending Review</p>
        </button>
        <button
          onClick={() => setStatusFilter('approved')}
          className={`p-4 rounded-lg border text-left transition-colors ${
            statusFilter === 'approved'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckIcon className="w-5 h-5 text-blue-500" />
            <span className="text-2xl font-bold">{stats.approved}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Ready to Send</p>
        </button>
        <button
          onClick={() => setStatusFilter('sent')}
          className={`p-4 rounded-lg border text-left transition-colors ${
            statusFilter === 'sent'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <PaperAirplaneIcon className="w-5 h-5 text-green-500" />
            <span className="text-2xl font-bold">{stats.sent}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Sent</p>
        </button>
        <button
          onClick={() => setStatusFilter('rejected')}
          className={`p-4 rounded-lg border text-left transition-colors ${
            statusFilter === 'rejected'
              ? 'border-orange-500 bg-orange-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-gray-500" />
            <span className="text-2xl font-bold">{stats.rejected}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Rejected</p>
        </button>
      </div>

      <div className="flex gap-6">
        {/* Drafts List */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Outreach Queue</h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border-gray-300 rounded-md"
            >
              <option value="all">All Status</option>
              <option value="draft">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
            </div>
          ) : drafts.length === 0 ? (
            <div className="p-8 text-center">
              <EnvelopeIcon className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-2 text-gray-500">No drafts found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => setSelectedDraft(draft)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedDraft?.id === draft.id ? 'bg-orange-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${STATUS_STYLES[draft.status].bg} ${STATUS_STYLES[draft.status].text}`}>
                          {STATUS_STYLES[draft.status].label}
                        </span>
                        <span className="text-xs text-gray-400">
                          {OUTREACH_TYPE_LABELS[draft.outreach_type]}
                        </span>
                      </div>
                      <h4 className="mt-1 font-medium text-gray-900 truncate">
                        {draft.lead?.concept_name || 'Unknown Lead'}
                      </h4>
                      <p className="text-sm text-gray-500 truncate">{draft.subject}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        To: {draft.contact_name}
                      </p>
                    </div>
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(draft.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        {selectedDraft && (
          <div className="w-1/2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Email Preview</h3>
              <button
                onClick={() => setSelectedDraft(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Email Headers */}
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="w-16 text-gray-500">To:</span>
                  <span className="text-gray-900">{selectedDraft.contact_name}</span>
                </div>
                {selectedDraft.subject && (
                  <div className="flex">
                    <span className="w-16 text-gray-500">Subject:</span>
                    <span className="text-gray-900 font-medium">{selectedDraft.subject}</span>
                  </div>
                )}
                <div className="flex">
                  <span className="w-16 text-gray-500">Lead:</span>
                  <span className="text-gray-900">{selectedDraft.lead?.concept_name}</span>
                </div>
                <div className="flex">
                  <span className="w-16 text-gray-500">Type:</span>
                  <span className="text-gray-900">{OUTREACH_TYPE_LABELS[selectedDraft.outreach_type]}</span>
                </div>
              </div>

              {/* Email Body */}
              <div className="border rounded-lg p-4 bg-gray-50 max-h-[400px] overflow-y-auto">
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                  {selectedDraft.body}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {selectedDraft.status === 'draft' && (
                  <>
                    <button
                      onClick={() => updateDraftStatus(selectedDraft.id, 'approved')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <CheckIcon className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => updateDraftStatus(selectedDraft.id, 'rejected')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      <XMarkIcon className="w-4 h-4" />
                      Reject
                    </button>
                  </>
                )}
                {selectedDraft.status === 'approved' && (
                  <button
                    onClick={() => sendEmail(selectedDraft)}
                    disabled={sending === selectedDraft.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {sending === selectedDraft.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <PaperAirplaneIcon className="w-4 h-4" />
                        Send via Gmail
                      </>
                    )}
                  </button>
                )}
                {selectedDraft.status === 'rejected' && (
                  <button
                    onClick={() => updateDraftStatus(selectedDraft.id, 'approved')}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <CheckIcon className="w-4 h-4" />
                    Re-approve
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
