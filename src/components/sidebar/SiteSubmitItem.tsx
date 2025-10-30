import React from 'react';
import { Database } from '../../../database-schema';

type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];

interface SiteSubmitItemProps {
  siteSubmit: SiteSubmit;
  onClick?: (siteSubmitId: string) => void;
}

/**
 * Shared Site Submit Item component used in sidebars across the app.
 * Displays site submit name, stage, property unit, and associated entity (client/property).
 */
const SiteSubmitItem: React.FC<SiteSubmitItemProps> = ({ siteSubmit, onClick }) => {
  // Determine what to show as the associated entity
  // Priority: property > client
  const associatedEntity =
    (siteSubmit as any).property?.property_name ||
    (siteSubmit as any).property?.address ||
    (siteSubmit as any).client?.client_name ||
    'No property';

  return (
    <div
      className="p-2 hover:bg-green-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
      onClick={() => onClick?.(siteSubmit.id)}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-green-900">
              {siteSubmit.site_submit_name || siteSubmit.sf_account || 'Unnamed Submit'}
            </p>
            <svg className="w-3 h-3 text-gray-400 group-hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-green-600 font-medium">
              {(siteSubmit as any).submit_stage?.name || siteSubmit.sf_submit_stage || 'No Stage'}
            </p>
            {(siteSubmit as any).property_unit?.property_unit_name && (
              <p className="text-xs text-gray-600 font-medium">
                {(siteSubmit as any).property_unit.property_unit_name}
              </p>
            )}
            <p className="text-xs text-gray-500 truncate ml-2">
              {associatedEntity}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteSubmitItem;
