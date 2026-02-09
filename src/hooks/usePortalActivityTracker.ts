import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

// Session ID persists across page views but resets on new browser session
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('portal_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('portal_session_id', sessionId);
  }
  return sessionId;
};

type EventType =
  | 'login'
  | 'logout'
  | 'page_view'
  | 'view_property'
  | 'view_site_submit'
  | 'download_document'
  | 'view_document'
  | 'search'
  | 'filter_change'
  | 'map_interaction';

interface TrackEventOptions {
  contactId?: string;
  clientId?: string;
  eventData?: Record<string, unknown>;
  pagePath?: string;
}

/**
 * Hook for tracking portal user activity
 *
 * Usage:
 * const { trackEvent, trackPageView } = usePortalActivityTracker();
 *
 * // Track a specific event
 * trackEvent('view_property', { eventData: { propertyId: '123' } });
 *
 * // Page views are tracked automatically when autoTrackPageViews is true
 */
export function usePortalActivityTracker(autoTrackPageViews = true) {
  const location = useLocation();
  const { user } = useAuth();
  const lastTrackedPath = useRef<string>('');

  const trackEvent = useCallback(
    async (eventType: EventType, options: TrackEventOptions = {}) => {
      try {
        const sessionId = getSessionId();

        const { error } = await supabase.rpc('log_portal_activity', {
          p_event_type: eventType,
          p_contact_id: options.contactId || null,
          p_event_data: options.eventData || {},
          p_page_path: options.pagePath || location.pathname,
          p_client_id: options.clientId || null,
          p_session_id: sessionId,
        });

        if (error) {
          console.error('Error tracking portal activity:', error);
        }
      } catch (err) {
        // Silently fail - don't let tracking errors affect user experience
        console.error('Error tracking portal activity:', err);
      }
    },
    [location.pathname]
  );

  const trackPageView = useCallback(
    (pagePath?: string) => {
      trackEvent('page_view', { pagePath: pagePath || location.pathname });
    },
    [trackEvent, location.pathname]
  );

  // Auto-track page views when location changes
  useEffect(() => {
    if (autoTrackPageViews && user && location.pathname.startsWith('/portal')) {
      // Avoid duplicate tracking for the same path
      if (lastTrackedPath.current !== location.pathname) {
        lastTrackedPath.current = location.pathname;
        trackPageView();
      }
    }
  }, [autoTrackPageViews, user, location.pathname, trackPageView]);

  return {
    trackEvent,
    trackPageView,
  };
}

/**
 * Track a login event - call this after successful authentication
 */
export async function trackPortalLogin(contactId?: string) {
  try {
    const sessionId = getSessionId();

    await supabase.rpc('log_portal_activity', {
      p_event_type: 'login',
      p_contact_id: contactId || null,
      p_event_data: {},
      p_page_path: '/portal/login',
      p_client_id: null,
      p_session_id: sessionId,
    });
  } catch (err) {
    console.error('Error tracking login:', err);
  }
}

/**
 * Track a logout event
 */
export async function trackPortalLogout(contactId?: string) {
  try {
    const sessionId = getSessionId();

    await supabase.rpc('log_portal_activity', {
      p_event_type: 'logout',
      p_contact_id: contactId || null,
      p_event_data: {},
      p_page_path: window.location.pathname,
      p_client_id: null,
      p_session_id: sessionId,
    });
  } catch (err) {
    console.error('Error tracking logout:', err);
  }
}

export default usePortalActivityTracker;
