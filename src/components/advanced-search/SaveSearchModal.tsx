import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface SaveSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, isPublic: boolean) => void;
  initialName?: string;
  initialDescription?: string;
  initialIsPublic?: boolean;
  mode: 'create' | 'edit';
}

export default function SaveSearchModal({
  isOpen,
  onClose,
  onSave,
  initialName = '',
  initialDescription = '',
  initialIsPublic = false,
  mode,
}: SaveSearchModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isPublic, setIsPublic] = useState(initialIsPublic);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setIsPublic(initialIsPublic);
    }
  }, [isOpen, initialName, initialDescription, initialIsPublic]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), description.trim(), isPublic);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-[#002147]">
            {mode === 'create' ? 'Save Search' : 'Edit Search'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="search-name" className="block text-sm font-medium text-[#002147] mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="search-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter search name..."
              className="w-full px-3 py-2 border border-[#8FA9C8] rounded-md text-sm focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="search-description" className="block text-sm font-medium text-[#002147] mb-1">
              Description
            </label>
            <textarea
              id="search-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 border border-[#8FA9C8] rounded-md text-sm focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147] resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#002147] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#002147]"></div>
            </label>
            <span className="text-sm text-[#002147]">
              Make this search public
            </span>
          </div>

          {isPublic && (
            <p className="text-xs text-[#4A6B94]">
              Public searches can be viewed and copied by all users, but only you can edit or delete them.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#4A6B94] border border-[#8FA9C8] rounded-md hover:bg-[#F8FAFC] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm bg-[#002147] text-white rounded-md hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {mode === 'create' ? 'Save' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
