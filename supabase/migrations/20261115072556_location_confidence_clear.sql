-- EST. LOCATION describes a pin the locate step placed. When the pin is
-- replaced by any other source (a hand-dropped pin, a boundary, a precise
-- address geocode), the tag no longer describes it: clear it.
CREATE FUNCTION public.municipal_project_clear_location_confidence()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.centroid_source IS DISTINCT FROM 'research_locate' AND OLD.centroid_source = 'research_locate' THEN
    NEW.location_confidence := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.municipal_project_clear_location_confidence() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER municipal_project_clear_location_confidence BEFORE UPDATE OF centroid_source ON public.municipal_project
  FOR EACH ROW EXECUTE FUNCTION public.municipal_project_clear_location_confidence();
