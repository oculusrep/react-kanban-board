import { Dropbox } from 'dropbox';

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

class DropboxService {
  private dbx: Dropbox;
  private readonly ALLOWED_BASE_PATH = '/Salesforce Documents';
  private accessToken: string;
  private refreshToken: string;
  private appKey: string;
  private appSecret: string;

  constructor(accessToken: string, refreshToken?: string, appKey?: string, appSecret?: string) {
    if (!accessToken) {
      throw new Error('Dropbox access token is required. Please set VITE_DROPBOX_ACCESS_TOKEN in your .env file.');
    }
    this.accessToken = accessToken;
    this.refreshToken = refreshToken || '';
    this.appKey = appKey || '';
    this.appSecret = appSecret || '';
    this.dbx = new Dropbox({ accessToken });
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken || !this.appKey || !this.appSecret) {
      console.warn('Cannot auto-refresh token: missing refresh token or app credentials');
      return;
    }

    try {
      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.appKey,
          client_secret: this.appSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;

      // Update Dropbox client with new token
      this.dbx = new Dropbox({ accessToken: this.accessToken });

      console.log('✅ Dropbox access token refreshed automatically');
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      throw error;
    }
  }

  /**
   * Wrapper to handle token expiration and auto-refresh
   */
  private async executeWithTokenRefresh<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      // Check if error is due to expired token (401 Unauthorized)
      if (error.status === 401 || error.error?.error === 'expired_access_token') {
        console.log('🔄 Access token expired, refreshing...');
        await this.refreshAccessToken();
        // Retry the operation with new token
        return await operation();
      }
      throw error;
    }
  }

  /**
   * CRITICAL: Validate all paths before operations
   * Prevents access to files outside the allowed directory
   */
  private validatePath(path: string): void {
    if (!path.startsWith(this.ALLOWED_BASE_PATH)) {
      throw new Error('Security violation: Path outside allowed directory');
    }
  }

  /**
   * List contents of a Dropbox folder
   * @param folderPath - Full path to the folder
   * @returns Array of files and folders (excluding .sfdb marker files)
   */
  async listFolderContents(folderPath: string): Promise<DropboxFile[]> {
    this.validatePath(folderPath);

    return this.executeWithTokenRefresh(async () => {
      const response = await this.dbx.filesListFolder({
        path: folderPath,
        recursive: true,  // Fetch all files recursively so subfolders work
        include_deleted: false
      });

      // Filter out .sfdb files and map to DropboxFile interface
      const files = response.result.entries
        .filter(entry => !entry.name.endsWith('.sfdb'))
        .map(entry => {
          const isFolder = entry['.tag'] === 'folder';
          return {
            id: entry.id || entry.path_lower || '',
            name: entry.name,
            path: entry.path_display || entry.path_lower || '',
            type: isFolder ? 'folder' : 'file',
            size: !isFolder && 'size' in entry ? entry.size : null,
            modified: !isFolder && 'server_modified' in entry ? entry.server_modified : null,
            shared_link: null
          } as DropboxFile;
        });

      return files;
    });
  }

  /**
   * Get the latest cursor for a folder (for change detection)
   * @param folderPath - Full path to the folder
   * @returns Cursor string
   */
  async getLatestCursor(folderPath: string): Promise<string> {
    this.validatePath(folderPath);

    return this.executeWithTokenRefresh(async () => {
      const response = await this.dbx.filesListFolderGetLatestCursor({
        path: folderPath,
        recursive: true,
        include_deleted: false
      });

      return response.result.cursor;
    });
  }

  /**
   * Long poll for changes in a folder
   * @param cursor - The cursor from getLatestCursor or previous longpoll
   * @param timeout - Timeout in seconds (default 30, max 480)
   * @returns Object indicating if there are changes
   */
  async longpollForChanges(cursor: string, timeout: number = 30): Promise<{ changes: boolean; backoff?: number }> {
    // Note: Longpoll doesn't need token refresh because it uses a different endpoint
    // and the cursor contains the authentication info
    const response = await this.dbx.filesListFolderLongpoll({
      cursor,
      timeout
    });

    return {
      changes: response.result.changes,
      backoff: response.result.backoff
    };
  }

  /**
   * Get or create a shared link for a file/folder
   * @param path - Full path to the file/folder
   * @returns Public shared link URL
   */
  async getSharedLink(path: string): Promise<string> {
    this.validatePath(path);

    return this.executeWithTokenRefresh(async () => {
      try {
        // Try to create a new shared link
        const response = await this.dbx.sharingCreateSharedLinkWithSettings({
          path: path,
          settings: {
            requested_visibility: 'public',
            audience: 'public',
            access: 'viewer'
          }
        });

        return response.result.url;
      } catch (error: any) {
        // If link already exists (error 409), fetch existing link
        if (error.status === 409 || error.error?.error?.['.tag'] === 'shared_link_already_exists') {
          const existingLinks = await this.dbx.sharingListSharedLinks({ path });
          if (existingLinks.result.links.length > 0) {
            return existingLinks.result.links[0].url;
          }
          throw new Error('Shared link exists but could not be retrieved');
        }

        throw new Error(`Failed to get shared link: ${error.error?.error_summary || error.message}`);
      }
    });
  }

  /**
   * Upload a file to Dropbox
   * @param file - File object to upload
   * @param folderPath - Destination folder path
   * @param fileName - Optional custom file name (defaults to file.name)
   * @returns Uploaded file info
   */
  async uploadFile(file: File, folderPath: string, fileName?: string): Promise<DropboxFile> {
    this.validatePath(folderPath);

    const uploadFileName = fileName || file.name;
    const uploadPath = `${folderPath}/${uploadFileName}`;

    this.validatePath(uploadPath);

    return this.executeWithTokenRefresh(async () => {
      const response = await this.dbx.filesUpload({
        path: uploadPath,
        contents: file,
        mode: { '.tag': 'add' },
        autorename: true // Adds (1), (2) if file exists
      });

      const result = response.result;

      return {
        id: result.id,
        name: result.name,
        path: result.path_display || result.path_lower,
        type: 'file',
        size: result.size,
        modified: result.server_modified,
        shared_link: null
      };
    });
  }

  /**
   * Create a new folder in Dropbox
   * @param folderPath - Full path for the new folder
   * @returns Created folder info
   */
  async createFolder(folderPath: string): Promise<DropboxFile> {
    this.validatePath(folderPath);

    return this.executeWithTokenRefresh(async () => {
      const response = await this.dbx.filesCreateFolderV2({
        path: folderPath,
        autorename: false
      });

      const result = response.result.metadata;

      return {
        id: result.id,
        name: result.name,
        path: result.path_display || result.path_lower,
        type: 'folder',
        size: null,
        modified: null,
        shared_link: null
      };
    });
  }

  /**
   * Delete a file or folder from Dropbox
   * @param path - Full path to the file/folder to delete
   */
  async deleteFileOrFolder(path: string): Promise<void> {
    this.validatePath(path);

    return this.executeWithTokenRefresh(async () => {
      await this.dbx.filesDeleteV2({ path });
    });
  }

  /**
   * Rename/move a folder in Dropbox
   * @param oldPath - Current full path to the folder
   * @param newPath - New full path for the folder
   * @returns Updated folder info
   */
  async renameFolder(oldPath: string, newPath: string): Promise<DropboxFile> {
    this.validatePath(oldPath);
    this.validatePath(newPath);

    return this.executeWithTokenRefresh(async () => {
      const response = await this.dbx.filesMoveV2({
        from_path: oldPath,
        to_path: newPath,
        autorename: false, // Don't auto-rename if conflict exists
        allow_ownership_transfer: false
      });

      const result = response.result.metadata;

      console.log('✅ Dropbox folder renamed successfully:', {
        from: oldPath,
        to: newPath
      });

      return {
        id: result.id,
        name: result.name,
        path: result.path_display || result.path_lower,
        type: 'folder',
        size: null,
        modified: null,
        shared_link: null
      };
    });
  }

  /**
   * Check if a folder exists in Dropbox
   * @param path - Full path to check
   * @returns True if folder exists, false otherwise
   */
  async folderExists(path: string): Promise<boolean> {
    this.validatePath(path);

    try {
      return await this.executeWithTokenRefresh(async () => {
        await this.dbx.filesGetMetadata({ path });
        return true;
      });
    } catch (error: any) {
      if (error.status === 409 || error.error?.error?.['.tag'] === 'path' || error.error?.error?.path?.['.tag'] === 'not_found') {
        return false;
      }
      throw error;
    }
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
}

export default DropboxService;
