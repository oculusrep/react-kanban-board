import React, { useState, useEffect } from 'react';
import { MapLayerShape, UpdateShapeInput } from '../../services/mapLayerService';

interface ShapeEditorPanelProps {
  isOpen: boolean;
  shape: MapLayerShape | null;
  onClose: () => void;
  onSave: (shapeId: string, updates: UpdateShapeInput) => Promise<void>;
  onDelete: (shapeId: string) => Promise<void>;
}

const ShapeEditorPanel: React.FC<ShapeEditorPanelProps> = ({
  isOpen,
  shape,
  onClose,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [fillOpacity, setFillOpacity] = useState(0.35);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Populate form when shape changes
  useEffect(() => {
    if (shape) {
      setName(shape.name || '');
      setColor(shape.color);
      setFillOpacity(shape.fill_opacity);
      setStrokeWidth(shape.stroke_width);
      setDescription(shape.description || '');
    }
  }, [shape]);

  const handleSave = async () => {
    if (!shape) return;

    setIsSaving(true);
    try {
      await onSave(shape.id, {
        name: name.trim() || undefined,
        color,
        fill_opacity: fillOpacity,
        stroke_width: strokeWidth,
        description: description.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!shape) return;

    const confirmMessage = `Are you sure you want to delete this ${shape.shape_type}${shape.name ? ` (${shape.name})` : ''}? This action cannot be undone.`;
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      await onDelete(shape.id);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !shape) return null;

  const shapeTypeLabel = {
    polygon: 'Polygon',
    circle: 'Circle',
    polyline: 'Line',
    rectangle: 'Rectangle',
  }[shape.shape_type] || 'Shape';

  return (
    <div className="fixed right-4 top-32 w-80 z-[1000] bg-white rounded-lg shadow-xl border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">Edit {shapeTypeLabel}</h3>
          <p className="text-xs text-gray-500">Modify shape properties</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Form */}
      <div className="p-4 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Unnamed ${shapeTypeLabel}`}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Color
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-gray-300"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
        </div>

        {/* Fill Opacity (not for polylines) */}
        {shape.shape_type !== 'polyline' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fill Opacity
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                value={fillOpacity}
                onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                min="0"
                max="1"
                step="0.05"
                className="flex-1"
              />
              <span className="text-sm text-gray-600 w-12">
                {Math.round(fillOpacity * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Stroke Width */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Stroke Width
          </label>
          <select
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            {[1, 2, 3, 4, 5, 6, 8, 10].map(w => (
              <option key={w} value={w}>{w}px</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this shape..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
          />
        </div>

        {/* Preview */}
        <div className="pt-2 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preview
          </label>
          <div className="flex items-center justify-center p-4 bg-gray-100 rounded-lg">
            <div
              className="w-16 h-12 rounded"
              style={{
                backgroundColor: shape.shape_type === 'polyline' ? 'transparent' : color,
                opacity: shape.shape_type === 'polyline' ? 1 : fillOpacity,
                border: `${strokeWidth}px solid ${color}`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 flex items-center justify-between">
        <button
          onClick={handleDelete}
          disabled={isDeleting || isSaving}
          className="px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md text-sm disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
        <div className="flex items-center space-x-2">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isDeleting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShapeEditorPanel;
