-- duplicate_tour: copy a tour with its days and stops into a new, unarchived tour.
-- SECURITY INVOKER — RLS on tour/tour_day/tour_stop decides who can read the
-- source and write the copy (internal users only today).
-- Live-day state (tour_stop.actual_departure_at) is not copied.

CREATE OR REPLACE FUNCTION public.duplicate_tour(p_tour_id uuid, p_tour_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_src     public.tour%ROWTYPE;
  v_new_id  uuid;
BEGIN
  SELECT * INTO v_src FROM public.tour WHERE id = p_tour_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tour % not found', p_tour_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.tour (client_id, tour_name, description, tour_date, is_archived, created_by_id)
  VALUES (
    v_src.client_id,
    COALESCE(NULLIF(btrim(p_tour_name), ''), 'Copy of ' || v_src.tour_name),
    v_src.description,
    v_src.tour_date,
    false,
    auth.uid()
  )
  RETURNING id INTO v_new_id;

  CREATE TEMP TABLE _tour_day_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;

  WITH src AS (
    SELECT d.*, gen_random_uuid() AS new_id FROM public.tour_day d WHERE d.tour_id = p_tour_id
  ), ins AS (
    INSERT INTO public.tour_day (id, tour_id, day_number, day_date, start_time, end_time,
      start_location_address, start_latitude, start_longitude,
      end_location_address, end_latitude, end_longitude)
    SELECT new_id, v_new_id, day_number, day_date, start_time, end_time,
      start_location_address, start_latitude, start_longitude,
      end_location_address, end_latitude, end_longitude
    FROM src
    RETURNING id
  )
  INSERT INTO _tour_day_map (old_id, new_id)
  SELECT src.id, src.new_id FROM src JOIN ins ON ins.id = src.new_id;

  INSERT INTO public.tour_stop (tour_id, stop_kind, site_submit_id, tour_day_id, position,
    category_id, stop_duration_minutes, display_label, approach_waypoints_override, notes,
    store_number, stop_name, address, city, latitude, longitude, market,
    projected_opening, status_override)
  SELECT v_new_id, s.stop_kind, s.site_submit_id, m.new_id, s.position,
    s.category_id, s.stop_duration_minutes, s.display_label, s.approach_waypoints_override, s.notes,
    s.store_number, s.stop_name, s.address, s.city, s.latitude, s.longitude, s.market,
    s.projected_opening, s.status_override
  FROM public.tour_stop s
  LEFT JOIN _tour_day_map m ON m.old_id = s.tour_day_id
  WHERE s.tour_id = p_tour_id;

  DROP TABLE _tour_day_map;
  RETURN v_new_id;
END;
$$;

-- Grants: authenticated only.
REVOKE ALL ON FUNCTION public.duplicate_tour(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_tour(uuid, text) TO authenticated;
