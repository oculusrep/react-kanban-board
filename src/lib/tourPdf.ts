// Tour itinerary PDF (Letter landscape, full color). Pure builder: takes already-computed tour
// data (route geometry from the map's cached Directions results, schedule minutes, totals)
// and draws it. It makes NO Directions/Distance Matrix calls. Network it touches, all through
// `loadImage`: one Maps Static API basemap per map image (overview + one per day), the brand
// logos, and the store icon PNGs.
//
// Maps are a standard color Google basemap with routes (day colors), pins and store logos
// drawn on top as PDF vectors/images (see staticMapProjection.ts) — numbers > 9 work and
// nothing hits the Static URL length cap.
//
// Only itinerary fields come in: stop name, address, market, city, status, notes, projected
// opening, times. No deal financials, no email content.

import { jsPDF } from 'jspdf';
import { fitFrame, frameBounds, projector, simplifyPx, staticMapUrl, type Frame, type LatLng } from './staticMapProjection';
import { formatClock12, formatDriveMinutes, type StopKind } from './tourRouting';
import { declutterLogos, declutterPins, type DeclutterItem } from './pinDeclutter';

export interface PdfStopRow {
  siteNo: number | null; // site submits only
  kind: StopKind;
  name: string;
  address: string | null;
  market: string | null;
  city: string | null;
  status: string;
  notes: string | null;
  projectedOpening: string | null;
  minutes: number;
  arriveMin: number | null; // clock minutes
  departMin: number | null;
  driveNextMin: number | null;
  arriveNextMin: number | null;
  nextIsEnd: boolean;
  coord: LatLng | null; // null = no location (listed, not routed)
  approach: LatLng[];
  iconUrl: string | null; // Atlas store logo (licensed stops get a plain 'LS' pin — no licensed logos on PDF maps)
  glyph: string | null; // custom stop letter (L / C / H / M / *)
}

export interface PdfStore {
  kind: 'atlas_store';
  store_number: string;
  lat: number;
  lng: number;
  iconUrl: string;
}

export interface PdfDay {
  dayNumber: number;
  date: string | null; // YYYY-MM-DD
  color: string;
  startAddress: string | null;
  startCoord: LatLng | null;
  startTimeMin: number | null;
  driveFromStartMin: number | null;
  endAddress: string | null;
  endCoord: LatLng | null;
  endTimeMin: number | null; // planned end of day
  stops: PdfStopRow[];
  paths: LatLng[][];
  totals: { driveMin: number | null; stopMin: number; finishMin: number | null; overEnd: boolean };
  note: string | null; // traffic note
}

export interface PdfTour {
  name: string;
  client: string | null;
  days: PdfDay[];
  generatedLabel: string;
  /** Atlas stores that may be overlaid on maps (the builder filters per map). */
  contextStores: PdfStore[];
  /** off = none; near = within 3 mi of that map's route; all = every Atlas store in the frame.
   *  Atlas stores that are tour stops are always drawn (as stops). */
  atlasMode: 'off' | 'near' | 'all';
}

export interface PdfOptions {
  apiKey: string;
  /** Fetch an image URL → PNG/JPEG data URL (null on failure). */
  loadImage: (url: string) => Promise<string | null>;
  /** Brand assets (null/absent = text fallback). Logos are PNG data URLs. */
  brand?: { bandLogo?: string | null; footerMark?: string | null; clientLogo?: string | null };
  /** Oklahoma TTFs (base64) for headings; absent = Helvetica Bold. */
  headingFont?: { regular: string; bold: string } | null;
}

// Heading font for this build: Oklahoma when provided, else Helvetica. Body text is Helvetica.
let HEADING = 'helvetica';
function head(doc: jsPDF, style: 'normal' | 'bold') {
  doc.setFont(HEADING, style);
}

// ---- layout (pt) ----
const PAGE_W = 792;
const PAGE_H = 612;
const M = 36;
const CW = PAGE_W - 2 * M; // 720
const FOOTER_Y = PAGE_H - 18;
const BOTTOM = PAGE_H - 40;
const BAND_H = 54;

const MIDNIGHT = '#011742'; // Oculus navy (PDF brand primary: band, table header, headings)
const GOLD = '#B38535'; // Oculus gold accent: thin rules, day-header underline, totals
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const INK = '#1F2937';
const MUTED = '#4B5563';
const RULE = '#D5DDE8';
const START_GREEN = '#2E7D32';
const END_RED = '#B00020';
const CUSTOM_GRAY = '#6B7280';
const STARBUCKS_GREEN = '#00704A';

const COLS = [
  { title: 'Site #', w: 32 },
  { title: 'Location', w: 122 },
  { title: 'Market', w: 72 },
  { title: 'City', w: 58 },
  { title: 'Status', w: 86 },
  { title: 'Notes', w: 86 },
  { title: 'Projected Opening', w: 56 },
  { title: 'Min', w: 26 },
  { title: 'Start', w: 44 },
  { title: 'End', w: 44 },
  { title: 'Drive to next', w: 50 },
  { title: 'Arrive next', w: 44 },
] as const; // sum = 720

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
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '');
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
// jsPDF embeds an image once per alias; without one, every store icon (hundreds per map)
// is embedded again. Alias = stable id per distinct data URL.
const aliases = new Map<string, string>();
function aliasOf(img: string): string {
  let a = aliases.get(img);
  if (!a) {
    a = `img${aliases.size}`;
    aliases.set(img, a);
  }
  return a;
}

// Raw property addresses sometimes join route names with ';' ("4545 US 23;GA 42").
const cleanAddress = (a: string | null) => (a ? a.replace(/\s*;\s*/g, ' / ') : a);

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

// Logical image width is fixed at 640 (Static Maps max); height follows the slot's aspect.
const frameFor = (pts: LatLng[], slotW: number, slotH: number, pad = 34) =>
  fitFrame(pts, 640, Math.max(120, Math.min(640, Math.round(640 * (slotH / slotW)))), pad);

export async function buildTourPdf(tour: PdfTour, opts: PdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape', compress: true });
  doc.setProperties({ title: pdfText(`${tour.name} - Tour`), creator: 'OVIS' });
  HEADING = 'helvetica';
  if (opts.headingFont) {
    doc.addFileToVFS('Oklahoma-Regular.ttf', opts.headingFont.regular);
    doc.addFont('Oklahoma-Regular.ttf', 'Oklahoma', 'normal');
    doc.addFileToVFS('Oklahoma-Bold.ttf', opts.headingFont.bold);
    doc.addFont('Oklahoma-Bold.ttf', 'Oklahoma', 'bold');
    HEADING = 'Oklahoma';
  }

  // Store icons: fetched once per URL.
  const iconUrls = new Set<string>();
  tour.days.forEach((d) => d.stops.forEach((s) => s.iconUrl && iconUrls.add(s.iconUrl)));
  tour.contextStores.forEach((s) => iconUrls.add(s.iconUrl));
  const icons = new Map<string, string | null>();
  await Promise.all([...iconUrls].map(async (u) => icons.set(u, await opts.loadImage(u))));

  const days = tour.days;
  const dated = days.map((d) => d.date).filter((x): x is string => !!x).sort();
  const dateLine =
    dated.length === 0
      ? 'Dates to be scheduled'
      : dated[0] === dated[dated.length - 1]
      ? formatDayDate(dated[0])!
      : `${formatDayDate(dated[0])} - ${formatDayDate(dated[dated.length - 1])}`;
  const siteCount = days.reduce((n, d) => n + d.stops.filter((s) => s.siteNo != null).length, 0);
  const otherCount = days.reduce((n, d) => n + d.stops.filter((s) => s.siteNo == null).length, 0);

  // ---- per-day layout pre-pass: a dry run of the agenda (same page breaks) says where it
  // ends; the map shares that last page when at least 220pt are left, else gets its own page ----
  const dayLayouts = days.map((d) => {
    const endY = drawAgenda(doc, d, M + dayHeaderHeight(doc, d) + 8, tour.name, true);
    const room = BOTTOM - endY - 14 - 22; // gap + legend row
    const own = frameFor(dayPoints(d), CW, BOTTOM - (M + 26) - 22);
    if (room < 220) return { sharePage: false, frame: own };
    // Zoom is whole-number: a short slot can force a level out. Only share when it doesn't.
    const shared = frameFor(dayPoints(d), CW, Math.min(room, 330));
    return shared.zoom >= own.zoom ? { sharePage: true, frame: shared } : { sharePage: false, frame: own };
  });

  // ---------------- cover ----------------
  const coverTop = BAND_H + 84;
  const coverFrame = frameFor(days.flatMap(dayPoints), CW, BOTTOM - coverTop - 22, 40);
  const [coverImg, ...dayImgs] = await Promise.all(
    [coverFrame, ...dayLayouts.map((l) => l.frame)].map((f) => opts.loadImage(staticMapUrl(f, opts.apiKey)))
  );

  doc.setFillColor(MIDNIGHT);
  doc.rect(0, 0, PAGE_W, BAND_H, 'F');
  const bandLogo = opts.brand?.bandLogo;
  if (bandLogo) {
    const h = 30;
    doc.addImage(bandLogo, 'PNG', M, (BAND_H - h) / 2, h * (189.5 / 49.25), h, aliasOf(bandLogo), 'FAST');
  } else {
    doc.setTextColor('#FFFFFF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('OCULUS', M, 34);
  }
  // Starbucks (client) logo top-right only when public/brand/starbucks-logo.* exists.
  const clientLogo = opts.brand?.clientLogo;
  if (clientLogo) doc.addImage(clientLogo, 'PNG', PAGE_W - M - 38, (BAND_H - 38) / 2, 38, 38, aliasOf(clientLogo), 'FAST');
  doc.setFillColor(GOLD);
  doc.rect(0, BAND_H, PAGE_W, 2, 'F');

  let y = BAND_H + 34;
  doc.setTextColor(MIDNIGHT);
  head(doc, 'bold');
  doc.setFontSize(22);
  doc.text(pdfText(tour.name), M, y);
  y += 19;
  if (tour.client) {
    head(doc, 'normal');
    doc.setFontSize(11.5);
    doc.setTextColor(GOLD);
    doc.text(pdfText(`Prepared for ${tour.client}`), M, y);
    y += 15;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(STEEL);
  const sub = [
    dateLine,
    `${days.length} day${days.length === 1 ? '' : 's'}`,
    `${siteCount} site${siteCount === 1 ? '' : 's'}${otherCount ? ` + ${otherCount} other stop${otherCount === 1 ? '' : 's'}` : ''}`,
  ]
    .filter(Boolean)
    .join('   ·   ');
  doc.text(pdfText(sub), M, y);

  drawMap(doc, coverImg, coverFrame, M, coverTop, CW, (ctx) => {
    drawMapLayer(doc, ctx, coverFrame, tour, icons, days, 0.85, 'overview');
  });
  drawLegend(doc, M, coverTop + coverFrame.height * (CW / 640) + 13, tour, icons, days);

  // ---------------- days ----------------
  days.forEach((d, i) => {
    const L = dayLayouts[i];
    doc.addPage();
    let yy = drawDayHeader(doc, d, M) + 8;
    yy = drawAgenda(doc, d, yy, tour.name, false);
    if (L.sharePage) {
      yy += 14;
    } else {
      doc.addPage();
      head(doc, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(MIDNIGHT);
      doc.text(pdfText(`Day ${d.dayNumber} map${d.date ? `  ·  ${formatDayDate(d.date)}` : ''}`), M, M + 10);
      yy = M + 26;
    }
    drawMap(doc, dayImgs[i], L.frame, M, yy, CW, (ctx) => {
      drawMapLayer(doc, ctx, L.frame, tour, icons, [d], 1, `Day ${d.dayNumber} map`);
    });
    drawLegend(doc, M, yy + L.frame.height * (CW / 640) + 13, tour, icons, [d]);
  });

  // ---------------- footers ----------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(GOLD);
    doc.setLineWidth(0.6);
    doc.line(M, FOOTER_Y - 12, PAGE_W - M, FOOTER_Y - 12);
    let fx = M;
    if (opts.brand?.footerMark) {
      doc.addImage(opts.brand.footerMark, 'PNG', M, FOOTER_Y - 8.5, 11, 11, aliasOf(opts.brand.footerMark), 'FAST');
      fx += 15;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text('Oculus Real Estate Partners  ·  oculusrep.com', fx, FOOTER_Y);
    doc.text(pdfText(`${tour.name}  ·  Generated ${tour.generatedLabel}`), PAGE_W / 2, FOOTER_Y, { align: 'center' });
    doc.text(`Page ${p} of ${pages}`, PAGE_W - M, FOOTER_Y, { align: 'right' });
  }
  return doc;
}

// ---------------- day header ----------------

function dayHeaderLines(doc: jsPDF, d: PdfDay): string[] {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const parts = [
    d.startAddress || d.startTimeMin != null
      ? `Start: ${[clock(d.startTimeMin), cleanAddress(d.startAddress)].filter(Boolean).join('  ')}`
      : null,
    d.endAddress || d.endTimeMin != null
      ? `End / overnight: ${[cleanAddress(d.endAddress), d.endTimeMin != null ? `(planned end ${clock(d.endTimeMin)})` : null].filter(Boolean).join('  ')}`
      : null,
  ].filter(Boolean) as string[];
  return parts.flatMap((p) => doc.splitTextToSize(pdfText(p), CW) as string[]);
}
function dayHeaderHeight(doc: jsPDF, d: PdfDay) {
  return 26 + dayHeaderLines(doc, d).length * 11.5;
}
function drawDayHeader(doc: jsPDF, d: PdfDay, y: number): number {
  doc.setFillColor(d.color); // day route color swatch
  doc.rect(M, y, 5, 18, 'F');
  doc.setTextColor(MIDNIGHT);
  head(doc, 'bold');
  doc.setFontSize(16);
  doc.text(pdfText([`Day ${d.dayNumber}`, formatDayDate(d.date)].filter(Boolean).join('  ·  ')), M + 12, y + 14);
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(M, y + 22, M + CW, y + 22);
  const lines = dayHeaderLines(doc, d);
  doc.setTextColor(STEEL);
  doc.text(lines, M, y + 35, { lineHeightFactor: 1.2 });
  return y + dayHeaderHeight(doc, d);
}

// ---------------- agenda table ----------------

// Returns the y where the agenda (incl. totals) ends on its last page.
// measure = true: a dry run — same wrapping and page breaks, nothing drawn.
function drawAgenda(doc: jsPDF, d: PdfDay, y: number, tourName: string, measure: boolean): number {
  const FS = 7.5;
  const LH = 9;
  const PADY = 3;
  const HEAD_H = 22;

  const header = (yy: number) => {
    doc.setFillColor(MIDNIGHT);
    doc.rect(M, yy, CW, HEAD_H, 'F');
    head(doc, 'bold');
    doc.setFontSize(7);
    doc.setTextColor('#FFFFFF');
    let x = M;
    COLS.forEach((c) => {
      const lines = doc.splitTextToSize(c.title, c.w - 5) as string[];
      doc.text(lines, x + 3, yy + (lines.length > 1 ? 9 : 13.5));
      x += c.w;
    });
    return yy + HEAD_H;
  };
  const newPage = () => {
    if (measure) return M + 8 + HEAD_H;
    doc.addPage();
    head(doc, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(MIDNIGHT);
    doc.text(pdfText(`Day ${d.dayNumber} (continued)  ·  ${tourName}`), M, M);
    return header(M + 8);
  };

  type Cell = { text: string; bold?: boolean; sub?: string | null; color?: string };
  const blank = (n: number): Cell[] => Array.from({ length: n }, () => ({ text: '' }));
  const row = (cells: Cell[], yy: number, shade?: string) => {
    doc.setFontSize(FS);
    const wrapped = cells.map((c, i) => {
      doc.setFont('helvetica', c.bold ? 'bold' : 'normal');
      doc.setFontSize(FS);
      const main = doc.splitTextToSize(pdfText(c.text), COLS[i].w - 6) as string[];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      const sub = c.sub ? (doc.splitTextToSize(pdfText(c.sub), COLS[i].w - 6) as string[]) : [];
      return { main, sub };
    });
    const h = Math.max(...wrapped.map((w) => Math.max(1, w.main.length) * LH + w.sub.length * 8)) + 2 * PADY;
    if (yy + h > BOTTOM) yy = newPage();
    if (measure) return yy + h;
    if (shade) {
      doc.setFillColor(shade);
      doc.rect(M, yy, CW, h, 'F');
    }
    let x = M;
    wrapped.forEach((w, i) => {
      doc.setFont('helvetica', cells[i].bold ? 'bold' : 'normal');
      doc.setFontSize(FS);
      doc.setTextColor(cells[i].color ?? INK);
      doc.text(w.main, x + 3, yy + PADY + 7);
      if (w.sub.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(MUTED);
        doc.text(w.sub, x + 3, yy + PADY + 7 + w.main.length * LH);
      }
      x += COLS[i].w;
    });
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.5);
    doc.line(M, yy + h, M + CW, yy + h);
    return yy + h;
  };

  if (y + 60 > BOTTOM) y = newPage();
  else y = measure ? y + HEAD_H : header(y);

  const firstArrive = d.stops.find((s) => s.coord)?.arriveMin ?? null;
  if (d.startAddress || d.startTimeMin != null) {
    y = row(
      [
        { text: 'A', bold: true, color: START_GREEN },
        { text: 'Start', bold: true, sub: cleanAddress(d.startAddress) },
        ...blank(7),
        { text: clock(d.startTimeMin) },
        { text: dur(d.driveFromStartMin) },
        { text: d.driveFromStartMin != null ? clock(firstArrive) : '' },
      ],
      y,
      '#F2F7F3'
    );
  }
  if (d.stops.length === 0) {
    y = row([{ text: '' }, { text: 'No stops scheduled on this day.' }, ...blank(COLS.length - 2)], y);
  }
  d.stops.forEach((s) => {
    const label =
      s.siteNo != null ? String(s.siteNo) : s.kind === 'atlas_store' ? 'SBUX' : s.kind === 'licensed_store' ? 'LS' : s.glyph ?? '';
    y = row(
      [
        { text: label, bold: true, color: s.siteNo != null ? d.color : s.kind === 'custom' ? CUSTOM_GRAY : STARBUCKS_GREEN },
        { text: s.name, bold: true, sub: [cleanAddress(s.address), s.coord ? null : '(no location - not routed)'].filter(Boolean).join(' ') || null },
        { text: s.market ?? '' },
        { text: s.city ?? '' },
        { text: s.status },
        { text: s.notes?.trim() ?? '' },
        { text: s.projectedOpening ?? '' },
        { text: String(s.minutes) },
        { text: clock(s.arriveMin) },
        { text: clock(s.departMin) },
        { text: s.driveNextMin != null ? `${dur(s.driveNextMin)}${s.nextIsEnd ? ' to end' : ''}` : '' },
        { text: clock(s.arriveNextMin) },
      ],
      y
    );
  });
  if (d.endAddress) {
    y = row(
      [
        { text: 'B', bold: true, color: END_RED },
        { text: 'End / overnight', bold: true, sub: cleanAddress(d.endAddress) },
        ...blank(6),
        { text: clock(d.totals.finishMin) },
        ...blank(3),
      ],
      y,
      '#FBF1F2'
    );
  }

  const totals = [
    d.totals.driveMin != null ? `Drive ${dur(d.totals.driveMin)}` : null,
    `Stops ${dur(d.totals.stopMin)}`,
    d.totals.finishMin != null ? `Finish ${clock(d.totals.finishMin)}` : null,
  ]
    .filter(Boolean)
    .join('     ');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  const noteLines = d.note ? (doc.splitTextToSize(pdfText(d.note), CW) as string[]) : [];
  const blockH = 16 + (d.totals.overEnd ? 11 : 0) + noteLines.length * 9;
  if (y + blockH + 4 > BOTTOM) y = newPage();
  if (measure) return y + blockH;
  y += 14;
  // Totals highlight: gold bar + gold figures.
  doc.setFillColor(GOLD);
  doc.rect(M, y - 9, 3, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(GOLD);
  doc.text(pdfText(totals), M + 8, y);
  if (d.totals.overEnd && d.endTimeMin != null) {
    y += 11;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#A27B5C');
    doc.text(pdfText(`Runs past the planned end of day (${clock(d.endTimeMin)}).`), M, y);
  }
  if (noteLines.length) {
    y += 10;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(noteLines, M, y);
    y += (noteLines.length - 1) * 9;
  }
  return y;
}

// ---------------- maps ----------------

interface MapCtx {
  toPt: (p: LatLng) => { x: number; y: number };
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawMap(doc: jsPDF, img: string | null, frame: Frame, x: number, y: number, w: number, draw: (ctx: MapCtx) => void) {
  const k = w / frame.width;
  const h = frame.height * k;
  if (img) {
    doc.addImage(img, 'JPEG', x, y, w, h, undefined, 'FAST');
  } else {
    doc.setFillColor('#F5F7FA');
    doc.rect(x, y, w, h, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text('Basemap unavailable - route and stops shown without streets', x + 6, y + h - 6);
  }
  const proj = projector(frame);
  draw({
    toPt: (p) => {
      const px = proj(p);
      return { x: x + px.x * k, y: y + px.y * k };
    },
    x,
    y,
    w,
    h,
  });
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

function drawRoute(doc: jsPDF, ctx: MapCtx, paths: LatLng[][], color: string) {
  const projected = paths.map((p) => simplifyPx(p.map(ctx.toPt), 0.8));
  doc.setLineJoin('round');
  doc.setLineCap('round');
  doc.setLineDashPattern([], 0);
  doc.setDrawColor('#FFFFFF');
  doc.setLineWidth(4.2);
  projected.forEach((pts) => strokePath(doc, pts));
  doc.setDrawColor(color);
  doc.setLineWidth(2.4);
  projected.forEach((pts) => strokePath(doc, pts));
}

const inside = (ctx: MapCtx, p: { x: number; y: number }, pad = 4) =>
  p.x >= ctx.x + pad && p.x <= ctx.x + ctx.w - pad && p.y >= ctx.y + pad && p.y <= ctx.y + ctx.h - pad;

export const NEAR_ROUTE_METERS = 4828; // 3 mi

/** Shortest distance (m) from a point to any segment of the paths. Local equirectangular
 *  projection around the point — accurate to well under 1% at these distances. */
export function distanceToPathsMeters(p: LatLng, paths: LatLng[][]): number {
  const R = 6371000;
  const kx = R * Math.cos((p.lat * Math.PI) / 180) * (Math.PI / 180);
  const ky = R * (Math.PI / 180);
  let best = Infinity;
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      const ax = (path[i].lng - p.lng) * kx, ay = (path[i].lat - p.lat) * ky;
      if (path.length === 1) {
        best = Math.min(best, Math.hypot(ax, ay));
        continue;
      }
      if (i === path.length - 1) break;
      const bx = (path[i + 1].lng - p.lng) * kx, by = (path[i + 1].lat - p.lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

// Atlas stores for this map: within 3 mi of ITS route (atlasMode 'near') or every one in the
// frame ('all'), minus the ones that are stops on these days (those are drawn larger, as stops).
function contextStoresFor(ctx: MapCtx, frame: Frame, tour: PdfTour, days: PdfDay[]): PdfStore[] {
  if (tour.atlasMode === 'off') return [];
  const routePaths = days.flatMap((d) => d.paths);
  const b = frameBounds(frame);
  const key = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  const stopKeys = new Set<string>();
  days.forEach((d) => d.stops.forEach((s) => s.iconUrl && s.coord && stopKeys.add(key(s.coord))));
  return tour.contextStores.filter((st) => {
    if (st.lat < b.south || st.lat > b.north || st.lng < b.west || st.lng > b.east) return false;
    if (stopKeys.has(key(st))) return false;
    if (tour.atlasMode === 'near' && distanceToPathsMeters(st, routePaths) > NEAR_ROUTE_METERS) return false;
    return inside(ctx, ctx.toPt(st), 6);
  });
}

// What a marker is, for drawing after layout.
type MarkerMeta =
  | { kind: 'pin'; label: string; color: string; point: { x: number; y: number }; mergeable: boolean }
  | { kind: 'logo'; img: string; color: string; point: { x: number; y: number } };

/**
 * Everything drawn on one map, in order: Atlas logos (decluttered against the stop markers),
 * routes, approach dots, then stop / A / B markers after declutter — near-identical same-day
 * site pins merge into one "3·4" pin; other overlaps fan out on a ring with a leader line to a
 * dot at the true spot.
 */
function drawMapLayer(
  doc: jsPDF,
  ctx: MapCtx,
  frame: Frame,
  tour: PdfTour,
  icons: Map<string, string | null>,
  days: PdfDay[],
  scale: number,
  mapName: string
) {
  const r = 7.2 * scale; // pin head radius
  const headOffset = r * 1.55; // head center sits this far above the pin point
  const meta = new Map<string, MarkerMeta>();
  const items: DeclutterItem[] = [];
  const addPin = (id: string, pt: { x: number; y: number }, label: string, color: string, mergeable: boolean) => {
    meta.set(id, { kind: 'pin', label, color, point: pt, mergeable });
    items.push({ id, anchor: { x: pt.x, y: pt.y - headOffset }, r: r + 1, label, mergeKey: mergeable ? `site:${color}` : null });
  };
  days.forEach((d, di) => {
    if (d.startCoord) addPin(`A${di}`, ctx.toPt(d.startCoord), 'A', START_GREEN, false);
    if (d.endCoord) addPin(`B${di}`, ctx.toPt(d.endCoord), 'B', END_RED, false);
    d.stops.forEach((s, si) => {
      if (!s.coord) return;
      const pt = ctx.toPt(s.coord);
      const id = `s${di}-${si}`;
      const img = s.iconUrl ? icons.get(s.iconUrl) : null;
      if (img) {
        const lr = 8.5 * scale;
        meta.set(id, { kind: 'logo', img, color: d.color, point: pt });
        items.push({ id, anchor: pt, r: lr + 1, mergeKey: null });
      } else if (s.kind === 'custom' || s.kind === 'licensed_store') {
        addPin(id, pt, s.kind === 'licensed_store' ? 'LS' : s.glyph ?? '*', CUSTOM_GRAY, false);
      } else {
        addPin(id, pt, s.siteNo != null ? String(s.siteNo) : '', d.color, true);
      }
    });
  });

  // Route points (every ~5pt) as obstacles so fanned badges avoid sitting on the line.
  const obstacles = days.flatMap((d) => d.paths.flatMap((p) => simplifyPx(p.map(ctx.toPt), 5)));
  const box = { x0: ctx.x, y0: ctx.y, x1: ctx.x + ctx.w, y1: ctx.y + ctx.h };
  const placed = declutterPins(items, {
    frame: box,
    obstacles,
    radiusFor: (label, baseR) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6 * scale);
      return Math.max(baseR, doc.getTextWidth(label) / 2 + 3.5 * scale);
    },
  });

  // Atlas logos yield to markers: kept, nudged, or hidden.
  const ctxStores = contextStoresFor(ctx, frame, tour, days);
  const S = 7;
  const logos = declutterLogos(
    ctxStores.map((st, i) => ({ id: `c${i}`, at: ctx.toPt(st), s: S })),
    placed,
    box
  );
  logos.forEach((L, i) => {
    const img = icons.get(ctxStores[i].iconUrl);
    if (img && L.draw) doc.addImage(img, 'PNG', L.draw.x - S / 2, L.draw.y - S / 2, S, S, aliasOf(img), 'FAST');
  });

  days.forEach((d) => drawRoute(doc, ctx, d.paths, d.color));

  days.forEach((d) => {
    doc.setLineWidth(0.9);
    doc.setDrawColor(d.color);
    doc.setFillColor('#FFFFFF');
    d.stops.forEach((s) =>
      s.approach.forEach((a) => {
        const p = ctx.toPt(a);
        doc.circle(p.x, p.y, 2.3, 'FD');
      })
    );
  });

  // Leaders under the markers: thin dark line from the badge to a dot at the true spot.
  placed
    .filter((m) => m.displaced)
    .forEach((m) => {
      const first = meta.get(m.ids[0])!;
      const pts = m.ids.map((id) => meta.get(id)!.point);
      const truePt = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
      doc.setDrawColor('#1F2937');
      doc.setLineWidth(0.6);
      doc.line(m.at.x, m.at.y, truePt.x, truePt.y);
      doc.setFillColor(first.color);
      doc.setDrawColor('#FFFFFF');
      doc.setLineWidth(0.6);
      doc.circle(truePt.x, truePt.y, 1.9, 'FD');
    });

  placed.forEach((m) => {
    const first = meta.get(m.ids[0])!;
    if (first.kind === 'logo') {
      const lr = 8.5 * scale;
      const c = m.at;
      doc.setFillColor('#FFFFFF');
      doc.setDrawColor(first.color);
      doc.setLineWidth(1.6);
      doc.circle(c.x, c.y, lr, 'FD');
      doc.addImage(first.img, 'PNG', c.x - lr * 0.82, c.y - lr * 0.82, lr * 1.64, lr * 1.64, aliasOf(first.img), 'FAST');
      return;
    }
    const label = m.label ?? first.label;
    if (m.displaced) {
      badge(doc, m.at, label, first.color, scale, m.r - 1);
    } else {
      // Undisplaced: a teardrop whose point is the true spot (mean of merged points).
      const pts = m.ids.map((id) => meta.get(id)!.point);
      const at = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
      pin(doc, at, label, first.color, scale, m.r - 1);
    }
  });

  const merged = placed.filter((m) => m.merged).length;
  const displaced = placed.filter((m) => m.displaced).length;
  const nudged = logos.filter((l) => l.nudged).length;
  const hidden = logos.filter((l) => !l.draw).length;
  if (merged || displaced || nudged || hidden) {
    const page = doc.getCurrentPageInfo().pageNumber;
    console.debug(
      `[tourPdf] page ${page} (${mapName}): merged ${merged} pin(s) [${placed.filter((m) => m.merged).map((m) => m.label).join(', ')}], ` +
        `fanned ${displaced} marker(s), Atlas logos nudged ${nudged} / hidden ${hidden}`
    );
  }
}

// Teardrop pin (matches the tour map): colored head with a white border and a white label,
// point at the location. headR widens the head into a pill for merged labels ("3·4").
function pin(doc: jsPDF, p: { x: number; y: number }, label: string, color: string, scale: number, headR?: number) {
  const r = 7.2 * scale;
  const cy = p.y - r * 1.55;
  const halfW = Math.max(r, headR ?? r);
  doc.setLineDashPattern([], 0);
  doc.setFillColor(color);
  doc.setDrawColor('#FFFFFF');
  doc.setLineWidth(1.1);
  doc.triangle(p.x - r * 0.62, cy + r * 0.62, p.x + r * 0.62, cy + r * 0.62, p.x, p.y, 'FD');
  if (halfW > r + 0.1) doc.roundedRect(p.x - halfW, cy - r, 2 * halfW, 2 * r, r, r, 'FD');
  else doc.circle(p.x, cy, r, 'FD');
  doc.rect(p.x - r * 0.45, cy + r * 0.2, r * 0.9, r * 0.6, 'F'); // hide the head/point seam
  pinLabel(doc, p.x, cy, label, scale);
}

// Displaced marker: the pin head alone (circle or pill), centered on `c`.
function badge(doc: jsPDF, c: { x: number; y: number }, label: string, color: string, scale: number, headR?: number) {
  const r = 7.2 * scale;
  const halfW = Math.max(r, headR ?? r);
  doc.setLineDashPattern([], 0);
  doc.setFillColor(color);
  doc.setDrawColor('#FFFFFF');
  doc.setLineWidth(1.1);
  if (halfW > r + 0.1) doc.roundedRect(c.x - halfW, c.y - r, 2 * halfW, 2 * r, r, r, 'FD');
  else doc.circle(c.x, c.y, r, 'FD');
  pinLabel(doc, c.x, c.y, label, scale);
}

function pinLabel(doc: jsPDF, x: number, y: number, label: string, scale: number) {
  doc.setTextColor('#FFFFFF');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize((label.length > 1 ? 6.6 : 7.6) * scale);
  doc.text(pdfText(label), x, y, { align: 'center', baseline: 'middle' });
}

function drawLegend(doc: jsPDF, x: number, y: number, tour: PdfTour, icons: Map<string, string | null>, days: PdfDay[]) {
  let cx = x;
  const item = (draw: () => void, text: string, w: number) => {
    draw();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(INK);
    doc.text(pdfText(text), cx + 14, y + 3);
    cx += w;
  };
  days.forEach((d) =>
    item(
      () => {
        doc.setDrawColor(d.color);
        doc.setLineWidth(2.4);
        doc.line(cx, y, cx + 11, y);
      },
      `Day ${d.dayNumber}`,
      48
    )
  );
  item(() => pin(doc, { x: cx + 5, y: y + 6 }, '#', days[0]?.color ?? MIDNIGHT, 0.7), 'Site (numbered)', 82);
  const atlasStop = days.some((d) => d.stops.some((s) => s.kind === 'atlas_store'));
  const atlasUrl = days.flatMap((d) => d.stops).find((s) => s.kind === 'atlas_store')?.iconUrl ?? tour.contextStores[0]?.iconUrl;
  const atlasImg = atlasUrl ? icons.get(atlasUrl) ?? null : null;
  if (atlasImg && (tour.atlasMode !== 'off' || atlasStop)) {
    const label = tour.atlasMode === 'near' ? 'Starbucks store (within 3 mi of route)' : 'Starbucks store (Atlas)';
    item(() => doc.addImage(atlasImg, 'PNG', cx, y - 4, 9, 9, aliasOf(atlasImg), 'FAST'), label, tour.atlasMode === 'near' ? 168 : 110);
  }
  if (days.some((d) => d.stops.some((s) => s.kind === 'custom' || s.kind === 'licensed_store'))) {
    item(() => pin(doc, { x: cx + 5, y: y + 6 }, '*', CUSTOM_GRAY, 0.7), 'Other stop', 60);
  }
  item(() => pin(doc, { x: cx + 5, y: y + 6 }, 'A', START_GREEN, 0.7), 'Start', 40);
  item(() => pin(doc, { x: cx + 5, y: y + 6 }, 'B', END_RED, 0.7), 'End / overnight', 80);
}

/** Browser loader: fetch → data URL. SVGs are rasterized through a canvas; non-image
 *  responses (e.g. an SPA index.html fallback for a missing file) return null.
 *  maxPx: downscale raster images wider/taller than this (store icons are drawn ~10pt, and
 *  one source PNG is 2.3 MB — embedded as-is it alone makes the PDF ~7 MB). */
export async function fetchImageAsDataUrl(url: string, maxPx?: number): Promise<string | null> {
  try {
    // Only spaces need escaping ('/Images/License DT.png'); Static Maps URLs arrive encoded.
    const res = await fetch(url.replace(/ /g, '%20'));
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const blob = await res.blob();
    if (type.includes('svg')) return await rasterizeSvg(blob, maxPx ?? 1200);
    if (maxPx) return await downscale(blob, maxPx);
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

async function downscale(blob: Blob, maxPx: number): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * k));
    canvas.height = Math.max(1, Math.round(bmp.height * k));
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function rasterizeSvg(blob: Blob, targetWidth = 1200): Promise<string | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg load failed'));
      img.src = url;
    });
    const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = Math.round(targetWidth * ratio);
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
