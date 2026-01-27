import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDropboxFiles } from '../../hooks/useDropboxFiles';
import { DropboxFile } from '../../services/dropboxService';

interface FileManagerModuleProps {
  entityType: 'property' | 'client' | 'deal' | 'contact';
  entityId: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const FileManagerModule: React.FC<FileManagerModuleProps> = ({
  entityType,
  entityId,
  isExpanded = true,
  onToggle
}) => {
  console.log('🗂️ FileManagerModule rendered:', { entityType, entityId, isExpanded });

  const { files, folderPath, loading, error, uploadFiles, deleteItem, moveItem, downloadFile, renameItem, getSharedLink, refreshFiles, createFolder, getLatestCursor, longpollForChanges, folderCreatedMessage } = useDropboxFiles(
    entityType,
    entityId
  );
  const [uploading, setUploading] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: DropboxFile } | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [draggedItem, setDraggedItem] = useState<DropboxFile | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [dropTargetFolder, setDropTargetFolder] = useState<DropboxFile | null>(null);
  const [renamingItem, setRenamingItem] = useState<DropboxFile | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Get breadcrumbs from current path
  const getBreadcrumbs = () => {
    if (!currentPath) return [];
    const parts = currentPath.split('/').filter(Boolean);
    return parts.map((part, index) => ({
      name: part,
      path: '/' + parts.slice(0, index + 1).join('/')
    }));
  };

  // Filter files based on current path
  const getCurrentFiles = () => {
    if (!folderPath) return [];
    const targetPath = folderPath + currentPath;
    return files.filter(file => {
      const parentPath = file.path.substring(0, file.path.lastIndexOf('/'));
      return parentPath === targetPath;
    });
  };

  const currentFiles = getCurrentFiles();
  const actualFiles = currentFiles.filter(f => f.type === 'file');
  const folders = currentFiles.filter(f => f.type === 'folder');
  const fileCount = actualFiles.length;
  const folderCount = folders.length;
  const totalCount = fileCount + folderCount;

  console.log('🗂️ FileManagerModule state:', {
    currentPath,
    fileCount,
    folderCount,
    totalCount,
    loading,
    error,
    filesLength: files.length,
    currentFilesLength: currentFiles.length
  });

  const handleFileUploadFromInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFileUpload(e.target.files);
      e.target.value = '';
    }
  };

  const handleFileUpload = async (fileList: FileList) => {
    if (fileList && fileList.length > 0) {
      try {
        setUploading(true);
        await uploadFiles(fileList);
        await refreshFiles();
      } catch (err) {
        console.error('Error uploading files:', err);
        alert('Failed to upload files. Please try again.');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleFolderClick = (folder: any) => {
    if (folder.type === 'folder') {
      setCurrentPath(folder.path.replace(folderPath || '', ''));
    }
  };

  const handleFileClick = async (path: string) => {
    try {
      const url = await getSharedLink(path);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error opening file:', err);
      alert('Failed to open file. Please try again.');
    }
  };

  const handleDelete = async (path: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteItem(path);
      await refreshFiles();
    } catch (err) {
      console.error('Error deleting file:', err);
      alert('Failed to delete file. Please try again.');
    }
  };

  const handleRightClick = (e: React.MouseEvent, file: any) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file
    });
  };

  const handleCopyLink = async (file: DropboxFile) => {
    try {
      const url = await getSharedLink(file.path);
      await navigator.clipboard.writeText(url);
      setContextMenu(null);

      // Show toast notification
      setToastMessage('Dropbox link copied to clipboard!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Error copying link:', err);
      alert('Failed to copy link. Please try again.');
    }
  };

  // Handle file download
  const handleDownload = async (file: DropboxFile) => {
    try {
      setContextMenu(null);
      await downloadFile(file.path, file.name);
      setToastMessage(`Downloading ${file.name}...`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Error downloading file:', err);
      alert('Failed to download file. Please try again.');
    }
  };

  // Handle file preview (open in Dropbox)
  const handlePreview = async (file: DropboxFile) => {
    setContextMenu(null);
    await handleFileClick(file.path);
  };

  // Handle rename
  const handleStartRename = (file: DropboxFile) => {
    setContextMenu(null);
    setRenamingItem(file);
    setRenameValue(file.name);
  };

  const handleRename = async () => {
    if (!renamingItem || !renameValue.trim()) return;

    // Don't rename if name hasn't changed
    if (renameValue.trim() === renamingItem.name) {
      setRenamingItem(null);
      setRenameValue('');
      return;
    }

    try {
      await renameItem(renamingItem.path, renameValue.trim());
      setToastMessage(`Renamed to "${renameValue.trim()}"`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Error renaming item:', err);
      alert('Failed to rename item. Please try again.');
    } finally {
      setRenamingItem(null);
      setRenameValue('');
    }
  };

  const handleCancelRename = () => {
    setRenamingItem(null);
    setRenameValue('');
  };

  // Drag and drop handlers for moving files
  const handleDragStart = (e: React.DragEvent, file: DropboxFile) => {
    setDraggedItem(file);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', file.path);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTargetPath(null);
  };

  const handleDragOver = (e: React.DragEvent, folder: DropboxFile) => {
    e.preventDefault();
    e.stopPropagation();

    if (folder.type !== 'folder') return;

    // Check if dragging native files (from computer) or internal files
    const isNativeFileDrag = e.dataTransfer.types.includes('Files');

    if (isNativeFileDrag) {
      // Native file drag from outside browser
      e.dataTransfer.dropEffect = 'copy';
      setDropTargetFolder(folder);
      setDropTargetPath(folder.path);
    } else if (draggedItem && folder.path !== draggedItem.path) {
      // Internal file move
      e.dataTransfer.dropEffect = 'move';
      setDropTargetPath(folder.path);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetPath(null);
    setDropTargetFolder(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: DropboxFile) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPath(null);

    if (targetFolder.type !== 'folder') return;

    // Check if this is a native file drop (from computer) or internal move
    const hasNativeFiles = e.dataTransfer.files && e.dataTransfer.files.length > 0;

    if (hasNativeFiles) {
      // Native file drop - upload to target folder
      setDropTargetFolder(targetFolder);
      // React-dropzone will handle the actual drop and call onDrop
      return;
    }

    // Internal file move logic
    if (!draggedItem) return;
    if (draggedItem.path === targetFolder.path) return;

    // Don't allow dropping a folder into itself or its children
    if (targetFolder.path.startsWith(draggedItem.path + '/')) {
      setToastMessage('Cannot move a folder into itself');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    try {
      await moveItem(draggedItem.path, targetFolder.path);
      setToastMessage(`Moved "${draggedItem.name}" to "${targetFolder.name}"`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Error moving item:', err);
      alert('Failed to move item. Please try again.');
    } finally {
      setDraggedItem(null);
      setDropTargetFolder(null);
    }
  };

  // Handle drop on breadcrumb (move to parent folder)
  const handleBreadcrumbDrop = async (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPath(null);

    if (!draggedItem || !folderPath) return;

    const fullTargetPath = folderPath + targetPath;

    // Don't allow dropping on same location
    const itemParentPath = draggedItem.path.substring(0, draggedItem.path.lastIndexOf('/'));
    if (itemParentPath === fullTargetPath) return;

    try {
      await moveItem(draggedItem.path, fullTargetPath);
      const targetName = targetPath === '' ? 'root folder' : targetPath.split('/').pop();
      setToastMessage(`Moved "${draggedItem.name}" to ${targetName}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Error moving item:', err);
      alert('Failed to move item. Please try again.');
    } finally {
      setDraggedItem(null);
    }
  };

  // Watch for folder creation message and show toast
  React.useEffect(() => {
    if (folderCreatedMessage) {
      setToastMessage(folderCreatedMessage);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  }, [folderCreatedMessage]);

  // Handle folder creation
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      alert('Please enter a folder name');
      return;
    }

    try {
      await createFolder(newFolderName);
      setShowCreateFolder(false);
      setNewFolderName('');
      await refreshFiles();
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Failed to create folder. Please try again.');
    }
  };

  // Close context menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Longpoll for changes to automatically refresh when Dropbox folder changes
  React.useEffect(() => {
    if (!folderPath) return;

    let isActive = true;
    let currentCursor: string | null = null;

    const startLongpolling = async () => {
      // Get initial cursor
      const cursor = await getLatestCursor();
      if (!cursor || !isActive) return;
      currentCursor = cursor;

      // Start longpolling loop
      const poll = async () => {
        if (!isActive || !currentCursor) return;

        try {
          const result = await longpollForChanges(currentCursor, 30);

          if (!isActive) return;

          if (result?.changes) {
            // Changes detected - refresh files silently
            await refreshFiles();
            // Get new cursor after refresh
            const newCursor = await getLatestCursor();
            if (newCursor && isActive) {
              currentCursor = newCursor;
            }
          } else if (result?.backoff) {
            // Server requested backoff
            await new Promise(resolve => setTimeout(resolve, result.backoff * 1000));
          }

          // Continue polling
          if (isActive) {
            poll();
          }
        } catch (err) {
          console.error('Longpoll error:', err);
          // Wait a bit before retrying on error
          if (isActive) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            poll();
          }
        }
      };

      poll();
    };

    startLongpolling();

    return () => {
      isActive = false;
    };
  }, [folderPath, refreshFiles, getLatestCursor, longpollForChanges]);

  // Setup react-dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      // Convert accepted files to FileList format
      const fileList = {
        ...acceptedFiles,
        length: acceptedFiles.length,
        item: (index: number) => acceptedFiles[index]
      } as unknown as FileList;

      // Determine upload path - use dropTargetFolder if set, otherwise currentPath
      let uploadPath = currentPath;
      if (dropTargetFolder) {
        // Calculate relative path from base folder
        uploadPath = dropTargetFolder.path.replace(folderPath || '', '');
        setDropTargetFolder(null); // Clear after use
      }

      // Upload files to the determined path
      try {
        setUploading(true);
        await uploadFiles(fileList, uploadPath);
        console.log('📤 Uploaded to subfolder:', uploadPath);
        await refreshFiles();
      } catch (err) {
        console.error('Error uploading files:', err);
        alert('Failed to upload files. Please try again.');
      } finally {
        setUploading(false);
      }
    },
    noClick: true,  // Don't open file picker on click (we have upload button for that)
    noKeyboard: false
  });

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';

    // PDF files
    if (ext === 'pdf') {
      return (
        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      );
    }

    // Word documents
    if (['doc', 'docx'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      );
    }

    // Excel files
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      );
    }

    // Images
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      );
    }

    // Generic file
    return (
      <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg mb-3 shadow-sm ${totalCount === 0 ? 'opacity-60' : ''}`}>
      <div className={`flex items-center justify-between p-3 border-b border-gray-100 ${
        totalCount === 0 ? 'bg-gray-50' : 'bg-gradient-to-r from-slate-50 to-gray-50'
      }`}>
        <button
          onClick={onToggle}
          className="flex items-center space-x-2 flex-1 text-left hover:bg-white/50 -mx-3 px-3 py-1 rounded-t-lg transition-colors"
        >
          <svg
            className={`w-5 h-5 text-gray-400 transform transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="w-5 h-5 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h4 className="font-medium text-gray-900 text-sm">Files</h4>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
            totalCount === 0 ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'
          }`}>
            {totalCount}
          </span>
          {totalCount === 0 && (
            <span className="text-xs text-gray-500 italic">(Empty)</span>
          )}
        </button>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => setShowCreateFolder(true)}
            className="flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            disabled={uploading}
            title="New Folder"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </button>
          <label className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors cursor-pointer">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload
            <input
              type="file"
              multiple
              onChange={handleFileUploadFromInput}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </div>
      {isExpanded && (
        <>
          {/* Breadcrumb Navigation - supports drag-drop to move files */}
          {!loading && !error && (
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center text-xs text-gray-600 space-x-1">
                <button
                  onClick={() => setCurrentPath('')}
                  onDragOver={(e) => {
                    if (draggedItem) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropTargetPath('');
                    }
                  }}
                  onDragLeave={() => setDropTargetPath(null)}
                  onDrop={(e) => handleBreadcrumbDrop(e, '')}
                  className={`hover:text-blue-600 transition-colors flex items-center p-1 rounded ${
                    dropTargetPath === '' ? 'bg-blue-100 ring-2 ring-blue-400' : ''
                  }`}
                  title="Go to root"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </button>
                {getBreadcrumbs().map((crumb, index) => (
                  <React.Fragment key={crumb.path}>
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <button
                      onClick={() => setCurrentPath(crumb.path)}
                      onDragOver={(e) => {
                        if (draggedItem) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropTargetPath(crumb.path);
                        }
                      }}
                      onDragLeave={() => setDropTargetPath(null)}
                      onDrop={(e) => handleBreadcrumbDrop(e, crumb.path)}
                      className={`hover:text-blue-600 transition-colors truncate max-w-[100px] px-1 py-0.5 rounded ${
                        dropTargetPath === crumb.path ? 'bg-blue-100 ring-2 ring-blue-400' : ''
                      }`}
                      title={crumb.name}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Create Folder Modal */}
          {showCreateFolder && (
            <div className="px-3 py-2 bg-blue-50 border-b border-blue-200">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') {
                      setShowCreateFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  autoFocus
                />
                <button
                  onClick={handleCreateFolder}
                  className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreateFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div {...getRootProps()} className={`max-h-64 overflow-y-auto relative ${isDragActive ? 'border-4 border-blue-500 border-dashed bg-blue-50' : ''}`}>
          <input {...getInputProps()} />

          {/* Drag overlay */}
          {isDragActive && (
            <div className="absolute inset-0 bg-blue-100/80 flex items-center justify-center z-10 pointer-events-none">
              <div className="text-center">
                <svg className="w-12 h-12 text-blue-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm font-semibold text-blue-900">Drop files here</p>
                <p className="text-xs text-blue-700 mt-1">Files will be uploaded to the current folder</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-xs text-gray-500 mt-2">Loading files...</p>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              <div className="w-12 h-12 mx-auto mb-2 bg-blue-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <p className="text-xs">Drop files to create folder</p>
            </div>
          ) : uploading ? (
            <div className="p-4 text-center text-blue-600 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p>Uploading files...</p>
            </div>
          ) : totalCount === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              No files yet
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Show folders first - draggable and drop targets */}
              {folders.map((folder: DropboxFile) => (
                <div
                  key={folder.path}
                  className={`p-2 hover:bg-blue-50 group transition-colors cursor-pointer ${
                    draggedItem?.path === folder.path ? 'opacity-50 bg-gray-100' : ''
                  } ${
                    dropTargetPath === folder.path || dropTargetFolder?.path === folder.path ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : ''
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, folder)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, folder)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, folder)}
                  onClick={() => handleFolderClick(folder)}
                  onContextMenu={(e) => handleRightClick(e, folder)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <svg className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-50 cursor-grab active:cursor-grabbing flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                      <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                          {folder.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          Folder
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}

              {/* Then show files - draggable with download/preview buttons */}
              {actualFiles.map((file: DropboxFile) => (
                  <div
                    key={file.path}
                    className={`p-2 hover:bg-gray-50 group transition-colors ${
                      draggedItem?.path === file.path ? 'opacity-50 bg-gray-100' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, file)}
                    onDragEnd={handleDragEnd}
                    onContextMenu={(e) => handleRightClick(e, file)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <svg className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-50 cursor-grab active:cursor-grabbing flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                        <button
                          onClick={() => handleFileClick(file.path)}
                          className="flex items-center space-x-2 flex-1 min-w-0 text-left"
                        >
                          {getFileIcon(file.name)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(file.size)}
                              {file.modified && (
                                <> • {new Date(file.modified).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}</>
                              )}
                            </p>
                          </div>
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDownload(file)}
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Download"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(file.path, file.name)}
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete file"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.file.type === 'file' && (
            <>
              <button
                onClick={() => handlePreview(contextMenu.file)}
                className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Open in Dropbox</span>
              </button>
              <button
                onClick={() => handleDownload(contextMenu.file)}
                className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download</span>
              </button>
              <div className="border-t border-gray-100 my-1" />
            </>
          )}
          <button
            onClick={() => handleCopyLink(contextMenu.file)}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>Copy Dropbox Link</span>
          </button>
          <button
            onClick={() => handleStartRename(contextMenu.file)}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-yellow-50 hover:text-yellow-600 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Rename</span>
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => {
              setContextMenu(null);
              handleDelete(contextMenu.file.path, contextMenu.file.name);
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Rename Modal */}
      {renamingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Rename {renamingItem.type === 'folder' ? 'Folder' : 'File'}
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter new name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={handleCancelRename}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!renameValue.trim() || renameValue.trim() === renamingItem.name}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default FileManagerModule;
