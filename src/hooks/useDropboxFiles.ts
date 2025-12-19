import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import DropboxService, { DropboxFile } from '../services/dropboxService';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';

// Return type for the hook
interface UseDropboxFilesReturn {
  files: DropboxFile[];
  folderPath: string | null;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  refreshFiles: (silent?: boolean) => Promise<void>;
  uploadFiles: (fileList: FileList) => Promise<void>;
  createFolder: (folderName: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  moveItem: (sourcePath: string, destinationFolderPath: string) => Promise<void>;
  downloadFile: (path: string, fileName: string) => Promise<void>;
  renameItem: (currentPath: string, newName: string) => Promise<void>;
  getSharedLink: (path: string) => Promise<string>;
  getLatestCursor: () => Promise<string | null>;
  longpollForChanges: (cursor: string, timeout?: number) => Promise<{ changes: boolean; backoff?: number } | null>;
  folderCreatedMessage: string | null;
}

/**
 * React hook to manage Dropbox files for a specific entity (client/property/deal/property_unit)
 * @param entityType - Type of entity: 'client' | 'property' | 'deal' | 'contact' | 'property_unit'
 * @param entityId - UUID of the entity
 * @returns Object containing files, loading states, and file management functions
 */
export function useDropboxFiles(
  entityType: 'client' | 'property' | 'deal' | 'contact' | 'property_unit',
  entityId: string | null
): UseDropboxFilesReturn {
  const [files, setFiles] = useState<DropboxFile[]>([]);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [folderCreatedMessage, setFolderCreatedMessage] = useState<string | null>(null);

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
   * @param silent - If true, don't show loading spinner (for background refreshes)
   */
  const fetchFiles = useCallback(async (silent: boolean = false) => {
    console.log('🔍 useDropboxFiles.fetchFiles called:', { entityId, entityType, hasDropboxService: !!dropboxService, silent });

    if (!entityId) {
      console.log('🔍 No entityId, returning empty');
      setFiles([]);
      setFolderPath(null);
      return;
    }

    // Check if Dropbox service is initialized
    if (!dropboxService) {
      console.log('🔍 No dropboxService, setting error');
      setError('Dropbox access token is required. Please set VITE_DROPBOX_ACCESS_TOKEN in your .env file.');
      setFiles([]);
      setFolderPath(null);
      setLoading(false);
      return;
    }

    // Only show loading spinner and clear error for non-silent refreshes
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      // Query dropbox_mapping table to get the folder path
      console.log('🔍 Querying dropbox_mapping for:', { entityType, entityId });
      const { data: mapping, error: mappingError } = await supabase
        .from('dropbox_mapping')
        .select('dropbox_folder_path')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      console.log('🔍 Mapping result:', { mapping, mappingError });

      if (mappingError || !mapping) {
        // Suppress 406 errors (RLS policy issues) and PGRST116 (not found) errors
        if (mappingError) {
          // Check if it's a 406 error by examining the error message or status
          const is406Error = mappingError.message?.includes('406') ||
                            mappingError.code === '406' ||
                            mappingError.hint?.includes('Row-level security');
          const is404Error = mappingError.code === 'PGRST116';

          if (!is406Error && !is404Error) {
            console.log('🔍 Dropbox mapping error:', mappingError);
          } else {
            console.log('🔍 No mapping found or access denied (suppressing error)');
          }
        }
        // Only update error state if not a silent refresh or if transitioning from no-error to error
        if (!silent) {
          setError('No Dropbox folder linked to this record');
        }
        setFiles([]);
        setFolderPath(null);
        setLoading(false);
        return;
      }

      const path = mapping.dropbox_folder_path;
      setFolderPath(path);
      console.log('🔍 Fetching files from path:', path);

      // Check if folder exists in Dropbox
      const folderExists = await dropboxService.folderExists(path);

      if (!folderExists) {
        console.log('⚠️ Folder exists in database but not in Dropbox:', path);
        // Only update error state if not a silent refresh
        if (!silent) {
          setError('Dropbox folder was deleted. Upload a file to recreate it.');
        }
        setFiles([]);
        // Clear the folder path so upload will recreate
        setFolderPath(null);
        setLoading(false);
        return;
      }

      // List folder contents from Dropbox
      const fileList = await dropboxService.listFolderContents(path);
      console.log('🔍 Files fetched:', fileList.length, fileList);
      setFiles(fileList);
      // Clear error on successful fetch (folder found and files loaded)
      setError(null);
    } catch (err: any) {
      console.error('🔍 Error fetching Dropbox files:', err);
      // Only update error state if not a silent refresh
      if (!silent) {
        setError(err.message || 'Failed to load Dropbox files');
      }
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  /**
   * Refresh the file list
   * @param silent - If true, don't show loading spinner (for background refreshes)
   */
  const refreshFiles = useCallback(async (silent: boolean = false) => {
    await fetchFiles(silent);
  }, [fetchFiles]);

  // Fetch files on mount and when entity changes
  useEffect(() => {
    fetchFiles();
  }, [entityId, entityType]); // Re-fetch when entity changes

  // Poll for folder creation when there's an error (no folder exists)
  // This helps detect when a folder is created in another component instance
  useEffect(() => {
    if (!error || !entityId || folderPath) return;

    // Poll every 3 seconds to check if a folder was created (silently, no loading spinner)
    const intervalId = setInterval(() => {
      console.log('🔄 Polling for folder creation...');
      fetchFiles(true); // Silent refresh
    }, 3000);

    return () => clearInterval(intervalId);
  }, [error, entityId, folderPath, fetchFiles]);

  /**
   * Get entity name from database
   */
  const getEntityName = useCallback(async (): Promise<string | null> => {
    if (!entityId) return null;

    try {
      let tableName: string;
      let nameField: string;

      // Determine table and name field based on entity type
      switch (entityType) {
        case 'property':
          tableName = 'property';
          nameField = 'property_name';
          break;
        case 'client':
          tableName = 'client';
          nameField = 'client_name';
          break;
        case 'deal':
          tableName = 'deal';
          nameField = 'deal_name';
          break;
        case 'contact':
          tableName = 'contact';
          nameField = 'first_name,last_name';
          break;
        case 'property_unit':
          tableName = 'property_unit';
          nameField = 'property_unit_name';
          break;
        default:
          return null;
      }

      // Fetch entity data
      const { data, error } = await supabase
        .from(tableName)
        .select(nameField)
        .eq('id', entityId)
        .single();

      if (error || !data) {
        console.error('Error fetching entity name:', error);
        return null;
      }

      // Build name based on entity type
      if (entityType === 'contact') {
        const firstName = data.first_name || '';
        const lastName = data.last_name || '';
        return `${firstName} ${lastName}`.trim() || 'Unnamed Contact';
      } else {
        return data[nameField] || `Unnamed ${entityType}`;
      }
    } catch (err) {
      console.error('Error in getEntityName:', err);
      return null;
    }
  }, [entityId, entityType]);

  /**
   * Create Dropbox folder and database mapping for entity
   */
  const createFolderAndMapping = useCallback(async (): Promise<string | null> => {
    if (!dropboxService || !entityId) return null;

    try {
      // Get entity name
      const entityName = await getEntityName();
      if (!entityName) {
        throw new Error('Could not fetch entity name');
      }

      console.log(`📁 Creating Dropbox folder for ${entityType}: ${entityName}`);

      let newFolderPath: string;

      // Special handling for property_unit - nest under parent property
      if (entityType === 'property_unit') {
        // Get the parent property info
        console.log('🔍 Fetching parent property for unit:', entityId);
        const { data: unitData, error: unitError } = await supabase
          .from('property_unit')
          .select('property_id, property:property_id(property_name)')
          .eq('id', entityId)
          .single();

        console.log('📊 Unit data result:', { unitData, unitError });

        if (unitError || !unitData) {
          console.error('❌ Error fetching property unit parent:', unitError);
          throw new Error(`Could not fetch property unit parent property: ${unitError?.message || 'Unknown error'}`);
        }

        const propertyName = (unitData.property as any)?.property_name;
        console.log('🏢 Property name:', propertyName);

        if (!propertyName) {
          throw new Error('Property name not found for unit');
        }

        // Build nested path: /Salesforce Documents/Properties/[Property Name]/Units/[Unit Name]
        const cleanPropertyName = propertyName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
        const cleanUnitName = entityName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
        newFolderPath = `/Salesforce Documents/Properties/${cleanPropertyName}/Units/${cleanUnitName}`;

        console.log(`📁 Creating nested unit folder under property: ${newFolderPath}`);

        // Create the folder manually (since dropboxService doesn't support property_unit)
        await dropboxService.createFolder(newFolderPath);
      } else {
        // Create folder in Dropbox for standard entity types
        const folder = await dropboxService.createFolderForEntity(entityType as any, entityName);
        newFolderPath = folder.path;
      }

      console.log(`✅ Created Dropbox folder: ${newFolderPath}`);

      // Check if mapping already exists
      const { data: existingMapping } = await supabase
        .from('dropbox_mapping')
        .select('id')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .single();

      if (existingMapping) {
        // Update existing mapping
        const { error: updateError } = await supabase
          .from('dropbox_mapping')
          .update(prepareUpdate({
            dropbox_folder_path: newFolderPath,
            last_verified_at: new Date().toISOString()
          }))
          .eq('entity_type', entityType)
          .eq('entity_id', entityId);

        if (updateError) {
          console.error('Error updating folder mapping:', updateError);
          throw new Error('Failed to update folder mapping');
        }

        console.log(`✅ Updated folder mapping in database`);
      } else {
        // Insert new mapping
        // Use a unique placeholder for sf_id since table has UNIQUE constraint
        // Format: AUTO-{first 13 chars of entity_id} to match sf_id VARCHAR(18) length
        const placeholderSfId = `AUTO-${entityId.substring(0, 13)}`;

        const { error: insertError } = await supabase
          .from('dropbox_mapping')
          .insert(prepareInsert({
            entity_type: entityType,
            entity_id: entityId,
            dropbox_folder_path: newFolderPath,
            sf_id: placeholderSfId, // Unique placeholder for auto-created folders
            sfdb_file_found: false,
            last_verified_at: new Date().toISOString()
          }));

        if (insertError) {
          console.error('Error inserting folder mapping:', insertError);
          throw new Error('Failed to save folder mapping');
        }

        console.log(`✅ Saved folder mapping to database`);
      }

      // Set the folder path state
      setFolderPath(newFolderPath);

      return newFolderPath;
    } catch (err: any) {
      console.error('Error creating folder and mapping:', err);
      throw err;
    }
  }, [dropboxService, entityId, entityType, getEntityName]);

  /**
   * Upload multiple files to the current folder
   * If no folder exists, auto-create one first
   * @param fileList - FileList from input or drag-drop event
   */
  const uploadFiles = useCallback(
    async (fileList: FileList) => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      if (!entityId) {
        throw new Error('No entity ID available');
      }

      setUploading(true);
      setError(null);
      setFolderCreatedMessage(null);

      try {
        let targetFolderPath = folderPath;

        // If no folder path, create one
        if (!targetFolderPath) {
          console.log('📁 No folder exists, auto-creating...');
          targetFolderPath = await createFolderAndMapping();

          if (!targetFolderPath) {
            throw new Error('Failed to create folder');
          }

          // Get entity name for message
          const entityName = await getEntityName();
          setFolderCreatedMessage(`Created Dropbox folder: ${entityName}`);
        }

        // Upload all files in parallel
        const uploadPromises = Array.from(fileList).map(file =>
          dropboxService!.uploadFile(file, targetFolderPath!)
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
    [folderPath, entityId, dropboxService, refreshFiles, createFolderAndMapping, getEntityName]
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

  /**
   * Move a file or folder to a new location
   * @param sourcePath - Full path to the file/folder to move
   * @param destinationFolderPath - Destination folder path
   */
  const moveItem = useCallback(
    async (sourcePath: string, destinationFolderPath: string) => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      setError(null);

      try {
        await dropboxService.moveItem(sourcePath, destinationFolderPath);

        // Refresh file list after move
        await refreshFiles();
      } catch (err: any) {
        console.error('Error moving item:', err);
        setError(err.message || 'Failed to move item');
        throw err;
      }
    },
    [refreshFiles]
  );

  /**
   * Download a file from Dropbox
   * @param path - Full path to the file
   * @param fileName - Name to save the file as
   */
  const downloadFile = useCallback(
    async (path: string, fileName: string) => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      try {
        // Get a temporary download link
        const downloadUrl = await dropboxService.getTemporaryDownloadLink(path);

        // Create a temporary anchor element to trigger the download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err: any) {
        console.error('Error downloading file:', err);
        setError(err.message || 'Failed to download file');
        throw err;
      }
    },
    []
  );

  /**
   * Rename a file or folder
   * @param currentPath - Full path to the file/folder
   * @param newName - New name for the file/folder
   */
  const renameItem = useCallback(
    async (currentPath: string, newName: string) => {
      if (!dropboxService) {
        throw new Error('Dropbox service not initialized');
      }

      setError(null);

      try {
        await dropboxService.renameItem(currentPath, newName);

        // Refresh file list after rename
        await refreshFiles();
      } catch (err: any) {
        console.error('Error renaming item:', err);
        setError(err.message || 'Failed to rename item');
        throw err;
      }
    },
    [refreshFiles]
  );

  // Fetch files when entity changes
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  /**
   * Get the latest cursor for change detection
   */
  const getLatestCursor = useCallback(async (): Promise<string | null> => {
    if (!dropboxService || !folderPath) return null;

    try {
      const cursor = await dropboxService.getLatestCursor(folderPath);
      return cursor;
    } catch (err: any) {
      console.error('Error getting latest cursor:', err);
      return null;
    }
  }, [folderPath]);

  /**
   * Longpoll for changes
   */
  const longpollForChanges = useCallback(async (cursor: string, timeout: number = 30): Promise<{ changes: boolean; backoff?: number } | null> => {
    if (!dropboxService) return null;

    try {
      const result = await dropboxService.longpollForChanges(cursor, timeout);
      return result;
    } catch (err: any) {
      console.error('Error during longpoll:', err);
      return null;
    }
  }, []);

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
    moveItem,
    downloadFile,
    renameItem,
    getSharedLink,
    getLatestCursor,
    longpollForChanges,
    folderCreatedMessage
  };
}
