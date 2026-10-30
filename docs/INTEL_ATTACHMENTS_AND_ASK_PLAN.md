# Intel: attachments + Ask mode — plan

**Status:** BUILT on `feature/intel-attachments-ask` (2026-10-30), NOT merged. Migration `20261030083654` APPLIED to the shared prod DB and recorded. Edge function `ovis-knowledge-capture` DEPLOYED from the branch 2026-10-30 (live e2e passed: text PDF, .docx, .xlsx, scanned PDF all indexed; Ask answered with a cited, page-located source; test entry + Dropbox folder deleted). The 2 old notes without embeddings were backfilled. Decisions as approved 2026-10-30 — see "Build notes" at the end; where they differ from the plan below, the build notes win.
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

---

## Build notes (2026-10-30)

Decisions approved: temporary link per click, never shared links (no `shared_link` column exists); scanned PDFs read by Claude from the start; folders `/Salesforce Documents/Intel/{first linked client | General}/{YYYY-MM-DD ET} {short title}/` (a client named "General" becomes "General (client)"); proxy NOT widened; attachments then Ask, one branch; caps 50 MB / 10 files.

**Migration `20261030083654_intel_attachments_and_ask.sql`** — applied + recorded in `schema_migrations`.
- `knowledge_entry_file` (status machine: uploading → pending → extracting → done | truncated | no_text | unsupported | failed; upload_failed). Path CHECK pins every row under `/Salesforce Documents/Intel/`.
- `knowledge_file_chunk` (`tsv` generated + GIN, `embedding vector(1536)` with the provenance check, `method` text|scan).
- `knowledge_entry.tsv` generated column + GIN.
- Read: `is_internal_user()` only. Write: **service_role only** — `authenticated` has SELECT and nothing else, so the browser can't write a file row or chunk at all (avoids the "edge fn writes with user JWT" trap).
- Service-only helpers: `knowledge_file_claim` (lock), `knowledge_file_save_step` (chunks + progress in one transaction; replaces chunks from the step's first ord so a retried step never duplicates), `knowledge_file_fail_step` (3 strikes → failed).
- `intel_search(p_query, p_embedding, p_limit)` SECURITY INVOKER; EXECUTE for authenticated + service_role only.
- Verified: `scripts/intel_attachments_persona_test.sql` 48/48 (Mike/Arty/VA read 1 row + search hits; coach/portal 0 rows / 0 hits; every persona refused on insert/update/claim/save; anon 42501). Anonymous HTTP: both tables and the RPC return 401, the edge function 401.

**Edge function** (`ovis-knowledge-capture`, all behind `is_internal_user()`):
- `attach_start` (note owner only) picks the folder, a free file name (Dropbox listing + rows still uploading), returns a Dropbox temporary upload link and inserts the row; `attach_finish` confirms the bytes landed (`get_metadata`); `extract_file` runs ONE step; `file_link` returns a 4-hour `get_temporary_link` (the row is read through the caller's RLS first); `ask`.
- Dropbox calls live in `_shared/knowledge-capture/dropbox.ts`, separate from `dropbox-proxy` (same secrets), every call asserts the path is inside `/Salesforce Documents/Intel/`.
- Extraction is **driven by the browser**, one step per request (2 s CPU each); a closed tab is resumed the next time its owner opens Intel. No cron (avoids the cron-auth landmine).
  - PDF text layer: unpdf, up to 40 pages / ~0.9 s per step. Pages with < 40 characters of text are queued as scans.
  - Scans: Claude (Sonnet, the document block cached across steps) 3 pages per step. PDFs over ~22 MB or 100 pages can't go to the reader: those pages are reported in `status_note`, never silently empty.
  - .docx mammoth; .xlsx/.xls/.csv SheetJS with `sheetRows` (5,000 rows/sheet); images and .doc stored, not indexed.
  - Chunks ~6,000 chars, 300 overlap; a chunk never spans a page gap ("p. 1–4" can't claim page 2 it doesn't contain). 300,000 characters per file, then `truncated`.
- Converse now also returns `short_title` (optional in the schema) for the folder name; fallback is the note's first six words.

**Ask** (`_shared/knowledge-capture/ask.ts`): search → floor (a candidate found only by meaning needs similarity ≥ 0.30) → if nothing, "nothing found" with no model call → Sonnet answers in `{answered, statements[{text, citations[{source, quote}]}]}` → `verifyAnswer` drops any citation to a source not sent, any quote not found word for word (case/whitespace/curly-quote/line-break-hyphen normalised), and any statement containing a number absent from the sources it cites. No surviving statement → "Nothing in Intel answers that."

**Not done / known gaps**
- The 2 entries with no embedding are still not backfilled; Ask finds them by keyword/tag/link only.
- A failed upload can be retried only from the same tab session (the browser still holds the file). Otherwise re-file.
- No delete for an attached file from the panel.
- A deal linked without its account files under General (only account links pick the client folder, as specified).
- Tests: `attachments_test.ts` (incl. real text PDF, image-only PDF, .docx, .xlsx fixtures), `extract_test.ts`, `ask_test.ts` — 91/91 with the existing suites. Run with `--node-modules-dir=none --allow-import --allow-read` (the readers import unpdf/mammoth/SheetJS).

### Deploy notes (2026-10-30)

- **SheetJS is vendored** at `supabase/functions/_shared/vendor/xlsx-0.20.3.mjs` (copy of `https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs`). A dynamic `import('https://…')` is NOT bundled by `supabase functions deploy` — it failed live with "Module not found" — while dynamic `npm:` imports (unpdf, mammoth) and relative files are. The npm `xlsx` package stops at 0.18.5, which has known parser CVEs, so it isn't an option. To upgrade, replace the file and the import path in `readers.ts`.
- Live check: create a throwaway note, attach the four `fixtures/` files, drive `extract_file`, `ask`, then delete the note (cascades to file rows and chunks) and the Dropbox folder (`dropbox-proxy` op `delete`). With no client, files land in `/Salesforce Documents/Intel/General/`.


## Follow-up: delete a file, attach to a filed note (2026-10-30, `feature/intel-file-delete-attach`)

**Delete.** Each file on a filed note has a *delete* link (inline confirm: "Delete from Dropbox and Intel?").
- Edge action `delete_file { file_id }` → `{ deleted: true }`. Allowed for the uploader (`created_by`) or an admin (`is_admin()`, called as the user); anyone else gets 403. Portal and coach never get that far — the `is_internal_user()` gate refuses them first.
- Order: Dropbox file first, then the row. If Dropbox refuses (502), nothing changes and the user can try again. A file already gone from Dropbox still loses its row.
- The row delete cascades to `knowledge_file_chunk`, so neither `intel_search` path (keyword, meaning) can return the text — Ask can't cite it. An extraction step still running for the file fails its save (`knowledge_file_save_step` raises when the row is gone) rather than writing orphan chunks.
- When the note's folder is empty afterwards, it is deleted too (best effort).
- Browsers still can't delete rows directly (`authenticated` has SELECT only) — the persona test checks it.
- The UI hides *delete* unless you uploaded the file or are an admin; the server is the control.
- No migration.

**Attach to a filed note.** Each note in "Recently filed" has an *Attach* link: same picker, caps (50 MB, 10 files per note counting what's already on it, allowed types), upload and indexing as a new note. The server reuses the note's folder from its existing file rows; a note with no files yet gets a folder named from its date and text, as before. Only your own notes (attach_start's owner check, unchanged).

**Failed files.** `upload_failed` and `failed` both show **Failed** on the note with what happened and what to do ("…delete it and attach the file again"). A row left `uploading` for over an hour (tab closed mid-upload; the upload link lasts an hour) is shown as Failed — "The upload never finished."

**Tests.**
- `deleteFile_test.ts`: permissions (uploader, admin, other → 403), Dropbox-then-row order, a Dropbox failure leaves everything, already-gone file, folder cleanup, and *a deleted file no longer appears in Ask results* (askIntel over an in-memory index answers before the delete, `nothing_found` after).
- `intelFileRules_test.ts` (tests `src/components/knowledgeCapture/intelFileRules.ts`, the browser's pure rules): caps when attaching to a note that already has files, repeats, the Failed messages.
- `scripts/intel_attachments_persona_test.sql`: every persona's direct DELETE is refused (42501); after a service-role delete, the file's chunks and both `intel_search` hits are gone (56/56).
