import React, { useState } from 'react';
import { useMapLayers } from '../../hooks/useMapLayers';

interface CreateLayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateLayerModal({ isOpen, onClose, onSuccess }: CreateLayerModalProps) {
  const { createLayer } = useMapLayers({ autoFetch: false });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultColor, setDefaultColor] = useState('#3b82f6');
  const [defaultOpacity, setDefaultOpacity] = useState(0.35);
  const [defaultStrokeWidth, setDefaultStrokeWidth] = useState(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Layer name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createLayer({
        name: name.trim(),
        description: description.trim() || undefined,
        default_color: defaultColor,
        default_opacity: defaultOpacity,
        default_stroke_width: defaultStrokeWidth,
      });

      if (result.success) {
        // Reset form
        setName('');
        setDescription('');
        setDefaultColor('#3b82f6');
        setDefaultOpacity(0.35);
        setDefaultStrokeWidth(2);
        onSuccess();
      } else {
        setError(result.error || 'Failed to create layer');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setDefaultColor('#3b82f6');
    setDefaultOpacity(0.35);
    setDefaultStrokeWidth(2);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Create New Layer</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Layer Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Southeast Territory"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional description..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
                Default Color
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  id="color"
                  value={defaultColor}
                  onChange={(e) => setDefaultColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={defaultColor}
                  onChange={(e) => setDefaultColor(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
            </div>

            <div>
              <label htmlFor="opacity" className="block text-sm font-medium text-gray-700 mb-1">
                Fill Opacity
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  id="opacity"
                  value={defaultOpacity}
                  onChange={(e) => setDefaultOpacity(parseFloat(e.target.value))}
                  min="0"
                  max="1"
                  step="0.05"
                  className="flex-1"
                />
                <span className="text-sm text-gray-600 w-12">
                  {Math.round(defaultOpacity * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="strokeWidth" className="block text-sm font-medium text-gray-700 mb-1">
              Stroke Width
            </label>
            <select
              id="strokeWidth"
              value={defaultStrokeWidth}
              onChange={(e) => setDefaultStrokeWidth(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[1, 2, 3, 4, 5].map(w => (
                <option key={w} value={w}>{w}px</option>
              ))}
            </select>
          </div>

          {/* Preview */}
          <div className="pt-4 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
            <div className="flex items-center justify-center p-4 bg-gray-100 rounded-lg">
              <div
                className="w-24 h-16 rounded"
                style={{
                  backgroundColor: defaultColor,
                  opacity: defaultOpacity,
                  border: `${defaultStrokeWidth}px solid ${defaultColor}`,
                }}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Layer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
