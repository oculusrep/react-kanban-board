import { Database } from '../../database-schema';

// Row/Insert/Update aliases for the three Phase 3 tables.

export type GoogleCalendarConnection =
  Database['public']['Tables']['google_calendar_connection']['Row'];
export type GoogleCalendarConnectionInsert =
  Database['public']['Tables']['google_calendar_connection']['Insert'];
export type GoogleCalendarConnectionUpdate =
  Database['public']['Tables']['google_calendar_connection']['Update'];

export type GoogleCalendarSubscription =
  Database['public']['Tables']['google_calendar_subscription']['Row'];
export type GoogleCalendarSubscriptionInsert =
  Database['public']['Tables']['google_calendar_subscription']['Insert'];
export type GoogleCalendarSubscriptionUpdate =
  Database['public']['Tables']['google_calendar_subscription']['Update'];

export type ExternalCalendarEvent =
  Database['public']['Tables']['external_calendar_event']['Row'];
export type ExternalCalendarEventInsert =
  Database['public']['Tables']['external_calendar_event']['Insert'];

// String-literal narrowing for the CHECK-constrained status column.
export type ExternalCalendarEventStatus = 'confirmed' | 'tentative' | 'cancelled';

// One row representing a calendar offered by the user's Google account, as
// returned by Google's CalendarList API. Used by the settings page when the
// user picks which calendars to subscribe to. Not persisted on its own —
// becomes a google_calendar_subscription row when toggled on.
export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string | null;
}
