import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface RoleSelectorProps {
  currentRole: string | null;
  onRoleChange: (role: string | null) => Promise<void>;
  disabled?: boolean;
}

// Common roles from Salesforce AccountContactRelation (fallback/default)
const COMMON_ROLES = [
  'Decision Maker',
  'Economic Buyer',
  'Influencer',
  'Technical Buyer',
  'Business User',
  'Executive Sponsor',
  'Champion',
  'Gatekeeper',
];

export const RoleSelector: React.FC<RoleSelectorProps> = ({
  currentRole,
  onRoleChange,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customRole, setCustomRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allRoles, setAllRoles] = useState<string[]>(COMMON_ROLES);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch all distinct roles from database when component mounts
  useEffect(() => {
    const fetchRoles = async () => {
      setLoadingRoles(true);
      try {
        const { data, error } = await supabase
          .from('contact_client_relation')
          .select('role')
          .not('role', 'is', null)
          .order('role');

        if (error) throw error;

        // Get unique roles from database
        const dbRoles = [...new Set(data.map(r => r.role).filter(Boolean))] as string[];

        // Merge with common roles, remove duplicates, and sort
        const combinedRoles = [...new Set([...COMMON_ROLES, ...dbRoles])].sort();

        setAllRoles(combinedRoles);
      } catch (err) {
        console.error('Error fetching roles:', err);
        // Fall back to common roles if query fails
        setAllRoles(COMMON_ROLES);
      } finally {
        setLoadingRoles(false);
      }
    };

    fetchRoles();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setCustomRole('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleRoleSelect = async (role: string | null) => {
    setIsLoading(true);
    try {
      await onRoleChange(role);

      // If it's a new custom role, add it to the list
      if (role && !allRoles.includes(role)) {
        setAllRoles(prev => [...prev, role].sort());
      }

      setIsOpen(false);
      setCustomRole('');
    } catch (err) {
      console.error('Failed to update role:', err);
      alert('Failed to update role. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomRoleSubmit = () => {
    if (customRole.trim()) {
      handleRoleSelect(customRole.trim());
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Role Badge - Clickable */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
          transition-colors
          ${currentRole
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isLoading ? 'opacity-50' : ''}
        `}
        title="Click to change role"
      >
        <span>{currentRole || 'No role set'}</span>
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1 max-h-96 overflow-y-auto">
          <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {loadingRoles ? 'Loading roles...' : 'Available Roles'}
          </div>

          {/* All role options (common + custom from database) */}
          {allRoles.map((role) => (
            <button
              key={role}
              onClick={() => handleRoleSelect(role)}
              disabled={isLoading || loadingRoles}
              className={`
                w-full text-left px-3 py-2 text-sm
                hover:bg-gray-100 transition-colors
                ${currentRole === role ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}
                ${isLoading || loadingRoles ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {role}
              {currentRole === role && (
                <span className="float-right text-blue-600">✓</span>
              )}
            </button>
          ))}

          <div className="border-t border-gray-200 my-1"></div>

          {/* Clear role option */}
          {currentRole && (
            <button
              onClick={() => handleRoleSelect(null)}
              disabled={isLoading}
              className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Clear role
            </button>
          )}

          {/* Custom role input */}
          <div className="px-3 py-2 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-500 mb-1.5">
              Add New Role
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCustomRoleSubmit();
                  }
                }}
                placeholder="Type custom role..."
                disabled={isLoading}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCustomRoleSubmit}
                disabled={!customRole.trim() || isLoading}
                className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleSelector;
