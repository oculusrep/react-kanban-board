import React, { useState } from 'react';
import { useDropboxFiles } from '../../hooks/useDropboxFiles';

interface FileManagerModuleProps {
  entityType: 'property' | 'client' | 'deal';
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

  const { files, folderPath, loading, error, uploadFiles, deleteItem, getSharedLink, refreshFiles } = useDropboxFiles(
    entityType,
    entityId
  );
  const [uploading, setUploading] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        setUploading(true);
        await uploadFiles(e.target.files);
        await refreshFiles();
      } catch (err) {
        console.error('Error uploading files:', err);
        alert('Failed to upload files. Please try again.');
      } finally {
        setUploading(false);
        e.target.value = '';
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
            className={`w-4 h-4 text-gray-400 transform transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="w-4 h-4 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <label className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ml-2 cursor-pointer">
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload
          <input
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>
      {isExpanded && (
        <>
          {/* Breadcrumb Navigation */}
          {!loading && !error && (
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center text-xs text-gray-600 space-x-1">
                <button
                  onClick={() => setCurrentPath('')}
                  className="hover:text-blue-600 transition-colors flex items-center"
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
                      className="hover:text-blue-600 transition-colors truncate max-w-[100px]"
                      title={crumb.name}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-xs text-gray-500 mt-2">Loading files...</p>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600 text-sm">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="font-medium">No Dropbox folder</p>
              <p className="text-xs text-gray-500 mt-1">Configure in .env</p>
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
              {/* Show folders first */}
              {folders.map((folder: any) => (
                <div
                  key={folder.path}
                  className="p-2 hover:bg-blue-50 group transition-colors cursor-pointer"
                  onClick={() => handleFolderClick(folder)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
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
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}

              {/* Then show files */}
              {actualFiles.map((file: any) => (
                  <div
                    key={file.path}
                    className="p-2 hover:bg-gray-50 group transition-colors"
                  >
                    <div className="flex items-center justify-between">
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
                          </p>
                        </div>
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
                ))}
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
};

export default FileManagerModule;
