/**
 * Generators slide — one .pptx built from a finished deep pass, on Mike's Starbucks slide template
 * (4:3, green bar, siren).
 *
 *   green bar    "Generators" title, totals, city / street text beside the siren
 *   map area     an empty PICTURE placeholder ("Paste Sites USA map") filling most of the slide
 *   callouts     one per row of schools.csv, employers.csv and generators.csv — no cap — staged in
 *                rings along the edges of the map, sorted by pin, never overlapping, for the user to
 *                drag onto the matching Sites USA pin
 *
 * The rows come from the SAME builders the exports phase uses (buildSchoolsCsv / buildEmployersCsv /
 * buildGeneratorsCsv), fed the same stored inputs, so the slide, its totals and the files' `pin`
 * column cannot disagree. Totals are summed from those rows, never entered by hand.
 *
 * Design: docs/GENERATORS_SLIDE.md.
 */

import JSZip from 'npm:jszip@3.10.1';
import { decodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { STARBUCKS_TEMPLATE_B64 } from './starbucks-slide-template.ts';
import type { EmployersRow, GeneratorsRow, SchoolsRow } from '../csv.ts';
import {
  type AcceptedFill, buildEmployersCsv, buildSchoolsCsv, type RecordedEmployer, type SchoolRecord,
} from './deep-pass.ts';
import { buildGeneratorsCsv, type RecordedGenerator } from './generators.ts';

// ---------------------------------------------------------------------------
// Rows: rebuilt from the run's stored inputs with the export builders
// ---------------------------------------------------------------------------

export interface ExportRows {
  schools: SchoolsRow[];
  employers: EmployersRow[];
  generators: GeneratorsRow[];
}

/**
 * The three files' rows for a finished deep pass, exactly as the exports phase builds them (retail
 * merchants never reach generators.csv, so they are not needed here; the drive-time band column is
 * the only thing left blank, and the slide does not use it).
 */
export async function rebuildExportRows(
  run: { id: string; phase_state: Record<string, unknown> | null },
  committedToolOutputs: (runId: string, toolName: string) => Promise<unknown[]>,
): Promise<ExportRows> {
  const fills = (await committedToolOutputs(run.id, 'record_school_fill'))
    .map((o) => (o as { accepted?: AcceptedFill | null }).accepted).filter((a): a is AcceptedFill => !!a);
  const employers = (await committedToolOutputs(run.id, 'record_employer'))
    .map((o) => (o as { recorded?: RecordedEmployer | null }).recorded).filter((e): e is RecordedEmployer => !!e);
  const generators = (await committedToolOutputs(run.id, 'record_generator'))
    .map((o) => (o as { recorded?: RecordedGenerator | null }).recorded).filter((g): g is RecordedGenerator => !!g);
  const schools = ((run.phase_state?.schools ?? []) as SchoolRecord[]);
  return {
    schools: buildSchoolsCsv(schools, fills).rows,
    employers: buildEmployersCsv(employers).rows,
    generators: buildGeneratorsCsv([], generators).rows,
  };
}

// ---------------------------------------------------------------------------
// Callouts and totals
// ---------------------------------------------------------------------------

export type CalloutGroup = 'school' | 'employer' | 'generator';

export interface Callout {
  group: CalloutGroup;
  pin: number;
  line1: string;
  line2: string;
}

const fmt = (n: number) => n.toLocaleString('en-US');
/** Names recorded from web pages sometimes carry a literal entity ("Baymont Inn &amp; Suites"): show the character. */
export const decodeEntities = (t: string) =>
  t.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[e]!);
const label = (v: unknown, fallback: string) => decodeEntities(String(v ?? fallback));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pinOf = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);

const UNIT_LABEL: Record<string, string> = { seats: 'Seats', beds: 'Beds', rooms: 'Rooms', sf: 'SF', headcount: 'Headcount' };

/** Higher-ed rows are their own group (IPEDS headcount): never added to a K-12 total. */
export const isHigherEd = (r: SchoolsRow) => r.enrollment_source === 'IPEDS';

const normName = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|inc|llc)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
const normStreet = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\bhighway\b/g, 'hwy').replace(/\broad\b/g, 'rd')
    .replace(/\bstreet\b/g, 'st').replace(/\bdrive\b/g, 'dr').replace(/\bparkway\b/g, 'pkwy').replace(/\s+/g, ' ').trim();

/**
 * A hospital in both employers.csv and generators.csv gets ONE callout, the employer one. Matched on
 * the same street address, or on the name (one contains the other, at least 8 characters). Only
 * generators in hospital_medical are candidates: a church sharing a street with an employer is not
 * the same place.
 */
export function generatorDuplicatesEmployer(g: GeneratorsRow, employers: EmployersRow[]): boolean {
  if (g.category !== 'hospital_medical') return false;
  const gName = normName(g.name), gStreet = normStreet(g.street);
  return employers.some((e) => {
    const eStreet = normStreet(e.street);
    if (gStreet && eStreet && gStreet === eStreet) return true;
    const eName = normName(e.name);
    if (gName.length < 8 || eName.length < 8) return false;
    return gName === eName || gName.includes(eName) || eName.includes(gName);
  });
}

/** One callout per row, sorted by pin within each file; schools, then employers, then generators. */
export function buildCallouts(rows: ExportRows): { callouts: Callout[]; mergedGenerators: string[] } {
  const byPin = <T extends { pin: unknown }>(xs: T[]) => [...xs].sort((a, b) => pinOf(a.pin, 1e9) - pinOf(b.pin, 1e9));
  const callouts: Callout[] = [];
  byPin(rows.schools).forEach((r, i) => {
    const n = num(r.enrollment);
    callouts.push({ group: 'school', pin: pinOf(r.pin, i + 1), line1: label(r.name, '(unnamed school)'),
      line2: n === null ? '(Students not on file)' : `(${fmt(n)} Students)` });
  });
  byPin(rows.employers).forEach((r, i) => {
    const n = num(r.headcount);
    callouts.push({ group: 'employer', pin: pinOf(r.pin, i + 1), line1: label(r.name, '(unnamed employer)'),
      line2: n === null ? '(Employees not on file)' : `(${fmt(n)} Employees)` });
  });
  const mergedGenerators: string[] = [];
  byPin(rows.generators).forEach((r, i) => {
    if (generatorDuplicatesEmployer(r, rows.employers)) {
      mergedGenerators.push(String(r.name ?? ''));
      return;
    }
    const n = num(r.size_value);
    const unit = r.size_unit ? UNIT_LABEL[String(r.size_unit)] ?? String(r.size_unit) : null;
    callouts.push({ group: 'generator', pin: pinOf(r.pin, i + 1), line1: label(r.name, '(unnamed generator)'),
      line2: n === null || !unit ? '(Size not on file)' : `(${fmt(n)} ${unit})` });
  });
  return { callouts, mergedGenerators };
}

export interface SlideTotals {
  k12Students: number;
  k12Schools: number;
  k12Missing: number;
  higherEdStudents: number;
  higherEdSchools: number;
  higherEdMissing: number;
  employees: number;
  employers: number;
  employersMissing: number;
}

/** Summed from the rows. A row with no number is counted as missing, never as zero. */
export function computeTotals(rows: ExportRows): SlideTotals {
  const k12 = rows.schools.filter((r) => !isHigherEd(r));
  const he = rows.schools.filter(isHigherEd);
  const sum = (xs: unknown[]) => xs.reduce<number>((a, v) => a + (num(v) ?? 0), 0);
  const missing = (xs: unknown[]) => xs.filter((v) => num(v) === null).length;
  return {
    k12Students: sum(k12.map((r) => r.enrollment)), k12Schools: k12.length, k12Missing: missing(k12.map((r) => r.enrollment)),
    higherEdStudents: sum(he.map((r) => r.enrollment)), higherEdSchools: he.length, higherEdMissing: missing(he.map((r) => r.enrollment)),
    employees: sum(rows.employers.map((r) => r.headcount)), employers: rows.employers.length,
    employersMissing: missing(rows.employers.map((r) => r.headcount)),
  };
}

// ---------------------------------------------------------------------------
// Text measurement (no font engine in the worker: Helvetica AFM widths, padded)
// ---------------------------------------------------------------------------

// Widths per 1000 em for ASCII 32..126 (Helvetica). Aptos runs close to it; SAFETY covers the gap.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778,
  722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const SAFETY = 1.1;

export const FONT_PT = 8;
/** Width of `text` in inches at FONT_PT. */
export function textWidthIn(text: string, pt = FONT_PT): number {
  let units = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    units += c >= 32 && c <= 126 ? W[c - 32] : 600;
  }
  return (units / 1000) * (pt / 72) * SAFETY;
}

const PAD_X = 0.1; // inches, total horizontal padding inside the callout
export const CALLOUT_H = 0.34; // two 8pt lines plus padding
export const calloutWidth = (c: Callout) => Math.max(textWidthIn(c.line1), textWidthIn(c.line2)) + PAD_X;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface Rect { x: number; y: number; w: number; h: number }
export type Pointer = 'down' | 'up' | 'left' | 'right';
export interface Placed extends Rect { callout: Callout; pointer: Pointer; offSlide: boolean }

const TAIL = 0.14; // how far the pointer tip reaches outside the box
const GAP = 0.05;

/**
 * Rings along the inside edges of the map, clockwise: top row (left→right, pointing down), right
 * column (top→bottom, pointing left), bottom row (right→left, pointing up), left column
 * (bottom→top, pointing right); then the next ring inward. Rows and columns never share space, so
 * nothing overlaps, pointer tails included. Whatever does not fit inside the map is staged on the
 * pasteboard to the right of the slide — still in pin order, still not overlapping.
 */
export function layoutCallouts(callouts: Callout[], map: Rect, slideW: number): Placed[] {
  const placed: Placed[] = [];
  const queue = [...callouts];
  const h = CALLOUT_H;
  let r = { left: map.x + GAP, right: map.x + map.w - GAP, top: map.y + GAP, bottom: map.y + map.h - GAP };

  const take = (fits: (w: number) => boolean): Callout | null => {
    if (!queue.length || !fits(calloutWidth(queue[0]))) return null;
    return queue.shift()!;
  };

  while (queue.length) {
    const rowFits = r.bottom - r.top >= 2 * (h + TAIL) + GAP;
    if (!rowFits || r.right - r.left < 1) break;
    const before = queue.length;
    // Top row
    let x = r.left;
    const topY = r.top;
    for (let c; (c = take((w) => x + w <= r.right));) {
      const w = calloutWidth(c);
      placed.push({ callout: c, x, y: topY, w, h, pointer: 'down', offSlide: false });
      x += w + GAP;
    }
    // Columns live strictly between the two rows.
    const colTop = topY + h + TAIL + GAP;
    const bottomY = r.bottom - h;
    const colBottom = bottomY - TAIL - GAP;
    // Right column
    let y = colTop, rightW = 0;
    for (let c; (c = take((w) => y + h <= colBottom && w <= (r.right - r.left) / 2 - TAIL));) {
      const w = calloutWidth(c);
      placed.push({ callout: c, x: r.right - w, y, w, h, pointer: 'left', offSlide: false });
      rightW = Math.max(rightW, w);
      y += h + GAP;
    }
    // Bottom row
    x = r.right;
    for (let c; (c = take((w) => x - w >= r.left));) {
      const w = calloutWidth(c);
      placed.push({ callout: c, x: x - w, y: bottomY, w, h, pointer: 'up', offSlide: false });
      x -= w + GAP;
    }
    // Left column: must also clear the right column horizontally.
    y = colBottom - h;
    let leftW = 0;
    for (let c; (c = take((w) => y >= colTop && r.left + w + TAIL + GAP <= r.right - (rightW ? rightW + TAIL + GAP : 0)));) {
      const w = calloutWidth(c);
      placed.push({ callout: c, x: r.left, y, w, h, pointer: 'right', offSlide: false });
      leftW = Math.max(leftW, w);
      y -= h + GAP;
    }
    if (queue.length === before) break; // nothing fit this ring: the next one is smaller still
    r = {
      left: r.left + (leftW ? leftW + TAIL + GAP : 0),
      right: r.right - (rightW ? rightW + TAIL + GAP : 0),
      top: r.top + h + TAIL + GAP,
      bottom: r.bottom - h - TAIL - GAP,
    };
  }

  // Pasteboard overflow: columns to the right of the slide.
  let px = slideW + 0.3, py = map.y, colW = 0;
  for (const c of queue) {
    const w = calloutWidth(c);
    if (py + h > map.y + map.h) { px += colW + TAIL + GAP; py = map.y; colW = 0; }
    placed.push({ callout: c, x: px, y: py, w, h, pointer: 'left', offSlide: true });
    colW = Math.max(colW, w);
    py += h + TAIL + GAP;
  }
  return placed;
}

/** wedgeRoundRectCallout adjust values: the tip as a fraction of the box from its centre (×100000). */
export function pointerAdjust(p: Placed): { adj1: number; adj2: number } {
  const v = Math.round((0.5 + TAIL / p.h) * 100000);
  const hz = Math.round((0.5 + TAIL / p.w) * 100000);
  switch (p.pointer) {
    case 'down': return { adj1: 0, adj2: v };
    case 'up': return { adj1: 0, adj2: -v };
    case 'right': return { adj1: hz, adj2: 0 };
    case 'left': return { adj1: -hz, adj2: 0 };
  }
}

// ---------------------------------------------------------------------------
// The slide: written into Mike's Starbucks slide template
// ---------------------------------------------------------------------------

/**
 * The template (templates/starbucks-slide-template.pptx) is a 4:3 deck whose "1_Title Slide" layout
 * draws the Starbucks-green bar (#00704A, full width, 0.75in), the siren at the right, a white
 * city / cross-streets text box beside it, and a title placeholder (idx 13) on the left of the bar.
 * We keep the master, theme and layout as they are, with two changes to the layout:
 *   - the city / cross-streets box moves from the layout onto the slide (same place, same format),
 *     so each site's slide carries its own text and it is editable without opening the master;
 *   - a picture placeholder ("Paste Sites USA map") is added below the bar.
 * Then slide1.xml is written from scratch: map placeholder first (behind), title, totals, callouts.
 */

const EMU = 914400;
export const SLIDE_W = 10;
export const SLIDE_H = 7.5;
const BAR_H = 0.75; // the template's green bar
export const MAP_RECT: Rect = { x: 0.15, y: BAR_H + 0.1, w: SLIDE_W - 0.3, h: SLIDE_H - BAR_H - 0.1 - 0.15 };

const FILL: Record<CalloutGroup, string> = { school: 'FFFFFF', employer: 'E3A47B', generator: 'FFFFFF' };
const LAYOUT = 'ppt/slideLayouts/slideLayout12.xml';
const MAP_PH_IDX = 100;

export interface SlideInput {
  siteName: string;
  /** Header line 1, e.g. "Covington, GA". */
  cityState: string;
  /** Header line 2: the template shows cross streets; OVIS has the property address. */
  street: string;
  rows: ExportRows;
}

export interface SlideResult {
  pptx: Uint8Array;
  callouts: number;
  offSlide: number;
  mergedGenerators: string[];
  totals: SlideTotals;
}

export function totalsLines(t: SlideTotals): string[] {
  // A row with no number is said out loud, never folded in as zero.
  const miss = (n: number) => (n ? ` · ${n} not on file` : '');
  const lines = [`Total students (K-12): ${fmt(t.k12Students)}${miss(t.k12Missing)}`];
  // IPEDS headcount is its own group with its own vintage: shown beside the K-12 total, never added.
  if (t.higherEdSchools) lines.push(`College students (IPEDS, not added): ${fmt(t.higherEdStudents)}${miss(t.higherEdMissing)}`);
  lines.push(`Total employees: ${fmt(t.employees)}${miss(t.employersMissing)}`);
  return lines;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const emu = (inches: number) => Math.round(inches * EMU);
const xfrm = (r: Rect) => `<a:xfrm><a:off x="${emu(r.x)}" y="${emu(r.y)}"/><a:ext cx="${emu(r.w)}" cy="${emu(r.h)}"/></a:xfrm>`;
const run = (text: string, sz: number, color: string, extra = '') =>
  `<a:r><a:rPr lang="en-US" sz="${sz}" dirty="0"${extra}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
  `<a:latin typeface="Aptos"/><a:cs typeface="Aptos"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;

function calloutXml(p: Placed, id: number, i: number): string {
  const { adj1, adj2 } = pointerAdjust(p);
  const para = (t: string) => `<a:p><a:pPr algn="ctr"/>${run(t, FONT_PT * 100, '000000')}</a:p>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Callout ${i}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(p)}<a:prstGeom prst="wedgeRoundRectCallout"><a:avLst>` +
    `<a:gd name="adj1" fmla="val ${adj1}"/><a:gd name="adj2" fmla="val ${adj2}"/><a:gd name="adj3" fmla="val 16667"/></a:avLst></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${FILL[p.callout.group]}"/></a:solidFill>` +
    `<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></p:spPr>` +
    // wrap="none" + spAutoFit: editing the text in PowerPoint resizes the box; the font never shrinks.
    `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
    `${para(p.callout.line1)}${para(p.callout.line2)}</p:txBody></p:sp>`;
}

function slideXml(input: SlideInput, totals: SlideTotals, placed: Placed[]): string {
  let id = 2;
  const shapes: string[] = [];
  // 1. The map placeholder, first in the tree so a pasted map sits behind everything else.
  shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Sites USA map"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="pic" idx="${MAP_PH_IDX}"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>`);
  // 2. Title: the layout's own placeholder on the left of the bar (white Calibri 21pt from the layout).
  shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="body" sz="quarter" idx="13"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm({ x: 0.1875, y: 0.0729, w: 1.55, h: 0.6024 })}</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>Generators</a:t></a:r></a:p></p:txBody></p:sp>`);
  // 3. Totals, in the bar between the title and the city box. Summed from the rows.
  const tl = totalsLines(totals);
  shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="Totals"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm({ x: 1.8, y: 0.0729, w: 3.6, h: 0.6024 })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/>` +
    tl.map((t) => `<a:p>${run(t, tl.length > 2 ? 900 : 1000, 'FFFFFF')}</a:p>`).join('') + `</p:txBody></p:sp>`);
  // 4. City / street: the template's text box, moved onto the slide unchanged except for its text.
  const cityRun = (t: string) => `<a:r><a:rPr lang="en-US" sz="1200" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
  shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="City and streets"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="5208106" y="66529"/><a:ext cx="3219818" cy="461665"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"><a:spAutoFit/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:pPr algn="r"/>${cityRun(input.cityState)}</a:p>` +
    `<a:p><a:pPr marL="0" indent="0" algn="r"><a:buNone/></a:pPr>${cityRun(input.street)}</a:p></p:txBody></p:sp>`);
  // 5. Callouts.
  placed.forEach((p, i) => shapes.push(calloutXml(p, id++, i)));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shapes.join('') +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

/** Layout 12: drop the hard-coded city box (it moves to the slide) and add the map picture placeholder. */
function layoutXml(xml: string): string {
  const cityBox = xml.match(/<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="Rectangle 8">[\s\S]*?<\/p:sp>/);
  if (!cityBox) throw new Error('template changed: layout 12 has no "Rectangle 8" city box');
  const mapPh = `<p:sp><p:nvSpPr><p:cNvPr id="20" name="Sites USA map"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="pic" idx="${MAP_PH_IDX}"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr>${xfrm(MAP_RECT)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle><a:lvl1pPr marL="0" indent="0" algn="ctr"><a:buNone/>` +
    `<a:defRPr sz="1800"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>` +
    `<a:p><a:r><a:rPr lang="en-US"/><a:t>Paste Sites USA map</a:t></a:r></a:p></p:txBody></p:sp>`;
  // The map goes right after the group properties, so it is behind the bar, the siren and the title.
  return xml.replace(cityBox[0], '').replace('</p:grpSpPr>', `</p:grpSpPr>${mapPh}`);
}

export async function buildGeneratorsSlide(input: SlideInput): Promise<SlideResult> {
  const { callouts, mergedGenerators } = buildCallouts(input.rows);
  const totals = computeTotals(input.rows);
  const placed = layoutCallouts(callouts, MAP_RECT, SLIDE_W);

  const zip = await JSZip.loadAsync(decodeBase64(STARBUCKS_TEMPLATE_B64.replace(/\s+/g, '')));
  zip.file(LAYOUT, layoutXml(await zip.file(LAYOUT)!.async('string')));
  zip.file('ppt/slides/slide1.xml', slideXml(input, totals, placed));
  // The template's thumbnail shows the Covington mock-up; drop it rather than ship a stale preview.
  zip.remove('docProps/thumbnail.jpeg');
  zip.file('_rels/.rels', (await zip.file('_rels/.rels')!.async('string'))
    .replace(/<Relationship [^>]*thumbnail\.jpeg"[^>]*\/>/, ''));
  zip.file('docProps/core.xml', (await zip.file('docProps/core.xml')!.async('string'))
    .replace(/<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/, '')
    .replace('</cp:coreProperties>', `<dc:title>${esc(`Generators — ${input.siteName}`)}</dc:title></cp:coreProperties>`));

  const pptx = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { pptx, callouts: placed.length, offSlide: placed.filter((p) => p.offSlide).length, mergedGenerators, totals };
}


/** "Generators - <site>.pptx", safe for a Content-Disposition header and every OS. */
export function slideFilename(siteName: string): string {
  const clean = siteName.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Site';
  return `Generators - ${clean}.pptx`;
}
