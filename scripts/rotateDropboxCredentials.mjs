#!/usr/bin/env node
/**
 * Rotate OVIS's Dropbox credentials after a leak (see docs/DROPBOX_PROXY.md).
 *
 * Before running: if you regenerated the app secret in the Dropbox App Console, put
 * the NEW value in .env as DROPBOX_APP_SECRET. (If you didn't, the current one is used.)
 *
 * What it does, in order:
 *   1. Opens the Dropbox consent flow (token_access_type=offline) and catches the
 *      redirect on http://localhost:3000 -> new refresh token.
 *   2. Checks the new token works (lists /Salesforce Documents).
 *   3. Pushes DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN / DROPBOX_ACCESS_TOKEN to the
 *      Supabase edge-function secrets (via a temporary 0600 env file, deleted after).
 *   4. Revokes the OLD refresh token (/2/auth/token/revoke kills it and every access
 *      token minted from it).
 *   5. Rewrites .env: new DROPBOX_* values, VITE_DROPBOX_* lines removed.
 * Never prints a secret.
 *
 * Usage: node scripts/rotateDropboxCredentials.mjs   (from the repo root)
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, exec } from 'node:child_process';

const ENV_PATH = path.resolve('.env');
const envText = fs.readFileSync(ENV_PATH, 'utf8');
const env = Object.fromEntries(
  envText.split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);

const APP_KEY = env.DROPBOX_APP_KEY;
const APP_SECRET = env.DROPBOX_APP_SECRET;
const OLD_REFRESH = env.DROPBOX_REFRESH_TOKEN;
const PROJECT_REF = (env.VITE_SUPABASE_URL || '').match(/https:\/\/([^.]+)\./)?.[1];
const REDIRECT_URI = 'http://localhost:3000';

for (const [k, v] of Object.entries({ DROPBOX_APP_KEY: APP_KEY, DROPBOX_APP_SECRET: APP_SECRET, DROPBOX_REFRESH_TOKEN: OLD_REFRESH, VITE_SUPABASE_URL: PROJECT_REF })) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

async function token(body) {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: APP_KEY, client_secret: APP_SECRET, ...body }),
  });
  if (!res.ok) throw new Error(`Dropbox token call failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error_description') || url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(code ? '<h2>Done — you can close this tab and go back to the terminal.</h2>' : `<h2>Failed: ${err ?? 'no code'}</h2>`);
      server.close();
      code ? resolve(code) : reject(new Error(err ?? 'No code in redirect'));
    });
    server.listen(3000);
  });
}

const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&token_access_type=offline`;
console.log('\nStep 1/5  Opening Dropbox in your browser. Sign in as the OVIS Dropbox account and click "Allow".');
console.log(`          If no tab opens, paste this into your browser:\n          ${authUrl}\n`);
exec(`open "${authUrl}"`);

const code = await waitForCode();
const fresh = await token({ code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI });
if (!fresh.refresh_token) throw new Error('Dropbox did not return a refresh token');
if (fresh.refresh_token === OLD_REFRESH) throw new Error('Got the same refresh token back — aborting');
console.log('Step 1/5  ✓ New refresh token received.');

const check = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
  method: 'POST',
  headers: { Authorization: `Bearer ${fresh.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: '/Salesforce Documents', limit: 1 }),
});
if (!check.ok) throw new Error(`New token can't list /Salesforce Documents (${check.status}) — wrong Dropbox account? Nothing changed.`);
console.log('Step 2/5  ✓ New token can read /Salesforce Documents.');

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbx-')), 'secrets.env');
fs.writeFileSync(tmp, `DROPBOX_APP_SECRET=${APP_SECRET}\nDROPBOX_REFRESH_TOKEN=${fresh.refresh_token}\nDROPBOX_ACCESS_TOKEN=${fresh.access_token}\n`, { mode: 0o600 });
try {
  execFileSync('supabase', ['secrets', 'set', '--env-file', tmp, '--project-ref', PROJECT_REF], { stdio: ['ignore', 'ignore', 'inherit'] });
} finally {
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}
console.log('Step 3/5  ✓ Supabase edge-function secrets updated.');

try {
  const old = await token({ grant_type: 'refresh_token', refresh_token: OLD_REFRESH });
  const rev = await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
    method: 'POST',
    headers: { Authorization: `Bearer ${old.access_token}` },
  });
  if (!rev.ok) throw new Error(`revoke returned ${rev.status}`);
  console.log('Step 4/5  ✓ Old refresh token revoked.');
} catch (e) {
  console.log(`Step 4/5  ! Could not revoke the old refresh token (${e.message}).`);
  console.log('          If you regenerated the app secret, it is already unusable. Otherwise tell Claude.');
}

const updated = envText
  .split('\n')
  .filter((l) => !/^VITE_DROPBOX_/.test(l))
  .map((l) => l
    .replace(/^DROPBOX_REFRESH_TOKEN=.*/, `DROPBOX_REFRESH_TOKEN=${fresh.refresh_token}`)
    .replace(/^DROPBOX_ACCESS_TOKEN=.*/, `DROPBOX_ACCESS_TOKEN=${fresh.access_token}`))
  .join('\n');
fs.writeFileSync(ENV_PATH, updated);
console.log('Step 5/5  ✓ .env updated (VITE_DROPBOX_* removed).\n\nAll done. Tell Claude "rotation done" so it can verify.\n');
