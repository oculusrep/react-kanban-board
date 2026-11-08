// Single-user auth: one secret token (WARDROBE_TOKEN), accepted as
//   - the last path segment of the MCP URL   (/mcp/<token>)  — for Claude/ChatGPT connectors
//   - Authorization: Bearer <token>                            — for scripts / other MCP clients
//   - the HttpOnly session cookie set by /api/login            — for the web page
// Fails closed: if WARDROBE_TOKEN isn't configured, nothing authenticates.

export const COOKIE = 'wardrobe_session';
const MIN_TOKEN_LENGTH = 24;

async function digest(s: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
}

/** Constant-time comparison (hash first so lengths always match). */
export async function tokenMatches(candidate: string | null | undefined, secret: string | undefined): Promise<boolean> {
  if (!candidate || !secret || secret.length < MIN_TOKEN_LENGTH) return false;
  const [a, b] = await Promise.all([digest(candidate), digest(secret)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** The cookie holds a derived value, not the raw token. */
export async function sessionValue(secret: string): Promise<string> {
  const bytes = new Uint8Array(await digest(`wardrobe-session:${secret}`));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function isAuthorized(req: Request, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < MIN_TOKEN_LENGTH) return false;
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ') && (await tokenMatches(auth.slice(7).trim(), secret))) return true;
  const cookie = readCookie(req, COOKIE);
  if (cookie && (await tokenMatches(cookie, await sessionValue(secret)))) return true;
  return false;
}

export async function loginCookie(secret: string): Promise<string> {
  return `${COOKIE}=${await sessionValue(secret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 400}`;
}

export const LOGOUT_COOKIE = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function tokenConfigured(secret: string | undefined): boolean {
  return !!secret && secret.length >= MIN_TOKEN_LENGTH;
}
