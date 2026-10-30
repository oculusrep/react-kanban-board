import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { type FiledResult, invokeKnowledgeCapture } from './useKnowledgeCapture';
import { type FileStatus, screenFiles } from './intelFileRules';

export {
  ACCEPT_ATTR, ACCEPTED_EXTENSIONS, FAILED_STATUSES, type FileStatus, formatBytes, MAX_FILE_BYTES, MAX_FILES,
} from './intelFileRules';

// Intel attachments in the browser: files waiting to be filed with a note, the
// upload after filing, and the extraction steps that make them searchable.
//
// Bytes go straight to Dropbox through a one-time upload link from the edge
// function — never through the function. Extraction runs as a series of short
// requests (edge functions get 2 s of CPU each), driven from here; if the tab
// closes mid-way, opening Intel again resumes this user's unfinished files.
// Docs: docs/INTEL_ATTACHMENTS_AND_ASK_PLAN.md

/** A file chosen in the panel, not yet filed. */
export interface DraftFile {
  localId: string;
  file: File;
}

/** A file attached to a filed note, as the panel shows it. */
export interface IntelFile {
  /** knowledge_entry_file.id once attach_start has run. */
  id: string | null;
  localId: string;
  entry_id: string;
  filename: string;
  size: number;
  status: FileStatus;
  status_note: string | null;
  /** Who attached it (auth user id); null for rows not loaded yet. */
  created_by: string | null;
}

/**
 * A row still 'uploading' this long after its last change was abandoned (tab
 * closed mid-upload; the Dropbox upload link lasts 1 hour), so it is shown as
 * failed.
 */
const STALE_UPLOAD_MS = 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_STEPS = 300;

export function useIntelFiles(authUserId: string | null) {
  const [drafts, setDrafts] = useState<DraftFile[]>([]);
  const [files, setFiles] = useState<Record<string, IntelFile[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  // File objects kept for a retry after a failed upload, by localId.
  const bytesRef = useRef<Map<string, File>>(new Map());
  const drivingRef = useRef<Set<string>>(new Set());
  // Folder hints per filed entry, for a retry.
  const filedRef = useRef<Map<string, FiledResult>>(new Map());

  const patch = useCallback((entryId: string, localId: string, change: Partial<IntelFile>) => {
    setFiles((all) => ({
      ...all,
      [entryId]: (all[entryId] ?? []).map((f) => (f.localId === localId ? { ...f, ...change } : f)),
    }));
  }, []);

  /** Add files to the note being written. Returns why any were refused. */
  const addDrafts = useCallback((incoming: File[] | FileList) => {
    const list = Array.from(incoming);
    let refused: string[] = [];
    setDrafts((current) => {
      const screened = screenFiles(list, current.map((d) => d.file));
      refused = screened.refused;
      return [...current, ...screened.accepted.map((file) => ({ localId: crypto.randomUUID(), file }))];
    });
    setNotice(refused.length ? refused.join(' ') : null);
  }, []);

  const removeDraft = useCallback((localId: string) => {
    setDrafts((d) => d.filter((x) => x.localId !== localId));
  }, []);

  const clearDrafts = useCallback(() => setDrafts([]), []);

  /** Run extraction steps until the file is finished (or another tab holds it). */
  const drive = useCallback(async (entryId: string, localId: string, fileId: string) => {
    if (drivingRef.current.has(fileId)) return;
    drivingRef.current.add(fileId);
    try {
      let busyWaits = 0;
      for (let i = 0; i < MAX_STEPS; i++) {
        const r = await invokeKnowledgeCapture<{ status: FileStatus; more: boolean; busy?: boolean; status_note?: string | null }>(
          { action: 'extract_file', file_id: fileId },
        );
        patch(entryId, localId, { status: r.status, status_note: r.status_note ?? null });
        if (!r.more) break;
        if (r.busy) {
          // Held by another request (another tab, or a step still running). Wait it out.
          if (++busyWaits > 40) break;
          await sleep(4000);
        } else {
          busyWaits = 0;
        }
      }
    } catch (e) {
      patch(entryId, localId, { status_note: e instanceof Error ? e.message : 'Indexing stopped; reopen Intel to resume.' });
    } finally {
      drivingRef.current.delete(fileId);
    }
  }, [patch]);

  const uploadOne = useCallback(async (filed: FiledResult, item: IntelFile, file: File) => {
    const entryId = filed.entry_id;
    patch(entryId, item.localId, { status: 'uploading', status_note: null });
    let fileId = item.id;
    try {
      const start = await invokeKnowledgeCapture<{ file_id: string; upload_url: string; dropbox_path: string }>({
        action: 'attach_start',
        entry_id: entryId,
        filename: file.name,
        size: file.size,
        mime_type: file.type || null,
        client_id: filed.client_id,
        short_title: filed.short_title,
      });
      fileId = start.file_id;
      patch(entryId, item.localId, { id: fileId });
      // Dropbox's temporary upload link: POST the raw bytes.
      const put = await fetch(start.upload_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const finish = await invokeKnowledgeCapture<{ status: FileStatus; status_note: string | null }>({
        action: 'attach_finish', file_id: fileId, ok: put.ok,
      });
      patch(entryId, item.localId, { status: finish.status, status_note: finish.status_note });
      if (finish.status === 'pending') {
        bytesRef.current.delete(item.localId);
        await drive(entryId, item.localId, fileId);
      }
    } catch (e) {
      if (fileId) {
        await invokeKnowledgeCapture({ action: 'attach_finish', file_id: fileId, ok: false }).catch(() => undefined);
      }
      patch(entryId, item.localId, {
        status: 'upload_failed',
        status_note: e instanceof Error ? e.message : 'Upload failed',
      });
    }
  }, [drive, patch]);

  /**
   * After the note is filed: upload its files one at a time (the first one
   * creates the folder the rest reuse), then index each.
   */
  const uploadForEntry = useCallback(async (filed: FiledResult, toUpload: DraftFile[]) => {
    if (toUpload.length === 0) return;
    filedRef.current.set(filed.entry_id, filed);
    const items: IntelFile[] = toUpload.map((d) => ({
      id: null,
      localId: d.localId,
      entry_id: filed.entry_id,
      filename: d.file.name,
      size: d.file.size,
      status: 'queued',
      status_note: null,
      created_by: authUserId,
    }));
    for (const d of toUpload) bytesRef.current.set(d.localId, d.file);
    setFiles((all) => ({ ...all, [filed.entry_id]: [...(all[filed.entry_id] ?? []), ...items] }));
    for (const item of items) {
      const file = bytesRef.current.get(item.localId);
      if (file) await uploadOne(filed, item, file);
    }
  }, [authUserId, uploadOne]);

  /**
   * Add files to a note that's already filed: same caps, same upload and
   * indexing, same Dropbox folder (the server reuses the note's folder).
   */
  const attachToEntry = useCallback((entryId: string, incoming: File[] | FileList) => {
    const onNote = (files[entryId] ?? []).filter((f) => f.status !== 'upload_failed');
    const { accepted, refused } = screenFiles(Array.from(incoming), onNote.map((f) => ({ name: f.filename, size: f.size })));
    setNotice(refused.length ? refused.join(' ') : null);
    if (accepted.length === 0) return;
    const filed = filedRef.current.get(entryId) ?? { entry_id: entryId, client_id: null, short_title: '' };
    void uploadForEntry(filed, accepted.map((file) => ({ localId: crypto.randomUUID(), file })));
  }, [files, uploadForEntry]);

  /**
   * Delete an attached file (the uploader or an admin; the server checks):
   * Dropbox copy, row and searchable text all go.
   */
  const deleteFile = useCallback(async (item: IntelFile): Promise<boolean> => {
    if (!item.id) return false;
    try {
      await invokeKnowledgeCapture({ action: 'delete_file', file_id: item.id });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not delete the file');
      return false;
    }
    bytesRef.current.delete(item.localId);
    setFiles((all) => ({
      ...all,
      [item.entry_id]: (all[item.entry_id] ?? []).filter((f) => f.localId !== item.localId),
    }));
    return true;
  }, []);

  const retryUpload = useCallback((item: IntelFile) => {
    const file = bytesRef.current.get(item.localId);
    const filed = filedRef.current.get(item.entry_id) ?? { entry_id: item.entry_id, client_id: null, short_title: '' };
    if (file) void uploadOne(filed, { ...item, id: null }, file);
  }, [uploadOne]);

  const canRetry = useCallback((localId: string) => bytesRef.current.has(localId), []);

  /** Files of the recent entries, from the table; resumes this user's unfinished ones. */
  const loadFor = useCallback(async (entryIds: string[]) => {
    if (!authUserId || entryIds.length === 0) return;
    const { data, error } = await supabase
      .from('knowledge_entry_file')
      .select('id, entry_id, filename, size_bytes, status, status_note, created_by, updated_at')
      .in('entry_id', entryIds)
      .order('created_at');
    if (error || !data) return;
    const byEntry: Record<string, IntelFile[]> = {};
    for (const row of data as Array<Record<string, unknown>>) {
      const entryId = String(row.entry_id);
      const abandoned = row.status === 'uploading' && !drivingRef.current.has(String(row.id))
        && Date.now() - new Date(String(row.updated_at)).getTime() > STALE_UPLOAD_MS;
      (byEntry[entryId] ??= []).push({
        id: String(row.id),
        localId: String(row.id),
        entry_id: entryId,
        filename: String(row.filename),
        size: Number(row.size_bytes),
        status: abandoned ? 'upload_failed' : row.status as FileStatus,
        status_note: abandoned ? 'The upload never finished.' : (row.status_note as string | null) ?? null,
        created_by: (row.created_by as string | null) ?? null,
      });
    }
    setFiles((all) => {
      const next = { ...all };
      for (const id of entryIds) {
        const fromDb = byEntry[id] ?? [];
        const local = (all[id] ?? []).filter((f) => !f.id || !fromDb.some((d) => d.id === f.id));
        // This tab's own items (uploaded or indexed here) are kept as they are:
        // they're at least as current as the row, and their localId is what
        // later status updates look for.
        const merged = fromDb.map((d) => (all[id] ?? []).find((f) => f.id === d.id) ?? d);
        next[id] = [...merged, ...local];
      }
      return next;
    });
    // Resume: this user's files left pending/extracting by a closed tab.
    for (const row of data as Array<Record<string, unknown>>) {
      const status = String(row.status);
      if (row.created_by === authUserId && (status === 'pending' || status === 'extracting')) {
        void drive(String(row.entry_id), String(row.id), String(row.id));
      }
    }
  }, [authUserId, drive]);

  /**
   * Open a file: a 4-hour temporary Dropbox link, fetched now, internal users
   * only. The window is opened first so the popup blocker allows it.
   */
  const openFile = useCallback(async (fileId: string) => {
    const win = window.open('', '_blank');
    try {
      const { url } = await invokeKnowledgeCapture<{ url: string }>({ action: 'file_link', file_id: fileId });
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      setNotice(e instanceof Error ? e.message : 'Could not open the file');
    }
  }, []);

  useEffect(() => {
    if (!authUserId) {
      setDrafts([]);
      setFiles({});
    }
  }, [authUserId]);

  return {
    drafts,
    files,
    notice,
    clearNotice: () => setNotice(null),
    addDrafts,
    removeDraft,
    clearDrafts,
    uploadForEntry,
    retryUpload,
    canRetry,
    attachToEntry,
    deleteFile,
    loadFor,
    openFile,
  };
}
