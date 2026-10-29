-- Intel "Look up in my email": prefill Create contact from the person's
-- signature in the caller's OWN stored Gmail.
-- Docs: docs/INTEL_EMAIL_SIGNATURE_PREFILL_PLAN.md
--
-- Two controls, both here so the edge function can't get them wrong:
--
-- 1. WHO may use it: internal users listed in
--    app_settings.intel_email_lookup_user_ids (a JSON array of "user".id).
--    Starts as Mike only. Turn it on for someone else by adding their user.id
--    to the array; no code change or deploy.
--
-- 2. WHOSE MAIL it reads: only the caller's. Every mailbox query joins
--    email_visibility -> "user" on auth_user_id = auth.uid(). The emails RLS
--    policy is NOT relied on for this: it also lets any internal user read an
--    email linked to a CRM object (email_object_link) from SOMEONE ELSE'S
--    mailbox, which is exactly what this feature must not do.
--
-- The mailbox functions are SECURITY INVOKER, so RLS still applies on top of
-- the explicit filter. Only the gate is SECURITY DEFINER, because app_settings
-- is admin-read-only.

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'intel_email_lookup_user_ids',
  '["fe6e516f-11e1-4a3b-b914-910d59d9e8df"]'::jsonb,
  'JSON array of "user".id values allowed to use Intel''s "Look up in my email" (reads only the caller''s own Gmail). Must also be an internal user.'
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intel_email_lookup_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_internal_user() AND EXISTS (
    SELECT 1
    FROM public."user" u
    JOIN public.app_settings s ON s.key = 'intel_email_lookup_user_ids'
    WHERE u.auth_user_id = auth.uid()
      AND jsonb_typeof(s.value) = 'array'
      AND s.value ? u.id::text
  );
$$;

-- ---------------------------------------------------------------------------
-- Name matching
-- ---------------------------------------------------------------------------
-- Lowercase, punctuation to spaces, whitespace collapsed. "Rutledge, Paul"
-- (one word before the comma) is flipped to "paul rutledge"; "Paul Rutledge,
-- CCIM" (a suffix after the comma) keeps only the part before it.
CREATE OR REPLACE FUNCTION public.intel_normalize_person_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(lower(
    CASE
      WHEN p_name ~ '^\s*[^,\s]+\s*,\s*[^,]+$'
        THEN split_part(p_name, ',', 2) || ' ' || split_part(p_name, ',', 1)
      WHEN p_name LIKE '%,%' THEN split_part(p_name, ',', 1)
      ELSE coalesce(p_name, '')
    END
  ), '[^a-z0-9 ]+', ' ', 'g'), '\s+', ' ', 'g')), '');
$$;

-- ---------------------------------------------------------------------------
-- Candidate senders in the caller's mailbox (last 12 months, inbound)
-- ---------------------------------------------------------------------------
-- p_email given: exact address match. Otherwise first AND last name tokens must
-- match, so "Paul R. Rutledge" is found for "Paul Rutledge" but "Paul" alone or
-- a nickname is not. Excludes our own domain and the caller's own address.
CREATE OR REPLACE FUNCTION public.intel_mailbox_senders(p_name text, p_email text DEFAULT NULL)
RETURNS TABLE (sender_email text, sender_name text, last_received_at timestamptz, email_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_name  text := public.intel_normalize_person_name(p_name);
  v_first text := split_part(v_name, ' ', 1);
  v_last  text := regexp_replace(v_name, '^.* ', '');
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF NOT public.intel_email_lookup_allowed() THEN
    RAISE EXCEPTION 'email lookup is not enabled for this user' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' AND (v_name IS NULL OR v_name NOT LIKE '% %') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT lower(e.sender_email)::text AS addr,
           e.sender_name::text AS display_name,
           e.received_at,
           public.intel_normalize_person_name(e.sender_name) AS norm
    FROM public.emails e
    JOIN public.email_visibility v ON v.email_id = e.id
    JOIN public."user" u ON u.id = v.user_id
    WHERE u.auth_user_id = auth.uid()
      AND e.direction = 'INBOUND'
      AND e.received_at >= now() - interval '12 months'
      AND e.sender_email NOT ILIKE '%@oculusrep.com'
      AND lower(e.sender_email) NOT IN (
        SELECT lower(g.google_email) FROM public.gmail_connection g WHERE g.user_id = u.id
      )
  )
  SELECT m.addr,
         (array_agg(m.display_name ORDER BY m.received_at DESC))[1],
         max(m.received_at),
         count(*)
  FROM mine m
  WHERE CASE
          WHEN v_email <> '' THEN m.addr = v_email
          ELSE m.norm LIKE '% %'
               AND split_part(m.norm, ' ', 1) = v_first
               AND regexp_replace(m.norm, '^.* ', '') = v_last
        END
  GROUP BY m.addr
  ORDER BY max(m.received_at) DESC
  LIMIT 10;
END;
$$;

-- ---------------------------------------------------------------------------
-- One sender's emails in the caller's mailbox, newest first (last 12 months)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intel_mailbox_emails_from(
  p_sender_email text,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  received_at timestamptz,
  sender_email text,
  sender_name text,
  subject text,
  body_text text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.intel_email_lookup_allowed() THEN
    RAISE EXCEPTION 'email lookup is not enabled for this user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.received_at, e.sender_email::text, e.sender_name::text, e.subject, e.body_text
  FROM public.emails e
  JOIN public.email_visibility v ON v.email_id = e.id
  JOIN public."user" u ON u.id = v.user_id
  WHERE u.auth_user_id = auth.uid()
    AND e.direction = 'INBOUND'
    AND e.received_at >= now() - interval '12 months'
    AND lower(e.sender_email) = lower(btrim(p_sender_email))
  ORDER BY e.received_at DESC
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Our own people's emails and phones, so a lookup never prefills them
-- ---------------------------------------------------------------------------
-- Automated mail (QuickBooks invoices, hotel bookings, helpdesk threads) prints
-- OUR details as the customer's with no quote marker to strip; measured on
-- 1,500 of Mike's inbound emails, 11 still held his mobile after stripping,
-- all of them automated mail. The edge function drops any detail that matches
-- one of these.
CREATE OR REPLACE FUNCTION public.intel_internal_contact_points()
RETURNS TABLE (kind text, value text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.intel_email_lookup_allowed() THEN
    RAISE EXCEPTION 'email lookup is not enabled for this user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 'email'::text, lower(btrim(u.email))
  FROM public."user" u
  WHERE u.ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va') AND coalesce(btrim(u.email), '') <> ''
  UNION
  SELECT 'email'::text, lower(btrim(g.google_email)) FROM public.gmail_connection g
  UNION
  SELECT 'phone'::text, regexp_replace(u.mobile_phone, '\D', '', 'g')
  FROM public."user" u
  WHERE u.ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va')
    AND length(regexp_replace(coalesce(u.mobile_phone, ''), '\D', '', 'g')) >= 7;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only. PUBLIC too, not just anon — anon inherits
-- EXECUTE through PUBLIC.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.intel_email_lookup_allowed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intel_normalize_person_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intel_mailbox_senders(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intel_mailbox_emails_from(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.intel_internal_contact_points() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.intel_email_lookup_allowed() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intel_normalize_person_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intel_mailbox_senders(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intel_mailbox_emails_from(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intel_internal_contact_points() TO authenticated, service_role;
