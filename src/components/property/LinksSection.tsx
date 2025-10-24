import React, { useState } from 'react';
import { Database } from '../../../database-schema';
import PropertyInputField from './PropertyInputField';

type Property = Database['public']['Tables']['property']['Row'];

interface LinksSectionProps {
  property: Property;
  isEditing: boolean;
  onFieldUpdate: (field: keyof Property, value: any) => void;
}

const LinksSection: React.FC<LinksSectionProps> = ({
  property,
  isEditing,
  onFieldUpdate
}) => {
  const links = [
    {
      key: 'costar_link' as keyof Property,
      label: 'CoStar',
      description: 'Commercial real estate database'
    },
    {
      key: 'reonomy_link' as keyof Property,
      label: 'Reonomy',
      description: 'Property intelligence platform'
    },
    {
      key: 'tax_url' as keyof Property,
      label: 'Tax Records',
      description: 'Property tax information'
    }
  ];

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
      <div className="flex items-center gap-1.5 mb-3">
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900">Links</h3>
      </div>

      <div className="space-y-2">
        {links.map((link) => {
          const linkValue = property[link.key] as string;
          const hasLink = linkValue && linkValue.trim() !== '';
          const isValid = hasLink && isValidUrl(linkValue);

          return (
            <div key={link.key} className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-700 w-24 flex-shrink-0">{link.label}:</span>
              <div className="flex-1 flex items-center gap-2">
                <PropertyInputField
                  label=""
                  value={linkValue}
                  onChange={(value) => onFieldUpdate(link.key, value)}
                  placeholder={`https://${link.label.toLowerCase()}.com/...`}
                  type="url"
                  compact={true}
                  defaultText="Click to add link"
                />
                {hasLink && isValid && (
                  <a
                    href={linkValue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 flex-shrink-0"
                    title="Open link in new tab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick generation buttons */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="text-xs font-medium text-gray-700 mb-2">Quick Actions</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (property.address && property.city && property.state) {
                const searchQuery = encodeURIComponent(`${property.address} ${property.city} ${property.state}`);
                const costarUrl = `https://www.costar.com/search?q=${searchQuery}`;
                onFieldUpdate('costar_link', costarUrl);
              }
            }}
            disabled={!property.address || !property.city || !property.state}
            className="px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate CoStar Link
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          Generate CoStar link from property address
        </p>
      </div>
    </section>
  );
};

export default LinksSection;