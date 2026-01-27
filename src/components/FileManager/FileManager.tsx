import React, { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDropboxFiles } from '../../hooks/useDropboxFiles';
import { DropboxFile } from '../../services/dropboxService';
import {
  FileText,
  Folder,
  Image,
  FileSpreadsheet,
  File,
  Trash2,
  ExternalLink,
  ChevronRight,
  Home,
  Upload,
  FolderPlus,
  Loader2,
  AlertCircle,
  RefreshCw,
  Download,
  Eye,
  Move,
  Link,
  GripVertical,
  Pencil
} from 'lucide-react';

interface FileManagerProps {
  entityType: 'client' | 'property' | 'deal' | 'contact';
  entityId: string;
}

const FileManager: React.FC<FileManagerProps> = ({ entityType, entityId }) => {
  const {
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
  } = useDropboxFiles(entityType, entityId);

  const [currentPath, setCurrentPath] = useState<string>('');
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: DropboxFile } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [draggedItem, setDraggedItem] = useState<DropboxFile | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [renamingItem, setRenamingItem] = useState<DropboxFile | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Longpoll for changes to automatically refresh when Dropbox folder changes
  useEffect(() => {
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
            // Changes detected - refresh files silently (no loading spinner)
            await refreshFiles(true);
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

  // Get file icon based on file extension
  const getFileIcon = (file: DropboxFile) => {
    if (file.type === 'folder') {
      return <Folder className="w-5 h-5 text-blue-500" />;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'xls':
      case 'xlsx':
        return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'svg':
        return <Image className="w-5 h-5 text-purple-500" />;
      default:
        return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  // Format file size
  const formatFileSize = (bytes: number | null): string => {
    if (bytes === null) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get breadcrumbs from current path
  const getBreadcrumbs = () => {
    if (!currentPath) return [];
    const parts = currentPath.split('/').filter(Boolean);
    return parts.map((part, index) => ({
      name: part,
      path: '/' + parts.slice(0, index + 1).join('/')
    }));
  };

  // Handle folder click
  const handleFolderClick = (file: DropboxFile) => {
    if (file.type === 'folder') {
      setCurrentPath(file.path.replace(folderPath || '', ''));
    }
  };

  // Handle file view/download
  const handleFileView = async (file: DropboxFile) => {
    if (file.type === 'file') {
      try {
        const link = await getSharedLink(file.path);
        window.open(link, '_blank');
      } catch (err) {
        console.error('Error opening file:', err);
        alert('Failed to open file. Please try again.');
      }
    }
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList) => {
    if (files && files.length > 0) {
      // Track progress for each file
      const fileArray = Array.from(files);

      try {
        // Initialize progress for each file
        const initialProgress: {[key: string]: number} = {};
        fileArray.forEach(file => {
          initialProgress[file.name] = 0;
        });
        setUploadProgress(initialProgress);

        // Upload files to the current subfolder
        await uploadFiles(files, currentPath);

        // Mark all as complete
        const completeProgress: {[key: string]: number} = {};
        fileArray.forEach(file => {
          completeProgress[file.name] = 100;
        });
        setUploadProgress(completeProgress);

        // Clear progress after a delay
        setTimeout(() => {
          setUploadProgress({});
        }, 2000);
      } catch (err) {
        console.error('Error uploading files:', err);
        alert('Failed to upload files. Please try again.');
        setUploadProgress({});
      }
    }
  };

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFileUpload(e.target.files);
      // Reset input
      e.target.value = '';
    }
  };

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
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Failed to create folder. Please try again.');
    }
  };

  // Handle delete
  const handleDelete = async (path: string) => {
    try {
      await deleteItem(path);
      setDeleteConfirmPath(null);
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Failed to delete item. Please try again.');
    }
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshFiles();
    } catch (err) {
      console.error('Error refreshing files:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle right click
  const handleRightClick = (e: React.MouseEvent, file: DropboxFile) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file
    });
  };

  // Handle copy link
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
    await handleFileView(file);
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
    if (draggedItem && folder.type === 'folder' && folder.path !== draggedItem.path) {
      e.dataTransfer.dropEffect = 'move';
      setDropTargetPath(folder.path);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetPath(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: DropboxFile) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetPath(null);

    if (!draggedItem || targetFolder.type !== 'folder') return;
    if (draggedItem.path === targetFolder.path) return;

    // Don't allow dropping a folder into itself or its children
    if (targetFolder.path.startsWith(draggedItem.path + '/')) {
      setToastMessage('Cannot move a folder into itself');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    try {
      setIsMoving(true);
      await moveItem(draggedItem.path, targetFolder.path);
      setToastMessage(`Moved "${draggedItem.name}" to "${targetFolder.name}"`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Error moving item:', err);
      alert('Failed to move item. Please try again.');
    } finally {
      setIsMoving(false);
      setDraggedItem(null);
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
      setIsMoving(true);
      await moveItem(draggedItem.path, fullTargetPath);
      const targetName = targetPath === '' ? 'root folder' : targetPath.split('/').pop();
      setToastMessage(`Moved "${draggedItem.name}" to ${targetName}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Error moving item:', err);
      alert('Failed to move item. Please try again.');
    } finally {
      setIsMoving(false);
      setDraggedItem(null);
    }
  };

  // Watch for folder creation message and show toast
  useEffect(() => {
    if (folderCreatedMessage) {
      setToastMessage(folderCreatedMessage);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  }, [folderCreatedMessage]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Setup react-dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      // Convert accepted files to FileList format
      const fileList = {
        ...acceptedFiles,
        length: acceptedFiles.length,
        item: (index: number) => acceptedFiles[index]
      } as unknown as FileList;

      await handleFileUpload(fileList);
    },
    noClick: true,  // Don't open file picker on click (we have upload button for that)
    noKeyboard: false
  });

  // Filter files based on current path
  const getCurrentFiles = (): DropboxFile[] => {
    if (!folderPath) return [];
    const targetPath = folderPath + currentPath;
    return files.filter(file => {
      const parentPath = file.path.substring(0, file.path.lastIndexOf('/'));
      return parentPath === targetPath;
    });
  };

  const currentFiles = getCurrentFiles();

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
          <span className="text-gray-600">Loading files...</span>
        </div>
      </div>
    );
  }

  // Dropbox token not configured - no file upload allowed (return early)
  if (error && error.includes('VITE_DROPBOX_ACCESS_TOKEN')) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Dropbox Not Configured</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-left">
            <p className="text-xs text-gray-700 font-semibold mb-2">Setup Instructions:</p>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>Add <code className="bg-gray-100 px-1 rounded">VITE_DROPBOX_ACCESS_TOKEN</code> to your .env file</li>
              <li>Get a token by running: <code className="bg-gray-100 px-1 rounded">npm run dropbox:auth</code></li>
              <li>Restart the development server</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Files</h2>
          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              disabled={uploading || isRefreshing}
              title="Refresh file list"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {/* Upload Button */}
            <label className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
              <Upload className="w-4 h-4 mr-1.5" />
              Upload
              <input
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
                disabled={uploading}
              />
            </label>

            {/* Create Folder Button */}
            <button
              onClick={() => setShowCreateFolder(true)}
              className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              disabled={uploading}
            >
              <FolderPlus className="w-4 h-4 mr-1.5" />
              New Folder
            </button>
          </div>
        </div>

        {/* Breadcrumbs - support drag-drop to move files to parent folders */}
        <div className="flex items-center text-sm text-gray-600">
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
            className={`hover:text-blue-600 transition-colors p-1 rounded ${
              dropTargetPath === '' ? 'bg-blue-100 ring-2 ring-blue-400' : ''
            }`}
          >
            <Home className="w-4 h-4" />
          </button>
          {getBreadcrumbs().map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              <ChevronRight className="w-4 h-4 mx-1 text-gray-400" />
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
                className={`hover:text-blue-600 transition-colors px-1 py-0.5 rounded ${
                  dropTargetPath === crumb.path ? 'bg-blue-100 ring-2 ring-blue-400' : ''
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName('');
              }}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
          {Object.entries(uploadProgress).map(([name, progress]) => (
            <div key={name} className="mb-2 last:mb-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-700 font-medium truncate">{name}</span>
                <span className="text-blue-700">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploading indicator (fallback for when no progress tracking) */}
      {uploading && Object.keys(uploadProgress).length === 0 && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center text-sm text-blue-700">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Uploading files...
          </div>
        </div>
      )}

      {/* File List - Wrapped in dropzone */}
      <div {...getRootProps()} className={`divide-y divide-gray-100 relative ${isDragActive ? 'border-4 border-blue-500 border-dashed bg-blue-50' : ''}`}>
        <input {...getInputProps()} />

        {/* Drag overlay */}
        {isDragActive && (
          <div className="absolute inset-0 bg-blue-100/80 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center">
              <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
              <p className="text-xl font-semibold text-blue-900">Drop files here</p>
              <p className="text-sm text-blue-700 mt-1">Files will be uploaded to the current folder</p>
            </div>
          </div>
        )}
        {currentFiles.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <Folder className="w-12 h-12 mx-auto mb-3 text-blue-400" />
            <p className="text-sm font-medium text-gray-700">No files yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Upload files to automatically create a folder
            </p>
          </div>
        ) : (
          currentFiles.map((file) => (
            <div
              key={file.id}
              className={`px-6 py-3 hover:bg-gray-50 transition-colors group ${
                draggedItem?.path === file.path ? 'opacity-50 bg-gray-100' : ''
              } ${
                dropTargetPath === file.path ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' : ''
              }`}
              draggable
              onDragStart={(e) => handleDragStart(e, file)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => file.type === 'folder' && handleDragOver(e, file)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => file.type === 'folder' && handleDrop(e, file)}
              onContextMenu={(e) => handleRightClick(e, file)}
            >
              <div className="flex items-center justify-between">
                {/* Drag handle indicator */}
                <div className="flex items-center flex-1 min-w-0">
                  <div className="mr-2 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 transition-opacity">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                  </div>
                  <div
                    className="flex items-center flex-1 min-w-0 cursor-pointer"
                    onClick={() => {
                      if (file.type === 'folder') {
                        handleFolderClick(file);
                      } else {
                        handleFileView(file);
                      }
                    }}
                  >
                    {getFileIcon(file)}
                    <div className="ml-3 flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {file.type === 'folder' ? 'Folder' : formatFileSize(file.size)}
                        {file.modified && ` • ${formatDate(file.modified)}`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  {file.type === 'file' && (
                    <>
                      <button
                        onClick={() => handleFileView(file)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                        title="Preview in Dropbox"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1.5 text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-all"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDeleteConfirmPath(file.path)}
                    className="p-1.5 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Delete Confirmation */}
              {deleteConfirmPath === file.path && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800 mb-2">
                    Are you sure you want to delete "{file.name}"?
                    {file.type === 'folder' && ' This will delete all contents.'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(file.path)}
                      className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmPath(null)}
                      className="px-3 py-1.5 bg-white text-gray-700 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div> {/* End of dropzone wrapper */}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
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
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
              >
                <Eye className="w-4 h-4" />
                <span>Open in Dropbox</span>
              </button>
              <button
                onClick={() => handleDownload(contextMenu.file)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-3"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
              <div className="border-t border-gray-100 my-1" />
            </>
          )}
          <button
            onClick={() => handleCopyLink(contextMenu.file)}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
          >
            <Link className="w-4 h-4" />
            <span>Copy Dropbox Link</span>
          </button>
          <button
            onClick={() => handleStartRename(contextMenu.file)}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-yellow-50 hover:text-yellow-600 flex items-center gap-3"
          >
            <Pencil className="w-4 h-4" />
            <span>Rename</span>
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => {
              setContextMenu(null);
              setDeleteConfirmPath(contextMenu.file.path);
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 flex items-center gap-3"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Rename Modal */}
      {renamingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Rename {renamingItem.type === 'folder' ? 'Folder' : 'File'}
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter new name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={handleCancelRename}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!renameValue.trim() || renameValue.trim() === renamingItem.name}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

export default FileManager;
