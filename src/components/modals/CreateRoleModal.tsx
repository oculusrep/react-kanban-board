import React, { useState } from 'react';

interface CreateRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateRole: (roleData: {
    name: string;
    display_name: string;
    description: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

const CreateRoleModal: React.FC<CreateRoleModalProps> = ({ isOpen, onClose, onCreateRole }) => {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);

    try {
      const result = await onCreateRole({
        name: name.toLowerCase().replace(/\s+/g, '_'), // Convert to snake_case
        display_name: displayName,
        description: description,
      });

      if (result.success) {
        // Reset form
        setName('');
        setDisplayName('');
        setDescription('');
        onClose();
      } else {
        setError(result.error || 'Failed to create role');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDisplayName('');
    setDescription('');
    setError(null);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Role</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display Name */}
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                Display Name *
              </label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Senior Broker"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Human-readable name shown in the UI</p>
            </div>

            {/* Machine Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Machine Name *
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="e.g., senior_broker"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Lowercase identifier (will be converted to snake_case)
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of this role's responsibilities..."
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateRoleModal;
