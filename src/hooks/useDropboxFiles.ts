import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import DropboxService, { DropboxFile } from '../services/dropboxService';

// Return type for the hook
interface UseDropboxFilesReturn {
  files: DropboxFile[];
  folderPath: string | null;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  refreshFiles: () => Promise<void>;
  uploadFiles: (fileList: FileList) => Promise<void>;
  createFolder: (folderName: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  getSharedLink: (path: string) => Promise<string>;
}

/**
 * React hook to manage Dropbox files for a specific entity (client/property/deal)
 * @param entityType - Type of entity: 'client' | 'property' | 'deal'
 * @param entityId - UUID of the entity
 * @returns Object containing files, loading states, and file management functions
 */
export function useDropboxFiles(
  entityType: 'client' | 'property' | 'deal',
  entityId: string | null
): UseDropboxFilesReturn {
  const [files, setFiles] = useState<DropboxFile[]>([]);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Dropbox service with access token and refresh credentials from environment
  let dropboxService: DropboxService | null = null;

  try {
    dropboxService = new DropboxService(
      import.meta.env.VITE_DROPBOX_ACCESS_TOKEN || '',
      import.meta.env.VITE_DROPBOX_REFRESH_TOKEN || '',
      import.meta.env.VITE_DROPBOX_APP_KEY || '',
      import.meta.env.VITE_DROPBOX_APP_SECRET || ''
    );
  } catch (err: any) {
    // Token not configured - will be handled in fetchFiles
  }

  /**
   * Fetch files from Dropbox for the current entity
   */
  const fetchFiles = useCallback(async () => {
    if (!entityId) {
      setFiles([]);
      setFolderPath(null);
      return;
    }

    // Check if Dropbox service is initialized
    if (!dropboxService) {
      setError('Dropbox access token is required. Please set VITE_DROPBOX_ACCESS_TOKEN in your .env file.');
      setFiles([]);
      setFolderPath(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query dropbox_folder_mapping table to get the folder path
      const { data: mapping, error: mappingError } = await supabase
        .from('dropbox_folder_mapping')
        .select('dropbox_folder_path')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      if (mappingError || !mapping) {
        setError('No Dropbox folder linked to this record');
        setFiles([]);
        setFolderPath(null);
        setLoading(false);
        return;
      }

      const path = mapping.dropbox_folder_path;
      setFolderPath(path);

      // List folder contents from Dropbox
      const fileList = await dropboxService.listFolderContents(path);
      setFiles(fileList);
    } catch (err: any) {
      console.error('Error fetching Dropbox files:', err);
      setError(err.message || 'Failed to load Dropbox files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  /**
   * Refresh the file list
   */
  const refreshFiles = useCallback(async () => {
    await fetchFiles();
  }, [fetchFiles]);

  /**
   * Upload multiple files to the current folder
   * @param fileList - FileList from input or drag-drop event
   */
  const uploadFiles = useCallback(
    async (fileList: FileList) => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      if (!folderPath) {
        throw new Error('No folder path available');
      }

      setUploading(true);
      setError(null);

      try {
        // Upload all files in parallel
        const uploadPromises = Array.from(fileList).map(file =>
          dropboxService!.uploadFile(file, folderPath)
        );

        await Promise.all(uploadPromises);

        // Refresh file list after uploads complete
        await refreshFiles();
      } catch (err: any) {
        console.error('Error uploading files:', err);
        setError(err.message || 'Failed to upload files');
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [folderPath, refreshFiles]
  );

  /**
   * Create a new folder
   * @param folderName - Name of the folder to create
   */
  const createFolder = useCallback(
    async (folderName: string) => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      if (!folderPath) {
        throw new Error('No folder path available');
      }

      setError(null);

      try {
        const newFolderPath = `${folderPath}/${folderName}`;
        await dropboxService.createFolder(newFolderPath);

        // Refresh file list after folder creation
        await refreshFiles();
      } catch (err: any) {
        console.error('Error creating folder:', err);
        setError(err.message || 'Failed to create folder');
        throw err;
      }
    },
    [folderPath, refreshFiles]
  );

  /**
   * Delete a file or folder
   * @param path - Full path to the file/folder to delete
   */
  const deleteItem = useCallback(
    async (path: string) => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      setError(null);

      try {
        await dropboxService.deleteFileOrFolder(path);

        // Refresh file list after deletion
        await refreshFiles();
      } catch (err: any) {
        console.error('Error deleting item:', err);
        setError(err.message || 'Failed to delete item');
        throw err;
      }
    },
    [refreshFiles]
  );

  /**
   * Get a shared link for a file/folder
   * @param path - Full path to the file/folder
   * @returns Public shared link URL
   */
  const getSharedLink = useCallback(
    async (path: string): Promise<string> => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      try {
        const link = await dropboxService.getSharedLink(path);
        return link;
      } catch (err: any) {
        console.error('Error getting shared link:', err);
        throw err;
      }
    },
    []
  );

  // Fetch files when entity changes
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    folderPath,
    loading,
    uploading,
    error,
    refreshFiles,
    uploadFiles,
    createFolder,
    deleteItem,
    getSharedLink
  };
}
