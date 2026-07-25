// Tour feature types (Phase 1)
// Hand-written until `npm run schema` regenerates database-schema.ts against the
// applied tour migration (20260725170000_tour_schema.sql). Keep in sync with that migration.

export interface TourStopCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
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
  position: number;
  category_id: string | null;
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
