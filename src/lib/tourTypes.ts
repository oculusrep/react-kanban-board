// Tour feature types (Phase 1)
// Hand-written until `npm run schema` regenerates database-schema.ts against the
// applied tour migration (20260725170000_tour_schema.sql). Keep in sync with that migration.

export interface TourStopCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  default_stop_duration_minutes: number;
}

export interface TourDay {
  id: string;
  tour_id: string;
  day_number: number;
  day_date: string | null; // YYYY-MM-DD
  start_time: string | null; // HH:MM[:SS]
  end_time: string | null;
  // Optional non-site start/end (airport, hotel, office…). Geocoded in the app.
  start_location_address: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_location_address: string | null;
  end_latitude: number | null;
  end_longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Tour {
  id: string;
  client_id: string;
  tour_name: string;
  description: string | null;
  tour_date: string | null; // YYYY-MM-DD
  is_archived: boolean;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TourStop {
  id: string;
  tour_id: string;
  site_submit_id: string;
  tour_day_id: string | null; // null = unscheduled
  position: number; // order within its day (or the unscheduled bucket)
  category_id: string | null;
  stop_duration_minutes: number | null; // null = use category default
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// A tour_stop joined to the site submit it points at (for list/map rendering).
export interface TourStopWithSiteSubmit extends TourStop {
  site_submit: {
    id: string;
    site_submit_name: string | null;
    submit_stage_id: string | null;
    property_id: string | null;
  } | null;
  category: TourStopCategory | null;
}

// A tour with its ordered stop count (for the list page).
export interface TourWithStopCount extends Tour {
  stop_count: number;
}

// A stop flattened with its resolved map coordinate + effective duration (for the map).
export interface TourStopGeo {
  id: string;
  tour_day_id: string | null;
  position: number;
  site_submit_id: string;
  site_submit_name: string | null;
  category_id: string | null;
  category_name: string | null;
  effective_duration_minutes: number;
  lat: number | null;
  lng: number | null;
}
