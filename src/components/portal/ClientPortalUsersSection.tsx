import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface PortalUser {
  contact_id: string;
  contact_name: string;
  contact_email: string;
  is_active: boolean;
  portal_invite_status: string | null;
  portal_last_login_at: string | null;
  granted_at: string | null;
  portal_invite_expires_at: string | null;
}

interface AvailableContact {
  id: string;
  name: string;
  email: string;
  portal_access_enabled: boolean;
}

interface ClientPortalUsersSectionProps {
  clientId: string | null;
  isNewClient: boolean;
}

/**
 * ClientPortalUsersSection - Admin UI for managing which portal users have access to a client
 *
 * Features:
 * - Shows all contacts with portal access to this client
 * - Add new portal users from existing contacts
 * - Revoke access for existing users
 * - View portal status (invite status, last login)
 */
export default function ClientPortalUsersSection({
  clientId,
  isNewClient,
}: ClientPortalUsersSectionProps) {
  const { user } = useAuth();
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [availableContacts, setAvailableContacts] = useState<AvailableContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [addingContactId, setAddingContactId] = useState<string | null>(null);
  const [sendingInviteForId, setSendingInviteForId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLinkForId, setInviteLinkForId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [generatingLinkForId, setGeneratingLinkForId] = useState<string | null>(null);
  const [sendingResetForId, setSendingResetForId] = useState<string | null>(null);
  const [resetSentForId, setResetSentForId] = useState<string | null>(null);
  const [showUserMenuForId, setShowUserMenuForId] = useState<string | null>(null);

  // Compose invite modal state
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeForUser, setComposeForUser] = useState<PortalUser | null>(null);
  const [emailSubject, setEmailSubject] = useState("You're Invited to the Oculus Client Portal");
  const [emailMessage, setEmailMessage] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState<{ subject: string; message: string } | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenuForId && !(event.target as Element).closest('.relative')) {
        setShowUserMenuForId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenuForId]);

  // Load default email template from settings
  useEffect(() => {
    async function loadDefaultTemplate() {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'portal_invite_email_template')
          .single();

        if (data?.value) {
          setDefaultTemplate(data.value as { subject: string; message: string });
        }
      } catch (err) {
        console.error('[Portal Invite Template] Error loading:', err);
      }
    }
    loadDefaultTemplate();
  }, []);

  // Load portal users for this client
  useEffect(() => {
    async function loadPortalUsers() {
      if (!clientId || isNewClient) return;

      setLoading(true);
      try {
        // Get all contacts with portal access to this client
        const { data: accessGrants, error: accessError } = await supabase
          .from('portal_user_client_access')
          .select(`
            contact_id,
            is_active,
            granted_at,
            contact:contact_id (
              id,
              first_name,
              last_name,
              email,
              portal_access_enabled,
              portal_invite_status,
              portal_last_login_at,
              portal_invite_expires_at
            )
          `)
          .eq('client_id', clientId)
          .eq('is_active', true);

        if (accessError) throw accessError;

        const users: PortalUser[] = (accessGrants || [])
          .filter(g => g.contact)
          .map(g => {
            const contact = g.contact as any;
            return {
              contact_id: g.contact_id,
              contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email || 'Unknown',
              contact_email: contact.email || '',
              is_active: g.is_active,
              portal_invite_status: contact.portal_invite_status,
              portal_last_login_at: contact.portal_last_login_at,
              portal_invite_expires_at: contact.portal_invite_expires_at,
              granted_at: g.granted_at,
            };
          });

        setPortalUsers(users);
      } catch (err) {
        console.error('Error loading portal users:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPortalUsers();
  }, [clientId, isNewClient]);

  // Load available contacts when adding a user
  useEffect(() => {
    async function loadAvailableContacts() {
      if (!showAddUser || !clientId) return;

      try {
        // Get contacts related to this client that don't already have portal access
        // First get contacts from contact_client_relation
        const { data: relations } = await supabase
          .from('contact_client_relation')
          .select(`
            contact:contact_id (
              id,
              first_name,
              last_name,
              email,
              portal_access_enabled
            )
          `)
          .eq('client_id', clientId)
          .eq('is_active', true);

        // Also get contacts with direct client_id
        const { data: directContacts } = await supabase
          .from('contact')
          .select('id, first_name, last_name, email, portal_access_enabled')
          .eq('client_id', clientId);

        // Combine and dedupe
        const contactsMap = new Map<string, AvailableContact>();

        (relations || []).forEach(r => {
          const contact = r.contact as any;
          if (contact?.id && contact.email) {
            contactsMap.set(contact.id, {
              id: contact.id,
              name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
              email: contact.email,
              portal_access_enabled: contact.portal_access_enabled || false,
            });
          }
        });

        (directContacts || []).forEach(contact => {
          if (contact.id && contact.email && !contactsMap.has(contact.id)) {
            contactsMap.set(contact.id, {
              id: contact.id,
              name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
              email: contact.email,
              portal_access_enabled: contact.portal_access_enabled || false,
            });
          }
        });

        // Filter out contacts that already have access
        const existingIds = new Set(portalUsers.map(u => u.contact_id));
        const available = Array.from(contactsMap.values())
          .filter(c => !existingIds.has(c.id))
          .sort((a, b) => a.name.localeCompare(b.name));

        setAvailableContacts(available);
      } catch (err) {
        console.error('Error loading available contacts:', err);
      }
    }

    loadAvailableContacts();
  }, [showAddUser, clientId, portalUsers]);

  const handleAddPortalUser = async (contactId: string) => {
    if (!clientId) return;

    setAddingContactId(contactId);
    try {
      // First enable portal access on the contact if not already enabled
      const contact = availableContacts.find(c => c.id === contactId);
      if (contact && !contact.portal_access_enabled) {
        const { error: enableError } = await supabase
          .from('contact')
          .update({ portal_access_enabled: true })
          .eq('id', contactId);

        if (enableError) throw enableError;
      }

      // Grant access to this client
      // First try to update existing record (if previously revoked)
      const { data: existingAccess } = await supabase
        .from('portal_user_client_access')
        .select('id')
        .eq('contact_id', contactId)
        .eq('client_id', clientId)
        .single();

      if (existingAccess) {
        // Re-activate existing record
        const { error } = await supabase
          .from('portal_user_client_access')
          .update({
            is_active: true,
            granted_by_id: user?.id,
            granted_at: new Date().toISOString(),
          })
          .eq('contact_id', contactId)
          .eq('client_id', clientId);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('portal_user_client_access')
          .insert({
            contact_id: contactId,
            client_id: clientId,
            is_active: true,
            granted_by_id: user?.id,
            granted_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      // Add to local state
      if (contact) {
        setPortalUsers(prev => [
          ...prev,
          {
            contact_id: contactId,
            contact_name: contact.name,
            contact_email: contact.email,
            is_active: true,
            portal_invite_status: null,
            portal_last_login_at: null,
            portal_invite_expires_at: null,
            granted_at: new Date().toISOString(),
          },
        ]);
      }

      // Remove from available contacts
      setAvailableContacts(prev => prev.filter(c => c.id !== contactId));
      setShowAddUser(false);
      setSearchTerm('');
    } catch (err) {
      console.error('Error adding portal user:', err);
    } finally {
      setAddingContactId(null);
    }
  };

  const handleRevokeAccess = async (contactId: string) => {
    if (!clientId) return;

    try {
      const { error } = await supabase
        .from('portal_user_client_access')
        .update({ is_active: false })
        .eq('contact_id', contactId)
        .eq('client_id', clientId);

      if (error) throw error;

      // Remove from local state
      setPortalUsers(prev => prev.filter(u => u.contact_id !== contactId));
    } catch (err) {
      console.error('Error revoking access:', err);
    }
  };

  const getDefaultMessage = (firstName: string) => {
    // Use template from settings if available, otherwise use hardcoded default
    if (defaultTemplate?.message) {
      return defaultTemplate.message.replace(/\{\{firstName\}\}/g, firstName);
    }
    return `Hi ${firstName},

You've been invited to access the Oculus Client Portal. This portal gives you visibility into your real estate projects, including property details, documents, and direct communication with your broker team.

Click the button below to set up your account.

If you have any questions, simply reply to this email or reach out to your broker representative.

Best regards`;
  };

  const getDefaultSubject = () => {
    return defaultTemplate?.subject || "You're Invited to the Oculus Client Portal";
  };

  const openComposeModal = (portalUser: PortalUser) => {
    const firstName = portalUser.contact_name.split(' ')[0] || 'there';
    setComposeForUser(portalUser);
    setEmailSubject(getDefaultSubject());
    setEmailMessage(getDefaultMessage(firstName));
    setShowComposeModal(true);
  };

  const closeComposeModal = () => {
    setShowComposeModal(false);
    setComposeForUser(null);
    setEmailSubject("You're Invited to the Oculus Client Portal");
    setEmailMessage('');
  };

  const handleSendInvite = async (portalUser: PortalUser, customSubject?: string, customMessage?: string) => {
    if (!portalUser.contact_email) {
      console.error('Contact must have an email address to receive an invite');
      return;
    }

    closeComposeModal();
    setSendingInviteForId(portalUser.contact_id);
    setInviteLink(null);
    setInviteLinkForId(null);

    try {
      // Generate invite token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      // Update contact with invite token
      const { error: updateError } = await supabase
        .from('contact')
        .update({
          portal_invite_token: token,
          portal_invite_status: 'pending',
          portal_invite_sent_at: new Date().toISOString(),
          portal_invite_expires_at: expiresAt.toISOString(),
        })
        .eq('id', portalUser.contact_id);

      if (updateError) throw updateError;

      // Log the invite
      await supabase.from('portal_invite_log').insert({
        contact_id: portalUser.contact_id,
        invited_by_id: user?.id,
        invite_email: portalUser.contact_email,
        invite_token: token,
        status: 'sent',
        expires_at: expiresAt.toISOString(),
      });

      // Generate the invite link
      const link = `${window.location.origin}/portal/invite?token=${token}`;
      setInviteLink(link);
      setInviteLinkForId(portalUser.contact_id);

      // Try to send the email via edge function (using Gmail API)
      try {
        const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-portal-invite', {
          body: {
            contactId: portalUser.contact_id,
            email: portalUser.contact_email,
            inviteLink: link,
            expiresAt: expiresAt.toISOString(),
            invitedByUserId: user?.id,  // Pass the current user's ID for Gmail lookup
            customSubject: customSubject,  // Custom subject if provided
            customMessage: customMessage,  // Custom message if provided
          },
        });

        if (emailError) {
          console.log('Edge function error, email not sent:', emailError);
        } else if (emailResult?.useManualLink) {
          console.log('Gmail not available:', emailResult.message);
        } else if (emailResult?.success) {
          console.log('Email sent via Gmail:', emailResult.sentFrom);
        }
      } catch (fnErr) {
        console.log('Edge function not configured, invite link available for manual copy');
      }

      // Update local state to reflect new invite status
      setPortalUsers(prev =>
        prev.map(u =>
          u.contact_id === portalUser.contact_id
            ? { ...u, portal_invite_status: 'pending', portal_invite_expires_at: expiresAt.toISOString() }
            : u
        )
      );
    } catch (err) {
      console.error('Error sending invite:', err);
    } finally {
      setSendingInviteForId(null);
    }
  };

  const handleCopyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // Generate or get existing invite link and copy to clipboard (without sending email)
  const handleCopyInviteLink = async (portalUser: PortalUser) => {
    setGeneratingLinkForId(portalUser.contact_id);

    try {
      // Check if there's an existing valid invite token
      const { data: contact } = await supabase
        .from('contact')
        .select('portal_invite_token, portal_invite_expires_at')
        .eq('id', portalUser.contact_id)
        .single();

      let token = contact?.portal_invite_token;
      const expiresAt = contact?.portal_invite_expires_at;
      const isExpired = expiresAt ? new Date(expiresAt) < new Date() : true;

      // If no valid token exists, generate a new one
      if (!token || isExpired) {
        token = crypto.randomUUID();
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 7); // 7 days expiry

        // Update contact with new invite token
        const { error: updateError } = await supabase
          .from('contact')
          .update({
            portal_invite_token: token,
            portal_invite_status: 'pending',
            portal_invite_expires_at: newExpiresAt.toISOString(),
          })
          .eq('id', portalUser.contact_id);

        if (updateError) throw updateError;

        // Log the invite generation
        await supabase.from('portal_invite_log').insert({
          contact_id: portalUser.contact_id,
          invited_by_id: user?.id,
          invite_email: portalUser.contact_email,
          invite_token: token,
          status: 'link_copied',
          expires_at: newExpiresAt.toISOString(),
        });

        // Update local state
        setPortalUsers(prev =>
          prev.map(u =>
            u.contact_id === portalUser.contact_id
              ? { ...u, portal_invite_status: 'pending', portal_invite_expires_at: newExpiresAt.toISOString() }
              : u
          )
        );
      }

      // Generate the link and copy to clipboard
      const link = `${window.location.origin}/portal/invite?token=${token}`;
      await navigator.clipboard.writeText(link);

      // Show copied feedback
      setInviteLink(link);
      setInviteLinkForId(portalUser.contact_id);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Error generating invite link:', err);
    } finally {
      setGeneratingLinkForId(null);
    }
  };

  // Send password reset email to a portal user
  const handleSendPasswordReset = async (portalUser: PortalUser) => {
    if (!portalUser.contact_email) {
      console.error('Contact must have an email address to receive a password reset');
      return;
    }

    setSendingResetForId(portalUser.contact_id);
    setShowUserMenuForId(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(portalUser.contact_email, {
        redirectTo: `${window.location.origin}/portal/reset-password`,
      });

      if (error) throw error;

      setResetSentForId(portalUser.contact_id);
      // Clear the success message after 5 seconds
      setTimeout(() => setResetSentForId(null), 5000);
    } catch (err) {
      console.error('Error sending password reset:', err);
    } finally {
      setSendingResetForId(null);
    }
  };

  const getStatusBadge = (user: PortalUser) => {
    if (user.portal_last_login_at) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
          Active
        </span>
      );
    }

    switch (user.portal_invite_status) {
      case 'accepted':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            Account Created
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            Invite Pending
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            Invite Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            Not Invited
          </span>
        );
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const filteredContacts = availableContacts.filter(
    c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isNewClient) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2 mb-4">
          Portal Users
        </h3>
        <p className="text-sm text-gray-500">
          Save the client first to manage portal users.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-4">
        <h3 className="text-lg font-medium text-gray-900">Portal Users</h3>
        <button
          type="button"
          onClick={() => setShowAddUser(true)}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add User
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Contacts listed here can log into the client portal and view site submits for this client.
      </p>

      {loading ? (
        <div className="flex items-center space-x-2 text-sm text-gray-500 py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span>Loading portal users...</span>
        </div>
      ) : portalUsers.length === 0 ? (
        <div className="text-center py-6">
          <svg
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No portal users yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Click "Add User" to grant portal access to a contact
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {portalUsers.map(portalUser => (
            <div
              key={portalUser.contact_id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-blue-700">
                      {portalUser.contact_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {portalUser.contact_name}
                  </p>
                  <p className="text-xs text-gray-500">{portalUser.contact_email}</p>
                </div>
              </div>
              <div className="relative flex items-center space-x-3">
                {/* Copy Link button - always available */}
                <button
                  type="button"
                  onClick={() => handleCopyInviteLink(portalUser)}
                  disabled={generatingLinkForId === portalUser.contact_id}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Copy invite link"
                >
                  {generatingLinkForId === portalUser.contact_id ? (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  )}
                </button>
                {/* Status badge - clickable for non-active users to send/resend invite */}
                {/* For active users or accepted invites, show dropdown with reset password option */}
                {(portalUser.portal_last_login_at || portalUser.portal_invite_status === 'accepted') ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowUserMenuForId(showUserMenuForId === portalUser.contact_id ? null : portalUser.contact_id)}
                      className="group flex items-center"
                    >
                      {getStatusBadge(portalUser)}
                      <svg className="ml-1 w-3 h-3 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {/* Dropdown menu */}
                    {showUserMenuForId === portalUser.contact_id && (
                      <div className="absolute z-20 mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
                        <button
                          type="button"
                          onClick={() => handleSendPasswordReset(portalUser)}
                          disabled={sendingResetForId === portalUser.contact_id}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                          {sendingResetForId === portalUser.contact_id ? (
                            <>
                              <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Sending...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                              Send Password Reset
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {/* Success message */}
                    {resetSentForId === portalUser.contact_id && (
                      <div className="absolute z-20 mt-1 right-0 bg-green-50 border border-green-200 rounded-lg shadow-lg p-3 w-64">
                        <div className="flex items-center text-green-700">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm">Password reset email sent!</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openComposeModal(portalUser)}
                    disabled={sendingInviteForId === portalUser.contact_id}
                    className="group relative"
                    title={portalUser.portal_invite_status === 'pending' ? 'Resend invite' : 'Send invite'}
                  >
                    {sendingInviteForId === portalUser.contact_id ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </span>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                        portalUser.portal_invite_status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                          : portalUser.portal_invite_status === 'expired'
                          ? 'bg-red-100 text-red-800 hover:bg-red-200'
                          : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      }`}>
                        {portalUser.portal_invite_status === 'pending' ? 'Invite Pending' :
                         portalUser.portal_invite_status === 'expired' ? 'Invite Expired' : 'Not Invited'}
                        <svg className="ml-1 w-3 h-3 opacity-60 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </span>
                    )}
                  </button>
                )}
                {/* Show invite link popover */}
                {inviteLinkForId === portalUser.contact_id && inviteLink && (
                  <div className="absolute z-10 mt-1 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-green-600">
                        {linkCopied ? 'Link copied to clipboard!' : 'Invite link ready'}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setInviteLink(null); setInviteLinkForId(null); }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">Share this link via text, email, or any other method:</p>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={inviteLink}
                        readOnly
                        className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded bg-gray-50 truncate"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                      >
                        {linkCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
                {portalUser.portal_last_login_at && (
                  <span className="text-xs text-gray-400">
                    Last login: {formatDate(portalUser.portal_last_login_at)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRevokeAccess(portalUser.contact_id)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title="Revoke access"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Add Portal User</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddUser(false);
                  setSearchTerm('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Select a contact associated with this client to grant portal access.
            </p>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search contacts..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Contact List */}
            <div className="max-h-64 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {availableContacts.length === 0
                    ? 'No contacts available. Add contacts to this client first.'
                    : 'No contacts match your search.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleAddPortalUser(contact.id)}
                      disabled={addingContactId === contact.id}
                      className="w-full flex items-center justify-between p-3 text-left rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                        <p className="text-xs text-gray-500">{contact.email}</p>
                      </div>
                      {addingContactId === contact.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      ) : (
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddUser(false);
                  setSearchTerm('');
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compose Invite Email Modal */}
      {showComposeModal && composeForUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {composeForUser.portal_invite_status === 'pending' ? 'Resend' : 'Send'} Portal Invite
              </h3>
              <button
                type="button"
                onClick={closeComposeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* To field (read-only) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700">
                {composeForUser.contact_name} &lt;{composeForUser.contact_email}&gt;
              </div>
            </div>

            {/* Subject field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Message field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={emailMessage}
                onChange={e => setEmailMessage(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="Enter your message..."
              />
              <p className="mt-1 text-xs text-gray-500">
                The invite button and expiration notice will be added automatically below your message.
              </p>
            </div>

            {/* Note about CC */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> You will be CC'd on this email so you have a record of it being sent.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={closeComposeModal}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSendInvite(composeForUser, emailSubject, emailMessage)}
                disabled={!emailSubject.trim() || !emailMessage.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Invite
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
