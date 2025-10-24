import React from 'react';
import { Database } from '../../../database-schema';

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
      description: 'Commercial real estate database',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'blue'
    },
    {
      key: 'reonomy_link' as keyof Property,
      label: 'Reonomy',
      description: 'Property intelligence platform',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      color: 'purple'
    },
    {
      key: 'tax_url' as keyof Property,
      label: 'Tax Records',
      description: 'Property tax information',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: 'green'
    },
    {
      key: 'map_link' as keyof Property,
      label: 'Map View',
      description: 'Interactive map link',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: 'orange'
    }
  ];

  const getColorClasses = (color: string, hasLink: boolean) => {
    const colors = {
      blue: hasLink 
        ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' 
        : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
      purple: hasLink 
        ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600' 
        : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
      green: hasLink 
        ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' 
        : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100',
      orange: hasLink 
        ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600' 
        : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

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

      {isEditing ? (
        <div className="space-y-3">
          {links.map((link) => (
            <div key={link.key}>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {link.label}
              </label>
              <input
                type="url"
                value={(property[link.key] as string) || ''}
                onChange={(e) => onFieldUpdate(link.key, e.target.value)}
                placeholder={`https://example.com/${link.label.toLowerCase()}-link`}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-0.5">{link.description}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => {
            const linkValue = property[link.key] as string;
            const hasLink = linkValue && linkValue.trim() !== '';
            const isValid = hasLink && isValidUrl(linkValue);

            return (
              <div key={link.key} className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700 w-24">{link.label}:</span>
                {hasLink && isValid ? (
                  <a
                    href={linkValue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                  >
                    Open Link
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">No link</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick generation buttons for editing mode */}
      {isEditing && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-xs font-medium text-blue-900 mb-2">Quick Actions</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (property.latitude && property.longitude) {
                  const mapUrl = `https://www.google.com/maps?q=${property.latitude},${property.longitude}`;
                  onFieldUpdate('map_link', mapUrl);
                }
              }}
              disabled={!property.latitude || !property.longitude}
              className="px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Map Link
            </button>

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
              Generate CoStar Search
            </button>
          </div>
          <p className="text-xs text-blue-700 mt-1.5">
            Quick generation requires property address and coordinates to be set.
          </p>
        </div>
      )}
    </section>
  );
};

export default LinksSection;