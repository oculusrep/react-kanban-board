# Intel: attachments + Ask mode — plan

**Status:** PLAN ONLY (2026-10-29). Nothing built. Branch `feature/intel-attachments-ask`.
Related: [KNOWLEDGE_CAPTURE.md](KNOWLEDGE_CAPTURE.md).

Two additions to Intel (Alt+K):

1. **Attachments.** Drag PDF, Word, Excel or image files into the panel when filing a note. Each file is saved to Dropbox, recorded against the `knowledge_entry`, and its text is extracted and embedded so search covers what's inside.
2. **Ask mode.** Ask a question. Intel answers only from notes and file text it finds, cites its sources, and links to the files. If it finds nothing, it says so.

---

## What OVIS already has

### Dropbox: yes, and it can be reused

`supabase/functions/dropbox-proxy` (since 2026-10-16) is the only route from the browser to Dropbox.

**How it authenticates:**
- The Dropbox credentials (`DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`) are Supabase secrets.
- The proxy swaps the refresh token for an access token and caches it, refreshing once on a 401.
- Callers use their own login. The gateway checks it (`verify_jwt` on), then the proxy checks `is_internal_user()`.

**Internal users** can run every operation, but only under `/Salesforce Documents`:
- check a path exists, list a folder
- create, delete or move a file or folder
- get a temporary link or a shared link
- get an upload link

**Portal users** must name the property, deal or site submit they're viewing. They are limited to that record's `dropbox_mapping` folder and to the files marked visible in the portal. Anyone else gets 403.

**Uploads skip the edge function.** The proxy returns a one-time Dropbox upload link, and the browser sends the file straight to Dropbox. Edge-function size limits don't apply to uploads. Dropbox's own cap for an upload link is 150 MB per file.

Client folders already exist, at `/Salesforce Documents/Accounts/{client name}`. The `dropbox_mapping` table has rows with `entity_type = 'client'`, and `dropboxService.buildEntityFolderPath('client', …)` builds the path.

**Two things in the request don't fit the proxy as it is:**

- **`/Intel/General/` is outside the allowed area.** The proxy refuses any path outside `/Salesforce Documents`. The plan therefore uses `/Salesforce Documents/Intel/General/`, which needs no proxy change. Widening the proxy's allowed area is possible, but I recommend against it.
- **Shared links are public.** The proxy creates them with `audience: 'public'`, so anyone holding the URL can open the file without logging in. See the access section below.

### Text extraction and search: no

- Nothing in `supabase/functions` parses PDF, Word or Excel today.
- `knowledge_entry.embedding` is filled when a note is filed (OpenAI `text-embedding-3-small`, 1536 dimensions). Nothing searches it, and there is no vector index or full-text index.
- **Known gap:** 2 entries still have no embedding (the backfill is waiting on your choice of option A or B). Ask's meaning-based search would miss those two. Keyword search would still find them.

---

## Part 1 — Attachments

### Flow

1. **Drag files onto the panel.** They appear as chips, each with name, type and size. Nothing uploads yet: the folder depends on the linked client and the short title, and both are only settled when you file.
2. **Press File.** The entry is filed as it is today.
3. **For each file:**
   1. The edge function works out the folder (see Folders) and returns an upload link. It reuses the proxy's `uploadLink` logic, including picking a name that doesn't collide.
   2. The browser sends the file to Dropbox.
   3. A `knowledge_entry_file` row is written with `extraction_status = 'pending'`.
4. **The browser starts extraction for each file** (`action: 'extract_file'`) without waiting for it. The panel shows "filed — 2 files indexing…" and closes.
5. **If an upload fails,** the note stays filed and the file row reads `upload_failed`, with a Retry button on the entry. A note is never left half-filed in silence.

### Folders

| Case | Folder |
|---|---|
| A client is linked | `{client folder}/Intel/{YYYY-MM-DD} {short title}/` |
| No client linked | `/Salesforce Documents/Intel/General/{YYYY-MM-DD} {short title}/` |

- **Client folder:** the client's `dropbox_mapping` row if there is one, otherwise the standard `Accounts/{client name}` path.
- **Date** is the filing date in Eastern Time.
- **Short title:** a new `short_title` field in the converse output, at most 6 words (e.g. "Chipotle work letter"). The note's first words are the fallback. Characters Dropbox rejects are removed.
- **Two notes with the same date and title** get a "(1)" suffix, the same way the proxy already names duplicate files.
- **Decision D3 below:** which folder to use when several clients are linked, and whether to create a client folder that doesn't exist yet.

### Data

**New table `knowledge_entry_file`, one row per file:**
- `id`
- `entry_id`, a foreign key to the entry; deleting the entry deletes the row
- `dropbox_path`, `dropbox_folder`
- `filename`, `file_ext`, `mime_type`, `size_bytes`
- `shared_link`: only if decision D1 keeps shared links
- `extraction_status`: one of `pending`, `done`, `no_text`, `unsupported`, `too_large`, `truncated`, `failed`, `upload_failed`
- `extraction_note`, `page_count`, `char_count`
- `created_by`, `created_at`

**New table `knowledge_file_chunk`, the file text cut into pieces for search:**
- `id`, `file_id` (the parent file; deleting the file deletes its chunks), `ord`
- `locator`, e.g. "p. 4–5" or "Sheet: Rent roll, rows 1–80", so a citation can point at the page
- `content`
- `tsv`, a full-text index column generated from `content`, with a GIN index
- `embedding vector(1536)`, `embedding_model`, `embedding_dims`, with the same provenance rule as `knowledge_entry`

**Also:** `knowledge_entry` gets the same generated `tsv` column (on `clean_text`) and a GIN index, so Ask can search notes by keyword.

**Chunk size:** about 1,500 tokens with a small overlap. Each chunk is embedded separately; one embedding per file would blur a 40-page lease into a single point.

### Extraction

Extraction runs in the background, never in the filing request, because of the edge-function limits:

| Limit | Value |
|---|---|
| CPU time | 2 s per request (time waiting on network or disk doesn't count) |
| Memory | 256 MB |
| Wall clock | 400 s on a paid plan |

CPU time is the binding one. Parsing a long PDF or a large spreadsheet in JavaScript can exceed it.

To stay inside it, each `extract_file` run handles a batch (a few PDF pages or a few thousand spreadsheet rows), saves its place, and calls itself for the next batch. A cron sweep picks up any file left `pending` for more than about 10 minutes.

**Cron caveat:** OVIS's cron-to-edge-function authentication has a known problem (see Deep Sweep: there is no `service_role_key` in the vault). The browser-started call is the main path; the sweep is the backup and must use the same authentication the Deep Sweep uses.

| Type | How | Notes |
|---|---|---|
| PDF with a text layer | `unpdf` (pdf.js), page by page | Records the page number on each chunk |
| PDF with no text (scanned) | A page with almost no text is treated as scanned | Status `no_text`. See below |
| Word `.docx` | `mammoth` raw-text output | Old `.doc` files: `unsupported` |
| Excel `.xlsx` / `.xls` / `.csv` | SheetJS, sheet by sheet, rows written as `Header: value` lines | Capped at 5,000 rows per sheet; status `truncated` above that |
| Images | Stored and linked only | `unsupported` for now, as requested |

**Size limits proposed:**
- 50 MB per file, at most 10 files per note. Dropbox would allow up to 150 MB; 50 MB keeps extraction within the 256 MB memory limit.
- Larger files are refused in the panel before upload, with the reason shown.
- 300,000 characters of text indexed per file (about 75,000 tokens, roughly 50 chunks). Anything beyond is stored in Dropbox but not searchable, and the status says `truncated`, so it's never silently partial.

**Scanned PDFs:**
- **Default:** status `no_text`. The file is stored and linked, and the note says "scanned — contents not searchable". It is still found through its note, tags and filename.
- **Option D2, reading scans with Claude:** send the PDF to Claude, which reads each page as an image. It can take PDFs up to 32 MB per request; Anthropic's docs list 100 pages, though a newer figure says more. Rough cost: $0.01–0.02 per page (about $0.50–1.00 for a 50-page scan). About +0.5 day.

**Cost of embedding file text:** `text-embedding-3-small` is cheap. A 50-chunk file costs well under a cent.

---

## Part 2 — Ask mode

### Flow

1. The panel gets an **Ask** toggle next to the existing capture mode.
2. Typing a question calls `action: 'ask'`, which is behind the same `is_internal_user()` check as every other action.
3. **Retrieval** uses a new database function `intel_search(query_embedding, query_text, k)`. It runs with the caller's own permissions, so the row-level security on every table applies. It merges four kinds of candidate, ranking them by reciprocal rank fusion:
   - **Meaning:** vector similarity against note and chunk embeddings.
   - **Keyword:** `websearch_to_tsquery` against note and chunk text.
   - **Tag:** the question's words matched against `knowledge_entry_tag`.
   - **Linked record:** a name in the question that matches a client, deal, property or contact (e.g. "Chipotle") pulls in the notes linked to that record.
4. **Relevance floor:** if nothing passes the similarity threshold and nothing matched by keyword, tag or linked record, the answer is "Nothing in Intel about that" and **no model call is made**.
5. **Answer:** Sonnet, with no tools, gets the question plus the top 12 sources as `[S1]…[S12]`. Each source carries its text, its note date and author, or its file name and page.
   - The prompt requires that every statement cite a source and include a short quote from it.
   - If the sources don't answer the question, it must say so.
6. **Server checks, the same idea as `verifyDetails()`:**
   - Every citation must be one of the sources it was given.
   - Every quote must appear literally in the source it cites.
   - Any statement whose quote fails is removed.
   - If nothing cited survives, the result is "Nothing in Intel answers that" rather than an uncited answer.

   This is how "never answer from general knowledge" is enforced, instead of relying on the prompt alone.
7. **Display:** the answer with numbered citations.
   - A note citation opens the note in an overlay.
   - A file citation shows the file name and page; clicking it opens the Dropbox copy (see D1).
   - An "N sources searched" line is shown. A sentence like "nothing about the TI amount" is shown as such.

### Search index

- With dozens to hundreds of rows, scanning every row is fine, so no vector index is needed yet.
- Add an HNSW index when there are around 5,000 or more chunks.

---

## Access: internal only; portal users can't reach the files

**Database**
- Both new tables use the same rule as `knowledge_entry`: internal users can read (`is_internal_user()`), and you can insert your own rows.
- Each table gets the standard grants block from CLAUDE.md: nothing for `anon`, only the operations the app uses for `authenticated`, and `service_role` for the extraction worker.
- `intel_search` uses the caller's own permissions, can be run by `authenticated` only, and is revoked from `PUBLIC` and `anon`.

**Edge function**
- `extract_file` and `ask` sit behind the existing `is_internal_user()` gate, so portal and coach users get 403.

**Dropbox**
- In the proxy, portal users are confined to the folder of a property, deal or site submit they can see.
- `Accounts/…/Intel/…` and `Intel/General/…` are never inside one of those folders, so every portal request for them is refused with 403. I checked this in the code (`portalOp` versus `internalOp`).

**Gaps that matter:**
1. **Shared links (D1).** A Dropbox shared link from this proxy is public. Storing one in `knowledge_entry_file`, or showing it in an answer that someone later pastes into an email or a portal comment, would make the file readable by anyone, portal users included.

   **Recommendation:** don't create shared links for Intel files. Store the path only, and open files with a 4-hour temporary link requested per click from the proxy, which is internal-only. "Links to the Dropbox copies" then means a click that opens the file for internal users only.
2. **Sharing set up directly in Dropbox, outside OVIS.** If any `Accounts/{client}` folder is shared with that client in Dropbox itself, an Intel subfolder inside it is shared too. OVIS can't detect that.

   **Alternative that avoids it:** `/Salesforce Documents/Intel/{client name}/…` instead of inside the client's folder (D3).

**Verification before shipping:**
- A rolled-back test as each persona (Mike, Arty, the VA, portal, coach), covering reads and writes on both tables plus `intel_search`. Portal and coach must get zero rows or a refusal.
- An anonymous HTTP request to the RPC and to both tables.
- A portal-user request to the proxy for an Intel path, which must return 403.

---

## Effort

| Part | Work | Estimate |
|---|---|---|
| 1. Attachments | Schema + RLS + grants + persona test | 0.5 day |
| | Drag-and-drop chips, upload after filing, retry, folder logic, `short_title` | 1 day |
| | Extraction in batches (PDF / docx / xlsx), chunking, embedding, cron backup | 1.5 days |
| | Tests on real files (text PDF, scanned PDF, lease docx, rent-roll xlsx), docs | 0.5 day |
| | **Total** | **3–3.5 days** (+0.5 day for scan reading, D2) |
| 2. Ask mode | `tsv` columns + `intel_search` + persona test | 0.5–1 day |
| | `ask` action: retrieval, relevance floor, prompt, citation and quote checks + unit tests | 1 day |
| | Ask UI: citations, note overlay, open file by temporary link | 0.5–1 day |
| | **Total** | **2–3 days** |

**Order:** the parts are independent. Ask can ship first over notes only, and file text joins its results as soon as Part 1 lands, with no change to Ask. Part 1 first means Ask covers files from its first day.

## Decisions needed

- **D1 — links.** Temporary link per click, no stored public link (recommended), or store a public shared link as originally specified (readable by anyone holding the URL).
- **D2 — scanned PDFs.** `no_text` for now (recommended to start), or read them with Claude now (+0.5 day, about $0.01–0.02 per page).
- **D3 — folders.**
  - (a) Inside the client folder (`Accounts/{client}/Intel/…`, as specified), or `Intel/{client}/…` to avoid any sharing set up on the client folder in Dropbox.
  - (b) When several clients are linked: the first client the model linked, or `Intel/General`.
  - (c) When the client has no Dropbox folder yet: create it, or fall back to `Intel/General`.
- **D4 — base path.** `/Salesforce Documents/Intel/General` (recommended, no proxy change), or a real top-level `/Intel/General` (widens the proxy's allowed area).
- **D5 — order.** Attachments first or Ask first.

## Sources

- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Claude PDF support](https://docs.anthropic.com/en/docs/build-with-claude/pdf-support)
- [Dropbox HTTP API](https://www.dropbox.com/developers/documentation/http/documentation) (`files/get_temporary_upload_link`, `sharing/create_shared_link_with_settings`)
