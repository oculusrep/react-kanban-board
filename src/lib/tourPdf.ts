// Tour PDF export (Letter portrait). Pure builder: takes already-computed tour data (route
// geometry from the map's cached Directions results, schedule minutes, totals) and draws it.
// It makes NO Directions/Distance Matrix calls. The only network it touches is one Maps
// Static API basemap per map image (overview + one per day), fetched through `loadImage`.
//
// Maps are a plain grayscale basemap with routes, pins and A/B drawn on top as PDF vectors
// (see staticMapProjection.ts), so numbers > 9 work, nothing hits the Static URL length cap,
// and everything prints clean in black & white: white pins with black numbers, dark routes
// with a white casing, and per-day dash patterns on the overview.
//
// Only tour-facing fields come in: stop name, property address, times, minutes, category,
// notes. No deal financials, no email content.

import { jsPDF } from 'jspdf';
import { fitFrame, projector, simplifyPx, staticMapUrl, type Frame, type LatLng } from './staticMapProjection';
import { formatClock12, formatDriveMinutes } from './tourRouting';

export interface PdfStopRow {
  number: number;
  name: string;
  address: string | null;
  arriveMin: number | null; // clock minutes
  minutes: number; // time at stop
  category: string | null;
  driveNextMin: number | null;
  nextIsEnd: boolean;
  notes: string | null;
  coord: LatLng | null; // null = no location (listed, not routed)
  approach: LatLng[]; // pass-through points routed into this stop
}

export interface PdfDay {
  dayNumber: number;
  date: string | null; // YYYY-MM-DD
  color: string; // day color (overview only)
  startAddress: string | null;
  startCoord: LatLng | null;
  startTimeMin: number | null;
  driveFromStartMin: number | null;
  endAddress: string | null;
  endCoord: LatLng | null;
  endTimeMin: number | null; // planned end of day
  stops: PdfStopRow[];
  paths: LatLng[][]; // route polylines (incl. approach legs)
  totals: { driveMin: number | null; stopMin: number; finishMin: number | null; overEnd: boolean };
  note: string | null; // traffic note
}

export interface PdfTour {
  name: string;
  client: string | null;
  days: PdfDay[];
  generatedLabel: string; // e.g. "Oct 30, 2026 10:42 AM ET"
}

export interface PdfOptions {
  apiKey: string;
  /** Fetch an image URL → data URL (null on failure). Injected so the builder stays testable. */
  loadImage: (url: string) => Promise<string | null>;
}

// ---- layout constants (pt) ----
const PAGE_W = 612;
const PAGE_H = 792;
const M = 40; // margin
const CW = PAGE_W - 2 * M; // content width 532
const FOOTER_Y = PAGE_H - 24;
const BOTTOM = PAGE_H - 48; // last usable y for content

const MIDNIGHT = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const INK = '#1F2937';
const MUTED = '#4B5563';
const RULE = '#C9D3E0';
const HEAD_FILL = '#E8EDF4';

// Overview dash patterns per day (B&W-distinguishable); index by day order.
const DASHES: number[][] = [[], [6, 3], [2, 2], [8, 3, 2, 3], [1.2, 2.4], [10, 4]];

// Table columns: #, Stop, Address, Arrive, Min, Category, Drive to next (sum = CW).
const COLS = [
  { key: 'n', title: '#', w: 20 },
  { key: 'stop', title: 'Stop', w: 128 },
  { key: 'addr', title: 'Address', w: 126 },
  { key: 'arr', title: 'Arrive', w: 50 },
  { key: 'min', title: 'Min', w: 30 },
  { key: 'cat', title: 'Category', w: 80 },
  { key: 'drive', title: 'Drive to next', w: 98 },
] as const;

// Standard PDF fonts are WinAnsi: map common typography down, drop anything else.
export function pdfText(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[→➜➡]/g, '->')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A1-\u00FF]/g, '');
}

export function formatDayDate(d: string | null): string | null {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const dur = (min: number | null | undefined) => (min == null ? '' : formatDriveMinutes(Math.round(min)));
const clock = (min: number | null | undefined) => (min == null ? '' : formatClock12(Math.round(min)));

function dayPoints(d: PdfDay): LatLng[] {
  const pts: LatLng[] = d.paths.flat();
  d.stops.forEach((s) => {
    if (s.coord) pts.push(s.coord);
    pts.push(...s.approach);
  });
  if (d.startCoord) pts.push(d.startCoord);
  if (d.endCoord) pts.push(d.endCoord);
  return pts;
}

export async function buildTourPdf(tour: PdfTour, opts: PdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  doc.setProperties({ title: pdfText(`${tour.name} - Tour`), creator: 'OVIS' });

  const days = tour.days;
  const dated = days.map((d) => d.date).filter((x): x is string => !!x).sort();
  const dateLine =
    dated.length === 0
      ? 'Dates to be scheduled'
      : dated[0] === dated[dated.length - 1]
      ? formatDayDate(dated[0])!
      : `${formatDayDate(dated[0])} - ${formatDayDate(dated[dated.length - 1])}`;
  const stopCount = days.reduce((n, d) => n + d.stops.length, 0);

  // Day basemaps start loading now; the overview's height depends on the cover text, so
  // it's framed and requested once that's laid out. One request per image, no retries.
  // Shrink a day's map (down to MIN_DAY_MAP) when that keeps the whole day on one page.
  const dayMapH = days.map((d) => {
    // -8: slack for the frame's whole-pixel rounding (the budget is otherwise exact).
    const avail = BOTTOM - (M + 24 + daySpanHeight(doc, d)) - 14 - 8;
    const tableH = drawSchedule(doc, d, 0, tour.name, true);
    return Math.max(MIN_DAY_MAP, Math.min(MAX_DAY_MAP, avail - tableH));
  });
  const dayFrames = days.map((d, i) => fitFrame(dayPoints(d), 640, Math.round(640 * (dayMapH[i] / CW)), 36));
  const dayImgsP = Promise.all(dayFrames.map((f) => opts.loadImage(staticMapUrl(f, opts.apiKey))));

  // ---------------- page 1: cover + overview ----------------
  doc.setFillColor(MIDNIGHT);
  doc.rect(0, 0, PAGE_W, 58, 'F');
  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('OCULUS', M, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(SLATE);
  doc.text('Tour itinerary', PAGE_W - M, 36, { align: 'right' });

  let y = 92;
  doc.setTextColor(MIDNIGHT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  const nameLines = doc.splitTextToSize(pdfText(tour.name), CW) as string[];
  doc.text(nameLines, M, y);
  y += nameLines.length * 25;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(STEEL);
  if (tour.client) {
    doc.text(pdfText(`Client: ${tour.client}`), M, y);
    y += 16;
  }
  doc.text(pdfText(dateLine), M, y);
  y += 16;
  doc.setTextColor(MUTED);
  doc.setFontSize(10);
  doc.text(`${days.length} day${days.length === 1 ? '' : 's'}  ·  ${stopCount} stop${stopCount === 1 ? '' : 's'}`, M, y);
  y += 14;

  const legendH = Math.ceil(days.length / 2) * 14 + 8;
  const ovH = Math.min(CW * (560 / 640), BOTTOM - y - legendH);
  const ovFit = fitFrame(days.flatMap(dayPoints), 640, Math.min(640, Math.round(640 * (ovH / CW))), 40);
  const [ovImg, dayImgs] = await Promise.all([opts.loadImage(staticMapUrl(ovFit, opts.apiKey)), dayImgsP]);
  drawMap(doc, ovImg, ovFit, M, y, CW, (ctx) => {
    days.forEach((d, i) => drawRoute(doc, ctx, d.paths, d.color, DASHES[i % DASHES.length]));
    days.forEach((d) => drawDayMarkers(doc, ctx, d, true));
  });
  y += ovH + 12;

  // Legend: dash sample + day label.
  doc.setFontSize(8.5);
  days.forEach((d, i) => {
    const lx = M + (i % 2) * (CW / 2);
    const ly = y + Math.floor(i / 2) * 14;
    doc.setDrawColor('#FFFFFF');
    doc.setLineWidth(3.4);
    doc.setLineDashPattern([], 0);
    doc.line(lx, ly - 3, lx + 34, ly - 3);
    doc.setDrawColor(d.color);
    doc.setLineWidth(1.8);
    doc.setLineDashPattern(DASHES[i % DASHES.length], 0);
    doc.line(lx, ly - 3, lx + 34, ly - 3);
    doc.setLineDashPattern([], 0);
    doc.setTextColor(INK);
    const label = [`Day ${d.dayNumber}`, formatDayDate(d.date), `${d.stops.length} stop${d.stops.length === 1 ? '' : 's'}`]
      .filter(Boolean)
      .join('  ·  ');
    doc.text(pdfText(label), lx + 42, ly);
  });

  // ---------------- one section per day ----------------
  days.forEach((d, i) => {
    doc.addPage();
    let yy = M;
    doc.setTextColor(MIDNIGHT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(pdfText([`Day ${d.dayNumber}`, formatDayDate(d.date)].filter(Boolean).join('  ·  ')), M, yy + 8);
    yy += 24;
    doc.setTextColor(STEEL);
    const spanLines = daySpanLines(doc, d);
    if (spanLines.length) {
      doc.text(spanLines, M, yy);
      yy += daySpanHeight(doc, d);
    }

    const mapH = dayFrames[i].height * (CW / 640);
    drawMap(doc, dayImgs[i], dayFrames[i], M, yy, CW, (ctx) => {
      drawRoute(doc, ctx, d.paths, MIDNIGHT, []);
      drawDayMarkers(doc, ctx, d, false);
    });
    yy += mapH + 14;

    yy = drawSchedule(doc, d, yy, tour.name);
  });

  // ---------------- footers ----------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([], 0);
    doc.line(M, FOOTER_Y - 10, PAGE_W - M, FOOTER_Y - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(pdfText(`${tour.name}  ·  Page ${p} of ${pages}`), M, FOOTER_Y);
    doc.text(pdfText(`Prepared by Oculus  ·  ${tour.generatedLabel}`), PAGE_W - M, FOOTER_Y, { align: 'right' });
  }
  return doc;
}

// ---------------- map drawing ----------------

interface MapCtx {
  toPt: (p: LatLng) => { x: number; y: number };
  k: number; // pt per logical px
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawMap(doc: jsPDF, img: string | null, frame: Frame, x: number, y: number, w: number, draw: (ctx: MapCtx) => void) {
  const k = w / frame.width;
  const h = frame.height * k;
  if (img) {
    doc.addImage(img, 'PNG', x, y, w, h, undefined, 'FAST');
  } else {
    doc.setFillColor('#F5F7FA');
    doc.rect(x, y, w, h, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text('Basemap unavailable - route and stops shown without streets', x + 6, y + h - 6);
  }
  const proj = projector(frame);
  const ctx: MapCtx = {
    toPt: (p) => {
      const px = proj(p);
      return { x: x + px.x * k, y: y + px.y * k };
    },
    k,
    x,
    y,
    w,
    h,
  };
  draw(ctx);
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(SLATE);
  doc.setLineWidth(0.75);
  doc.rect(x, y, w, h, 'S');
}

function strokePath(doc: jsPDF, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  const rel = pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y]);
  doc.lines(rel, pts[0].x, pts[0].y, [1, 1], 'S', false);
}

function drawRoute(doc: jsPDF, ctx: MapCtx, paths: LatLng[][], color: string, dash: number[]) {
  const projected = paths.map((p) => simplifyPx(p.map(ctx.toPt), 0.8));
  doc.setLineJoin('round');
  doc.setLineCap('round');
  // White casing first so the line reads on any basemap and on B&W paper.
  doc.setLineDashPattern([], 0);
  doc.setDrawColor('#FFFFFF');
  doc.setLineWidth(4);
  projected.forEach((pts) => strokePath(doc, pts));
  doc.setDrawColor(color);
  doc.setLineWidth(2);
  doc.setLineDashPattern(dash, 0);
  projected.forEach((pts) => strokePath(doc, pts));
  doc.setLineDashPattern([], 0);
}

function drawDayMarkers(doc: jsPDF, ctx: MapCtx, d: PdfDay, overview: boolean) {
  // Approach points: small hollow rings.
  if (!overview) {
    doc.setLineWidth(0.8);
    doc.setDrawColor(MIDNIGHT);
    doc.setFillColor('#FFFFFF');
    d.stops.forEach((s) =>
      s.approach.forEach((a) => {
        const p = ctx.toPt(a);
        doc.circle(p.x, p.y, 2.2, 'FD');
      })
    );
  }
  if (d.startCoord) square(doc, ctx.toPt(d.startCoord), 'A');
  if (d.endCoord) square(doc, ctx.toPt(d.endCoord), 'B');
  // Later stops drawn last so earlier numbers don't hide later ones at the same spot.
  d.stops
    .filter((s) => s.coord)
    .forEach((s) => pin(doc, ctx.toPt(s.coord!), overview ? `${s.number}` : String(s.number), overview ? 5.6 : 7));
}

function pin(doc: jsPDF, p: { x: number; y: number }, label: string, r: number) {
  doc.setLineDashPattern([], 0);
  doc.setFillColor('#FFFFFF');
  doc.setDrawColor('#000000');
  doc.setLineWidth(1);
  doc.circle(p.x, p.y, r, 'FD');
  doc.setTextColor('#000000');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(label.length > 1 ? r * 1.05 : r * 1.25);
  doc.text(label, p.x, p.y, { align: 'center', baseline: 'middle' });
}

function square(doc: jsPDF, p: { x: number; y: number }, label: string) {
  const s = 6.5;
  doc.setLineDashPattern([], 0);
  doc.setFillColor('#000000');
  doc.setDrawColor('#FFFFFF');
  doc.setLineWidth(1);
  doc.rect(p.x - s, p.y - s, 2 * s, 2 * s, 'FD');
  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(label, p.x, p.y, { align: 'center', baseline: 'middle' });
}

const MAX_DAY_MAP = CW * (340 / 640); // ~283pt
const MIN_DAY_MAP = 190;

// "Start 7:00 AM · from … · End at … · planned end 6:00 PM" (sets the font it measures in).
function daySpanLines(doc: jsPDF, d: PdfDay): string[] {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const span = [
    d.startTimeMin != null ? `Start ${clock(d.startTimeMin)}` : null,
    d.startAddress ? `from ${d.startAddress}` : null,
    d.endAddress ? `End at ${d.endAddress}` : null,
    d.endTimeMin != null ? `planned end ${clock(d.endTimeMin)}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  return span ? (doc.splitTextToSize(pdfText(span), CW) as string[]) : [];
}
function daySpanHeight(doc: jsPDF, d: PdfDay): number {
  const n = daySpanLines(doc, d).length;
  return n ? n * 12 + 4 : 0;
}

// Raw property addresses sometimes join route names with ';' ("4545 US 23;GA 42").
const cleanAddress = (a: string | null) => (a ? a.replace(/\s*;\s*/g, ' / ') : a);

// ---------------- schedule table ----------------

// measure = true: draw nothing, never break pages, return the table + totals height.
function drawSchedule(doc: jsPDF, d: PdfDay, y: number, tourName: string, measure = false): number {
  const y0 = y;
  const FS = 8.5;
  const LH = 10.5;
  const PADY = 4;

  const header = (yy: number) => {
    doc.setFillColor(HEAD_FILL);
    doc.rect(M, yy, CW, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(MIDNIGHT);
    let x = M;
    COLS.forEach((c) => {
      doc.text(c.title, x + 3, yy + 11);
      x += c.w;
    });
    return yy + 16;
  };

  const newPage = () => {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(STEEL);
    doc.text(pdfText(`Day ${d.dayNumber} (continued)  ·  ${tourName}`), M, M);
    return header(M + 8);
  };

  type Cell = { text: string; bold?: boolean };
  const row = (cells: Cell[], notes: string | null, yy: number, opts: { shade?: boolean } = {}) => {
    doc.setFontSize(FS);
    const wrapped = cells.map((c, i) => {
      doc.setFont('helvetica', c.bold ? 'bold' : 'normal');
      return doc.splitTextToSize(pdfText(c.text), COLS[i].w - 6) as string[];
    });
    let h = Math.max(...wrapped.map((w) => Math.max(1, w.length))) * LH + 2 * PADY;
    let noteLines: string[] = [];
    if (notes) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      noteLines = doc.splitTextToSize(pdfText(`Notes: ${notes}`), CW - COLS[0].w - 6) as string[];
      h += noteLines.length * 10 + 2;
    }
    if (measure) return yy + h;
    if (yy + h > BOTTOM) yy = newPage();
    if (opts.shade) {
      doc.setFillColor('#F4F6F9');
      doc.rect(M, yy, CW, h, 'F');
    }
    let x = M;
    wrapped.forEach((lines, i) => {
      doc.setFont('helvetica', cells[i].bold ? 'bold' : 'normal');
      doc.setFontSize(FS);
      doc.setTextColor(INK);
      doc.text(lines, x + 3, yy + PADY + 8);
      x += COLS[i].w;
    });
    if (noteLines.length) {
      const ny = yy + PADY + Math.max(...wrapped.map((w) => Math.max(1, w.length))) * LH + 6;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(MUTED);
      doc.text(noteLines, M + COLS[0].w + 3, ny);
    }
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.5);
    doc.line(M, yy + h, M + CW, yy + h);
    return yy + h;
  };

  if (measure) y += 16;
  else if (y + 60 > BOTTOM) y = newPage();
  else y = header(y);

  if (d.startAddress || d.startTimeMin != null) {
    y = row(
      [
        { text: 'A', bold: true },
        { text: 'Start', bold: true },
        { text: cleanAddress(d.startAddress) ?? '' },
        { text: clock(d.startTimeMin) },
        { text: '' },
        { text: '' },
        { text: d.driveFromStartMin != null ? dur(d.driveFromStartMin) : '' },
      ],
      null,
      y,
      { shade: true }
    );
  }

  if (d.stops.length === 0 && measure) y += 22;
  else if (d.stops.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text('No stops scheduled on this day.', M + 3, y + 14);
    y += 22;
  }

  d.stops.forEach((s) => {
    const drive =
      s.driveNextMin == null ? '' : `${dur(s.driveNextMin)}${s.nextIsEnd ? ' to end' : ''}`;
    y = row(
      [
        { text: String(s.number), bold: true },
        { text: s.name, bold: true },
        { text: [cleanAddress(s.address), s.coord ? null : '(no location - not routed)'].filter(Boolean).join(' ') },
        { text: clock(s.arriveMin) },
        { text: String(s.minutes) },
        { text: s.category ?? '' },
        { text: drive },
      ],
      s.notes?.trim() ? s.notes.trim() : null,
      y
    );
  });

  if (d.endAddress) {
    y = row(
      [
        { text: 'B', bold: true },
        { text: 'End', bold: true },
        { text: cleanAddress(d.endAddress) ?? '' },
        { text: clock(d.totals.finishMin) },
        { text: '' },
        { text: '' },
        { text: '' },
      ],
      null,
      y,
      { shade: true }
    );
  }

  // Totals + traffic note.
  const totals = [
    d.totals.driveMin != null ? `Drive ${dur(d.totals.driveMin)}` : null,
    `Stops ${dur(d.totals.stopMin)}`,
    d.totals.finishMin != null ? `Finish ${clock(d.totals.finishMin)}` : null,
  ]
    .filter(Boolean)
    .join('     ');
  const noteLines = d.note ? (doc.splitTextToSize(pdfText(d.note), CW) as string[]) : [];
  const blockH = 18 + (d.totals.overEnd ? 12 : 0) + noteLines.length * 10;
  if (measure) return y + blockH + 8 - y0;
  if (y + blockH + 8 > BOTTOM) y = newPage();
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(MIDNIGHT);
  doc.text(pdfText(totals), M, y);
  if (d.totals.overEnd && d.endTimeMin != null) {
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(INK);
    doc.text(pdfText(`Runs past the planned end of day (${clock(d.endTimeMin)}).`), M, y);
  }
  if (noteLines.length) {
    y += 12;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(noteLines, M, y);
    y += (noteLines.length - 1) * 10;
  }
  return y;
}

/** Browser loader: fetch → data URL. Static Maps sends Access-Control-Allow-Origin: *. */
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
