import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  setSubscriptionEnabled,
  triggerSyncNow,
  upsertSubscription,
  useCalendarSubscriptions,
  useGoogleCalendarConnection,
} from '../hooks/useGoogleCalendar';
import { GoogleCalendarOption } from '../types/calendar';

// Calendar Settings page (Phase 3 PR 4) at /settings/calendars.
//
// States:
//   - Not connected: "Connect Google Calendar" button (calls gcal-connect)
//   - Connected: connection email + Disconnect; list of available calendars
//     fetched on demand from gcal-list-calendars; per-calendar toggles
//     create / enable / disable google_calendar_subscription rows.
//
// Reflects ?status=success / ?status=error from the OAuth callback redirect.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

export const CalendarSettingsPage: React.FC = () => {
  const { userTableId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { connection, loading: connLoading, error: connError, refetch: refetchConnection } =
    useGoogleCalendarConnection(userTableId);
  const {
    subscriptions,
    loading: subsLoading,
    error: subsError,
    refetch: refetchSubs,
  } = useCalendarSubscriptions(connection?.id ?? null);

  const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);

  const [actioning, setActioning] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Surface OAuth callback result via URL params, then strip them.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    if (status === 'success') {
      setBanner({ kind: 'success', text: `Connected ${params.get('email') ?? 'Google Calendar'}.` });
      navigate(location.pathname, { replace: true });
      refetchConnection();
    } else if (status === 'error') {
      setBanner({ kind: 'error', text: `Connection failed: ${params.get('message') ?? 'unknown error'}` });
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate, refetchConnection]);

  // Fetch the list of available calendars from Google whenever the
  // connection is active. Refetches if the connection re-mounts.
  useEffect(() => {
    if (!connection?.is_active) {
      setCalendars([]);
      return;
    }
    let cancelled = false;
    setCalendarsLoading(true);
    setCalendarsError(null);
    supabase.functions
      .invoke('gcal-list-calendars', { body: {} })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setCalendarsError(error.message ?? 'Failed to list calendars');
          return;
        }
        const list = (data as { calendars?: GoogleCalendarOption[] } | null)?.calendars ?? [];
        setCalendars(list);
      })
      .finally(() => {
        if (!cancelled) setCalendarsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connection?.id, connection?.is_active]);

  const handleConnect = async () => {
    setActioning(true);
    setBanner(null);
    try {
      const { data, error } = await supabase.functions.invoke('gcal-connect', { body: {} });
      if (error) throw error;
      const authUrl = (data as { auth_url?: string } | null)?.auth_url;
      if (!authUrl) throw new Error('No auth_url returned');
      window.location.href = authUrl;
    } catch (err) {
      console.error(err);
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Connect failed',
      });
      setActioning(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Calendar? Pulled events will stop refreshing.')) return;
    setActioning(true);
    setBanner(null);
    try {
      const { error } = await supabase.functions.invoke('gcal-disconnect', { body: {} });
      if (error) throw error;
      setBanner({ kind: 'success', text: 'Disconnected.' });
      refetchConnection();
      refetchSubs();
    } catch (err) {
      console.error(err);
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Disconnect failed',
      });
    } finally {
      setActioning(false);
    }
  };

  const handleToggleCalendar = async (cal: GoogleCalendarOption, currentlyEnabled: boolean) => {
    if (!connection) return;
    const existing = subscriptions.find((s) => s.google_calendar_id === cal.id);
    try {
      if (existing) {
        await setSubscriptionEnabled(existing.id, !currentlyEnabled);
      } else {
        // First-time subscribe: create with enabled=true.
        await upsertSubscription({
          connection_id: connection.id,
          google_calendar_id: cal.id,
          display_name: cal.summary,
          color_hex: cal.backgroundColor ?? null,
          enabled: true,
        });
      }
      refetchSubs();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Toggle failed');
    }
  };

  const handleSyncNow = async () => {
    if (!userTableId) return;
    setSyncing(true);
    try {
      await triggerSyncNow(userTableId);
      setBanner({ kind: 'success', text: 'Sync triggered.' });
      refetchConnection();
    } catch (err) {
      console.error(err);
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Sync failed',
      });
    } finally {
      setSyncing(false);
    }
  };

  const subscriptionByCalendarId = new Map(
    subscriptions.map((s) => [s.google_calendar_id, s])
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-2xl font-bold mb-2" style={{ color: COLORS.midnight }}>
          Calendars
        </h1>
        <p className="text-sm mb-5" style={{ color: COLORS.steel }}>
          Connect your Google account and pick which calendars feed the dashboard.
          Pull-only — OVIS never writes back to Google.
        </p>

        {banner && (
          <div
            className="mb-4 p-3 rounded text-sm"
            style={
              banner.kind === 'success'
                ? { backgroundColor: '#dcfce7', color: '#166534' }
                : { backgroundColor: '#fff5ec', color: COLORS.warning }
            }
          >
            {banner.text}
          </div>
        )}

        {connLoading ? (
          <div className="text-sm" style={{ color: COLORS.slate }}>
            Loading…
          </div>
        ) : connError ? (
          <div
            className="p-3 rounded text-sm"
            style={{ backgroundColor: '#fff5ec', color: COLORS.warning }}
          >
            {connError}
          </div>
        ) : !connection || !connection.is_active ? (
          <div
            className="bg-white rounded-lg p-5 border"
            style={{ borderColor: COLORS.slate + '66' }}
          >
            <p className="text-sm mb-3" style={{ color: COLORS.steel }}>
              No Google Calendar connected.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={actioning}
              className="text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50"
              style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
            >
              {actioning ? 'Opening Google…' : 'Connect Google Calendar'}
            </button>
          </div>
        ) : (
          <>
            <div
              className="bg-white rounded-lg p-4 mb-4 border"
              style={{ borderColor: COLORS.slate + '66' }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium" style={{ color: COLORS.midnight }}>
                    Connected as {connection.google_email}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: COLORS.slate }}>
                    Last sync:{' '}
                    {connection.last_sync_at
                      ? new Date(connection.last_sync_at).toLocaleString()
                      : 'never'}
                    {connection.sync_error && (
                      <span style={{ color: COLORS.warning }}> · last error: {connection.sync_error}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={syncing}
                    className="text-xs font-medium px-2.5 py-1.5 rounded border disabled:opacity-50"
                    style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                  >
                    {syncing ? 'Syncing…' : '↻ Sync now'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={actioning}
                    className="text-xs font-medium px-2.5 py-1.5 rounded border disabled:opacity-50"
                    style={{ borderColor: COLORS.slate, color: COLORS.warning }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            </div>

            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.steel }}>
              Calendars
            </h2>
            {calendarsError && (
              <div
                className="p-3 rounded text-sm mb-2"
                style={{ backgroundColor: '#fff5ec', color: COLORS.warning }}
              >
                {calendarsError}
              </div>
            )}
            {(calendarsLoading || subsLoading) && (
              <div className="text-sm" style={{ color: COLORS.slate }}>
                Loading calendars…
              </div>
            )}
            {!calendarsLoading && calendars.length === 0 && !calendarsError && (
              <div className="text-sm italic" style={{ color: COLORS.slate }}>
                No calendars returned.
              </div>
            )}
            {!calendarsLoading && calendars.length > 0 && (
              <div
                className="bg-white rounded-lg border overflow-hidden"
                style={{ borderColor: COLORS.slate + '66' }}
              >
                {calendars.map((cal) => {
                  const sub = subscriptionByCalendarId.get(cal.id);
                  const enabled = sub?.enabled === true;
                  return (
                    <div
                      key={cal.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0"
                      style={{ borderColor: COLORS.slate + '22' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {cal.backgroundColor && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cal.backgroundColor }}
                          />
                        )}
                        <span className="text-sm truncate" style={{ color: COLORS.midnight }}>
                          {cal.summary}
                          {cal.primary && (
                            <span
                              className="text-[10px] uppercase tracking-wide ml-2 px-1 py-0.5 rounded"
                              style={{ backgroundColor: COLORS.slate + '22', color: COLORS.steel }}
                            >
                              primary
                            </span>
                          )}
                        </span>
                      </div>
                      <label className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.steel }}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => handleToggleCalendar(cal, enabled)}
                        />
                        {enabled ? 'Subscribed' : 'Subscribe'}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
            {subsError && (
              <div
                className="mt-2 p-3 rounded text-sm"
                style={{ backgroundColor: '#fff5ec', color: COLORS.warning }}
              >
                {subsError}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CalendarSettingsPage;
