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

  constructor(accessToken: string) {
    this.dbx = new Dropbox({ accessToken });
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

    try {
      const response = await this.dbx.filesListFolder({
        path: folderPath,
        recursive: false,
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
    } catch (error: any) {
      console.error('Error listing folder contents:', error);
      throw new Error(`Failed to list folder contents: ${error.error?.error_summary || error.message}`);
    }
  }

  /**
   * Get or create a shared link for a file/folder
   * @param path - Full path to the file/folder
   * @returns Public shared link URL
   */
  async getSharedLink(path: string): Promise<string> {
    this.validatePath(path);

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
        try {
          const existingLinks = await this.dbx.sharingListSharedLinks({ path });
          if (existingLinks.result.links.length > 0) {
            return existingLinks.result.links[0].url;
          }
        } catch (fetchError: any) {
          throw new Error(`Failed to fetch existing shared link: ${fetchError.message}`);
        }
      }

      throw new Error(`Failed to get shared link: ${error.error?.error_summary || error.message}`);
    }
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

    try {
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
    } catch (error: any) {
      console.error('Error uploading file:', error);
      throw new Error(`Failed to upload file: ${error.error?.error_summary || error.message}`);
    }
  }

  /**
   * Create a new folder in Dropbox
   * @param folderPath - Full path for the new folder
   * @returns Created folder info
   */
  async createFolder(folderPath: string): Promise<DropboxFile> {
    this.validatePath(folderPath);

    try {
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
    } catch (error: any) {
      console.error('Error creating folder:', error);
      throw new Error(`Failed to create folder: ${error.error?.error_summary || error.message}`);
    }
  }

  /**
   * Delete a file or folder from Dropbox
   * @param path - Full path to the file/folder to delete
   */
  async deleteFileOrFolder(path: string): Promise<void> {
    this.validatePath(path);

    try {
      await this.dbx.filesDeleteV2({ path });
    } catch (error: any) {
      console.error('Error deleting file/folder:', error);
      throw new Error(`Failed to delete: ${error.error?.error_summary || error.message}`);
    }
  }
}

export default DropboxService;
