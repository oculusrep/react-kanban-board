# Wardrobe

A personal wardrobe database on Cloudflare, managed from your phone.

- **Web page**: take or choose a photo, AI pre-fills category/color/season/formality, you confirm, save. Browse, search, edit, "wore it today".
- **MCP server**: talk to your wardrobe from Claude or ChatGPT (add, update, delete, search, list, log wear, outfit candidates).
- **One Worker** serves both. **D1** holds the data, **R2** holds photos, **Workers AI** reads photos.

```
phone browser ──► https://wardrobe.<you>.workers.dev/         (web page, cookie login)
Claude/ChatGPT ─► https://wardrobe.<you>.workers.dev/mcp/<token>  (MCP, Streamable HTTP)
                                   │
                         Worker ── D1 (items, wear_log)
                                ├─ R2 (photos/…)
                                └─ Workers AI (@cf/meta/llama-4-scout-17b-16e-instruct)
```

---

## Cost: read this first

Everything is meant to stay on free tiers. To the best of my knowledge (check Cloudflare's current pricing pages — they change):

| Service | Free allowance | What happens past it on the **Workers Free** plan |
|---|---|---|
| Workers | 100,000 requests/day | Requests fail until the next day. No charge. |
| D1 | 5 GB storage, 5M rows read/day | Queries fail until reset. No charge. |
| Workers AI | 10,000 "neurons"/day | Auto-fill fails until reset; you fill fields by hand. No charge. |
| **R2** | 10 GB storage, 1M writes + 10M reads/month, free egress | **Billed to your card.** |

**⚠️ R2 is the one that can cost money.** Cloudflare requires you to turn on R2 with a payment method on file, even to use only the free 10 GB. Photos are shrunk on your phone to ≤1280 px JPEG (roughly 150–400 KB each), so 10 GB is tens of thousands of photos, and a personal wardrobe should never get near it. Still, enabling R2 is your call. **Don't run the deploy until you've decided** — the workflow creates the bucket and will fail if R2 isn't enabled.

GitHub Actions minutes are used for deploys (about 1–2 minutes each). That's GitHub, not Cloudflare. Check that your plan's included minutes cover it.

Stay on the **Workers Free** plan. Upgrading to Workers Paid ($5/month) changes "fails at the limit" into "billed past the limit".

---

## Deploy from your phone (about 15 minutes, once)

You'll create three secrets in GitHub, then press **Run workflow**. No laptop needed.

### 1. Cloudflare: claim a workers.dev subdomain and enable R2

In the Cloudflare dashboard (dash.cloudflare.com in your phone browser):

1. **Workers & Pages** → if asked, pick your `workers.dev` subdomain (e.g. `yourname`). Your app will live at `https://wardrobe.<subdomain>.workers.dev`.
2. **R2 Object Storage** → **Enable R2** / purchase the free plan (asks for a payment method — see Cost above).
3. Copy your **Account ID**. It's on the Workers & Pages overview page (right side, or under the ⋯ menu on mobile), and it's also the long hex string in the dashboard URL: `dash.cloudflare.com/<ACCOUNT_ID>/…`.

### 2. Cloudflare: create the API token

**My Profile** (top-right avatar) → **API Tokens** → **Create Token**:

1. Use the **"Edit Cloudflare Workers"** template.
2. Under **Permissions**, add two more rows (all *Account*-level):
   - **D1** → **Edit**
   - **Workers R2 Storage** → **Edit**
3. **Account Resources** → *Include* → your account. Leave **Zone Resources** as the template sets it. The app doesn't use any zones.
4. **Continue to summary** → **Create Token** → copy it now (it's shown once).

If the template isn't offered, make a **Custom token** with these Account permissions: *Workers Scripts: Edit*, *D1: Edit*, *Workers R2 Storage: Edit*, *Account Settings: Read*.

### 3. Make your wardrobe token

This is the password for your app *and* part of the connector URL. Use 24+ characters, letters/digits/`-`/`_` only (no `/ ? # %`, because it goes in a URL).

- **iPhone**: Passwords app → **+** → let it suggest a **strong password** (looks like `abcdEf-ghijk1-lmnoPq`). Save it there as "Wardrobe".
- **Android**: Google Password Manager → add → generate.

### 4. GitHub: add the secrets

On github.com in your phone browser (the GitHub app can't edit secrets): this repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, three times:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 1 |
| `WARDROBE_TOKEN` | your wardrobe token from step 3 |

### 5. Run the deploy

Repo → **Actions** → **Deploy wardrobe** → **Run workflow** (pick the branch the code is on) → **Run**.

It also runs automatically when anything under `wardrobe/` is pushed to `main` or to `claude/wardrobe-database-app-dw77m3`. Until the three secrets exist it just skips.

The workflow:
1. creates the D1 database `wardrobe` and R2 bucket `wardrobe-photos` if they don't exist,
2. applies `migrations/` to D1,
3. deploys the Worker and sets `WARDROBE_TOKEN` as a Worker secret.

When it's green, open the run: the **Summary** shows your web URL and connector URL.

> **Run workflow** only appears in the Actions tab once the workflow file is on the repo's default branch (`main`). Before the branch is merged, pushing to the branch triggers it, and **Re-run all jobs** on that run redeploys.

### 6. Open it

Visit `https://wardrobe.<subdomain>.workers.dev`, enter your wardrobe token, and you stay signed in on that phone. In Safari use **Share → Add to Home Screen** (or Chrome **⋮ → Add to Home screen**) to get an app icon.

### Rotating the token

Change the `WARDROBE_TOKEN` GitHub secret and re-run the workflow. Then sign in again on the web page and update the connector URL in Claude and ChatGPT.

---

## Connect Claude and ChatGPT

Your connector URL is:

```
https://wardrobe.<subdomain>.workers.dev/mcp/<WARDROBE_TOKEN>
```

For example: `https://wardrobe.yourname.workers.dev/mcp/abcdEf-ghijk1-lmnoPq`.

The token in the URL **is** the auth. Treat the whole URL like a password. Anyone with it can read and edit your wardrobe. Wrong or missing tokens get a plain 404.

### Claude

Add it once on claude.ai (works from a phone browser), and it then shows up in the Claude mobile app too:

1. **Settings** → **Connectors** → **Add custom connector**.
2. **Name**: `Wardrobe`. **Remote MCP server URL**: your connector URL.
3. Leave **Advanced settings** (OAuth Client ID / Secret) empty → **Add**.
4. In a chat, open the **+ / tools** menu and make sure *Wardrobe* is enabled.

### ChatGPT

1. **Settings** → **Apps & Connectors** → **Advanced settings** → turn on **Developer mode**. (Custom MCP connectors with write actions require it. Availability depends on your ChatGPT plan.)
2. Back in **Apps & Connectors** → **Create**.
3. **Name**: `Wardrobe`. **MCP Server URL**: your connector URL. **Authentication**: **No authentication**. Tick "I trust this application" → **Create**.
4. In a chat, choose **Developer mode** from the **+** menu and enable *Wardrobe*. ChatGPT asks you to confirm write actions (add/update/delete/log wear).

### Things to say

- "Add my grey Patagonia fleece, size M, bought last March for $129, fall and winter, casual."
- "What haven't I worn since August?"
- "It's 48° and raining and I have client meetings. Pick me an outfit." (calls `suggest_outfit_candidates`)
- "I wore the navy oxford and grey chinos today."
- "Delete the torn white tee."

---

## MCP tools

| Tool | What it does |
|---|---|
| `add_item` | Create an item. Only `name` is required. Category accepts synonyms ("jeans" becomes `bottom`). |
| `update_item` | Change any fields by `id`. `null` clears a field. |
| `delete_item` | Delete the item, its wear history and its photo. Annotated destructive, so clients ask first. |
| `search_items` | Free text plus filters: category, color, brand, season, formality, price range, `not_worn_since`, sort, paging. |
| `list_items` | List by category with sort and paging, or fetch one item with `id`. |
| `log_wear` | Record items worn on a date (default today, Eastern time). Bumps `times_worn` and `last_worn`. |
| `suggest_outfit_candidates` | Given season / formality / weather words / temperature, returns candidates per category (top, bottom, dress, outerwear, shoes, accessory), least-recently-worn first. The AI composes the outfit. |

**Data model** (`migrations/0001_init.sql`): name, category, brand, color, size, season (`all` or any of spring/summer/fall/winter), formality (casual/business/formal), purchase_date, price, photo, notes, last_worn, times_worn. A `wear_log` table keeps the dated history.

**Protocol**: stateless MCP over Streamable HTTP (`POST` JSON-RPC, JSON responses, no SSE). It supports protocol versions 2024-11-05 through 2025-11-25. `Authorization: Bearer <token>` on `/mcp` also works for clients that support headers.

---

## Web API (used by the page)

All endpoints except `login` need the session cookie or `Authorization: Bearer <token>`.

| Method + path | |
|---|---|
| `POST /api/login` `{token}` | Sets an HttpOnly cookie that holds a hash of the token, not the token itself. |
| `GET /api/items?query=&category=&season=&formality=&sort=&limit=&offset=` | Search |
| `POST /api/items`, `GET/PATCH/DELETE /api/items/:id` | CRUD |
| `POST /api/items/:id/wear` `{date?}` | Log a wear |
| `POST /api/photos` (raw JPEG/PNG/WebP body, ≤ 8 MB) | Upload to R2 → `{photo_key}` |
| `DELETE /api/photos/photos/<key>` | Discard an unsaved upload |
| `POST /api/analyze` `{photo_key}` | Workers AI auto-fill suggestion |
| `GET /photos/<key>` | Authenticated photo |

---

## Local development (laptop, optional)

```bash
cd wardrobe
npm install
cp .dev.vars.example .dev.vars          # set WARDROBE_TOKEN (24+ chars)
npm run db:migrate:local
npm run dev                             # http://localhost:8787
WARDROBE_TOKEN=<same token> npm test    # end-to-end tests against the dev server
npm run typecheck
```

`wrangler dev` runs D1 and R2 locally. The AI binding always calls Cloudflare, so photo auto-fill needs `npx wrangler login` and counts against your free daily AI allowance.

### Manual deploy from a laptop

```bash
npx wrangler login
npx wrangler d1 create wardrobe          # paste the id into wrangler.jsonc → database_id
npx wrangler r2 bucket create wardrobe-photos
npm run db:migrate:remote
npx wrangler deploy
npx wrangler secret put WARDROBE_TOKEN
```

## Notes

- **Time zone**: "today" for `log_wear` uses the `TIMEZONE` var in `wrangler.jsonc` (default `America/New_York`).
- **Vision model**: `@cf/meta/llama-4-scout-17b-16e-instruct`, image sent as a base64 data URI with JSON-schema output. To swap models, change `VISION_MODEL` in `src/ai.ts`. Other vision models available include `@cf/google/gemma-3-12b-it` and `@cf/mistralai/mistral-small-3.1-24b-instruct`.
- **Photos** are private: they're served only to a signed-in browser. Claude and ChatGPT see `photo_url` but can't open it.
