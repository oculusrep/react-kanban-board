import { useState, useEffect, useCallback, useRef } from 'react';
import { useDropboxFiles } from '../../hooks/useDropboxFiles';
import { supabase } from '../../lib/supabaseClient';

interface PortalFilesTabProps {
  propertyId: string | null;
  dealId?: string | null;
  siteSubmitId?: string | null;
  canUpload: boolean; // True for brokers/admins
  isInternalUser: boolean; // True for brokers/admins who can see/modify visibility
}

interface FileVisibilityOverride {
  dropbox_path: string;
  is_visible: boolean;
}

/**
 * PortalFilesTab - Displays files from Property and Deal Dropbox folders
 *
 * Features:
 * - Two sections: Property Files (visible by default) and Deal Files (hidden by default)
 * - Brokers can toggle visibility for individual files/folders
 * - Drag & drop upload to either section
 * - View-only for clients (only see visible files)
 */
export default function PortalFilesTab({
  propertyId,
  dealId,
  siteSubmitId,
  canUpload,
  isInternalUser,
}: PortalFilesTabProps) {
  // Property files hook
  const propertyFiles = useDropboxFiles('property', propertyId || '');

  // Deal files hook
  const dealFiles = useDropboxFiles('deal', dealId || '');

  // Visibility overrides state
  const [propertyVisibility, setPropertyVisibility] = useState<Map<string, boolean>>(new Map());
  const [dealVisibility, setDealVisibility] = useState<Map<string, boolean>>(new Map());
  const [visibilityLoading, setVisibilityLoading] = useState(false);

  // Current path for navigation within each section
  const [propertyCurrentPath, setPropertyCurrentPath] = useState('');
  const [dealCurrentPath, setDealCurrentPath] = useState('');

  // Drag state for each section
  const [propertyDragOver, setPropertyDragOver] = useState(false);
  const [dealDragOver, setDealDragOver] = useState(false);

  // Upload errors
  const [propertyUploadError, setPropertyUploadError] = useState<string | null>(null);
  const [dealUploadError, setDealUploadError] = useState<string | null>(null);

  // Collapsed state for sections
  const [propertyCollapsed, setPropertyCollapsed] = useState(false);
  const [dealCollapsed, setDealCollapsed] = useState(false);

  // File input refs for upload buttons
  const propertyFileInputRef = useRef<HTMLInputElement>(null);
  const dealFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch visibility overrides
  useEffect(() => {
    const fetchVisibilityOverrides = async () => {
      setVisibilityLoading(true);

      try {
        // Fetch property visibility overrides
        if (propertyId) {
          const { data: propOverrides } = await supabase.rpc(
            'get_portal_file_visibility_overrides',
            { p_entity_type: 'property', p_entity_id: propertyId }
          );

          if (propOverrides) {
            const map = new Map<string, boolean>();
            (propOverrides as FileVisibilityOverride[]).forEach(o => {
              map.set(o.dropbox_path, o.is_visible);
            });
            setPropertyVisibility(map);
          }
        }

        // Fetch deal visibility overrides
        if (dealId) {
          const { data: dealOverrides } = await supabase.rpc(
            'get_portal_file_visibility_overrides',
            { p_entity_type: 'deal', p_entity_id: dealId }
          );

          if (dealOverrides) {
            const map = new Map<string, boolean>();
            (dealOverrides as FileVisibilityOverride[]).forEach(o => {
              map.set(o.dropbox_path, o.is_visible);
            });
            setDealVisibility(map);
          }
        }
      } catch (err) {
        console.error('Error fetching visibility overrides:', err);
      } finally {
        setVisibilityLoading(false);
      }
    };

    fetchVisibilityOverrides();
  }, [propertyId, dealId]);

  // Check if a file is visible in portal
  const isFileVisible = useCallback(
    (path: string, entityType: 'property' | 'deal', visibilityMap: Map<string, boolean>) => {
      // Check for exact path override
      if (visibilityMap.has(path)) {
        return visibilityMap.get(path)!;
      }

      // Check for parent folder override (most specific wins)
      let longestMatch = '';
      let visibilityValue: boolean | null = null;

      visibilityMap.forEach((visible, overridePath) => {
        if (path.startsWith(overridePath + '/') && overridePath.length > longestMatch.length) {
          longestMatch = overridePath;
          visibilityValue = visible;
        }
      });

      if (visibilityValue !== null) {
        return visibilityValue;
      }

      // Default: property = visible, deal = hidden
      return entityType === 'property';
    },
    []
  );

  // Toggle file/folder visibility
  const toggleVisibility = useCallback(
    async (path: string, entityType: 'property' | 'deal', entityId: string, currentlyVisible: boolean) => {
      const newVisibility = !currentlyVisible;

      try {
        const { data: user } = await supabase.auth.getUser();

        await supabase.rpc('set_portal_file_visibility', {
          p_dropbox_path: path,
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_is_visible: newVisibility,
          p_site_submit_id: siteSubmitId || null,
          p_user_id: user.user?.id || null,
        });

        // Update local state
        if (entityType === 'property') {
          setPropertyVisibility(prev => {
            const newMap = new Map(prev);
            newMap.set(path, newVisibility);
            return newMap;
          });
        } else {
          setDealVisibility(prev => {
            const newMap = new Map(prev);
            newMap.set(path, newVisibility);
            return newMap;
          });
        }

        // If sharing a deal file, add chat notification
        if (entityType === 'deal' && newVisibility && siteSubmitId) {
          const fileName = path.split('/').pop() || 'file';
          await addFileShareNotification(siteSubmitId, fileName);
        }
      } catch (err) {
        console.error('Error toggling visibility:', err);
      }
    },
    [siteSubmitId]
  );

  // Add chat notification for file share
  const addFileShareNotification = async (siteSubmitId: string, fileName: string) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      await supabase.from('site_submit_comment').insert({
        site_submit_id: siteSubmitId,
        author_id: user.user.id,
        content: `Shared file: ${fileName}`,
        visibility: 'client',
      });
    } catch (err) {
      console.error('Error adding file share notification:', err);
    }
  };

  // Filter files based on current path and visibility
  const getVisibleFiles = useCallback(
    (
      files: any[],
      folderPath: string | null,
      currentPath: string,
      entityType: 'property' | 'deal',
      visibilityMap: Map<string, boolean>
    ) => {
      if (!folderPath) return { folders: [], files: [] };

      const targetPath = folderPath + currentPath;

      const currentFiles = files.filter((file: any) => {
        const parentPath = file.path?.substring(0, file.path.lastIndexOf('/')) || '';
        return parentPath === targetPath;
      });

      // For internal users, show all files with visibility indicators
      // For portal users, only show visible files
      const filteredFiles = isInternalUser
        ? currentFiles
        : currentFiles.filter((file: any) => isFileVisible(file.path, entityType, visibilityMap));

      return {
        folders: filteredFiles.filter((f: any) => f.type === 'folder'),
        files: filteredFiles.filter((f: any) => f.type === 'file'),
      };
    },
    [isInternalUser, isFileVisible]
  );

  // Handle drag events
  const handleDragOver = (e: React.DragEvent, section: 'property' | 'deal') => {
    e.preventDefault();
    e.stopPropagation();
    if (section === 'property') {
      setPropertyDragOver(true);
    } else {
      setDealDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent, section: 'property' | 'deal') => {
    e.preventDefault();
    e.stopPropagation();
    if (section === 'property') {
      setPropertyDragOver(false);
    } else {
      setDealDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, section: 'property' | 'deal') => {
    e.preventDefault();
    e.stopPropagation();

    if (section === 'property') {
      setPropertyDragOver(false);
    } else {
      setDealDragOver(false);
    }

    if (!canUpload) return;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    try {
      if (section === 'property') {
        setPropertyUploadError(null);
        await propertyFiles.uploadFiles(Array.from(files) as any);
        await propertyFiles.refreshFiles();
      } else {
        setDealUploadError(null);
        await dealFiles.uploadFiles(Array.from(files) as any);
        await dealFiles.refreshFiles();
      }
    } catch (err) {
      console.error('Upload error:', err);
      if (section === 'property') {
        setPropertyUploadError('Failed to upload files');
      } else {
        setDealUploadError('Failed to upload files');
      }
    }
  };

  // Handle file input upload
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    section: 'property' | 'deal'
  ) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    try {
      if (section === 'property') {
        setPropertyUploadError(null);
        await propertyFiles.uploadFiles(selectedFiles as any);
        await propertyFiles.refreshFiles();
      } else {
        setDealUploadError(null);
        await dealFiles.uploadFiles(selectedFiles as any);
        await dealFiles.refreshFiles();
      }
    } catch (err) {
      console.error('Upload error:', err);
      if (section === 'property') {
        setPropertyUploadError('Failed to upload files');
      } else {
        setDealUploadError('Failed to upload files');
      }
    }

    // Clear the input
    e.target.value = '';
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }

    if (ext === 'pdf') {
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    }

    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }

    if (['doc', 'docx'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }

    return (
      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (bytes === null || bytes === undefined) return '-';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  // Render a file section (Property or Deal)
  const renderFileSection = (
    title: string,
    icon: React.ReactNode,
    entityType: 'property' | 'deal',
    entityId: string | null,
    filesHook: ReturnType<typeof useDropboxFiles>,
    visibilityMap: Map<string, boolean>,
    currentPath: string,
    setCurrentPath: (path: string) => void,
    dragOver: boolean,
    uploadError: string | null,
    collapsed: boolean,
    setCollapsed: (c: boolean) => void,
    fileInputRef: React.RefObject<HTMLInputElement>,
    defaultVisible: boolean
  ) => {
    const { folders, files: regularFiles } = getVisibleFiles(
      filesHook.files,
      filesHook.folderPath,
      currentPath,
      entityType,
      visibilityMap
    );

    const navigateToFolder = (file: any) => {
      setCurrentPath(file.path.replace(filesHook.folderPath || '', ''));
    };

    const navigateUp = () => {
      if (!currentPath) return;
      const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
      setCurrentPath(parentPath || '');
    };

    const handleFileView = async (file: any) => {
      if (file.type === 'file') {
        try {
          const link = await filesHook.getSharedLink(file.path);
          window.open(link, '_blank');
        } catch (err) {
          console.error('Error opening file:', err);
        }
      }
    };

    const handleDownload = async (file: any) => {
      try {
        await filesHook.downloadFile(file.path, file.name);
      } catch (err) {
        console.error('Download error:', err);
      }
    };

    // Don't show section if no entity ID
    if (!entityId) {
      return (
        <div className="p-4 bg-gray-50 rounded-lg mb-4">
          <div className="flex items-center space-x-2 text-gray-500">
            {icon}
            <span className="font-medium">{title}</span>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            {entityType === 'deal' ? 'No deal associated with this site' : 'No property linked'}
          </p>
        </div>
      );
    }

    return (
      <div
        className={`border rounded-lg mb-4 overflow-hidden transition-all ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
        }`}
        onDragOver={(e) => canUpload && handleDragOver(e, entityType)}
        onDragLeave={(e) => canUpload && handleDragLeave(e, entityType)}
        onDrop={(e) => canUpload && handleDrop(e, entityType)}
      >
        {/* Section Header */}
        <div
          className={`px-4 py-3 flex items-center justify-between cursor-pointer ${
            entityType === 'property' ? 'bg-green-50' : 'bg-blue-50'
          }`}
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center space-x-2">
            {icon}
            <span className="font-medium text-gray-900">{title}</span>
            <span className="text-sm text-gray-500">
              ({folders.length + regularFiles.length} items)
            </span>
            {isInternalUser && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  defaultVisible
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700'
                }`}
              >
                {defaultVisible ? 'Visible by default' : 'Hidden by default'}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {canUpload && (
              <>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={(e) => handleFileUpload(e, entityType)}
                  className="hidden"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-white rounded transition-colors"
                  title="Upload files"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                filesHook.refreshFiles();
              }}
              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-white rounded transition-colors"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Section Content */}
        {!collapsed && (
          <div className="bg-white">
            {/* Loading */}
            {filesHook.loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : filesHook.error ? (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-500">{filesHook.error}</p>
                {canUpload && (
                  <p className="text-xs text-gray-400 mt-1">
                    Drag & drop files here to create folder
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Breadcrumb */}
                {currentPath && (
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center space-x-1 text-sm text-gray-600">
                    <button
                      onClick={() => setCurrentPath('')}
                      className="hover:text-blue-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    </button>
                    <span>/</span>
                    <button onClick={navigateUp} className="hover:text-blue-600">
                      {currentPath.split('/').pop()}
                    </button>
                  </div>
                )}

                {/* Upload progress */}
                {filesHook.uploading && (
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center space-x-2 text-sm text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    <span>Uploading...</span>
                  </div>
                )}

                {/* Upload error */}
                {uploadError && (
                  <div className="px-4 py-2 border-b border-gray-100 text-sm text-red-600">
                    {uploadError}
                  </div>
                )}

                {/* File List */}
                {folders.length === 0 && regularFiles.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    <svg className="mx-auto h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <p className="text-sm">No files</p>
                    {canUpload && (
                      <p className="text-xs text-gray-400 mt-1">
                        Drag & drop or click upload
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {/* Folders */}
                    {folders.map((folder: any) => {
                      const isVisible = isFileVisible(folder.path, entityType, visibilityMap);

                      return (
                        <div
                          key={folder.id}
                          className={`px-4 py-2 flex items-center space-x-3 hover:bg-gray-50 ${
                            !isVisible && isInternalUser ? 'opacity-50' : ''
                          }`}
                        >
                          <button
                            onClick={() => navigateToFolder(folder)}
                            className="flex-1 flex items-center space-x-3 text-left"
                          >
                            <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {folder.name}
                            </span>
                          </button>

                          {/* Visibility toggle for brokers */}
                          {isInternalUser && (
                            <button
                              onClick={() => toggleVisibility(folder.path, entityType, entityId!, isVisible)}
                              className={`p-1.5 rounded transition-colors ${
                                isVisible
                                  ? 'text-green-600 hover:bg-green-50'
                                  : 'text-gray-400 hover:bg-gray-100'
                              }`}
                              title={isVisible ? 'Visible to client (click to hide)' : 'Hidden from client (click to show)'}
                            >
                              {isVisible ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              )}
                            </button>
                          )}

                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      );
                    })}

                    {/* Files */}
                    {regularFiles.map((file: any) => {
                      const isVisible = isFileVisible(file.path, entityType, visibilityMap);

                      return (
                        <div
                          key={file.id}
                          className={`px-4 py-2 flex items-center space-x-3 hover:bg-gray-50 ${
                            !isVisible && isInternalUser ? 'opacity-50' : ''
                          }`}
                        >
                          <button
                            onClick={() => handleFileView(file)}
                            className="flex-1 flex items-center space-x-3 text-left"
                          >
                            {getFileIcon(file.name || '')}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {file.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(file.size)} • {formatDate(file.modified)}
                              </p>
                            </div>
                          </button>

                          {/* Visibility toggle for brokers */}
                          {isInternalUser && (
                            <button
                              onClick={() => toggleVisibility(file.path, entityType, entityId!, isVisible)}
                              className={`p-1.5 rounded transition-colors ${
                                isVisible
                                  ? 'text-green-600 hover:bg-green-50'
                                  : 'text-gray-400 hover:bg-gray-100'
                              }`}
                              title={isVisible ? 'Visible to client (click to hide)' : 'Hidden from client (click to show)'}
                            >
                              {isVisible ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                              )}
                            </button>
                          )}

                          <button
                            onClick={() => handleDownload(file)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Download"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Drag overlay */}
            {dragOver && canUpload && (
              <div className="absolute inset-0 bg-blue-500 bg-opacity-10 flex items-center justify-center pointer-events-none">
                <div className="bg-white rounded-lg shadow-lg p-4 flex items-center space-x-2">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="font-medium text-blue-600">Drop files to upload</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!propertyId && !dealId) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No property or deal linked to this site submit</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4">
      {/* Property Files Section */}
      {renderFileSection(
        'Property Files',
        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>,
        'property',
        propertyId,
        propertyFiles,
        propertyVisibility,
        propertyCurrentPath,
        setPropertyCurrentPath,
        propertyDragOver,
        propertyUploadError,
        propertyCollapsed,
        setPropertyCollapsed,
        propertyFileInputRef,
        true // Property files visible by default
      )}

      {/* Deal Files Section */}
      {renderFileSection(
        'Deal Files',
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>,
        'deal',
        dealId || null,
        dealFiles,
        dealVisibility,
        dealCurrentPath,
        setDealCurrentPath,
        dealDragOver,
        dealUploadError,
        dealCollapsed,
        setDealCollapsed,
        dealFileInputRef,
        false // Deal files hidden by default
      )}

      {/* Help text for brokers */}
      {isInternalUser && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500">
            <strong>Visibility:</strong> Click the eye icon to show/hide files from portal users.
            Property files are visible by default; deal files are hidden by default.
          </p>
        </div>
      )}
    </div>
  );
}
