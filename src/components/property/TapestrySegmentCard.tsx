import React, { useState } from 'react';

interface TapestrySegmentCardProps {
  code: string | null;
  name: string | null;
  description: string | null;
  lifemodes: string | null;
}

/**
 * Display card for ESRI Tapestry psychographic segment
 * Shows segment code, name, LifeMode category, and expandable description
 */
const TapestrySegmentCard: React.FC<TapestrySegmentCardProps> = ({
  code,
  name,
  description,
  lifemodes,
}) => {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // If no Tapestry data, don't render anything
  if (!code && !name) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-[#002147]/5 to-[#4A6B94]/5 rounded-lg border border-[#8FA9C8] p-4">
      <div className="flex items-start gap-3">
        {/* Segment Code Badge */}
        {code && (
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-lg bg-[#002147] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {code}
            </div>
          </div>
        )}

        {/* Segment Details */}
        <div className="flex-1 min-w-0">
          {/* Segment Name */}
          {name && (
            <h4 className="text-base font-semibold text-[#002147] leading-tight">
              {name}
            </h4>
          )}

          {/* LifeMode Category */}
          {lifemodes && (
            <div className="mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#4A6B94]/10 text-[#4A6B94]">
                {lifemodes}
              </span>
            </div>
          )}

          {/* Description (expandable) */}
          {description && (
            <div className="mt-2">
              <p
                className={`text-sm text-gray-600 ${
                  !isDescriptionExpanded ? 'line-clamp-2' : ''
                }`}
              >
                {description}
              </p>
              {description.length > 100 && (
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-xs text-[#4A6B94] hover:text-[#002147] mt-1 font-medium"
                >
                  {isDescriptionExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tapestry Icon */}
        <div className="flex-shrink-0">
          <svg
            className="w-6 h-6 text-[#4A6B94]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default TapestrySegmentCard;
