import { useState, useEffect } from 'react';
import { useDropboxFiles } from '../../hooks/useDropboxFiles';

interface PortalFilesTabProps {
  propertyId: string | null;
  dropboxPath: string | null | undefined;
  canUpload: boolean;
}

/**
 * PortalFilesTab - Displays Dropbox files from the property record
 *
 * - View-only for clients
 * - Upload/delete capabilities for brokers
 */
export default function PortalFilesTab({ propertyId, dropboxPath, canUpload }: PortalFilesTabProps) {
  const {
    files,
    loading,
    error,
    refreshFiles,
    uploadFiles,
    downloadFile,
    uploading,
  } = useDropboxFiles('property', propertyId || '');

  const [currentPath, setCurrentPath] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Filter files by current path
  const currentFiles = files.filter((file) => {
    const fileDir = file.path_lower?.substring(0, file.path_lower.lastIndexOf('/')) || '';
    const targetDir = currentPath || (dropboxPath?.toLowerCase() || '');
    return fileDir === targetDir || (currentPath === '' && fileDir === dropboxPath?.toLowerCase());
  });

  // Get folders and files separately
  const folders = currentFiles.filter((f) => f['.tag'] === 'folder');
  const regularFiles = currentFiles.filter((f) => f['.tag'] === 'file');

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    // Images
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }

    // PDFs
    if (ext === 'pdf') {
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    }

    // Spreadsheets
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }

    // Documents
    if (['doc', 'docx'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }

    // Default file icon
    return (
      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploadError(null);
    try {
      await uploadFiles(Array.from(selectedFiles));
      await refreshFiles();
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError('Failed to upload files');
    }

    // Clear the input
    e.target.value = '';
  };

  const handleDownload = async (file: any) => {
    try {
      await downloadFile(file.path_lower);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const navigateToFolder = (folderPath: string) => {
    setCurrentPath(folderPath);
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
    setCurrentPath(parentPath || '');
  };

  if (!propertyId) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No property linked to this site submit</p>
      </div>
    );
  }

  if (!dropboxPath) {
    return (
      <div className="p-4 text-center text-gray-500">
        <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p>No Dropbox folder linked</p>
        <p className="text-sm mt-1">Files will appear here once a Dropbox folder is set up</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => refreshFiles()}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with upload button and breadcrumb */}
      <div className="flex-shrink-0 p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          {/* Breadcrumb */}
          <div className="flex items-center space-x-1 text-sm text-gray-600">
            <button
              onClick={() => setCurrentPath('')}
              className="hover:text-blue-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>
            {currentPath && (
              <>
                <span>/</span>
                <button onClick={navigateUp} className="hover:text-blue-600">
                  {currentPath.split('/').pop()}
                </button>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => refreshFiles()}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {canUpload && (
              <label className="cursor-pointer">
                <span className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center space-x-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Upload</span>
                </span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="mt-2 flex items-center space-x-2 text-sm text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span>Uploading...</span>
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="mt-2 text-sm text-red-600">{uploadError}</div>
        )}
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {folders.length === 0 && regularFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p>No files yet</p>
            {canUpload && (
              <p className="text-sm mt-1">Upload files to get started</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Folders first */}
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => navigateToFolder(folder.path_lower || '')}
                className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors text-left"
              >
                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{folder.name}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}

            {/* Files */}
            {regularFiles.map((file) => (
              <div
                key={file.id}
                className="px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors"
              >
                {getFileIcon(file.name || '')}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)} • {formatDate(file.client_modified)}
                  </p>
                </div>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
