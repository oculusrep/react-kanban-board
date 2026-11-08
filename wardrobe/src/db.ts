// D1 data access for wardrobe items and wear history.
import {
  CATEGORIES, FORMALITIES, InputError, Item, ItemPatch, ItemRow, Season,
  normalizeCategory, normalizeDate, normalizeFormality, normalizeSeasonFilter,
  todayIn, toItem, validateItemInput,
} from './model';

export interface Ctx {
  db: D1Database;
  origin: string;
  timeZone: string;
}

const SORTS: Record<string, string> = {
  name: 'name COLLATE NOCASE ASC',
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  last_worn: 'last_worn IS NULL, last_worn DESC',
  least_recently_worn: 'last_worn IS NOT NULL, last_worn ASC, times_worn ASC',
  most_worn: 'times_worn DESC',
  least_worn: 'times_worn ASC',
  price: 'price IS NULL, price DESC',
};

export async function getItem(ctx: Ctx, id: string): Promise<Item | null> {
  const row = await ctx.db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
  return row ? toItem(row, ctx.origin) : null;
}

export async function addItem(ctx: Ctx, input: Record<string, unknown>): Promise<Item> {
  const fields = validateItemInput(input, false);
  const id = crypto.randomUUID();
  const cols = ['id', ...Object.keys(fields)];
  const vals = [id, ...Object.values(fields)];
  await ctx.db
    .prepare(`INSERT INTO items (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...vals)
    .run();
  return (await getItem(ctx, id))!;
}

export async function updateItem(ctx: Ctx, id: string, input: Record<string, unknown>): Promise<Item | null> {
  const fields: ItemPatch = validateItemInput(input, true);
  const keys = Object.keys(fields);
  if (keys.length === 0) throw new InputError('no fields to update');
  const res = await ctx.db
    .prepare(`UPDATE items SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...Object.values(fields), id)
    .run();
  if (!res.meta.changes) return null;
  return getItem(ctx, id);
}

/** Deletes the row and returns it (so the caller can remove the photo). */
export async function deleteItem(ctx: Ctx, id: string): Promise<Item | null> {
  const item = await getItem(ctx, id);
  if (!item) return null;
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM wear_log WHERE item_id = ?').bind(id),
    ctx.db.prepare('DELETE FROM items WHERE id = ?').bind(id),
  ]);
  return item;
}

export interface SearchFilters {
  query?: string;
  category?: string;
  color?: string;
  brand?: string;
  season?: string;
  formality?: string;
  min_price?: number;
  max_price?: number;
  not_worn_since?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export async function searchItems(ctx: Ctx, f: SearchFilters): Promise<{ items: Item[]; total: number }> {
  const where: string[] = [];
  const args: unknown[] = [];

  if (f.query?.trim()) {
    // Every word must match somewhere (name, brand, color, category, notes, size).
    for (const word of f.query.trim().split(/\s+/).slice(0, 8)) {
      where.push('(name LIKE ? OR brand LIKE ? OR color LIKE ? OR category LIKE ? OR notes LIKE ? OR size LIKE ?)');
      const like = `%${word.replace(/[%_]/g, '')}%`;
      args.push(like, like, like, like, like, like);
    }
  }
  if (f.category) { where.push('category = ?'); args.push(normalizeCategory(f.category)); }
  if (f.formality) { where.push('formality = ?'); args.push(normalizeFormality(f.formality)); }
  if (f.color?.trim()) { where.push('color LIKE ?'); args.push(`%${f.color.trim()}%`); }
  if (f.brand?.trim()) { where.push('brand LIKE ?'); args.push(`%${f.brand.trim()}%`); }
  if (f.season) {
    where.push(`(season = 'all' OR instr(',' || season || ',', ?) > 0)`);
    args.push(`,${normalizeSeasonFilter(f.season)},`);
  }
  if (f.min_price !== undefined && f.min_price !== null) { where.push('price >= ?'); args.push(Number(f.min_price)); }
  if (f.max_price !== undefined && f.max_price !== null) { where.push('price <= ?'); args.push(Number(f.max_price)); }
  if (f.not_worn_since) {
    where.push('(last_worn IS NULL OR last_worn < ?)');
    args.push(normalizeDate(f.not_worn_since, 'not_worn_since'));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[f.sort ?? 'newest'];
  if (!order) throw new InputError(`sort must be one of: ${Object.keys(SORTS).join(', ')}`);
  const limit = Math.min(Math.max(Number(f.limit ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(f.offset ?? 0) || 0, 0);

  const [rows, count] = await ctx.db.batch([
    ctx.db.prepare(`SELECT * FROM items ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    ctx.db.prepare(`SELECT COUNT(*) AS n FROM items ${whereSql}`).bind(...args),
  ]);
  return {
    items: (rows.results as ItemRow[]).map((r) => toItem(r, ctx.origin)),
    total: Number((count.results[0] as { n: number }).n),
  };
}

export async function logWear(
  ctx: Ctx, itemIds: string[], date?: string, note?: string,
): Promise<{ worn_on: string; items: Item[]; missing: string[] }> {
  const ids = [...new Set(itemIds.map(String).filter(Boolean))];
  if (ids.length === 0) throw new InputError('item_ids must contain at least one id');
  if (ids.length > 30) throw new InputError('at most 30 items per log_wear call');
  const wornOn = normalizeDate(date, 'date') ?? todayIn(ctx.timeZone);

  const existing = await ctx.db
    .prepare(`SELECT id FROM items WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<{ id: string }>();
  const found = new Set(existing.results.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  const stmts = [...found].flatMap((id) => [
    ctx.db.prepare('INSERT INTO wear_log (item_id, worn_on, note) VALUES (?, ?, ?)').bind(id, wornOn, note ?? null),
    ctx.db
      .prepare(`UPDATE items SET times_worn = times_worn + 1,
                last_worn = CASE WHEN last_worn IS NULL OR last_worn < ?1 THEN ?1 ELSE last_worn END,
                updated_at = datetime('now') WHERE id = ?2`)
      .bind(wornOn, id),
  ]);
  if (stmts.length) await ctx.db.batch(stmts);
  const items = await Promise.all([...found].map((id) => getItem(ctx, id)));
  return { worn_on: wornOn, items: items.filter((i): i is Item => !!i), missing };
}

// ---------- outfit candidates ----------

export interface SuggestInput {
  season?: string;
  formality?: string;
  weather?: string;
  temperature_f?: number;
  temperature_c?: number;
  exclude_worn_within_days?: number;
  per_category?: number;
}

const OUTFIT_GROUPS = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'] as const;

function seasonsForTemp(f: number): Season[] {
  if (f >= 80) return ['summer'];
  if (f >= 65) return ['spring', 'summer'];
  if (f >= 50) return ['spring', 'fall'];
  if (f >= 35) return ['fall', 'winter'];
  return ['winter'];
}

function seasonForMonth(date: string): Season {
  const m = Number(date.slice(5, 7)); // northern hemisphere
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}

export async function suggestOutfitCandidates(ctx: Ctx, input: SuggestInput) {
  const today = todayIn(ctx.timeZone);
  const weather = (input.weather ?? '').toLowerCase();
  const notes: string[] = [];

  let tempF = input.temperature_f ?? (input.temperature_c !== undefined ? input.temperature_c * 9 / 5 + 32 : undefined);
  if (tempF === undefined) {
    if (/\b(hot|heat|scorch)/.test(weather)) tempF = 88;
    else if (/\bwarm/.test(weather)) tempF = 72;
    else if (/\b(mild|pleasant)/.test(weather)) tempF = 60;
    else if (/\b(cool|chilly|crisp)/.test(weather)) tempF = 45;
    else if (/\b(cold|freez|frigid|snow|ice|icy)/.test(weather)) tempF = 28;
  }

  let seasons: Season[];
  if (input.season) seasons = [normalizeSeasonFilter(input.season)];
  else if (tempF !== undefined) seasons = seasonsForTemp(tempF);
  else { seasons = [seasonForMonth(today)]; notes.push(`No season or weather given; assumed ${seasons[0]} from today's date.`); }

  const formality = input.formality ? normalizeFormality(input.formality) : undefined;
  const wet = /\b(rain|shower|drizzle|storm|wet|snow|sleet)/.test(weather);
  const windy = /\bwind/.test(weather);
  const needsOuterwear = wet || windy || (tempF !== undefined && tempF < 60);
  if (wet) notes.push('Wet conditions: prefer water-resistant outerwear and closed shoes/boots; avoid suede.');
  if (needsOuterwear) notes.push('Outerwear recommended.');
  if (tempF !== undefined && tempF >= 80) notes.push('Hot: favor light, breathable fabrics; outerwear omitted.');

  const where: string[] = [`category IN (${OUTFIT_GROUPS.map(() => '?').join(',')})`];
  const args: unknown[] = [...OUTFIT_GROUPS];
  where.push(`(season = 'all' OR ${seasons.map(() => `instr(',' || season || ',', ?) > 0`).join(' OR ')})`);
  args.push(...seasons.map((s) => `,${s},`));
  if (formality) { where.push('formality = ?'); args.push(formality); }
  const days = Number(input.exclude_worn_within_days ?? 0);
  if (days > 0) {
    const cutoff = new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
    where.push('(last_worn IS NULL OR last_worn <= ?)');
    args.push(cutoff);
  }

  const rows = await ctx.db
    .prepare(`SELECT * FROM items WHERE ${where.join(' AND ')}
              ORDER BY last_worn IS NOT NULL, last_worn ASC, times_worn ASC LIMIT 1000`)
    .bind(...args)
    .all<ItemRow>();

  const per = Math.min(Math.max(Number(input.per_category ?? 6) || 6, 1), 25);
  const candidates: Record<string, Item[]> = {};
  for (const g of OUTFIT_GROUPS) {
    if (g === 'outerwear' && tempF !== undefined && tempF >= 80 && !wet) continue;
    candidates[g] = rows.results.filter((r) => r.category === g).slice(0, per).map((r) => toItem(r, ctx.origin));
  }
  const missing = Object.entries(candidates).filter(([g, v]) => v.length === 0 && g !== 'dress' && g !== 'accessory').map(([g]) => g);
  if (missing.length) notes.push(`No matching items for: ${missing.join(', ')}. Try relaxing formality or season.`);

  return {
    criteria: { seasons, formality: formality ?? 'any', temperature_f: tempF ?? null, weather: input.weather ?? null, needs_outerwear: needsOuterwear },
    ordering: 'Within each category, least-recently-worn first (never-worn items lead) to encourage rotation.',
    notes,
    candidates,
  };
}

export const META = { categories: CATEGORIES, formalities: FORMALITIES, sorts: Object.keys(SORTS) };
