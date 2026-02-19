import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Link as TipTapLink } from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';

interface GmailConnection {
  id: string;
  user_id: string;
  google_email: string;
  last_sync_at: string | null;
  last_history_id: string | null;
  is_active: boolean;
  sync_error: string | null;
  sync_error_at: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface SyncStats {
  total_emails: number;
  emails_today: number;
  unprocessed_emails: number;
  pending_suggestions: number;
}

interface EmailSignature {
  id: string;
  user_id: string;
  name: string;
  signature_html: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// TipTap Toolbar Component for Signature Editor
const SignatureMenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Italic"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('underline') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Underline"
      >
        <u>U</u>
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Bullet List"
      >
        •
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Numbered List"
      >
        1.
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive({ textAlign: 'left' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Align Left"
      >
        ≡
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive({ textAlign: 'center' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Align Center"
      >
        ≡
      </button>

      <div className="w-px h-6 bg-gray-300 mx-1 self-center" />

      <button
        type="button"
        onClick={() => {
          const url = window.prompt('Enter link URL:');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('link') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
        title="Add Link"
      >
        🔗
      </button>
      <button
        type="button"
        onClick={addImage}
        className="px-2 py-1 text-sm rounded hover:bg-gray-200"
        title="Add Image"
      >
        🖼️
      </button>
    </div>
  );
};

// Signature Editor Component using TipTap
interface SignatureEditorProps {
  value: string;
  onChange: (html: string) => void;
}

const SignatureEditor: React.FC<SignatureEditorProps> = ({ value, onChange }) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TipTapLink.configure({ openOnClick: false }),
      TextStyle,
      Color,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: true }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <SignatureMenuBar editor={editor} />
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-3 min-h-[200px] focus:outline-none"
      />
    </div>
  );
};

const GmailSettingsPage: React.FC = () => {
  const { user, userRole } = useAuth();
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Signature state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [editingSignature, setEditingSignature] = useState<Partial<EmailSignature> | null>(null);
  const [loadingSignatures, setLoadingSignatures] = useState(false);

  // Check URL params for OAuth callback status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const email = params.get('email');
    const message = params.get('message');

    if (status === 'success' && email) {
      setSuccessMessage(`Successfully connected ${email}`);
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);
    } else if (status === 'error') {
      let errorMsg = message || 'Unknown error';
      // Provide helpful guidance for scope issues
      if (message === 'missing_gmail_readonly_scope') {
        errorMsg = 'Google did not grant full email access. Please go to Google Cloud Console > OAuth consent screen and add "gmail.readonly" to the scopes, then try connecting again.';
      }
      setError(`Failed to connect Gmail: ${errorMsg}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Admins can see all connections, users only their own
      let query = supabase
        .from('gmail_connection')
        .select(`
          *,
          user:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (userRole !== 'admin') {
        const { data: currentUser } = await supabase
          .from('user')
          .select('id')
          .eq('email', user?.email)
          .single();

        if (currentUser) {
          query = query.eq('user_id', currentUser.id);
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setConnections(data || []);

      // Fetch stats
      await fetchStats();
    } catch (err: any) {
      console.error('Error fetching connections:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.email, userRole]);

  const fetchStats = async () => {
    try {
      // Get total emails visible to current user
      const { count: totalEmails } = await supabase
        .from('email_visibility')
        .select('*', { count: 'exact', head: true });

      // Get emails from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: emailsToday } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .gte('received_at', today.toISOString());

      // Get unprocessed emails
      const { count: unprocessed } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('ai_processed', false);

      // Get pending suggestions
      const { count: pending } = await supabase
        .from('unmatched_email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      setStats({
        total_emails: totalEmails || 0,
        emails_today: emailsToday || 0,
        unprocessed_emails: unprocessed || 0,
        pending_suggestions: pending || 0,
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Get current user ID for signature operations (use auth_user_id for consistency with useSiteSubmitEmail)
  useEffect(() => {
    const fetchUserId = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      if (!authUserId) return;

      const { data } = await supabase
        .from('user')
        .select('id')
        .eq('auth_user_id', authUserId)
        .single();
      if (data) setCurrentUserId(data.id);
    };
    fetchUserId();
  }, []);

  // Load signatures when we have user ID
  const loadSignatures = useCallback(async () => {
    if (!currentUserId) return;
    setLoadingSignatures(true);
    try {
      const { data } = await supabase
        .from('user_email_signature')
        .select('*')
        .eq('user_id', currentUserId)
        .order('is_default', { ascending: false });
      setSignatures(data || []);
    } catch (err) {
      console.error('Error loading signatures:', err);
    } finally {
      setLoadingSignatures(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) loadSignatures();
  }, [currentUserId, loadSignatures]);

  // Signature CRUD operations
  const saveSignature = async () => {
    if (!editingSignature || !currentUserId) return;

    try {
      if (editingSignature.id) {
        // Update existing
        const { error } = await supabase
          .from('user_email_signature')
          .update({
            name: editingSignature.name,
            signature_html: editingSignature.signature_html,
            is_default: editingSignature.is_default
          })
          .eq('id', editingSignature.id);

        if (error) throw error;
        setSuccessMessage('Signature updated');
      } else {
        // If this is the first signature or marked as default, make it default
        const isDefault = signatures.length === 0 || editingSignature.is_default;

        // If setting as default, unset other defaults
        if (isDefault) {
          await supabase
            .from('user_email_signature')
            .update({ is_default: false })
            .eq('user_id', currentUserId);
        }

        const { error } = await supabase
          .from('user_email_signature')
          .insert({
            user_id: currentUserId,
            name: editingSignature.name || 'Default Signature',
            signature_html: editingSignature.signature_html,
            is_default: isDefault
          });

        if (error) throw error;
        setSuccessMessage('Signature created');
      }

      setEditingSignature(null);
      loadSignatures();
    } catch (err: any) {
      console.error('Error saving signature:', err);
      setError('Failed to save signature');
    }
  };

  const deleteSignature = async (id: string) => {
    if (!confirm('Delete this signature?')) return;

    try {
      const { error } = await supabase
        .from('user_email_signature')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSuccessMessage('Signature deleted');
      loadSignatures();
    } catch (err: any) {
      console.error('Error deleting signature:', err);
      setError('Failed to delete signature');
    }
  };

  const setDefaultSignature = async (id: string) => {
    if (!currentUserId) return;

    try {
      // Unset all defaults
      await supabase
        .from('user_email_signature')
        .update({ is_default: false })
        .eq('user_id', currentUserId);

      // Set new default
      await supabase
        .from('user_email_signature')
        .update({ is_default: true })
        .eq('id', id);

      setSuccessMessage('Default signature updated');
      loadSignatures();
    } catch (err: any) {
      console.error('Error setting default signature:', err);
      setError('Failed to update default');
    }
  };

  
  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError(null);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-connect`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate connection');
      }

      // Redirect to Google OAuth
      window.location.href = data.auth_url;
    } catch (err: any) {
      console.error('Error connecting Gmail:', err);
      setError(err.message);
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId: string, googleEmail: string) => {
    if (!confirm(`Are you sure you want to disconnect ${googleEmail}?`)) {
      return;
    }

    try {
      setDisconnecting(connectionId);
      setError(null);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-disconnect`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ delete_emails: false }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disconnect');
      }

      setSuccessMessage(`Disconnected ${googleEmail}`);
      await fetchConnections();
    } catch (err: any) {
      console.error('Error disconnecting:', err);
      setError(err.message);
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSyncNow = async (connectionId: string, forceFullSync = false) => {
    try {
      setSyncing(connectionId);
      setError(null);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            connection_id: connectionId,
            force_full_sync: forceFullSync,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      const syncType = data.results?.[0]?.is_full_sync ? 'Full sync' : 'Incremental sync';
      setSuccessMessage(`${syncType}: Synced ${data.total_synced || 0} emails (${data.total_new || 0} new)`);
      await fetchConnections();
    } catch (err: any) {
      console.error('Error syncing:', err);
      setError(err.message);
    } finally {
      setSyncing(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (connection: GmailConnection) => {
    if (!connection.is_active) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Inactive
        </span>
      );
    }
    if (connection.sync_error) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Active
      </span>
    );
  };

  // Check if current user has a connection
  const currentUserHasConnection = connections.some(
    (c) => c.user?.email === user?.email && c.is_active
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Gmail Integration</h1>
        <p className="mt-1 text-sm text-gray-600">
          Connect Gmail accounts to automatically sync and tag emails to CRM objects.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <div className="ml-auto">
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-500">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700">{successMessage}</p>
            </div>
            <div className="ml-auto">
              <button onClick={() => setSuccessMessage(null)} className="text-green-400 hover:text-green-500">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm font-medium text-gray-500">Total Emails</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{stats.total_emails}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm font-medium text-gray-500">Emails Today</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{stats.emails_today}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm font-medium text-gray-500">Awaiting AI Processing</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{stats.unprocessed_emails}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm font-medium text-gray-500">Pending Suggestions</div>
            <div className="mt-1 text-2xl font-semibold text-blue-600">{stats.pending_suggestions}</div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          to="/contacts/suggested"
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Suggested Contacts
          {stats && stats.pending_suggestions > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
              {stats.pending_suggestions}
            </span>
          )}
        </Link>
        <Link
          to="/admin/agent-rules"
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Agent Rules
        </Link>
        <Link
          to="/admin/email-review"
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Review Classifications
        </Link>
        <Link
          to="/admin/flagged-emails"
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Flagged Queue
        </Link>
      </div>

      {/* Connect Button */}
      {!currentUserHasConnection && (
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-blue-900">Connect Your Gmail</h3>
              <p className="mt-1 text-sm text-blue-700">
                Connect your Gmail account to start syncing emails automatically.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"/>
                  </svg>
                  Connect Gmail
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Connections Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b">
          <h3 className="text-lg font-medium text-gray-900">Connected Accounts</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="mt-2 text-sm text-gray-500">Loading connections...</p>
          </div>
        ) : connections.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Gmail accounts connected</h3>
            <p className="mt-1 text-sm text-gray-500">
              Connect a Gmail account to start syncing emails.
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Sync
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {connections.map((connection) => (
                <tr key={connection.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                          <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"/>
                          </svg>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {connection.google_email}
                        </div>
                        <div className="text-sm text-gray-500">
                          Connected {formatDate(connection.created_at)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {connection.user?.first_name} {connection.user?.last_name}
                    </div>
                    <div className="text-sm text-gray-500">{connection.user?.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(connection)}
                    {connection.sync_error && (
                      <div className="mt-1 text-xs text-red-600 max-w-xs truncate" title={connection.sync_error}>
                        {connection.sync_error}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(connection.last_sync_at)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <div className="flex flex-wrap justify-end gap-2">
                      {connection.is_active && (
                        <>
                          <button
                            onClick={() => handleSyncNow(connection.id, false)}
                            disabled={syncing === connection.id}
                            className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                          >
                            {syncing === connection.id ? (
                              <>
                                <svg className="animate-spin -ml-0.5 mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Syncing
                              </>
                            ) : (
                              'Sync'
                            )}
                          </button>
                          <button
                            onClick={() => handleSyncNow(connection.id, true)}
                            disabled={syncing === connection.id}
                            className="inline-flex items-center px-2 py-1 border border-blue-300 text-xs font-medium rounded text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-50"
                            title="Re-fetch last 50 emails regardless of history"
                          >
                            Full
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDisconnect(connection.id, connection.google_email)}
                        disabled={disconnecting === connection.id}
                        className="inline-flex items-center px-2 py-1 border border-red-300 text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                      >
                        {disconnecting === connection.id ? '...' : 'X'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">How Gmail Integration Works</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start">
            <span className="flex-shrink-0 h-5 w-5 text-blue-500 mr-2">1.</span>
            <span>Emails are synced automatically every 5 minutes from your INBOX and SENT folders.</span>
          </div>
          <div className="flex items-start">
            <span className="flex-shrink-0 h-5 w-5 text-blue-500 mr-2">2.</span>
            <span>AI analyzes each email to identify related Contacts, Clients, Deals, and Properties.</span>
          </div>
          <div className="flex items-start">
            <span className="flex-shrink-0 h-5 w-5 text-blue-500 mr-2">3.</span>
            <span>Tagged emails appear in the Activity tab of related CRM records.</span>
          </div>
          <div className="flex items-start">
            <span className="flex-shrink-0 h-5 w-5 text-blue-500 mr-2">4.</span>
            <span>Unknown senders discussing your business are added to "Suggested Contacts" for review.</span>
          </div>
        </div>
      </div>

      {/* Email Signature Section */}
      <div className="mt-8 bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Email Signature</h3>
            <p className="mt-1 text-sm text-gray-500">
              Manage your email signature for Site Submit and other outgoing emails.
            </p>
          </div>
          <button
            onClick={() => setEditingSignature({ name: 'Default Signature', signature_html: '', is_default: true })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            <PlusIcon className="w-4 h-4" />
            New Signature
          </button>
        </div>

        {loadingSignatures ? (
          <div className="p-8 text-center">
            <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="mt-2 text-sm text-gray-500">Loading signatures...</p>
          </div>
        ) : signatures.length === 0 ? (
          <div className="p-8 text-center">
            <PencilIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No signatures yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Create a signature to automatically add to your outgoing emails.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {signatures.map((sig) => (
              <div key={sig.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium text-gray-900">{sig.name}</h4>
                    {sig.is_default && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded flex items-center gap-1">
                        <CheckIcon className="w-3 h-3" />
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!sig.is_default && (
                      <button
                        onClick={() => setDefaultSignature(sig.id)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Set as default
                      </button>
                    )}
                    <button
                      onClick={() => setEditingSignature(sig)}
                      className="p-2 text-gray-400 hover:text-blue-600"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteSignature(sig.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Preview */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sig.signature_html }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signature Editor Modal */}
      {editingSignature && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setEditingSignature(null)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-medium">
                  {editingSignature.id ? 'Edit Signature' : 'New Signature'}
                </h3>
                <button onClick={() => setEditingSignature(null)} className="text-gray-400 hover:text-gray-500">
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">
                {/* Signature Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Signature Name</label>
                  <input
                    type="text"
                    value={editingSignature.name || ''}
                    onChange={(e) => setEditingSignature({ ...editingSignature, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Professional, Casual"
                  />
                </div>

                {/* Info about images */}
                <div className="bg-blue-50 rounded-lg p-3 flex items-start gap-3">
                  <PhotoIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Adding Images</p>
                    <p className="text-sm text-blue-600">
                      Click the image icon in the toolbar to add logos or photos.
                      You can paste image URLs or upload from your computer.
                    </p>
                  </div>
                </div>

                {/* Signature Editor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Signature Content</label>
                  <SignatureEditor
                    value={editingSignature.signature_html || ''}
                    onChange={(value) => setEditingSignature({ ...editingSignature, signature_html: value })}
                  />
                </div>

                {/* Default Option */}
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={editingSignature.is_default || false}
                    onChange={(e) => setEditingSignature({ ...editingSignature, is_default: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_default" className="text-sm text-gray-700">
                    Set as default signature
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setEditingSignature(null)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSignature}
                  disabled={!editingSignature.signature_html}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Save Signature
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GmailSettingsPage;
