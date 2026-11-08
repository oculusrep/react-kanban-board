// Shared vocabulary + input validation for wardrobe items.

export const CATEGORIES = [
  'top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory',
  'activewear', 'sleepwear', 'swimwear', 'underwear', 'other',
] as const;
export const FORMALITIES = ['casual', 'business', 'formal'] as const;
export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Formality = (typeof FORMALITIES)[number];
export type Season = (typeof SEASONS)[number];

export interface ItemRow {
  id: string;
  name: string;
  category: Category;
  brand: string | null;
  color: string | null;
  size: string | null;
  season: string; // 'all' or comma list
  formality: Formality;
  purchase_date: string | null;
  price: number | null;
  photo_key: string | null;
  notes: string | null;
  last_worn: string | null;
  times_worn: number;
  created_at: string;
  updated_at: string;
}

export interface Item extends Omit<ItemRow, 'season'> {
  season: Season[] | ['all'];
  photo_url: string | null;
}

export class InputError extends Error {}

/** Fields a caller may set. Everything except name is optional. */
export const EDITABLE_FIELDS = [
  'name', 'category', 'brand', 'color', 'size', 'season', 'formality',
  'purchase_date', 'price', 'photo_key', 'notes', 'last_worn', 'times_worn',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type ItemPatch = Partial<Record<EditableField, string | number | null>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEASON_ALIASES: Record<string, Season> = { autumn: 'fall' };

export function normalizeCategory(v: unknown): Category {
  const s = String(v ?? '').trim().toLowerCase();
  const plural = s.endsWith('s') ? s.slice(0, -1) : s;
  const aliases: Record<string, Category> = {
    shirt: 'top', tee: 'top', 't-shirt': 'top', blouse: 'top', sweater: 'top', hoodie: 'top', polo: 'top',
    pant: 'bottom', jean: 'bottom', trouser: 'bottom', short: 'bottom', skirt: 'bottom', chino: 'bottom',
    jacket: 'outerwear', coat: 'outerwear', blazer: 'outerwear', vest: 'outerwear',
    shoe: 'shoes', sneaker: 'shoes', boot: 'shoes', sandal: 'shoes', loafer: 'shoes', heel: 'shoes',
    belt: 'accessory', hat: 'accessory', scarf: 'accessory', tie: 'accessory', bag: 'accessory',
    watch: 'accessory', jewelry: 'accessory', sock: 'underwear', bra: 'underwear',
    gown: 'dress', swimsuit: 'swimwear', pajama: 'sleepwear',
  };
  if ((CATEGORIES as readonly string[]).includes(s)) return s as Category;
  if ((CATEGORIES as readonly string[]).includes(plural)) return plural as Category;
  if (aliases[s]) return aliases[s];
  if (aliases[plural]) return aliases[plural];
  throw new InputError(`category must be one of: ${CATEGORIES.join(', ')}`);
}

export function normalizeFormality(v: unknown): Formality {
  const s = String(v ?? '').trim().toLowerCase();
  if ((FORMALITIES as readonly string[]).includes(s)) return s as Formality;
  if (['smart casual', 'business casual', 'smart-casual'].includes(s)) return 'business';
  if (['black tie', 'cocktail', 'evening'].includes(s)) return 'formal';
  throw new InputError(`formality must be one of: ${FORMALITIES.join(', ')}`);
}

/** Accepts 'all', 'spring,fall', ['winter'], etc. Returns the stored form. */
export function normalizeSeason(v: unknown): string {
  const parts = (Array.isArray(v) ? v : String(v ?? '').split(/[,\s/]+/))
    .map((p) => String(p).trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0 || parts.includes('all') || parts.includes('any') || parts.includes('year-round')) return 'all';
  const out = new Set<Season>();
  for (const p of parts) {
    const s = (SEASON_ALIASES[p] ?? p) as Season;
    if (!(SEASONS as readonly string[]).includes(s)) {
      throw new InputError(`season must be 'all' or any of: ${SEASONS.join(', ')}`);
    }
    out.add(s);
  }
  if (out.size === SEASONS.length) return 'all';
  return SEASONS.filter((s) => out.has(s)).join(',');
}

export function normalizeSeasonFilter(v: unknown): Season {
  const s = String(v ?? '').trim().toLowerCase();
  const n = (SEASON_ALIASES[s] ?? s) as Season;
  if (!(SEASONS as readonly string[]).includes(n)) throw new InputError(`season must be one of: ${SEASONS.join(', ')}`);
  return n;
}

export function normalizeDate(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw new InputError(`${field} must be YYYY-MM-DD`);
  return s;
}

function optText(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * Validates a create/update payload. With `partial`, only provided keys are returned;
 * without it, `name` is required and defaults are filled in.
 */
export function validateItemInput(input: Record<string, unknown>, partial: boolean): ItemPatch {
  const out: ItemPatch = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined;

  if (has('name')) {
    const name = optText(input.name, 200);
    if (!name) throw new InputError('name cannot be empty');
    out.name = name;
  } else if (!partial) {
    throw new InputError('name is required');
  }
  if (has('category')) out.category = input.category === null ? 'other' : normalizeCategory(input.category);
  if (has('formality')) out.formality = normalizeFormality(input.formality);
  if (has('season')) out.season = normalizeSeason(input.season);
  for (const k of ['brand', 'color', 'size'] as const) if (has(k)) out[k] = optText(input[k], 100);
  if (has('notes')) out.notes = optText(input.notes, 4000);
  if (has('photo_key')) {
    const key = optText(input.photo_key, 200);
    if (key && !/^photos\/[A-Za-z0-9._-]+$/.test(key)) throw new InputError('photo_key is not a valid upload key');
    out.photo_key = key;
  }
  if (has('purchase_date')) out.purchase_date = normalizeDate(input.purchase_date, 'purchase_date');
  if (has('last_worn')) out.last_worn = normalizeDate(input.last_worn, 'last_worn');
  if (has('price')) {
    if (input.price === null || input.price === '') out.price = null;
    else {
      const n = Number(String(input.price).replace(/[$,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) throw new InputError('price must be a non-negative number');
      out.price = Math.round(n * 100) / 100;
    }
  }
  if (has('times_worn')) {
    const n = Number(input.times_worn);
    if (!Number.isInteger(n) || n < 0) throw new InputError('times_worn must be a non-negative integer');
    out.times_worn = n;
  }

  if (!partial) {
    out.category ??= 'other';
    out.formality ??= 'casual';
    out.season ??= 'all';
  }
  return out;
}

/** Today's date (YYYY-MM-DD) in the configured time zone — not UTC. */
export function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function toItem(row: ItemRow, origin: string): Item {
  return {
    ...row,
    season: row.season === 'all' ? ['all'] : (row.season.split(',') as Season[]),
    photo_url: row.photo_key ? `${origin}/${row.photo_key}` : null,
  };
}
