-- Migration: Merchants map layer — manual brandfetch_domain corrections
-- Date: 2026-04-24
-- Spec: docs/MERCHANTS_LAYER_SPEC.md §5
-- Depends on: 20260423_merchants_seed_brands.sql
--
-- The initial Brandfetch auto-resolution (scripts/resolveBrandfetchDomains.ts)
-- left ~55 brands without a logo because either:
--   a) Brandfetch Search returned no results, or
--   b) The suggested domain failed the plausibility check (caught bad matches
--      like "Truist Bank -> diversityintechsummit.com" but also some legit
--      short domains like "TD Bank -> td.com").
--
-- This migration hardcodes correct domains for brands where we have high
-- confidence, then constructs Brandfetch CDN URLs the same way the TypeScript
-- script does.
--
-- The Brandfetch client_id is PUBLIC (appears in browser-visible CDN URLs),
-- so embedding it in migration SQL is safe — it's not a secret.
--
-- Brands not covered here remain with NULL brandfetch_domain; they'll render
-- with the Deep Midnight Blue letter-fallback pin until an admin sets a
-- domain via the admin UI (spec §7.2) or future SQL.


-- Helper CTE pattern: UPDATE from VALUES list joined by name.
-- logo_url is built with the same CDN URL template the script uses
-- so everything stays consistent.

UPDATE merchant_brand AS mb
SET
  brandfetch_domain = v.domain,
  logo_url = 'https://cdn.brandfetch.io/' || v.domain || '/w/128/h/128?c=1idJcjJ1MdO21x4knJH',
  logo_fetched_at = now(),
  updated_at = now()
FROM (VALUES
  -- Fast food / casual dining
  ('A&W',                              'awrestaurants.com'),
  ('BJ''s Restaurant & Brewery',       'bjsrestaurants.com'),
  ('Buffalo''s Southwest Cafe',        'buffaloscafe.com'),
  ('Burger King',                      'bk.com'),
  ('California Pizza Kitchen',         'cpk.com'),
  ('Captain D''s Seafood',             'captainds.com'),
  ('Coopers Hawk Winery & Restaurants','coopershawkwinery.com'),
  ('Dave and Busters',                 'daveandbusters.com'),
  ('Fleming''s',                       'flemingssteakhouse.com'),
  ('Fuzzys Taco Shop',                 'fuzzystacoshop.com'),
  ('Lazy Dog Bar & Restaurant',        'lazydogrestaurants.com'),
  ('Main Event Entertainment',         'mainevent.com'),
  ('McCormick & Schmick''s',           'mccormickandschmicks.com'),
  ('Miller''s Ale House',              'millersalehouse.com'),
  ('Old Chicago Pizza & Tap House',    'oldchicago.com'),
  ('Raising Canes',                    'raisingcanes.com'),
  ('Red Robin',                        'redrobin.com'),
  ('Schlotzsky''s Deli',               'schlotzskys.com'),
  ('Snooze Eatery',                    'snoozeeatery.com'),
  ('Sonnys BBQ',                       'sonnysbbq.com'),
  ('Torchys Tacos',                    'torchystacos.com'),
  ('Uncle Maddios Pizza Joint',        'unclemaddios.com'),

  -- Coffee / ice cream / bakery
  ('Andys Frozen Custard',             'andysfrozencustard.com'),
  ('Crumbl Cookies',                   'crumblcookies.com'),
  ('Jeremiahs Italian Ice',            'jeremiahsice.com'),

  -- Retail / discount / wholesale
  ('Bealls Outlet',                    'bealls.com'),
  ('BJ''s Wholesale',                  'bjs.com'),
  ('Burlington Coat Factory',          'burlington.com'),
  ('Ollies Bargain Outlet',            'ollies.us'),
  ('TJ Maxx',                          'tjmaxx.tjx.com'),
  ('Total Wine & More',                'totalwine.com'),

  -- Grocery
  ('IGA',                              'iga.com'),
  ('Lowe''s Food',                     'lowesfoods.com'),

  -- Banks
  ('AT&T',                             'att.com'),
  ('Chase Bank',                       'chase.com'),
  ('Fifth Third Bank',                 '53.com'),
  ('Flagstar Bank FSB',                'flagstar.com'),
  ('Pinnacle Financial Partners',      'pnfp.com'),
  ('Regions Bank',                     'regions.com'),
  ('Synovus Bank',                     'synovus.com'),
  ('TD Bank',                          'td.com'),
  ('Truist Bank',                      'truist.com'),
  ('United Community Bank',            'ucbi.com'),

  -- Sports / fitness / specialty
  ('Dick''s',                          'dickssportinggoods.com'),
  ('Hibbett Sports',                   'hibbett.com'),
  ('Regal',                            'regmovies.com'),

  -- Automotive / home improvement
  ('Discount Tire',                    'discounttire.com'),
  ('Harbor Freight Tools',             'harborfreight.com'),
  ('Mavis Discount Tire',              'mavistire.com'),
  ('NTB',                              'ntbtires.com'),
  ('Tractor Supply Company',           'tractorsupply.com'),

  -- Mattress / furniture / pet
  ('Goo-Goo Car Wash',                 'googoo3minutecarwash.com'),
  ('Mattress King',                    'mattresskingstores.com'),
  ('Original Mattress Factory',        'originalmattress.com'),
  ('Unleashed By Petco',               'petco.com'),

  -- Beauty / salon
  ('Regis Salon',                      'regissalons.com'),

  -- Sandwich / deli
  ('Lenny''s Sub Shop',                'lennys.com')

) AS v(name, domain)
WHERE mb.name = v.name;


-- Log how many rows were actually updated so the migration output shows progress.
DO $$
DECLARE
  resolved_count integer;
  remaining_count integer;
BEGIN
  SELECT COUNT(*) INTO resolved_count
  FROM merchant_brand WHERE brandfetch_domain IS NOT NULL;
  SELECT COUNT(*) INTO remaining_count
  FROM merchant_brand WHERE brandfetch_domain IS NULL;
  RAISE NOTICE 'Merchant logos: % resolved, % still needing manual domain', resolved_count, remaining_count;
END $$;
