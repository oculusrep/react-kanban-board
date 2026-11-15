-- research_location_estimate.before: the record's fields as they were before
-- the locate write-back (location_description, notes, parcel notes/ids,
-- parcel_fetch_status, lead_reason, pin), so any write-back can be undone exactly.
ALTER TABLE public.research_location_estimate ADD COLUMN before jsonb;
