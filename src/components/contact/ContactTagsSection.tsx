/**
 * ContactTagsSection
 *
 * Displays and manages tags for a contact. Shows tag chips with colors,
 * allows adding new tags via dropdown, and removing existing tags.
 */

import { useState, useRef, useEffect } from 'react';
import { TagIcon, PlusIcon, XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useContactTags } from '../../hooks/useContactTags';

interface ContactTagsSectionProps {
  contactId: string;
  compact?: boolean; // For smaller display in cards
  inline?: boolean;  // For inline display in headers (no border-b, less padding)
  className?: string;
}

export default function ContactTagsSection({
  contactId,
  compact = false,
  inline = false,
  className = '',
}: ContactTagsSectionProps) {
  const { tags, availableTagTypes, loading, addTag, removeTag, createTagType } = useContactTags(contactId);
  const [showDropdown, setShowDropdown] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setShowCreateForm(false);
        setNewTagName('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when create form opens
  useEffect(() => {
    if (showCreateForm && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCreateForm]);

  // Get tag types that aren't already assigned
  const availableToAdd = availableTagTypes.filter(
    (tagType) => !tags.some((t) => t.tag_id === tagType.id)
  );

  const handleAddTag = async (tagId: string) => {
    setAddingTag(true);
    try {
      await addTag(contactId, tagId);
      setShowDropdown(false);
    } catch (err) {
      // Error is handled in hook
    } finally {
      setAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagAssignmentId: string) => {
    setRemovingTagId(tagAssignmentId);
    try {
      await removeTag(tagAssignmentId);
    } catch (err) {
      // Error is handled in hook
    } finally {
      setRemovingTagId(null);
    }
  };

  const handleCreateAndAssignTag = async () => {
    if (!newTagName.trim()) return;

    setCreatingTag(true);
    try {
      // Create the new tag type
      const newTagId = await createTagType(newTagName.trim());
      // Assign it to this contact
      await addTag(contactId, newTagId);
      // Reset form
      setNewTagName('');
      setShowCreateForm(false);
      setShowDropdown(false);
    } catch (err) {
      // Error is handled in hook
    } finally {
      setCreatingTag(false);
    }
  };

  if (compact) {
    // Compact view for cards - just shows tag chips inline
    if (tags.length === 0) return null;

    return (
      <div className={`flex flex-wrap gap-1 ${className}`}>
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full"
            style={{
              backgroundColor: `${tag.tag_color}20`,
              color: tag.tag_color,
              border: `1px solid ${tag.tag_color}40`,
            }}
          >
            {tag.tag_name}
          </span>
        ))}
      </div>
    );
  }

  // Full section view with add/remove capability
  const baseStyles = inline
    ? '' // No padding/border for inline mode - let parent control
    : 'p-4 border-b border-gray-200';

  return (
    <div className={`${baseStyles} ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <TagIcon className="w-4 h-4" />
          <span>Tags</span>
        </div>

        {/* Add Tag Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            disabled={addingTag || creatingTag}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add
            <ChevronDownIcon className="w-3 h-3" />
          </button>

          {/* Dropdown */}
          {showDropdown && (
            <div className="absolute right-0 z-10 mt-1 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
              <div className="py-1 max-h-60 overflow-y-auto">
                {/* Existing tags to add */}
                {availableToAdd.map((tagType) => (
                  <button
                    key={tagType.id}
                    onClick={() => handleAddTag(tagType.id)}
                    disabled={addingTag}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tagType.color }}
                    />
                    <span className="truncate">{tagType.tag_name}</span>
                  </button>
                ))}

                {/* Divider */}
                {availableToAdd.length > 0 && <div className="border-t border-gray-100 my-1" />}

                {/* Create new tag */}
                {showCreateForm ? (
                  <div className="px-3 py-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateAndAssignTag();
                        } else if (e.key === 'Escape') {
                          setShowCreateForm(false);
                          setNewTagName('');
                        }
                      }}
                      placeholder="New tag name..."
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      disabled={creatingTag}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleCreateAndAssignTag}
                        disabled={!newTagName.trim() || creatingTag}
                        className="flex-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingTag ? 'Creating...' : 'Create & Add'}
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateForm(false);
                          setNewTagName('');
                        }}
                        className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>Create new tag...</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tags Display */}
      {loading ? (
        <div className="text-sm text-gray-400">Loading tags...</div>
      ) : tags.length === 0 ? (
        <div className="text-sm text-gray-400 italic">No tags assigned</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-full group"
              style={{
                backgroundColor: `${tag.tag_color}15`,
                color: tag.tag_color,
                border: `1px solid ${tag.tag_color}30`,
              }}
            >
              {tag.tag_name}
              <button
                onClick={() => handleRemoveTag(tag.id)}
                disabled={removingTagId === tag.id}
                className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                title="Remove tag"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
