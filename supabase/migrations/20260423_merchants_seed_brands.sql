-- Migration: Merchants map layer — seed data (categories + brands)
-- Date: 2026-04-23
-- Spec: docs/MERCHANTS_LAYER_SPEC.md §12
-- Depends on: 20260422_merchants_map_layer_tables.sql
--
-- Seeds the merchant_category and merchant_brand master tables with the
-- initial 35 categories and ~415 brands provided by the user.
--
-- Cleanups applied (confirmed in interview 2026-04-22):
--   - Trim all whitespace on category and brand names.
--   - Normalize curly apostrophes to straight ASCII.
--   - Merge 'Fitness' + 'Fitness ' (trailing space) into single category.
--   - Drop singleton 'Pizza' category; move 'Old Chicago Pizza & Tap House' into 'Restaurant Pizza'.
--   - Fix typo 'Funiture Household' -> 'Furniture Household'.
--   - Merge 'ALDI' + 'Aldi' into single 'ALDI' brand (enforced by normalized_name UNIQUE).
--   - Merge 'Wal-Mart' + 'Wal-Mart Supercenter' into single 'Wal-Mart' brand.
--   - Drop 'Family Dollar | Dollar Tree' combo entry (keep Family Dollar and Dollar Tree separate).
--     Combo-store handling deferred to Phase 2 per spec §14.
--
-- Idempotent: uses ON CONFLICT DO NOTHING on unique columns so re-running
-- is safe (but re-running will not update existing rows either).


-- ============================================================================
-- 1. Categories (35 total, alphabetical, display_order in steps of 100)
-- ============================================================================

INSERT INTO merchant_category (name, display_order) VALUES
  ('Auto Parts Tires',          100),
  ('Banks',                     200),
  ('Book Stores',               300),
  ('Car Washes',                400),
  ('Clothing Apparel',          500),
  ('Computers Electronic',      600),
  ('Craft Fabric Stores',       700),
  ('Dental',                    800),
  ('Department Stores',         900),
  ('Discount Department Stores', 1000),
  ('Dollar Stores',             1100),
  ('Drug Stores',               1200),
  ('Entertainment',             1300),
  ('Eyewear',                   1400),
  ('Fitness',                   1500),
  ('Furniture Household',       1600),
  ('Grocery Stores',            1700),
  ('Health Beauty',             1800),
  ('Home Improvement',          1900),
  ('Massage',                   2000),
  ('Mattress',                  2100),
  ('Office Supply',             2200),
  ('Pet Stores',                2300),
  ('Restaurant Bakery Bagels',  2400),
  ('Restaurant Casual',         2500),
  ('Restaurant Coffee Donuts',  2600),
  ('Restaurant Fastfood Major', 2700),
  ('Restaurant Ice Cream Smoothie', 2800),
  ('Restaurant Pizza',          2900),
  ('Restaurant Sandwich',       3000),
  ('Shoes Footwear',            3100),
  ('Specialty',                 3200),
  ('Sporting Goods',            3300),
  ('Wholesale',                 3400),
  ('Wireless Stores',           3500)
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- 2. Brands (~415 total)
--
-- Pattern: VALUES list with (brand_name, normalized_name, category_name)
-- joined to merchant_category on category_name. Keeps the data tabular
-- without repeating category subqueries per row.
--
-- normalized_name = LOWER(TRIM(brand_name)) for stable dedup.
-- ============================================================================

INSERT INTO merchant_brand (name, normalized_name, category_id)
SELECT v.name, v.normalized_name, c.id
FROM (VALUES
  -- Auto Parts Tires (18)
  ('Advance Auto Parts',                'advance auto parts',                'Auto Parts Tires'),
  ('AutoZone',                          'autozone',                          'Auto Parts Tires'),
  ('Discount Tire',                     'discount tire',                     'Auto Parts Tires'),
  ('Express Oil Change',                'express oil change',                'Auto Parts Tires'),
  ('Firestone',                         'firestone',                         'Auto Parts Tires'),
  ('Goodyear',                          'goodyear',                          'Auto Parts Tires'),
  ('Grease Monkey',                     'grease monkey',                     'Auto Parts Tires'),
  ('Honest-1',                          'honest-1',                          'Auto Parts Tires'),
  ('Jiffy Lube',                        'jiffy lube',                        'Auto Parts Tires'),
  ('Mavis Discount Tire',               'mavis discount tire',               'Auto Parts Tires'),
  ('NTB',                               'ntb',                               'Auto Parts Tires'),
  ('O''Reilly',                         'o''reilly',                         'Auto Parts Tires'),
  ('Pep Boys',                          'pep boys',                          'Auto Parts Tires'),
  ('SpeeDee Oil Change',                'speedee oil change',                'Auto Parts Tires'),
  ('Take 5 Oil Change',                 'take 5 oil change',                 'Auto Parts Tires'),
  ('Tire Discounters',                  'tire discounters',                  'Auto Parts Tires'),
  ('Tires Plus',                        'tires plus',                        'Auto Parts Tires'),
  ('Valvoline Instant Oil Change',      'valvoline instant oil change',      'Auto Parts Tires'),

  -- Banks (17)
  ('Ameris Bank',                       'ameris bank',                       'Banks'),
  ('Bank of America',                   'bank of america',                   'Banks'),
  ('Chase Bank',                        'chase bank',                        'Banks'),
  ('Citizens Bank',                     'citizens bank',                     'Banks'),
  ('Fifth Third Bank',                  'fifth third bank',                  'Banks'),
  ('First Community Bank',              'first community bank',              'Banks'),
  ('Flagstar Bank FSB',                 'flagstar bank fsb',                 'Banks'),
  ('Pinnacle Bank',                     'pinnacle bank',                     'Banks'),
  ('Pinnacle Financial Partners',       'pinnacle financial partners',       'Banks'),
  ('PNC Bank',                          'pnc bank',                          'Banks'),
  ('Regions Bank',                      'regions bank',                      'Banks'),
  ('Renasant Bank',                     'renasant bank',                     'Banks'),
  ('Synovus Bank',                      'synovus bank',                      'Banks'),
  ('TD Bank',                           'td bank',                           'Banks'),
  ('Truist Bank',                       'truist bank',                       'Banks'),
  ('United Community Bank',             'united community bank',             'Banks'),
  ('Wells Fargo',                       'wells fargo',                       'Banks'),

  -- Book Stores (2)
  ('Barnes & Noble',                    'barnes & noble',                    'Book Stores'),
  ('Books-A-Million',                   'books-a-million',                   'Book Stores'),

  -- Car Washes (6)
  ('Goo-Goo Car Wash',                  'goo-goo car wash',                  'Car Washes'),
  ('Mister Car Wash',                   'mister car wash',                   'Car Washes'),
  ('Take 5 Car Wash',                   'take 5 car wash',                   'Car Washes'),
  ('Tidal Wave Auto Spa',               'tidal wave auto spa',               'Car Washes'),
  ('Tommy''s Express Car Wash',         'tommy''s express car wash',         'Car Washes'),
  ('Zips Car Wash',                     'zips car wash',                     'Car Washes'),

  -- Clothing Apparel (2)
  ('Athleta',                           'athleta',                           'Clothing Apparel'),
  ('Lululemon',                         'lululemon',                         'Clothing Apparel'),

  -- Computers Electronic (2)
  ('Apple Store',                       'apple store',                       'Computers Electronic'),
  ('Best Buy',                          'best buy',                          'Computers Electronic'),

  -- Craft Fabric Stores (3)
  ('Hobby Lobby',                       'hobby lobby',                       'Craft Fabric Stores'),
  ('Jo-Ann',                            'jo-ann',                            'Craft Fabric Stores'),
  ('Michaels',                          'michaels',                          'Craft Fabric Stores'),

  -- Dental (4)
  ('Aspen Dental',                      'aspen dental',                      'Dental'),
  ('Great Expressions Dental Centers',  'great expressions dental centers',  'Dental'),
  ('Pacific Dental Services',           'pacific dental services',           'Dental'),
  ('Park Dental',                       'park dental',                       'Dental'),

  -- Department Stores (8)
  ('Bealls Outlet',                     'bealls outlet',                     'Department Stores'),
  ('Belk',                              'belk',                              'Department Stores'),
  ('Bloomingdale''s',                   'bloomingdale''s',                   'Department Stores'),
  ('Dillard''s',                        'dillard''s',                        'Department Stores'),
  ('Macy''s',                           'macy''s',                           'Department Stores'),
  ('Neiman Marcus',                     'neiman marcus',                     'Department Stores'),
  ('Nordstrom',                         'nordstrom',                         'Department Stores'),
  ('Saks Fifth Avenue',                 'saks fifth avenue',                 'Department Stores'),

  -- Discount Department Stores (10 original, 9 after Wal-Mart merge)
  ('Burlington Coat Factory',           'burlington coat factory',           'Discount Department Stores'),
  ('Kohl''s',                           'kohl''s',                           'Discount Department Stores'),
  ('Marshalls',                         'marshalls',                         'Discount Department Stores'),
  ('Ollies Bargain Outlet',             'ollies bargain outlet',             'Discount Department Stores'),
  ('Roses',                             'roses',                             'Discount Department Stores'),
  ('Ross',                              'ross',                              'Discount Department Stores'),
  ('Target',                            'target',                            'Discount Department Stores'),
  ('TJ Maxx',                           'tj maxx',                           'Discount Department Stores'),
  ('Tuesday Morning',                   'tuesday morning',                   'Discount Department Stores'),
  ('Wal-Mart',                          'wal-mart',                          'Discount Department Stores'),

  -- Dollar Stores (6 original, 5 after dropping 'Family Dollar | Dollar Tree')
  ('Dollar General',                    'dollar general',                    'Dollar Stores'),
  ('Dollar Tree',                       'dollar tree',                       'Dollar Stores'),
  ('Family Dollar',                     'family dollar',                     'Dollar Stores'),
  ('Five Below',                        'five below',                        'Dollar Stores'),
  ('pOpshelf',                          'popshelf',                          'Dollar Stores'),

  -- Drug Stores (3)
  ('CVS',                               'cvs',                               'Drug Stores'),
  ('Vitamin Shoppe',                    'vitamin shoppe',                    'Drug Stores'),
  ('Walgreens',                         'walgreens',                         'Drug Stores'),

  -- Entertainment (11)
  ('AMC',                               'amc',                               'Entertainment'),
  ('Bowlero',                           'bowlero',                           'Entertainment'),
  ('Chuck E. Cheese''s',                'chuck e. cheese''s',                'Entertainment'),
  ('Cinemark',                          'cinemark',                          'Entertainment'),
  ('Dave and Busters',                  'dave and busters',                  'Entertainment'),
  ('Main Event Entertainment',          'main event entertainment',          'Entertainment'),
  ('Regal',                             'regal',                             'Entertainment'),
  ('Regency',                           'regency',                           'Entertainment'),
  ('Round 1',                           'round 1',                           'Entertainment'),
  ('Topgolf',                           'topgolf',                           'Entertainment'),
  ('UA',                                'ua',                                'Entertainment'),

  -- Eyewear (4)
  ('America''s Best',                   'america''s best',                   'Eyewear'),
  ('MyEyeDr.',                          'myeyedr.',                          'Eyewear'),
  ('Visionworks',                       'visionworks',                       'Eyewear'),
  ('Warby Parker',                      'warby parker',                      'Eyewear'),

  -- Fitness (22, merged from 'Fitness' + 'Fitness ')
  ('24 Hour Fitness',                   '24 hour fitness',                   'Fitness'),
  ('9Round',                            '9round',                            'Fitness'),
  ('Anytime Fitness',                   'anytime fitness',                   'Fitness'),
  ('Burn Boot Camp',                    'burn boot camp',                    'Fitness'),
  ('Club Pilates',                      'club pilates',                      'Fitness'),
  ('Crunch',                            'crunch',                            'Fitness'),
  ('CycleBar',                          'cyclebar',                          'Fitness'),
  ('Equinox Fitness',                   'equinox fitness',                   'Fitness'),
  ('F45 Training',                      'f45 training',                      'Fitness'),
  ('Fit Body Boot Camp',                'fit body boot camp',                'Fitness'),
  ('Fitness 19',                        'fitness 19',                        'Fitness'),
  ('Gold''s Gym',                       'gold''s gym',                       'Fitness'),
  ('Hotworx',                           'hotworx',                           'Fitness'),
  ('LA Fitness',                        'la fitness',                        'Fitness'),
  ('Lifetime Fitness',                  'lifetime fitness',                  'Fitness'),
  ('Onelife Fitness',                   'onelife fitness',                   'Fitness'),
  ('Orangetheory Fitness',              'orangetheory fitness',              'Fitness'),
  ('Planet Fitness',                    'planet fitness',                    'Fitness'),
  ('Pure Barre',                        'pure barre',                        'Fitness'),
  ('Snap Fitness',                      'snap fitness',                      'Fitness'),
  ('World Gym',                         'world gym',                         'Fitness'),
  ('YMCA',                              'ymca',                              'Fitness'),

  -- Furniture Household (23, typo 'Funiture' fixed)
  ('American Freight',                  'american freight',                  'Furniture Household'),
  ('American Signature Furniture',      'american signature furniture',      'Furniture Household'),
  ('Ashley Furniture',                  'ashley furniture',                  'Furniture Household'),
  ('At Home',                           'at home',                           'Furniture Household'),
  ('Badcock',                           'badcock',                           'Furniture Household'),
  ('Bassett',                           'bassett',                           'Furniture Household'),
  ('Bed Bath & Beyond',                 'bed bath & beyond',                 'Furniture Household'),
  ('Crate and Barrel',                  'crate and barrel',                  'Furniture Household'),
  ('Ethan Allen',                       'ethan allen',                       'Furniture Household'),
  ('Havertys',                          'havertys',                          'Furniture Household'),
  ('HomeGoods',                         'homegoods',                         'Furniture Household'),
  ('IKEA',                              'ikea',                              'Furniture Household'),
  ('Kirklands',                         'kirklands',                         'Furniture Household'),
  ('La-Z-Boy',                          'la-z-boy',                          'Furniture Household'),
  ('Pottery Barn',                      'pottery barn',                      'Furniture Household'),
  ('Relax The Back',                    'relax the back',                    'Furniture Household'),
  ('Restoration Hardware',              'restoration hardware',              'Furniture Household'),
  ('Rooms To Go',                       'rooms to go',                       'Furniture Household'),
  ('The Container Store',               'the container store',               'Furniture Household'),
  ('West Elm',                          'west elm',                          'Furniture Household'),
  ('Williams-Sonoma',                   'williams-sonoma',                   'Furniture Household'),
  ('World Market',                      'world market',                      'Furniture Household'),
  ('Z Gallerie',                        'z gallerie',                        'Furniture Household'),

  -- Grocery Stores (15 original, 14 after ALDI merge)
  ('ALDI',                              'aldi',                              'Grocery Stores'),
  ('Food Lion',                         'food lion',                         'Grocery Stores'),
  ('H Mart',                            'h mart',                            'Grocery Stores'),
  ('H-E-B',                             'h-e-b',                             'Grocery Stores'),
  ('IGA',                               'iga',                               'Grocery Stores'),
  ('Ingles',                            'ingles',                            'Grocery Stores'),
  ('Kroger',                            'kroger',                            'Grocery Stores'),
  ('Lidl',                              'lidl',                              'Grocery Stores'),
  ('Lowe''s Food',                      'lowe''s food',                      'Grocery Stores'),
  ('Publix',                            'publix',                            'Grocery Stores'),
  ('Sprouts',                           'sprouts',                           'Grocery Stores'),
  ('The Fresh Market',                  'the fresh market',                  'Grocery Stores'),
  ('Trader Joe''s',                     'trader joe''s',                     'Grocery Stores'),
  ('Whole Foods',                       'whole foods',                       'Grocery Stores'),

  -- Health Beauty (10)
  ('Amazing Lash Studio',               'amazing lash studio',               'Health Beauty'),
  ('Bath & Body Works',                 'bath & body works',                 'Health Beauty'),
  ('Fantastic Sams',                    'fantastic sams',                    'Health Beauty'),
  ('Great Clips',                       'great clips',                       'Health Beauty'),
  ('Regis Salon',                       'regis salon',                       'Health Beauty'),
  ('Sally Beauty Supply',               'sally beauty supply',               'Health Beauty'),
  ('Sephora',                           'sephora',                           'Health Beauty'),
  ('Sport Clips',                       'sport clips',                       'Health Beauty'),
  ('Supercuts',                         'supercuts',                         'Health Beauty'),
  ('ULTA',                              'ulta',                              'Health Beauty'),

  -- Home Improvement (8)
  ('Ace Hardware',                      'ace hardware',                      'Home Improvement'),
  ('Floor & Decor',                     'floor & decor',                     'Home Improvement'),
  ('Harbor Freight Tools',              'harbor freight tools',              'Home Improvement'),
  ('Home Depot',                        'home depot',                        'Home Improvement'),
  ('Lowe''s',                           'lowe''s',                           'Home Improvement'),
  ('Northern Tool',                     'northern tool',                     'Home Improvement'),
  ('Sherwin-Williams',                  'sherwin-williams',                  'Home Improvement'),
  ('Tractor Supply Company',            'tractor supply company',            'Home Improvement'),

  -- Massage (4)
  ('European Wax Center',               'european wax center',               'Massage'),
  ('Hand and Stone',                    'hand and stone',                    'Massage'),
  ('Massage Envy',                      'massage envy',                      'Massage'),
  ('Waxing The City',                   'waxing the city',                   'Massage'),

  -- Mattress (5)
  ('Mattress Firm',                     'mattress firm',                     'Mattress'),
  ('Mattress King',                     'mattress king',                     'Mattress'),
  ('Mattress Warehouse',                'mattress warehouse',                'Mattress'),
  ('Original Mattress Factory',         'original mattress factory',         'Mattress'),
  ('Sleep Number',                      'sleep number',                      'Mattress'),

  -- Office Supply (3)
  ('Office Depot',                      'office depot',                      'Office Supply'),
  ('Office Max',                        'office max',                        'Office Supply'),
  ('Staples',                           'staples',                           'Office Supply'),

  -- Pet Stores (6)
  ('Pet Supplies Plus',                 'pet supplies plus',                 'Pet Stores'),
  ('Petco',                             'petco',                             'Pet Stores'),
  ('Petland',                           'petland',                           'Pet Stores'),
  ('Petsense',                          'petsense',                          'Pet Stores'),
  ('PetsMart',                          'petsmart',                          'Pet Stores'),
  ('Unleashed By Petco',                'unleashed by petco',                'Pet Stores'),

  -- Restaurant Bakery Bagels (6)
  ('Atlanta Bread',                     'atlanta bread',                     'Restaurant Bakery Bagels'),
  ('Corner Bakery',                     'corner bakery',                     'Restaurant Bakery Bagels'),
  ('Crumbl Cookies',                    'crumbl cookies',                    'Restaurant Bakery Bagels'),
  ('Einstein Bros',                     'einstein bros',                     'Restaurant Bakery Bagels'),
  ('Nothing Bundt Cakes',               'nothing bundt cakes',               'Restaurant Bakery Bagels'),
  ('Panera Bread',                      'panera bread',                      'Restaurant Bakery Bagels'),

  -- Restaurant Casual (82)
  ('Another Broken Egg',                'another broken egg',                'Restaurant Casual'),
  ('Applebee''s',                       'applebee''s',                       'Restaurant Casual'),
  ('BJ''s Restaurant & Brewery',        'bj''s restaurant & brewery',        'Restaurant Casual'),
  ('Bonefish Grill',                    'bonefish grill',                    'Restaurant Casual'),
  ('Brio',                              'brio',                              'Restaurant Casual'),
  ('Buffalo Wild Wings',                'buffalo wild wings',                'Restaurant Casual'),
  ('Buffalo''s Southwest Cafe',         'buffalo''s southwest cafe',         'Restaurant Casual'),
  ('BURGERFI',                          'burgerfi',                          'Restaurant Casual'),
  ('California Pizza Kitchen',          'california pizza kitchen',          'Restaurant Casual'),
  ('Capital Grille',                    'capital grille',                    'Restaurant Casual'),
  ('Carrabba''s',                       'carrabba''s',                       'Restaurant Casual'),
  ('Cava',                              'cava',                              'Restaurant Casual'),
  ('Cheddar''s',                        'cheddar''s',                        'Restaurant Casual'),
  ('Chevys',                            'chevys',                            'Restaurant Casual'),
  ('Chili''s',                          'chili''s',                          'Restaurant Casual'),
  ('Chipotle',                          'chipotle',                          'Restaurant Casual'),
  ('Chuy''s',                           'chuy''s',                           'Restaurant Casual'),
  ('Coopers Hawk Winery & Restaurants', 'coopers hawk winery & restaurants', 'Restaurant Casual'),
  ('Cracker Barrel',                    'cracker barrel',                    'Restaurant Casual'),
  ('Denny''s',                          'denny''s',                          'Restaurant Casual'),
  ('Dickey''s',                         'dickey''s',                         'Restaurant Casual'),
  ('Famous Dave''s',                    'famous dave''s',                    'Restaurant Casual'),
  ('Firebirds',                         'firebirds',                         'Restaurant Casual'),
  ('First Watch',                       'first watch',                       'Restaurant Casual'),
  ('Five Guys',                         'five guys',                         'Restaurant Casual'),
  ('Fleming''s',                        'fleming''s',                        'Restaurant Casual'),
  ('Fogo De Chao',                      'fogo de chao',                      'Restaurant Casual'),
  ('Fuddruckers',                       'fuddruckers',                       'Restaurant Casual'),
  ('Fuzzys Taco Shop',                  'fuzzys taco shop',                  'Restaurant Casual'),
  ('Glory Days Grill',                  'glory days grill',                  'Restaurant Casual'),
  ('Golden Corral',                     'golden corral',                     'Restaurant Casual'),
  ('Habit Burger Grill',                'habit burger grill',                'Restaurant Casual'),
  ('Hard Rock Cafe',                    'hard rock cafe',                    'Restaurant Casual'),
  ('Hooters',                           'hooters',                           'Restaurant Casual'),
  ('Huddle House',                      'huddle house',                      'Restaurant Casual'),
  ('Hurricane Grill and Wings',         'hurricane grill and wings',         'Restaurant Casual'),
  ('Hwy 55',                            'hwy 55',                            'Restaurant Casual'),
  ('IHOP',                              'ihop',                              'Restaurant Casual'),
  ('Joe''s Crab Shack',                 'joe''s crab shack',                 'Restaurant Casual'),
  ('Lazy Dog Bar & Restaurant',         'lazy dog bar & restaurant',         'Restaurant Casual'),
  ('Logan''s Roadhouse',                'logan''s roadhouse',                'Restaurant Casual'),
  ('Longhorn Steakhouse',               'longhorn steakhouse',               'Restaurant Casual'),
  ('Macaroni Grill',                    'macaroni grill',                    'Restaurant Casual'),
  ('Maggiano''s',                       'maggiano''s',                       'Restaurant Casual'),
  ('Maple Street',                      'maple street',                      'Restaurant Casual'),
  ('McCormick & Schmick''s',            'mccormick & schmick''s',            'Restaurant Casual'),
  ('Miller''s Ale House',               'miller''s ale house',               'Restaurant Casual'),
  ('Mimis Cafe',                        'mimis cafe',                        'Restaurant Casual'),
  ('Moe''s',                            'moe''s',                            'Restaurant Casual'),
  ('Mooyah Burgers',                    'mooyah burgers',                    'Restaurant Casual'),
  ('O''Charley''s',                     'o''charley''s',                     'Restaurant Casual'),
  ('Olive Garden',                      'olive garden',                      'Restaurant Casual'),
  ('On The Border',                     'on the border',                     'Restaurant Casual'),
  ('Outback Steakhouse',                'outback steakhouse',                'Restaurant Casual'),
  ('P.F. Chang''s',                     'p.f. chang''s',                     'Restaurant Casual'),
  ('Pappadeaux',                        'pappadeaux',                        'Restaurant Casual'),
  ('Pappasitos',                        'pappasitos',                        'Restaurant Casual'),
  ('Piccadilly',                        'piccadilly',                        'Restaurant Casual'),
  ('Pollo Tropical',                    'pollo tropical',                    'Restaurant Casual'),
  ('Qdoba',                             'qdoba',                             'Restaurant Casual'),
  ('Red Lobster',                       'red lobster',                       'Restaurant Casual'),
  ('Red Robin',                         'red robin',                         'Restaurant Casual'),
  ('Ruby Tuesday',                      'ruby tuesday',                      'Restaurant Casual'),
  ('Ruth''s Chris',                     'ruth''s chris',                     'Restaurant Casual'),
  ('Seasons 52',                        'seasons 52',                        'Restaurant Casual'),
  ('Shake Shack',                       'shake shack',                       'Restaurant Casual'),
  ('Shane''s Rib Shack',                'shane''s rib shack',                'Restaurant Casual'),
  ('Snooze Eatery',                     'snooze eatery',                     'Restaurant Casual'),
  ('Sonnys BBQ',                        'sonnys bbq',                        'Restaurant Casual'),
  ('Sweetgreen',                        'sweetgreen',                        'Restaurant Casual'),
  ('T.G.I. Friday''s',                  't.g.i. friday''s',                  'Restaurant Casual'),
  ('Taco Mac',                          'taco mac',                          'Restaurant Casual'),
  ('Ted''s Montana Grill',              'ted''s montana grill',              'Restaurant Casual'),
  ('Texas Roadhouse',                   'texas roadhouse',                   'Restaurant Casual'),
  ('The Cheesecake Factory',            'the cheesecake factory',            'Restaurant Casual'),
  ('Tijuana Flats',                     'tijuana flats',                     'Restaurant Casual'),
  ('Torchys Tacos',                     'torchys tacos',                     'Restaurant Casual'),
  ('Twin Peaks',                        'twin peaks',                        'Restaurant Casual'),
  ('Waffle House',                      'waffle house',                      'Restaurant Casual'),
  ('Willy''s',                          'willy''s',                          'Restaurant Casual'),
  ('Yard House',                        'yard house',                        'Restaurant Casual'),

  -- Restaurant Coffee Donuts (9)
  ('Caribou Coffee',                    'caribou coffee',                    'Restaurant Coffee Donuts'),
  ('Dunkin'' Donuts',                   'dunkin'' donuts',                   'Restaurant Coffee Donuts'),
  ('Krispy Kreme',                      'krispy kreme',                      'Restaurant Coffee Donuts'),
  ('Peet''s',                           'peet''s',                           'Restaurant Coffee Donuts'),
  ('Scooters Coffee',                   'scooters coffee',                   'Restaurant Coffee Donuts'),
  ('Shipley Do-Nuts',                   'shipley do-nuts',                   'Restaurant Coffee Donuts'),
  ('Starbucks',                         'starbucks',                         'Restaurant Coffee Donuts'),
  ('The Human Bean',                    'the human bean',                    'Restaurant Coffee Donuts'),
  ('Tim Hortons',                       'tim hortons',                       'Restaurant Coffee Donuts'),

  -- Restaurant Fastfood Major (37)
  ('A&W',                               'a&w',                               'Restaurant Fastfood Major'),
  ('Arby''s',                           'arby''s',                           'Restaurant Fastfood Major'),
  ('Bojangles''',                       'bojangles''',                       'Restaurant Fastfood Major'),
  ('Boston Market',                     'boston market',                     'Restaurant Fastfood Major'),
  ('Burger King',                       'burger king',                       'Restaurant Fastfood Major'),
  ('Captain D''s Seafood',              'captain d''s seafood',              'Restaurant Fastfood Major'),
  ('Checkers',                          'checkers',                          'Restaurant Fastfood Major'),
  ('Chicken Salad Chick',               'chicken salad chick',               'Restaurant Fastfood Major'),
  ('Chick-fil-A',                       'chick-fil-a',                       'Restaurant Fastfood Major'),
  ('Church''s Chicken',                 'church''s chicken',                 'Restaurant Fastfood Major'),
  ('Cook Out',                          'cook out',                          'Restaurant Fastfood Major'),
  ('Culver''s',                         'culver''s',                         'Restaurant Fastfood Major'),
  ('Dairy Queen',                       'dairy queen',                       'Restaurant Fastfood Major'),
  ('Del Taco',                          'del taco',                          'Restaurant Fastfood Major'),
  ('Fazoli''s',                         'fazoli''s',                         'Restaurant Fastfood Major'),
  ('Freddys',                           'freddys',                           'Restaurant Fastfood Major'),
  ('Golden Chick',                      'golden chick',                      'Restaurant Fastfood Major'),
  ('Hardee''s',                         'hardee''s',                         'Restaurant Fastfood Major'),
  ('Jack in the Box',                   'jack in the box',                   'Restaurant Fastfood Major'),
  ('Jacks',                             'jacks',                             'Restaurant Fastfood Major'),
  ('KFC',                               'kfc',                               'Restaurant Fastfood Major'),
  ('Krystal',                           'krystal',                           'Restaurant Fastfood Major'),
  ('Long John Silver''s',               'long john silver''s',               'Restaurant Fastfood Major'),
  ('McDonald''s',                       'mcdonald''s',                       'Restaurant Fastfood Major'),
  ('Panda Express',                     'panda express',                     'Restaurant Fastfood Major'),
  ('Popeyes',                           'popeyes',                           'Restaurant Fastfood Major'),
  ('Raising Canes',                     'raising canes',                     'Restaurant Fastfood Major'),
  ('Slim Chickens',                     'slim chickens',                     'Restaurant Fastfood Major'),
  ('Sonic',                             'sonic',                             'Restaurant Fastfood Major'),
  ('Steak n Shake',                     'steak n shake',                     'Restaurant Fastfood Major'),
  ('Taco Bell',                         'taco bell',                         'Restaurant Fastfood Major'),
  ('Teriyaki Madness',                  'teriyaki madness',                  'Restaurant Fastfood Major'),
  ('Wendy''s',                          'wendy''s',                          'Restaurant Fastfood Major'),
  ('Whataburger',                       'whataburger',                       'Restaurant Fastfood Major'),
  ('Wing Stop',                         'wing stop',                         'Restaurant Fastfood Major'),
  ('Zaxby''s',                          'zaxby''s',                          'Restaurant Fastfood Major'),

  -- Restaurant Ice Cream Smoothie (14)
  ('Andys Frozen Custard',              'andys frozen custard',              'Restaurant Ice Cream Smoothie'),
  ('Baskin-Robbins',                    'baskin-robbins',                    'Restaurant Ice Cream Smoothie'),
  ('Bruster''s',                        'bruster''s',                        'Restaurant Ice Cream Smoothie'),
  ('Cold Stone Creamery',               'cold stone creamery',               'Restaurant Ice Cream Smoothie'),
  ('Jamba Juice',                       'jamba juice',                       'Restaurant Ice Cream Smoothie'),
  ('Jeremiahs Italian Ice',             'jeremiahs italian ice',             'Restaurant Ice Cream Smoothie'),
  ('Marble Slab Creamery',              'marble slab creamery',              'Restaurant Ice Cream Smoothie'),
  ('Menchie''s',                        'menchie''s',                        'Restaurant Ice Cream Smoothie'),
  ('Pinkberry',                         'pinkberry',                         'Restaurant Ice Cream Smoothie'),
  ('Planet Smoothie',                   'planet smoothie',                   'Restaurant Ice Cream Smoothie'),
  ('Rita''s',                           'rita''s',                           'Restaurant Ice Cream Smoothie'),
  ('Robeks',                            'robeks',                            'Restaurant Ice Cream Smoothie'),
  ('Smoothie King',                     'smoothie king',                     'Restaurant Ice Cream Smoothie'),
  ('Tropical Smoothie Cafe',            'tropical smoothie cafe',            'Restaurant Ice Cream Smoothie'),

  -- Restaurant Pizza (18 original + 1 from 'Pizza' merge = 19)
  ('Blaze Pizza',                       'blaze pizza',                       'Restaurant Pizza'),
  ('CiCi''s Pizza',                     'cici''s pizza',                     'Restaurant Pizza'),
  ('Domino''s Pizza',                   'domino''s pizza',                   'Restaurant Pizza'),
  ('Donatos',                           'donatos',                           'Restaurant Pizza'),
  ('Godfather''s Pizza',                'godfather''s pizza',                'Restaurant Pizza'),
  ('Hungry Howie''s',                   'hungry howie''s',                   'Restaurant Pizza'),
  ('Jet''s Pizza',                      'jet''s pizza',                      'Restaurant Pizza'),
  ('Little Caesars',                    'little caesars',                    'Restaurant Pizza'),
  ('Marco''s Pizza',                    'marco''s pizza',                    'Restaurant Pizza'),
  ('Mellow Mushroom',                   'mellow mushroom',                   'Restaurant Pizza'),
  ('MOD Pizza',                         'mod pizza',                         'Restaurant Pizza'),
  ('Old Chicago Pizza & Tap House',     'old chicago pizza & tap house',     'Restaurant Pizza'),
  ('Papa Johns',                        'papa johns',                        'Restaurant Pizza'),
  ('Papa Murphy''s',                    'papa murphy''s',                    'Restaurant Pizza'),
  ('Pizza Factory',                     'pizza factory',                     'Restaurant Pizza'),
  ('Pizza Hut',                         'pizza hut',                         'Restaurant Pizza'),
  ('Rosati''s',                         'rosati''s',                         'Restaurant Pizza'),
  ('Uncle Maddios Pizza Joint',         'uncle maddios pizza joint',         'Restaurant Pizza'),
  ('Your Pie',                          'your pie',                          'Restaurant Pizza'),

  -- Restaurant Sandwich (15)
  ('Blimpie',                           'blimpie',                           'Restaurant Sandwich'),
  ('Capriotti''s',                      'capriotti''s',                      'Restaurant Sandwich'),
  ('Firehouse Subs',                    'firehouse subs',                    'Restaurant Sandwich'),
  ('Jason''s Deli',                     'jason''s deli',                     'Restaurant Sandwich'),
  ('Jersey Mike''s',                    'jersey mike''s',                    'Restaurant Sandwich'),
  ('Jimmy John''s',                     'jimmy john''s',                     'Restaurant Sandwich'),
  ('Lenny''s Sub Shop',                 'lenny''s sub shop',                 'Restaurant Sandwich'),
  ('McAlister''s Deli',                 'mcalister''s deli',                 'Restaurant Sandwich'),
  ('Penn Station',                      'penn station',                      'Restaurant Sandwich'),
  ('Philly Connection',                 'philly connection',                 'Restaurant Sandwich'),
  ('Potbelly Sandwich Works',           'potbelly sandwich works',           'Restaurant Sandwich'),
  ('Quiznos',                           'quiznos',                           'Restaurant Sandwich'),
  ('Schlotzsky''s Deli',                'schlotzsky''s deli',                'Restaurant Sandwich'),
  ('Subway',                            'subway',                            'Restaurant Sandwich'),
  ('Which Wich',                        'which wich',                        'Restaurant Sandwich'),

  -- Shoes Footwear (6)
  ('Famous Footwear',                   'famous footwear',                   'Shoes Footwear'),
  ('Rack Room Shoes',                   'rack room shoes',                   'Shoes Footwear'),
  ('Shoe Carnival',                     'shoe carnival',                     'Shoes Footwear'),
  ('Shoe Dept',                         'shoe dept',                         'Shoes Footwear'),
  ('Shoe Sensation',                    'shoe sensation',                    'Shoes Footwear'),
  ('Shoe Show',                         'shoe show',                         'Shoes Footwear'),

  -- Specialty (4)
  ('Goodwill',                          'goodwill',                          'Specialty'),
  ('Guitar Center',                     'guitar center',                     'Specialty'),
  ('Party City',                        'party city',                        'Specialty'),
  ('Total Wine & More',                 'total wine & more',                 'Specialty'),

  -- Sporting Goods (12)
  ('Academy Sports',                    'academy sports',                    'Sporting Goods'),
  ('Bass Pro Shops',                    'bass pro shops',                    'Sporting Goods'),
  ('Cabela''s',                         'cabela''s',                         'Sporting Goods'),
  ('Dick''s',                           'dick''s',                           'Sporting Goods'),
  ('Edwin Watts Golf',                  'edwin watts golf',                  'Sporting Goods'),
  ('Golf Galaxy',                       'golf galaxy',                       'Sporting Goods'),
  ('Golf Mart',                         'golf mart',                         'Sporting Goods'),
  ('Hibbett Sports',                    'hibbett sports',                    'Sporting Goods'),
  ('PGA Tour Superstore',               'pga tour superstore',               'Sporting Goods'),
  ('Play It Again Sports',              'play it again sports',              'Sporting Goods'),
  ('REI',                               'rei',                               'Sporting Goods'),
  ('Sun and Ski',                       'sun and ski',                       'Sporting Goods'),

  -- Wholesale (3)
  ('BJ''s Wholesale',                   'bj''s wholesale',                   'Wholesale'),
  ('Costco',                            'costco',                            'Wholesale'),
  ('Sam''s Club',                       'sam''s club',                       'Wholesale'),

  -- Wireless Stores (6)
  ('AT&T',                              'at&t',                              'Wireless Stores'),
  ('Boost Mobile',                      'boost mobile',                      'Wireless Stores'),
  ('Cricket',                           'cricket',                           'Wireless Stores'),
  ('MetroPCS',                          'metropcs',                          'Wireless Stores'),
  ('T-Mobile',                          't-mobile',                          'Wireless Stores'),
  ('Verizon Wireless',                  'verizon wireless',                  'Wireless Stores')
) AS v(name, normalized_name, category_name)
JOIN merchant_category c ON c.name = v.category_name
ON CONFLICT (normalized_name) DO NOTHING;


-- ============================================================================
-- Sanity check: log counts so failed imports surface in migration output.
-- ============================================================================

DO $$
DECLARE
  cat_count integer;
  brand_count integer;
BEGIN
  SELECT COUNT(*) INTO cat_count FROM merchant_category;
  SELECT COUNT(*) INTO brand_count FROM merchant_brand;
  RAISE NOTICE 'Merchant seed: % categories, % brands', cat_count, brand_count;
END $$;
