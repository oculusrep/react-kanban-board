-- Close the last path by which a portal user (client) could read prospecting
-- data: v_prospecting_daily_metrics. Decision 2026-09-28 - portal users must not
-- see prospecting lists at all.
--
-- 20260928170000 locked the prospecting tables, but this view is SECURITY DEFINER
-- (runs as its owner), so RLS on its base tables never applies to the caller and
-- it kept returning all 121 rows to every logged-in account, portal included.
--
-- Turning on security_invoker is the wrong fix HERE. The view blends two sources:
-- prospecting_activity (internal users may read all rows) and activity
-- (owner-scoped - admin sees all, others only their own). Under security_invoker
-- a broker would get complete prospecting_activity totals but only their own
-- activity totals, i.e. a silently half-populated scorecard. Denying outright is
-- better than reporting wrong numbers.
--
-- So the guard goes inside the view instead: is_internal_user() is SECURITY
-- DEFINER and resolves the CALLER, giving internal users the full view unchanged
-- and portal/coach an empty one.
--
-- Definition below was pulled from the live database with pg_get_viewdef, not
-- rebuilt from an older migration (CLAUDE.md), with only the AND added.

BEGIN;

CREATE OR REPLACE VIEW public.v_prospecting_daily_metrics AS
WITH daily_prospecting_activities AS (
         SELECT COALESCE(pa_1.activity_date, date((pa_1.created_at AT TIME ZONE 'America/New_York'::text))) AS activity_date,
            pa_1.created_by AS user_id,
            count(*) FILTER (WHERE pa_1.activity_type = 'email'::text) AS emails,
            count(*) FILTER (WHERE pa_1.activity_type = 'linkedin'::text) AS linkedin,
            count(*) FILTER (WHERE pa_1.activity_type = 'sms'::text) AS sms,
            count(*) FILTER (WHERE pa_1.activity_type = 'voicemail'::text) AS voicemail,
            count(*) FILTER (WHERE pa_1.activity_type = 'call'::text) AS calls,
            count(*) FILTER (WHERE pa_1.activity_type = 'meeting'::text) AS meetings,
            count(*) FILTER (WHERE pa_1.activity_type = 'email_response'::text) AS email_responses,
            count(*) FILTER (WHERE pa_1.activity_type = 'linkedin_response'::text) AS linkedin_responses,
            count(*) FILTER (WHERE pa_1.activity_type = 'sms_response'::text) AS sms_responses,
            count(*) FILTER (WHERE pa_1.activity_type = 'return_call'::text) AS return_calls,
            count(DISTINCT COALESCE(pa_1.contact_id::text, pa_1.target_id::text)) AS contacts_touched
           FROM prospecting_activity pa_1
          GROUP BY (COALESCE(pa_1.activity_date, date((pa_1.created_at AT TIME ZONE 'America/New_York'::text)))), pa_1.created_by
        ), daily_activity_table AS (
         SELECT a.activity_date,
            COALESCE(a.user_id, a.owner_id) AS user_id,
            count(*) FILTER (WHERE atype.name::text = 'Email'::text AND a.is_prospecting_call = true) AS emails,
            count(*) FILTER (WHERE atype.name::text = 'LinkedIn Message'::text AND a.is_prospecting_call = true) AS linkedin,
            count(*) FILTER (WHERE atype.name::text = 'SMS'::text AND a.is_prospecting_call = true) AS sms,
            count(*) FILTER (WHERE atype.name::text = 'Voicemail'::text AND a.is_prospecting_call = true) AS voicemail,
            count(*) FILTER (WHERE atype.name::text = 'Call'::text AND a.completed_call = true) AS calls,
            count(*) FILTER (WHERE atype.name::text = 'Meeting'::text) AS meetings,
            0::bigint AS email_responses,
            0::bigint AS linkedin_responses,
            0::bigint AS sms_responses,
            0::bigint AS return_calls,
            count(DISTINCT a.contact_id) FILTER (WHERE a.is_prospecting_call = true OR a.completed_call = true OR atype.name::text = 'Meeting'::text) AS contacts_touched
           FROM activity a
             LEFT JOIN activity_type atype ON a.activity_type_id = atype.id
          WHERE a.is_prospecting_call = true OR a.completed_call = true OR atype.name::text = 'Meeting'::text
          GROUP BY a.activity_date, (COALESCE(a.user_id, a.owner_id))
        )
 SELECT COALESCE(pa.activity_date, dat.activity_date) AS activity_date,
    COALESCE(pa.user_id, dat.user_id) AS user_id,
    COALESCE(pa.emails, 0::bigint) + COALESCE(dat.emails, 0::bigint) AS emails,
    COALESCE(pa.linkedin, 0::bigint) + COALESCE(dat.linkedin, 0::bigint) AS linkedin,
    COALESCE(pa.sms, 0::bigint) + COALESCE(dat.sms, 0::bigint) AS sms,
    COALESCE(pa.voicemail, 0::bigint) + COALESCE(dat.voicemail, 0::bigint) AS voicemail,
    COALESCE(pa.calls, 0::bigint) + COALESCE(dat.calls, 0::bigint) AS calls,
    COALESCE(pa.meetings, 0::bigint) + COALESCE(dat.meetings, 0::bigint) AS meetings,
    COALESCE(pa.email_responses, 0::bigint) AS email_responses,
    COALESCE(pa.linkedin_responses, 0::bigint) AS linkedin_responses,
    COALESCE(pa.sms_responses, 0::bigint) AS sms_responses,
    COALESCE(pa.return_calls, 0::bigint) AS return_calls,
    COALESCE(pa.emails, 0::bigint) + COALESCE(dat.emails, 0::bigint) + COALESCE(pa.linkedin, 0::bigint) + COALESCE(dat.linkedin, 0::bigint) + COALESCE(pa.sms, 0::bigint) + COALESCE(dat.sms, 0::bigint) + COALESCE(pa.voicemail, 0::bigint) + COALESCE(dat.voicemail, 0::bigint) AS total_outreach,
    COALESCE(pa.calls, 0::bigint) + COALESCE(dat.calls, 0::bigint) + COALESCE(pa.meetings, 0::bigint) + COALESCE(dat.meetings, 0::bigint) + COALESCE(pa.email_responses, 0::bigint) + COALESCE(pa.linkedin_responses, 0::bigint) + COALESCE(pa.sms_responses, 0::bigint) + COALESCE(pa.return_calls, 0::bigint) AS total_connections,
    COALESCE(pa.contacts_touched, 0::bigint) + COALESCE(dat.contacts_touched, 0::bigint) AS contacts_touched
   FROM daily_prospecting_activities pa
     FULL JOIN daily_activity_table dat ON pa.activity_date = dat.activity_date AND pa.user_id = dat.user_id
  WHERE COALESCE(pa.activity_date, dat.activity_date) IS NOT NULL
    AND is_internal_user();

COMMIT;

-- Expected after this: admin/broker_full/va 121 rows (unchanged), coach 0,
-- portal 0. Verify by impersonation, not by reading the definition.
