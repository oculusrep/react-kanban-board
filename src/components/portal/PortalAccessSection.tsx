import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface Client {
  id: string;
  client_name: string;
}

interface ClientAccess {
  client_id: string;
  client_name: string;
  is_active: boolean;
}

interface PortalAccessSectionProps {
  contactId: string | null;
  contactEmail: string | null;
  portalAccessEnabled: boolean | null;
  portalInviteStatus: string | null;
  portalInviteSentAt: string | null;
  portalLastLoginAt: string | null;
  portalInviteExpiresAt: string | null;
  onFieldUpdate: (field: string, value: any) => void;
  isNewContact: boolean;
}

/**
 * PortalAccessSection - Admin UI for managing portal access on a contact record
 *
 * Features:
 * - Enable/disable portal access toggle
 * - Client access checkboxes
 * - Invite status display
 * - Send/resend invite button
 */
export default function PortalAccessSection({
  contactId,
  contactEmail,
  portalAccessEnabled,
  portalInviteStatus,
  portalInviteSentAt,
  portalLastLoginAt,
  portalInviteExpiresAt,
  onFieldUpdate,
  isNewContact,
}: PortalAccessSectionProps) {
  const { user } = useAuth();
  const [clientAccess, setClientAccess] = useState<ClientAccess[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load client access data
  useEffect(() => {
    async function loadClientAccess() {
      if (!contactId || isNewContact) return;

      setLoading(true);
      try {
        // Get contact's many-to-many client relationships (include parent_id for parent client lookup)
        const { data: relations, error: relError } = await supabase
          .from('contact_client_relation')
          .select('client_id, client:client_id(id, client_name, parent_id)')
          .eq('contact_id', contactId)
          .eq('is_active', true);

        if (relError) throw relError;

        // Also get contact's direct client_id (some contacts have this instead of relations)
        const { data: contactData, error: contactError } = await supabase
          .from('contact')
          .select('client_id, client:client_id(id, client_name, parent_id)')
          .eq('id', contactId)
          .single();

        if (contactError && contactError.code !== 'PGRST116') throw contactError;

        // Get explicit portal access grants
        const { data: accessGrants, error: accessError } = await supabase
          .from('portal_user_client_access')
          .select('client_id, is_active')
          .eq('contact_id', contactId);

        if (accessError) throw accessError;

        // Build access map
        const accessMap = new Map(
          (accessGrants || []).map(g => [g.client_id, g.is_active])
        );

        // Build list of all associated clients
        const clientsMap = new Map<string, ClientAccess>();
        const parentIdsToFetch: string[] = [];

        // Add many-to-many relations
        (relations || []).forEach(r => {
          const client = r.client as any;
          const clientId = client?.id || r.client_id;
          const clientName = client?.client_name || 'Unknown';
          if (clientId && !clientsMap.has(clientId)) {
            clientsMap.set(clientId, {
              client_id: clientId,
              client_name: clientName,
              is_active: accessMap.get(clientId) ?? false,
            });
            // Track parent clients to fetch
            if (client?.parent_id && !clientsMap.has(client.parent_id)) {
              parentIdsToFetch.push(client.parent_id);
            }
          }
        });

        // Add direct client_id if not already present
        if (contactData?.client_id && contactData.client) {
          const directClient = contactData.client as any;
          if (directClient?.id && !clientsMap.has(directClient.id)) {
            clientsMap.set(directClient.id, {
              client_id: directClient.id,
              client_name: directClient.client_name || 'Unknown',
              is_active: accessMap.get(directClient.id) ?? false,
            });
            // Track parent client to fetch
            if (directClient?.parent_id && !clientsMap.has(directClient.parent_id)) {
              parentIdsToFetch.push(directClient.parent_id);
            }
          }
        }

        // Fetch and add parent clients
        const uniqueParentIds = [...new Set(parentIdsToFetch)].filter(id => !clientsMap.has(id));
        if (uniqueParentIds.length > 0) {
          const { data: parentClients, error: parentError } = await supabase
            .from('client')
            .select('id, client_name')
            .in('id', uniqueParentIds);

          if (!parentError && parentClients) {
            parentClients.forEach(parent => {
              if (!clientsMap.has(parent.id)) {
                clientsMap.set(parent.id, {
                  client_id: parent.id,
                  client_name: parent.client_name + ' (Parent)',
                  is_active: accessMap.get(parent.id) ?? false,
                });
              }
            });
          }
        }

        setClientAccess(Array.from(clientsMap.values()));

        // Get all active clients for adding new access
        const { data: clients } = await supabase
          .from('client')
          .select('id, client_name')
          .eq('is_active_client', true)
          .order('client_name');

        setAvailableClients(clients || []);
      } catch (err) {
        console.error('Error loading client access:', err);
      } finally {
        setLoading(false);
      }
    }

    loadClientAccess();
  }, [contactId, isNewContact]);

  const handleToggleClientAccess = async (clientId: string, enabled: boolean) => {
    if (!contactId) return;

    try {
      if (enabled) {
        // Grant access
        const { error } = await supabase
          .from('portal_user_client_access')
          .upsert({
            contact_id: contactId,
            client_id: clientId,
            is_active: true,
            granted_by_id: user?.id,
            granted_at: new Date().toISOString(),
          });

        if (error) throw error;
      } else {
        // Revoke access
        const { error } = await supabase
          .from('portal_user_client_access')
          .update({ is_active: false })
          .eq('contact_id', contactId)
          .eq('client_id', clientId);

        if (error) throw error;
      }

      // Update local state
      setClientAccess(prev =>
        prev.map(ca =>
          ca.client_id === clientId ? { ...ca, is_active: enabled } : ca
        )
      );
    } catch (err) {
      console.error('Error updating client access:', err);
    }
  };

  const handleSendInvite = async () => {
    if (!contactId || !contactEmail) {
      setInviteError('Contact must have an email address to receive an invite');
      return;
    }

    setSendingInvite(true);
    setInviteError(null);
    setInviteSuccess(false);

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
        .eq('id', contactId);

      if (updateError) throw updateError;

      // Log the invite
      await supabase.from('portal_invite_log').insert({
        contact_id: contactId,
        invited_by_id: user?.id,
        invite_email: contactEmail,
        invite_token: token,
        status: 'sent',
        expires_at: expiresAt.toISOString(),
      });

      // Generate the invite link
      const link = `${window.location.origin}/portal/invite?token=${token}`;
      setInviteLink(link);

      // Try to send the email via edge function (if configured)
      try {
        const { error: emailError } = await supabase.functions.invoke('send-portal-invite', {
          body: {
            contactId,
            email: contactEmail,
            inviteLink: link,
            expiresAt: expiresAt.toISOString(),
          },
        });

        if (emailError) {
          console.log('Edge function not available, email not sent:', emailError);
          // Continue - the link is still available for manual copying
        }
      } catch (fnErr) {
        console.log('Edge function not configured, invite link available for manual copy');
      }

      // Update parent state
      onFieldUpdate('portal_invite_status', 'pending');
      onFieldUpdate('portal_invite_sent_at', new Date().toISOString());
      onFieldUpdate('portal_invite_expires_at', expiresAt.toISOString());

      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 5000);
    } catch (err) {
      console.error('Error sending invite:', err);
      setInviteError('Failed to send invite. Please try again.');
    } finally {
      setSendingInvite(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = () => {
    if (!portalAccessEnabled) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Disabled
        </span>
      );
    }

    switch (portalInviteStatus) {
      case 'accepted':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Invite Pending
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Invite Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Not Invited
          </span>
        );
    }
  };

  if (isNewContact) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2 mb-4">
          Portal Access
        </h3>
        <p className="text-sm text-gray-500">
          Save the contact first to configure portal access.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <h3 className="text-lg font-medium text-gray-900">
          Portal Access
        </h3>
        {getStatusBadge()}
      </div>

      {/* Enable Portal Access Toggle */}
      <div className="flex items-center justify-between py-2">
        <div>
          <label htmlFor="portal_access_enabled" className="text-sm font-medium text-gray-700">
            Enable Portal Access
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            Allow this contact to log into the client portal
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={portalAccessEnabled || false}
          onClick={() => onFieldUpdate('portal_access_enabled', !portalAccessEnabled)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            portalAccessEnabled ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              portalAccessEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {portalAccessEnabled && (
        <>
          {/* Client Access Checkboxes */}
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client Access
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Select which clients this contact can view in the portal
            </p>

            {loading ? (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Loading clients...</span>
              </div>
            ) : clientAccess.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No client relationships found. Add this contact to a client first.
              </p>
            ) : (
              <div className="space-y-2">
                {clientAccess.map((ca) => (
                  <label
                    key={ca.client_id}
                    className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={ca.is_active}
                      onChange={(e) => handleToggleClientAccess(ca.client_id, e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">{ca.client_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Portal Status Info */}
          <div className="border-t border-gray-200 pt-4">
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
              {portalInviteSentAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Invite Sent:</span>
                  <span className="text-gray-900">{formatDate(portalInviteSentAt)}</span>
                </div>
              )}
              {portalInviteExpiresAt && portalInviteStatus === 'pending' && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Invite Expires:</span>
                  <span className="text-gray-900">{formatDate(portalInviteExpiresAt)}</span>
                </div>
              )}
              {portalLastLoginAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Last Login:</span>
                  <span className="text-gray-900">{formatDate(portalLastLoginAt)}</span>
                </div>
              )}
              {!portalInviteSentAt && !portalLastLoginAt && (
                <p className="text-gray-500 italic">No portal activity yet</p>
              )}
            </div>
          </div>

          {/* Invite Actions */}
          <div className="border-t border-gray-200 pt-4">
            {inviteError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                Invite created successfully!
              </div>
            )}

            {/* Invite Link Copy Section */}
            {inviteLink && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                <label className="block text-xs font-medium text-blue-800 mb-1">
                  Invite Link (share with contact)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={inviteLink}
                    readOnly
                    className="flex-1 text-xs bg-white border border-blue-300 rounded px-2 py-1.5 text-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                  >
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-blue-600">
                  This link expires in 7 days. The contact will use it to set up their password.
                </p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleSendInvite}
                disabled={sendingInvite || !contactEmail}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingInvite ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : portalInviteStatus === 'pending' || portalInviteStatus === 'expired' ? (
                  'Resend Invite'
                ) : (
                  'Send Invite'
                )}
              </button>

              {portalInviteStatus === 'accepted' && (
                <span className="inline-flex items-center text-sm text-green-600">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  User has accepted invite
                </span>
              )}
            </div>

            {!contactEmail && (
              <p className="mt-2 text-xs text-amber-600">
                Contact must have an email address to receive an invite
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
