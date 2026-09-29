-- Add Harris Teeter and Piggly Wiggly to the org-wide default favorite.
--
-- A merchant_favorite is an explicit brand list, so brands added to
-- merchant_brand after the favorite was built do not join it. OREP held 14 of
-- the 16 grocery brands — the missing two being exactly the ones added for
-- the Columbia market in 20260928185116. Running OREP into Columbia would
-- therefore have skipped the two brands added for Columbia.
--
-- OREP is the is_default favorite, auto-applied on every user's first
-- Merchants drawer open, so this changes what everyone sees on the map. That
-- is the intent: Mike chose this over running the two brands separately.
--
-- Keyed on is_default and on normalized_name rather than on uuids, so it is
-- reproducible in any environment.
--
-- Docs: docs/MERCHANT_FAVORITE_ORG_DEFAULT.md

INSERT INTO public.merchant_favorite_brand (favorite_id, brand_id)
SELECT f.id, b.id
FROM public.merchant_favorite f
CROSS JOIN public.merchant_brand b
WHERE f.is_default
  AND b.normalized_name IN ('harris teeter', 'piggly wiggly')
ON CONFLICT (favorite_id, brand_id) DO NOTHING;
