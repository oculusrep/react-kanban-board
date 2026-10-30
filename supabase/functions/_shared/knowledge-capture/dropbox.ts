/**
 * Dropbox calls for Intel attachments — server-side only, confined to
 * /Salesforce Documents/Intel.
 *
 * Same credentials and token flow as dropbox-proxy (the DROPBOX_REFRESH_TOKEN /
 * APP_KEY / APP_SECRET secrets, refreshed to a short-lived access token), but
 * deliberately NOT through the proxy: the proxy is the browser's door and its
 * shared-link op makes PUBLIC links. Intel never creates a shared link — files
 * open through a 4-hour temporary link fetched per click, by internal users only.
 *
 * Every function asserts withinIntel(path) first, so nothing here can touch the
 * rest of Dropbox even if a caller passes a bad path.
 *
 * API reference: https://www.dropbox.com/developers/documentation/http/documentation
 */
import { withinIntel } from './attachments.ts';

const API = 'https://api.dropboxapi.com/2/';
const CONTENT = 'https://content.dropboxapi.com/2/';

let cachedToken: string | null = null;

async function getToken(forceRefresh: boolean): Promise<string> {
  if (cachedToken && !forceRefresh) return cachedToken;
  const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN');
  const appKey = Deno.env.get('DROPBOX_APP_KEY');
  const appSecret = Deno.env.get('DROPBOX_APP_SECRET');
  if (!refreshToken || !appKey || !appSecret) throw new Error('Dropbox credentials not configured');
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed: ${res.status}`);
  cachedToken = (await res.json()).access_token as string;
  return cachedToken;
}

export class DropboxError extends Error {
  constructor(public status: number, public summary: string) {
    super(`Dropbox error ${status}: ${summary}`);
  }
}

function assertIntel(path: string): string {
  if (!withinIntel(path)) throw new Error(`refusing Dropbox path outside Intel: ${path}`);
  return path;
}

async function rpc(endpoint: string, args: unknown): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    const res = await fetch(API + endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (res.status === 401 && attempt === 0) continue;
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error_summary: text }; }
    if (!res.ok) throw new DropboxError(res.status, String(body?.error_summary ?? text).slice(0, 300));
    return body;
  }
}

function isNotFound(e: unknown): boolean {
  return e instanceof DropboxError && e.status === 409 && /not_found/.test(e.summary);
}

/**
 * Dropbox-API-Arg must be HTTP-header safe: every non-ASCII character escaped
 * as \uXXXX (client names and file names can carry accents or curly quotes).
 */
function headerJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Lower-cased names directly inside `folder`; empty when the folder doesn't exist yet. */
export async function listNames(folder: string): Promise<Set<string>> {
  assertIntel(`${folder}/x`);
  const names = new Set<string>();
  try {
    let r = await rpc('files/list_folder', { path: folder, recursive: false, limit: 2000 });
    for (;;) {
      for (const e of r.entries ?? []) names.add(String(e.name).toLowerCase());
      if (!r.has_more) break;
      r = await rpc('files/list_folder/continue', { cursor: r.cursor });
    }
  } catch (e) {
    if (isNotFound(e)) return names;
    throw e;
  }
  return names;
}

/** File metadata, or null when nothing is at `path`. */
export async function metadata(path: string): Promise<{ size: number; name: string } | null> {
  assertIntel(path);
  try {
    const r = await rpc('files/get_metadata', { path });
    return { size: Number(r.size ?? 0), name: String(r.name ?? '') };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

/**
 * A one-time link the browser POSTs the bytes to (Content-Type:
 * application/octet-stream). Committed at exactly `path`, never renamed: the
 * caller already picked a free name, and the row records this path.
 */
export async function uploadLink(path: string): Promise<string> {
  assertIntel(path);
  const r = await rpc('files/get_temporary_upload_link', {
    commit_info: { path, mode: 'add', autorename: false, mute: false },
    duration: 3600,
  });
  return String(r.link);
}

/** A 4-hour direct link to the file. Never a shared link. */
export async function temporaryLink(path: string): Promise<string> {
  assertIntel(path);
  const r = await rpc('files/get_temporary_link', { path });
  return String(r.link);
}

/** The file's bytes. */
export async function download(path: string): Promise<Uint8Array> {
  assertIntel(path);
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    const res = await fetch(CONTENT + 'files/download', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': headerJson({ path }) },
    });
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) throw new DropboxError(res.status, (await res.text()).slice(0, 300));
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error('Dropbox download failed');
}

/** Delete a file or folder. False when nothing was at `path` (already gone). */
export async function remove(path: string): Promise<boolean> {
  assertIntel(path);
  try {
    await rpc('files/delete_v2', { path });
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}
