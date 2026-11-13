-- Two grocery brands with real Columbia SC presence that the Georgia-era
-- master list never needed: Harris Teeter and Piggly Wiggly.
--
-- Added BEFORE the first Columbia ingestion so they are picked up by that run
-- rather than needing a second pass.
--
-- Both Brandfetch domains were verified against the CDN with browser-like
-- headers on 2026-09-28 — 2,380 and 4,068 bytes respectively, well clear of
-- the 338-byte placeholder that means "Brandfetch has nothing". The daily
-- merchant-logo-refresh cron will re-verify and keep the licence alive;
-- logo_fetched_at is stamped now so the cron treats them as fresh and does
-- not immediately re-fetch.
--
-- Caveat for whoever reviews the first Columbia results: Piggly Wiggly is
-- heavily franchised and its Places listings are inconsistent ("Piggly
-- Wiggly", "Pig", operator names). If it comes back near-empty after the
-- name-match filter, set places_display_name rather than assuming no stores.
--
-- Docs: docs/MERCHANTS_COLUMBIA_SC_EXPANSION.md

INSERT INTO public.merchant_brand (
  name,
  normalized_name,
  category_id,
  brandfetch_domain,
  logo_url,
  logo_variant,
  logo_fetched_at,
  is_active
)
SELECT
  v.name,
  v.normalized_name,
  c.id,
  v.domain,
  'https://cdn.brandfetch.io/' || v.domain || '/w/128/h/128?c=1idJcjJ1MdO21x4knJH',
  'auto',
  now(),
  true
FROM (VALUES
  ('Harris Teeter',  'harris teeter',  'harristeeter.com'),
  ('Piggly Wiggly',  'piggly wiggly',  'pigglywiggly.com')
) AS v(name, normalized_name, domain)
-- Look the category up by name rather than hardcoding its uuid, so this
-- migration is reproducible against any environment.
CROSS JOIN LATERAL (
  SELECT id FROM public.merchant_category WHERE name = 'Grocery Stores'
) c
ON CONFLICT (normalized_name) DO NOTHING;
