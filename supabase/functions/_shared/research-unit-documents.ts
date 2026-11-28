/**
 * Cited-document reader for Market Research leads (post-run).
 *
 * The Gemini web-search step only sees search snippets. The counts it misses
 * are mostly inside the documents the research agent cited, or one link away
 * from them: the staff report on an agenda item, the plat PDF, the packet
 * (docs/MARKET_RESEARCH_NO_COUNT_AUDIT_2026-11-12.md). This step opens them.
 *
 *   1. URLs: every http(s) link in permit_url, source and notes. Grounding
 *      redirect links are resolved; listing / aggregator sites are dropped.
 *   2. One hop: each cited HTML page is fetched here (edge function network)
 *      and its document links (PDFs, showpublisheddocument, attachments,
 *      packets, staff reports, plats) are ranked by project-name words and
 *      case numbers. The best few are added.
 *   3. Gemini 2.5 Flash with url_context (reads the pages and PDFs, including
 *      scanned plats and lot-map images) plus google_search (to find the
 *      primary document when nothing usable was cited). Cited / one-hop PDFs
 *      (up to 3, ≤ 50 MB) are downloaded here and attached through the Files
 *      API, because url_context can't parse big agenda packets.
 *   3b. No count yet: PDFs among the URLs Gemini tried or found by search are
 *      downloaded and read as files in a second call (no tools).
 *   4. A count is accepted only with a verbatim quote that contains the
 *      number, from a named non-listing URL. Approved → 'approved'; stated in
 *      a plat / approval-stage document → 'reported'; proposed or a zoning cap
 *      → 'estimated' (EST. badge; the note says which).
 *
 * API: REST generateContent, tools [{ url_context: {} }, { google_search: {} }];
 * retrieval status in candidates[0].urlContextMetadata.urlMetadata[]
 * .{retrievedUrl, urlRetrievalStatus} (URL_RETRIEVAL_STATUS_SUCCESS / _ERROR /
 * _PAYWALL / _UNSAFE). Field names checked against @google/genai 1.30.0's
 * type definitions (genai.d.ts: Tool.urlContext, UrlContextMetadata,
 * UrlMetadata, UrlRetrievalStatus) on 2026-11-26; ai.google.dev was not
 * reachable from that session. Docs: https://ai.google.dev/gemini-api/docs/url-context
 * Retrieved content is billed as input tokens (toolUsePromptTokenCount).
 *
 * Doc: docs/MARKET_RESEARCH_LEAD_PASS_2026-11-26.md (Automation)
 */

import { isListingUrl, resolveUrl } from './source-rules.ts';

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CENTS_PER_INPUT_TOKEN = 30 / 1_000_000;
const CENTS_PER_OUTPUT_TOKEN = 250 / 1_000_000;
const CENTS_PER_GROUNDED_PROMPT = 3.5; // charged whether or not it searched: upper bound
const CALL_TIMEOUT_MS = 120_000;
const MAX_CITED = 8;
const MAX_HOP = 6;
const MAX_URLS = 20; // url_context limit per request

export interface DocRow {
  project_name: string | null;
  phase_label: string | null;
  address: string | null;
  builder_developer: string | null;
  zoning: string | null;
  permit_url?: string | null;
  source: string | null;
  notes: string | null;
  boundary_municipality: { name: string; kind: string; state: string } | null;
}

export interface DocResult {
  units: number | null;
  status: 'approved' | 'stated' | 'proposed' | 'cap' | null;
  confidence: 'approved' | 'reported' | 'estimated' | null;
  quote: string;
  url: string | null;
  page: string | null;
  basis: string;
  answer: string;
  urls_given: string[];
  urls_read: string[];
  sources: { title: string; uri: string }[];
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
}

// ---------------------------------------------------------------------------
// URLs (pure parts unit-tested)
// ---------------------------------------------------------------------------

/** Every http(s) URL in the texts, trailing punctuation trimmed, in order, unique. */
export function extractUrls(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
      let u = m[0].replace(/[),.;:\]]+$/, '');
      if ((u.match(/\(/g)?.length ?? 0) > (u.match(/\)/g)?.length ?? 0)) u += ')';
      if (!out.includes(u)) out.push(u);
    }
  }
  return out;
}

/** Case / petition numbers: RZ-24-12, AX-RZ-25-05-02, Z24-07, PP23-000004, HSUB24-0002. */
export function caseNumbers(...texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of (t ?? '').matchAll(/\b(?:[A-Z]{1,5}-)?[A-Z]{1,5}-?\d{2,4}-\d{2,6}(?:-\d{1,3})?\b/g)) out.add(m[0]);
  return [...out];
}

const DOC_LINK = /\.pdf($|[?#])|showpublisheddocument|documentcenter\/view|viewfile|attachment|packet|staff[-_ ]?report|agenda|minutes|plat|fileid=|getfile|download/i;
const STOP = new Set(['the', 'at', 'of', 'and', 'on', 'in', 'phase', 'subdivision', 'development', 'community', 'road', 'rd', 'drive', 'dr', 'highway', 'hwy', 'county', 'city', 'ga', 'homes', 'new', 'section']);

/** Rank a document link by overlap with the project's words and case numbers. */
export function scoreLink(href: string, text: string, projectWords: string[], cases: string[]): number {
  const hay = `${href} ${text}`.toLowerCase();
  let s = 0;
  for (const c of cases) if (hay.includes(c.toLowerCase())) s += 5;
  for (const w of projectWords) if (hay.includes(w)) s += 2;
  if (/staff[-_ ]?report|application|plat|site plan|concept/i.test(hay)) s += 2;
  if (/packet|agenda/i.test(hay)) s += 1;
  if (/\.pdf($|[?#])/i.test(href)) s += 1;
  return s;
}

export const projectWords = (name: string | null) =>
  (name ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

async function fetchText(url: string, timeoutMs = 15_000): Promise<{ type: string; body: string } | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (OVIS research)' } });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/html/i.test(type)) { await res.body?.cancel(); return { type, body: '' }; }
    const body = (await res.text()).slice(0, 3_000_000);
    return { type, body };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Document links one hop from a cited HTML page, best first. */
export function harvestLinks(html: string, base: string, words: string[], cases: string[]): { url: string; score: number }[] {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let abs: string;
    try { abs = new URL(m[1].replace(/&amp;/g, '&'), base).toString(); } catch { continue; }
    if (!/^https?:/i.test(abs) || !DOC_LINK.test(abs) || isListingUrl(abs)) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const s = scoreLink(abs, text, words, cases);
    if (s > 0 && s > (out.get(abs) ?? -1)) out.set(abs, s);
  }
  return [...out.entries()].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score);
}

export async function gatherUrls(r: DocRow): Promise<string[]> {
  const cache = new Map<string, string | null>();
  const cited: string[] = [];
  for (const u of extractUrls(r.permit_url, r.source, r.notes)) {
    const real = await resolveUrl(u, cache);
    if (!real || isListingUrl(real) || cited.includes(real)) continue;
    if (/vertexaisearch\.cloud\.google\.com/.test(real)) continue;
    cited.push(real);
    if (cited.length >= MAX_CITED) break;
  }
  // PDFs and government pages first.
  const rank = (u: string) => (/\.pdf($|[?#])/i.test(u) ? 0 : /\.(gov|us)(\/|$)|civicclerk|municode|legistar|granicus|agendapub|novus|usgovcloudapi|core-docs/i.test(u) ? 1 : 2);
  cited.sort((a, b) => rank(a) - rank(b));

  const words = projectWords(r.project_name);
  const cases = caseNumbers(r.project_name, r.source, r.notes);
  const hop: { url: string; score: number }[] = [];
  await Promise.all(cited.filter((u) => !/\.pdf($|[?#])/i.test(u)).slice(0, 4).map(async (u) => {
    const page = await fetchText(u);
    if (page?.body) hop.push(...harvestLinks(page.body, u, words, cases).slice(0, MAX_HOP));
  }));
  hop.sort((a, b) => b.score - a.score);
  const out = [...cited];
  for (const h of hop) {
    if (out.length >= MAX_URLS || out.filter((u) => !cited.includes(u)).length >= MAX_HOP) break;
    if (!out.includes(h.url)) out.push(h.url);
  }
  return out.slice(0, MAX_URLS);
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

function buildPrompt(r: DocRow, urls: string[]): string {
  const bm = r.boundary_municipality;
  const where = bm ? `${bm.name}${bm.kind === 'county' ? '' : ` (${bm.kind})`}, ${bm.state}` : 'Georgia';
  const lines = [
    `Project name: ${r.project_name ?? '(unnamed)'}`,
    r.phase_label ? `Phase: ${r.phase_label}` : null,
    `Jurisdiction: ${where}`,
    r.address ? `Address: ${r.address}` : null,
    r.builder_developer ? `Builder / developer: ${r.builder_developer}` : null,
    r.zoning ? `Zoning: ${r.zoning}` : null,
    r.source ? `What the research agent cited: ${r.source.slice(0, 1000)}` : null,
    r.notes ? `Research notes: ${r.notes.slice(0, 1500)}` : null,
  ].filter(Boolean).join('\n');
  const list = urls.length
    ? `Open and read these documents first (PDFs included; read scanned pages, plat tables and lot maps too):\n${urls.map((u) => `- ${u}`).join('\n')}`
    : 'No document links were cited.';
  return `Find the number of housing units (lots, homes, townhomes or apartment units) for this residential development, stated in a PRIMARY document: a staff report, rezoning / annexation application, site or concept plan, preliminary or final plat, agenda packet, minutes, resolution or ordinance, or the builder/developer's own page.

${lines}

${list}

If those documents don't state it, search for the project's primary documents (use the case number, jurisdiction and meeting date above) and open them.

Rules:
- Only report a number that a document states for THIS project (and this phase, if a phase is named). Never derive one from acreage, density or lot numbers you see.
- Listing or aggregator sites (Zillow, Redfin, Realtor.com, Homes.com, Jome, Livabl, NewHomeSource, apartment listing sites, LoopNet) never count.
- status: "approved" if the document records the approved count (approval, conditions, ordinance, final plat); "stated" if a plat or the developer states it without an approval; "proposed" if it is the applicant's request / concept plan; "cap" if it is a maximum ("not to exceed").
- If documents disagree, prefer the latest approved figure and say so in basis.
- quote: copy the sentence or table row that contains the number, verbatim.
- If no document states a count, units must be null.

Reply with ONLY a JSON object:
{"units": <integer or null>, "status": "approved"|"stated"|"proposed"|"cap"|null, "quote": "<verbatim>", "url": "<the document's URL>", "page": "<page number or null>", "basis": "<one sentence>"}`;
}

const GEMINI_FILES = 'https://generativelanguage.googleapis.com';
const MAX_PDF_BYTES = 50 * 1024 * 1024; // Gemini's PDF limit (50 MB / 1,000 pages)
const MAX_UPLOADS = 3;

type Part = { text: string } | { file_data: { mime_type: string; file_uri: string } };

async function callGemini(parts: Part[], apiKey: string, tools: unknown[]): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ contents: [{ parts }], ...(tools.length ? { tools } : {}), generationConfig: { temperature: 0 } }),
    });
    if (!res.ok) {
      const err = new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Big PDFs: download here, upload to the Gemini Files API, attach as file_data.
// url_context can't parse large packets (Locust Grove's 17.5 MB one came back
// empty). REST shape taken from @google/genai 1.30.0 (files.upload →
// fetchUploadUrl + uploadBlobInternal; ai.google.dev unreachable from the build
// session): POST /upload/v1beta/files with X-Goog-Upload-Protocol: resumable,
// -Command: start, -Header-Content-Length, -Header-Content-Type and body
// {file:{display_name}}; the x-goog-upload-url response header takes the bytes
// with -Command: "upload, finalize", -Offset: 0; x-goog-upload-status 'final'
// and body {file:{name, uri, mimeType, state}}. state PROCESSING → ACTIVE via
// GET /v1beta/{name}; DELETE /v1beta/{name} afterwards (files expire in 48 h).
// Docs: https://ai.google.dev/gemini-api/docs/document-processing
// ---------------------------------------------------------------------------

/** The bytes, if the URL serves a PDF (by content type or %PDF header) under 50 MB. */
export async function fetchPdf(url: string, timeoutMs = 45_000): Promise<Uint8Array | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (OVIS research)' } });
    const type = res.headers.get('content-type') ?? '';
    const len = Number(res.headers.get('content-length') ?? 0);
    if (!res.ok || /html|json|xml|text\//i.test(type) || len > MAX_PDF_BYTES || !res.body) { await res.body?.cancel(); return null; }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const c of res.body) {
      size += c.length;
      if (size > MAX_PDF_BYTES) { ctl.abort(); return null; }
      chunks.push(c);
    }
    const out = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    const isPdf = out.length > 4 && out[0] === 0x25 && out[1] === 0x50 && out[2] === 0x44 && out[3] === 0x46; // %PDF
    return isPdf ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function uploadPdf(bytes: Uint8Array, displayName: string, apiKey: string): Promise<{ name: string; uri: string }> {
  const start = await fetch(`${GEMINI_FILES}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': 'application/pdf',
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
  });
  const uploadUrl = start.headers.get('x-goog-upload-url');
  await start.body?.cancel();
  if (!start.ok || !uploadUrl) throw new Error(`file upload start ${start.status}`);
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(bytes.length) },
    body: new Blob([bytes as BlobPart], { type: "application/pdf" }),
  });
  const body = await up.json().catch(() => null);
  if (!up.ok || up.headers.get('x-goog-upload-status') !== 'final' || !body?.file?.uri) {
    throw new Error(`file upload ${up.status} ${up.headers.get('x-goog-upload-status') ?? ''}`.trim());
  }
  let f = body.file;
  for (let i = 0; f.state === 'PROCESSING' && i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    f = await (await fetch(`${GEMINI_FILES}/v1beta/${f.name}?key=${apiKey}`)).json();
  }
  if (f.state && f.state !== 'ACTIVE') throw new Error(`file ${f.name} is ${f.state}`);
  return { name: f.name, uri: f.uri };
}

async function deleteFile(name: string, apiKey: string) {
  try { await (await fetch(`${GEMINI_FILES}/v1beta/${name}?key=${apiKey}`, { method: 'DELETE' })).body?.cancel(); } catch { /* expires anyway */ }
}

/** Download + upload up to `max` PDFs from the candidate URLs, in order. */
async function uploadPdfs(candidates: string[], max: number, apiKey: string, skip: Set<string>):
  Promise<{ url: string; name: string; uri: string; bytes: number }[]> {
  const out: { url: string; name: string; uri: string; bytes: number }[] = [];
  const stopAt = Date.now() + 75_000; // one row's downloads can't eat the run's wall clock
  for (const url of candidates) {
    if (out.length >= max || Date.now() > stopAt) break;
    if (skip.has(url) || isListingUrl(url)) continue;
    skip.add(url);
    const bytes = await fetchPdf(url);
    if (!bytes) continue;
    try {
      const f = await uploadPdf(bytes, url.split('/').pop() || 'document.pdf', apiKey);
      out.push({ url, ...f, bytes: bytes.length });
    } catch (e) {
      console.warn('[document reader] upload failed', url, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

/** The number appears in the quote as a whole number ("150", "1,300", "(67)"). */
export function quoteHasNumber(quote: string, n: number): boolean {
  const q = quote.replace(/(\d),(\d{3})/g, '$1$2');
  return new RegExp(`(^|[^\\d.])${n}([^\\d]|$)`).test(q);
}

const CONFIDENCE = { approved: 'approved', stated: 'reported', proposed: 'estimated', cap: 'estimated' } as const;

export function judge(parsed: any, given: string[], read: string[], sources: { title: string; uri: string }[]):
  { units: number | null; status: DocResult['status']; why: string } {
  const n = Number(parsed?.units);
  const status = ['approved', 'stated', 'proposed', 'cap'].includes(parsed?.status) ? parsed.status : null;
  if (parsed?.units == null || !Number.isInteger(n) || n <= 0) return { units: null, status: null, why: 'no stated count' };
  const quote = typeof parsed.quote === 'string' ? parsed.quote : '';
  const url = typeof parsed.url === 'string' ? parsed.url.trim() : '';
  if (!quote || !quoteHasNumber(quote, n)) return { units: null, status, why: `discarded: the quote doesn't contain ${n}` };
  if (!url || isListingUrl(url)) return { units: null, status, why: 'discarded: no non-listing source URL' };
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return { units: null, status, why: 'discarded: bad source URL' }; }
  const known = [...given, ...read].some((u) => u === url || u.includes(host)) ||
    sources.some((s) => s.title && host.endsWith(s.title.replace(/^www\./, '')));
  if (!known) return { units: null, status, why: `discarded: ${host} was neither given, read nor a search source` };
  if (!status) return { units: null, status: null, why: 'discarded: no status (approved / stated / proposed / cap)' };
  // The model calls a request "approved" when the case was approved; the
  // quoted number is still the applicant's. The quote decides.
  if (status === 'approved' && /\b(propos|request|applicant|seeks|would (include|allow)|plans? (to|for)|concept)/i.test(quote)) {
    return { units: n, status: 'proposed', why: 'status lowered to proposed: the quote describes the request' };
  }
  return { units: n, status, why: '' };
}

interface PassResult {
  parsed: any; answer: string; urls_read: string[]; urls_tried: string[]; sources: { title: string; uri: string }[];
  input_tokens: number; output_tokens: number; cost_cents: number;
}

async function runPass(prompt: string, files: { url: string; uri: string }[], apiKey: string, withTools: boolean, haveUrls: boolean): Promise<PassResult> {
  const parts: Part[] = [
    ...files.map((f) => ({ file_data: { mime_type: 'application/pdf', file_uri: f.uri } })),
    { text: files.length ? `${prompt}\n\nThe attached PDF${files.length === 1 ? ' is' : 's are, in order,'}: ${files.map((f) => f.url).join(' ; ')}. Use that URL as "url" when the count comes from one of them.` : prompt },
  ];
  let data: any;
  if (!withTools) data = await callGemini(parts, apiKey, []);
  else {
    try {
      data = await callGemini(parts, apiKey, [{ url_context: {} }, { google_search: {} }]);
    } catch (e) {
      // If the two tools can't be combined on this model, read the cited URLs only.
      if ((e as { status?: number }).status === 400 && haveUrls) data = await callGemini(parts, apiKey, [{ url_context: {} }]);
      else throw e;
    }
  }
  const u = data.usageMetadata ?? {};
  const input_tokens = (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0);
  const output_tokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  const cost_cents = input_tokens * CENTS_PER_INPUT_TOKEN + output_tokens * CENTS_PER_OUTPUT_TOKEN + (withTools ? CENTS_PER_GROUNDED_PROMPT : 0);

  const cand = data.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
  const metaObj = cand?.urlContextMetadata ?? cand?.url_context_metadata;
  const meta = (metaObj?.urlMetadata ?? metaObj?.url_metadata ?? []) as any[];
  const urls_tried = meta.map((m) => String(m.retrievedUrl ?? m.retrieved_url ?? '')).filter(Boolean);
  const urls_read = meta
    .filter((m) => (m.urlRetrievalStatus ?? m.url_retrieval_status) === 'URL_RETRIEVAL_STATUS_SUCCESS')
    .map((m) => String(m.retrievedUrl ?? m.retrieved_url ?? ''));
  const sources = ((cand?.groundingMetadata?.groundingChunks ?? []) as any[])
    .map((c) => c.web).filter(Boolean).map((w: any) => ({ title: String(w.title ?? ''), uri: String(w.uri ?? '') }));
  let parsed: any = null;
  try { parsed = JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] ?? 'null'); } catch { parsed = null; }
  if (typeof parsed?.url === 'string' && /vertexaisearch\.cloud\.google\.com/.test(parsed.url)) {
    parsed.url = (await resolveUrl(parsed.url)) ?? parsed.url; // grounding redirects expire
  }
  return { parsed, answer, urls_read, urls_tried, sources, input_tokens, output_tokens, cost_cents };
}

/**
 * Pass 1: cited URLs via url_context + search, with any cited / one-hop PDFs
 * uploaded and attached. Pass 2, only when pass 1 found no count: PDFs among
 * the URLs Gemini tried or searched are downloaded here and read as files.
 */
export async function readCitedDocuments(r: DocRow, apiKey: string): Promise<DocResult> {
  const urls = await gatherUrls(r);
  const prompt = buildPrompt(r, urls);
  const done = new Set<string>();
  const uploaded: { url: string; name: string; uri: string; bytes: number }[] = [];
  try {
    const first = await uploadPdfs(urls, MAX_UPLOADS, apiKey, done);
    uploaded.push(...first);
    const p1 = await runPass(prompt, first, apiKey, true, urls.length > 0);
    let pass = p1;
    let v = judge(p1.parsed, [...urls, ...first.map((f) => f.url)], p1.urls_read, p1.sources);
    let tokensIn = p1.input_tokens, tokensOut = p1.output_tokens, cost = p1.cost_cents;
    const read = new Set(p1.urls_read);

    if (v.units == null && uploaded.length < MAX_UPLOADS) {
      const cache = new Map<string, string | null>();
      const more: string[] = [];
      for (const u of [...p1.urls_tried, ...p1.sources.map((s) => s.uri)]) {
        const real = await resolveUrl(u, cache);
        if (real && !more.includes(real)) more.push(real);
        if (more.length >= 8) break;
      }
      const second = await uploadPdfs(more, MAX_UPLOADS - uploaded.length, apiKey, done);
      if (second.length) {
        uploaded.push(...second);
        const p2 = await runPass(prompt, second, apiKey, false, false);
        tokensIn += p2.input_tokens; tokensOut += p2.output_tokens; cost += p2.cost_cents;
        const v2 = judge(p2.parsed, second.map((f) => f.url), [], []);
        if (v2.units != null || !p1.parsed?.units) { pass = p2; v = v2; }
      }
    }
    for (const f of uploaded) read.add(f.url);

    const parsed = pass.parsed;
    const basis = [typeof parsed?.basis === 'string' ? parsed.basis : '', v.why ? `[${v.why}]` : '',
      uploaded.length ? `[PDFs read as files: ${uploaded.map((f) => `${f.url} (${(f.bytes / 1_048_576).toFixed(1)} MB)`).join('; ')}]` : '']
      .filter(Boolean).join(' ');
    return {
      units: v.units,
      status: v.units != null ? v.status : null,
      confidence: v.units != null && v.status ? CONFIDENCE[v.status] : null,
      quote: typeof parsed?.quote === 'string' ? parsed.quote : '',
      url: typeof parsed?.url === 'string' ? parsed.url : null,
      page: parsed?.page != null ? String(parsed.page) : null,
      basis, answer: pass.answer, urls_given: urls, urls_read: [...read], sources: p1.sources,
      input_tokens: tokensIn, output_tokens: tokensOut, cost_cents: cost,
    };
  } finally {
    await Promise.all(uploaded.map((f) => deleteFile(f.name, apiKey)));
  }
}
