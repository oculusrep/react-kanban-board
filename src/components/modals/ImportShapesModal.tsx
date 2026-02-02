import React, { useState, useRef } from 'react';
import { useMapLayers } from '../../hooks/useMapLayers';

interface ImportShapesModalProps {
  isOpen: boolean;
  layerId: string;
  layerName: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type FileType = 'geojson' | 'kml' | 'unknown';

export default function ImportShapesModal({
  isOpen,
  layerId,
  layerName,
  onClose,
  onSuccess,
}: ImportShapesModalProps) {
  const { importGeoJSON, importKML } = useMapLayers({ autoFetch: false });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>('unknown');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectFileType = (file: File): FileType => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.geojson') || name.endsWith('.json')) {
      return 'geojson';
    } else if (name.endsWith('.kml')) {
      return 'kml';
    }
    return 'unknown';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSelectedFile(file);

    const type = detectFileType(file);
    setFileType(type);

    if (type === 'unknown') {
      setError('Unsupported file type. Please use GeoJSON (.geojson, .json) or KML (.kml) files.');
      return;
    }

    // Read file for preview
    try {
      const content = await file.text();
      // Show first 500 characters as preview
      setPreview(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
    } catch (err) {
      console.error('Error reading file:', err);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || fileType === 'unknown') return;

    setError(null);
    setIsImporting(true);

    try {
      const content = await selectedFile.text();
      let result;

      if (fileType === 'geojson') {
        result = await importGeoJSON(layerId, content);
      } else if (fileType === 'kml') {
        result = await importKML(layerId, content);
      }

      if (result?.success) {
        const count = result.shapes?.length || 0;
        onSuccess(count);
        handleClose();
      } else {
        setError(result?.error || 'Failed to import shapes');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import file');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileType('unknown');
    setError(null);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && fileInputRef.current) {
      // Create a DataTransfer object to set files on the input
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;

      // Trigger the change handler
      handleFileSelect({ target: { files: dt.files } } as any);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Import Shapes</h2>
          <p className="text-sm text-gray-500 mt-1">
            Import shapes to "{layerName}"
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* File Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              selectedFile
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,.kml"
              onChange={handleFileSelect}
              className="hidden"
              id="shape-file-input"
            />

            {selectedFile ? (
              <div>
                <div className="text-blue-600 text-lg mb-2">
                  {fileType === 'geojson' && '📋'}
                  {fileType === 'kml' && '🗺️'}
                  {fileType === 'unknown' && '❓'}
                </div>
                <div className="font-medium text-gray-900">{selectedFile.name}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                  {fileType !== 'unknown' && ` • ${fileType.toUpperCase()}`}
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                    setFileType('unknown');
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="mt-2 text-sm text-blue-600 hover:underline"
                >
                  Choose different file
                </button>
              </div>
            ) : (
              <label htmlFor="shape-file-input" className="cursor-pointer">
                <div className="text-gray-400 text-3xl mb-2">📁</div>
                <div className="text-gray-600">
                  Drop a file here or{' '}
                  <span className="text-blue-600 hover:underline">browse</span>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  Supports GeoJSON (.geojson, .json) and KML (.kml)
                </div>
              </label>
            )}
          </div>

          {/* File Preview */}
          {preview && fileType !== 'unknown' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preview
              </label>
              <pre className="text-xs bg-gray-50 p-3 rounded-md overflow-x-auto max-h-32 overflow-y-auto border border-gray-200">
                {preview}
              </pre>
            </div>
          )}

          {/* Supported Formats Info */}
          <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-md">
            <div className="font-medium mb-1">Supported formats:</div>
            <ul className="space-y-1">
              <li><strong>GeoJSON</strong> - Standard geographic data format with Points, Polygons, and LineStrings</li>
              <li><strong>KML</strong> - Keyhole Markup Language (Google Earth format)</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-white"
            disabled={isImporting}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedFile || fileType === 'unknown' || isImporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isImporting ? 'Importing...' : 'Import Shapes'}
          </button>
        </div>
      </div>
    </div>
  );
}
