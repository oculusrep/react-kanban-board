import { supabase } from '../lib/supabaseClient';

// TypeScript interfaces
export interface DropboxFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number | null;
  modified: string | null;
  shared_link: string | null;
}

/**
 * Folder name for a site submit's own Dropbox folder: "{site_submit_name} - {first 8 of id}".
 *
 * The id suffix is required, not decoration: site_submit_name is not unique (149 of
 * 3,200 rows share a name with another site submit), and createFolderForEntity reuses a
 * folder when the path already exists — so a bare name would silently put two site
 * submits' files in one folder. Used for both creation and rename sync so the two can
 * never disagree about the name. Character cleaning happens in buildEntityFolderPath.
 */
export function siteSubmitFolderName(name: string | null | undefined, id: string): string {
  const base = (name ?? '').trim() || 'Unnamed Site Submit';
  return `${base} - ${id.slice(0, 8)}`;
}

/**
 * Which record a portal user is browsing. Internal users don't need it; portal
 * users must send it so the dropbox-proxy edge function can check, through portal
 * RLS, that they may see this record and that the path is inside its folder.
 */
export interface DropboxScope {
  entityType: 'property' | 'deal' | 'site_submit';
  entityId: string;
}

/**
 * Dropbox access for the browser. Every call goes through the dropbox-proxy edge
 * function, which holds the Dropbox credentials and authorizes the caller — the
 * browser never sees a token. (Until 2026-10-16 this class was built from
 * VITE_DROPBOX_* env vars, which put the app secret and refresh token in the
 * public JS bundle.)
 */
class DropboxService {
  private readonly ALLOWED_BASE_PATH = '/Salesforce Documents';
  private getScope: () => DropboxScope | undefined;

  /** @param scope - fixed scope, or a getter so a long-lived instance follows the current record */
  constructor(scope?: DropboxScope | (() => DropboxScope | undefined)) {
    this.getScope = typeof scope === 'function' ? scope : () => scope;
  }

  private async call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.functions.invoke('dropbox-proxy', {
      body: { op, scope: this.getScope(), ...args },
    });
    if (error) {
      let message = error.message;
      try {
        const body = await (error as any).context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        // keep the generic message
      }
      throw new Error(message);
    }
    return data as T;
  }

  /**
   * CRITICAL: Validate all paths before operations
   * Prevents access to files outside the allowed directory (the proxy enforces this too)
   */
  private validatePath(path: string): void {
    if (!path.startsWith(this.ALLOWED_BASE_PATH)) {
      throw new Error('Security violation: Path outside allowed directory');
    }
  }

  /**
   * List contents of a Dropbox folder, recursively (excluding .sfdb marker files).
   * Portal users only get entries visible to the portal.
   */
  async listFolderContents(folderPath: string): Promise<DropboxFile[]> {
    this.validatePath(folderPath);
    const { files } = await this.call<{ files: DropboxFile[] }>('list', { path: folderPath, recursive: true });
    return files;
  }

  /** Get the latest cursor for a folder (for change detection) */
  async getLatestCursor(folderPath: string): Promise<string> {
    this.validatePath(folderPath);
    const { cursor } = await this.call<{ cursor: string }>('latest_cursor', { path: folderPath });
    return cursor;
  }

  /**
   * Long poll for changes in a folder. list_folder/longpoll is a no-auth Dropbox
   * endpoint (the cursor is the credential), so it's called directly.
   * @param timeout - seconds (default 30, max 480)
   */
  async longpollForChanges(cursor: string, timeout: number = 30): Promise<{ changes: boolean; backoff?: number }> {
    const response = await fetch('https://notify.dropboxapi.com/2/files/list_folder/longpoll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor, timeout }),
    });
    if (!response.ok) throw new Error(`Longpoll failed: ${response.status}`);
    const result = await response.json();
    return { changes: result.changes, backoff: result.backoff };
  }

  /** Get or create a public shared link for a file/folder */
  async getSharedLink(path: string): Promise<string> {
    this.validatePath(path);
    const { link } = await this.call<{ link: string }>('shared_link', { path });
    return link;
  }

  /**
   * Upload a file. The proxy picks a free name (Dropbox-style "name (1).ext") and
   * returns a one-time upload link; the bytes go straight from the browser to Dropbox.
   * @param siteSubmitId - optional, attributes a portal upload's "file shared" activity
   */
  async uploadFile(file: File, folderPath: string, fileName?: string, siteSubmitId?: string | null): Promise<DropboxFile> {
    this.validatePath(folderPath);

    const { link, path, name } = await this.call<{ link: string; path: string; name: string }>('upload_link', {
      folder: folderPath,
      name: fileName || file.name,
      siteSubmitId: siteSubmitId || undefined,
    });

    const response = await fetch(link, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${await response.text().catch(() => '')}`);
    }

    return {
      id: path,
      name,
      path,
      type: 'file',
      size: file.size,
      modified: new Date().toISOString(),
      shared_link: null
    };
  }

  /** Create a new folder (no autorename) */
  async createFolder(folderPath: string): Promise<DropboxFile> {
    this.validatePath(folderPath);
    const { file } = await this.call<{ file: DropboxFile }>('create_folder', { path: folderPath });
    return file;
  }

  /** Delete a file or folder */
  async deleteFileOrFolder(path: string): Promise<void> {
    this.validatePath(path);
    await this.call('delete', { path });
  }

  /** Rename/move a folder to a new full path (fails on conflict) */
  async renameFolder(oldPath: string, newPath: string): Promise<DropboxFile> {
    this.validatePath(oldPath);
    this.validatePath(newPath);
    const { file } = await this.call<{ file: DropboxFile }>('move', { from: oldPath, to: newPath, autorename: false });
    console.log('✅ Dropbox folder renamed successfully:', { from: oldPath, to: newPath });
    return file;
  }

  /** Rename a file or folder in place (newName is just the name, fails on conflict) */
  async renameItem(currentPath: string, newName: string): Promise<DropboxFile> {
    this.validatePath(currentPath);
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    const newPath = `${parentPath}/${newName}`;
    this.validatePath(newPath);
    const { file } = await this.call<{ file: DropboxFile }>('move', { from: currentPath, to: newPath, autorename: false });
    console.log('✅ Dropbox item renamed successfully:', { from: currentPath, to: newPath });
    return file;
  }

  /** Move a file or folder into another folder (auto-renames on conflict) */
  async moveItem(sourcePath: string, destinationFolderPath: string): Promise<DropboxFile> {
    this.validatePath(sourcePath);
    this.validatePath(destinationFolderPath);
    const itemName = sourcePath.split('/').pop() || '';
    const newPath = `${destinationFolderPath}/${itemName}`;
    this.validatePath(newPath);
    const { file } = await this.call<{ file: DropboxFile }>('move', { from: sourcePath, to: newPath, autorename: true });
    console.log('✅ Dropbox item moved successfully:', { from: sourcePath, to: newPath });
    return file;
  }

  /** Download a file's content */
  async downloadFile(path: string): Promise<Blob> {
    const link = await this.getTemporaryDownloadLink(path);
    const response = await fetch(link);
    if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);
    return response.blob();
  }

  /** Get a direct download link for a file (temporary link valid for 4 hours) */
  async getTemporaryDownloadLink(path: string): Promise<string> {
    this.validatePath(path);
    const { link } = await this.call<{ link: string }>('temp_link', { path });
    return link;
  }

  /** Check if a file or folder exists */
  async folderExists(path: string): Promise<boolean> {
    this.validatePath(path);
    const { exists } = await this.call<{ exists: boolean }>('exists', { path });
    return exists;
  }

  /**
   * List folders in a directory (non-recursive), all pages. Raw Dropbox entries.
   */
  async listFolders(folderPath: string): Promise<{ entries: any[] }> {
    this.validatePath(folderPath);
    const { entries } = await this.call<{ entries: any[] }>('list_raw', { path: folderPath, recursive: false });
    console.log(`📂 listFolders fetched ${entries.length} total entries from ${folderPath}`);
    return { entries };
  }

  /**
   * Build folder path for an entity (property, client, deal)
   * @param entityName - Name of the entity
   * @param basePath - Base path (defaults to /Salesforce Documents)
   * @returns Clean folder path
   */
  buildFolderPath(entityName: string, basePath: string = this.ALLOWED_BASE_PATH): string {
    // Clean the entity name for use as folder name
    const cleanName = entityName
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return `${basePath}/${cleanName}`;
  }

  /**
   * Build folder path for an entity based on entity type
   * @param entityType - Type of entity ('property', 'client', 'deal', 'contact', 'comp_property', 'site_submit')
   * @param entityName - Name of the entity
   * @returns Clean folder path in proper subfolder
   */
  buildEntityFolderPath(
    entityType: 'property' | 'client' | 'deal' | 'contact' | 'comp_property' | 'site_submit',
    entityName: string
  ): string {
    // Map entity types to their subfolder names
    const subfolderMap = {
      property: 'Properties',
      client: 'Accounts',  // Clients go in Accounts folder
      deal: 'Opportunities',  // Deals go in Opportunities folder
      contact: 'Contacts',
      comp_property: 'Comps',  // Comparable database records
      site_submit: 'Site Submits'  // Site submit's own folder; name via siteSubmitFolderName()
    };

    const subfolder = subfolderMap[entityType];
    const basePath = `${this.ALLOWED_BASE_PATH}/${subfolder}`;

    // Clean the entity name for use as folder name
    const cleanName = entityName
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return `${basePath}/${cleanName}`;
  }

  /**
   * Create a folder for an entity if it doesn't exist
   * @param entityType - Type of entity
   * @param entityName - Name of the entity
   * @returns Created or existing folder info
   */
  async createFolderForEntity(
    entityType: 'property' | 'client' | 'deal' | 'contact' | 'comp_property' | 'site_submit',
    entityName: string
  ): Promise<DropboxFile> {
    const folderPath = this.buildEntityFolderPath(entityType, entityName);

    // Check if folder already exists
    const exists = await this.folderExists(folderPath);

    if (exists) {
      console.log(`✅ Folder already exists: ${folderPath}`);
      // Return folder info even if it already exists
      return {
        id: '',
        name: entityName,
        path: folderPath,
        type: 'folder',
        size: null,
        modified: null,
        shared_link: null
      };
    }

    // Make sure the type's parent folder exists first. Every existing type's parent
    // (Properties, Accounts, Opportunities, ...) was provisioned long ago; 'Site Submits'
    // is new, and we don't rely on create_folder_v2 creating intermediate folders.
    const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));
    if (parentPath && parentPath !== this.ALLOWED_BASE_PATH && !(await this.folderExists(parentPath))) {
      console.log(`📁 Creating missing parent folder: ${parentPath}`);
      await this.createFolder(parentPath);
    }

    // Create the folder
    console.log(`📁 Creating new folder: ${folderPath}`);
    return await this.createFolder(folderPath);
  }
}

export default DropboxService;
