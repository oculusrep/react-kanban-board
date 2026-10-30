/**
 * The attachment actions of ovis-knowledge-capture. Every one runs AFTER the
 * function's is_internal_user() gate; attach_start/attach_finish additionally
 * require the caller to own the note.
 *
 *   attach_start   { entry_id, filename, size, mime_type?, client_id?, short_title? }
 *                  → { file_id, upload_url, dropbox_path }
 *   attach_finish  { file_id, ok }      → { status }
 *   extract_file   { file_id }          → { status, more, status_note }
 *   file_link      { file_id }          → { url }   (4-hour temporary link)
 *
 * Bytes never pass through the function: the browser POSTs them to the one-time
 * Dropbox upload link from attach_start.
 *
 * Folder: /Salesforce Documents/Intel/{first linked client | General}/{YYYY-MM-DD ET} {short title}/
 * chosen when a note's first file is attached, reused for its later files.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  checkUpload,
  cleanFileName,
  clientSegment,
  easternDate,
  fileKind,
  freeName,
  INTEL_BASE,
  MAX_FILES_PER_ENTRY,
  pickShortTitle,
  unindexedReason,
  withinIntel,
} from './attachments.ts';
import * as dropbox from './dropbox.ts';
import { createEmbeddings } from './embedding.ts';
import { type FileRow, type Progress, runStep, type SavedChunk } from './extract.ts';
import * as readers from './readers.ts';

type Result = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string, detail?: string): Result => ({ status, body: { error, ...(detail ? { detail } : {}) } });

export async function attachStart(
  service: SupabaseClient,
  userClient: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const entryId = typeof body.entry_id === 'string' ? body.entry_id : '';
  if (!entryId) return fail(400, 'entry_id is required');
  const check = checkUpload(body.filename, body.size);
  if (!check.ok) return fail(400, 'bad_file', check.error);

  // Read as the caller (RLS), then require ownership: files go on your own notes.
  const { data: entry, error: entryErr } = await userClient
    .from('knowledge_entry').select('id, user_id, clean_text, created_at').eq('id', entryId).maybeSingle();
  if (entryErr) return fail(500, 'entry_lookup_failed', entryErr.message);
  if (!entry) return fail(404, 'entry_not_found');
  if (entry.user_id !== userId) return fail(403, 'forbidden', 'Files can only be attached to your own notes.');

  const { data: existing, error: filesErr } = await service
    .from('knowledge_entry_file').select('id, dropbox_path, dropbox_folder, status').eq('entry_id', entryId)
    .order('created_at');
  if (filesErr) return fail(500, 'file_lookup_failed', filesErr.message);
  const live = (existing ?? []).filter((f) => f.status !== 'upload_failed');
  if (live.length >= MAX_FILES_PER_ENTRY) return fail(400, 'too_many_files', `A note takes at most ${MAX_FILES_PER_ENTRY} files.`);

  // Folder: reuse this note's, or create the name for its first file.
  let folder: string | undefined = (existing ?? [])[0]?.dropbox_folder;
  if (!folder) {
    const { data: links } = await service
      .from('knowledge_entry_link').select('object_id, created_at, id')
      .eq('entry_id', entryId).eq('object_type', 'account')
      .order('created_at').order('id');
    const accountIds = (links ?? []).map((l) => String(l.object_id));
    // "First linked client" is the panel's order; the hint is only trusted if it
    // really is one of this note's links.
    const hint = typeof body.client_id === 'string' ? body.client_id : '';
    const clientId = accountIds.includes(hint) ? hint : accountIds[0];
    let clientName: string | null = null;
    if (clientId) {
      const { data: client } = await service.from('client').select('client_name').eq('id', clientId).maybeSingle();
      clientName = client?.client_name ?? null;
    }
    const parent = `${INTEL_BASE}/${clientSegment(clientName)}`;
    const sub = `${easternDate(String(entry.created_at))} ${pickShortTitle(body.short_title, String(entry.clean_text ?? ''))}`;
    folder = `${parent}/${freeName(sub, await dropbox.listNames(parent))}`;
  }
  if (!withinIntel(`${folder}/x`)) return fail(500, 'bad_folder');

  // A name free both in Dropbox and among rows still uploading into this folder.
  const taken = await dropbox.listNames(folder);
  for (const f of existing ?? []) taken.add(String(f.dropbox_path).split('/').pop()!.toLowerCase());
  const name = freeName(cleanFileName(String(body.filename)), taken);
  const path = `${folder}/${name}`;

  const uploadUrl = await dropbox.uploadLink(path);
  const { data: row, error: insErr } = await service.from('knowledge_entry_file').insert({
    entry_id: entryId,
    created_by: userId,
    dropbox_path: path,
    dropbox_folder: folder,
    filename: name,
    file_ext: check.ext,
    mime_type: typeof body.mime_type === 'string' ? body.mime_type.slice(0, 120) : null,
    size_bytes: Number(body.size),
    status: 'uploading',
  }).select('id').single();
  if (insErr) return fail(500, 'file_insert_failed', insErr.message);

  return { status: 200, body: { file_id: row.id, upload_url: uploadUrl, dropbox_path: path } };
}

export async function attachFinish(service: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<Result> {
  const fileId = typeof body.file_id === 'string' ? body.file_id : '';
  const { data: file } = await service
    .from('knowledge_entry_file').select('id, created_by, dropbox_path, file_ext, status').eq('id', fileId).maybeSingle();
  if (!file) return fail(404, 'file_not_found');
  if (file.created_by !== userId) return fail(403, 'forbidden');
  if (file.status !== 'uploading' && file.status !== 'upload_failed') return { status: 200, body: { status: file.status } };

  let status = 'upload_failed';
  let note: string | null = 'The upload did not complete.';
  if (body.ok === true) {
    const meta = await dropbox.metadata(String(file.dropbox_path));
    if (meta) {
      const kind = fileKind(String(file.file_ext));
      const reason = kind ? unindexedReason(kind) : 'Unrecognised file type.';
      status = reason ? 'unsupported' : 'pending';
      note = reason;
    }
  }
  const { error } = await service.from('knowledge_entry_file')
    .update({ status, status_note: note }).eq('id', fileId);
  if (error) return fail(500, 'file_update_failed', error.message);
  return { status: 200, body: { status, status_note: note } };
}

export async function extractFile(service: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const fileId = typeof body.file_id === 'string' ? body.file_id : '';
  if (!fileId) return fail(400, 'file_id is required');

  const { data: claimed, error: claimErr } = await service.rpc('knowledge_file_claim', { p_file_id: fileId });
  if (claimErr) return fail(500, 'claim_failed', claimErr.message);
  const row = (Array.isArray(claimed) ? claimed[0] : claimed) as FileRow | undefined;
  if (!row) {
    // Someone else holds it, or it's finished. Report where it stands.
    const { data: cur } = await service.from('knowledge_entry_file')
      .select('status, status_note, lock_until').eq('id', fileId).maybeSingle();
    if (!cur) return fail(404, 'file_not_found');
    const busy = cur.status === 'pending' || cur.status === 'extracting';
    return { status: 200, body: { status: cur.status, status_note: cur.status_note, more: busy, busy } };
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  try {
    const result = await runStep(row, {
      download: dropbox.download,
      pdfPages: readers.pdfPages,
      docxText: readers.docxText,
      sheets: readers.sheets,
      ocrPages: (bytes, pages) => {
        if (!apiKey) throw new Error('anthropic_key_missing');
        return readers.ocrPages(apiKey, bytes, pages);
      },
      embed: createEmbeddings,
      save: async (id: string, chunks: SavedChunk[], progress: Progress) => {
        const { error } = await service.rpc('knowledge_file_save_step', {
          p_file_id: id,
          p_chunks: chunks,
          p_progress: progress,
        });
        if (error) throw new Error(`save failed: ${error.message}`);
      },
    });
    const { data: cur } = await service.from('knowledge_entry_file').select('status_note').eq('id', fileId).maybeSingle();
    return { status: 200, body: { status: result.status, more: result.more, status_note: cur?.status_note ?? null } };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[knowledge-capture] extract step failed:', fileId, detail);
    const { data: st } = await service.rpc('knowledge_file_fail_step', { p_file_id: fileId, p_error: `Could not read this file: ${detail}` });
    const status = String((Array.isArray(st) ? st[0] : st) ?? 'extracting');
    return { status: 200, body: { status, more: status !== 'failed', status_note: `Could not read this file: ${detail}` } };
  }
}

export async function fileLink(userClient: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const fileId = typeof body.file_id === 'string' ? body.file_id : '';
  // Through the caller's RLS: only internal users see the row at all.
  const { data: file, error } = await userClient
    .from('knowledge_entry_file').select('dropbox_path, status').eq('id', fileId).maybeSingle();
  if (error) return fail(500, 'file_lookup_failed', error.message);
  if (!file) return fail(404, 'file_not_found');
  if (file.status === 'uploading' || file.status === 'upload_failed') return fail(409, 'not_uploaded', 'This file never finished uploading.');
  return { status: 200, body: { url: await dropbox.temporaryLink(String(file.dropbox_path)) } };
}

