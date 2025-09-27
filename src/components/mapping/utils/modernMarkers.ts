// Modern marker designs using SVG for better scalability and contemporary look

export const createModernMarkerIcon = (color: string, size: number = 28): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Outer ring with subtle shadow -->
      <circle cx="14" cy="14" r="13" fill="rgba(0,0,0,0.1)" />
      <circle cx="14" cy="13.5" r="12" fill="white" stroke="${color}" stroke-width="2"/>
      <!-- Inner dot -->
      <circle cx="14" cy="13.5" r="6" fill="${color}"/>
      <!-- Highlight for depth -->
      <circle cx="12" cy="11.5" r="2" fill="rgba(255,255,255,0.6)"/>
    </svg>
  `;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size / 2)
  };
};

export const createModernPinIcon = (color: string, size: number = 32): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Drop shadow -->
      <ellipse cx="16" cy="38" rx="8" ry="3" fill="rgba(0,0,0,0.2)"/>
      <!-- Main pin shape -->
      <path d="M16 2C10.477 2 6 6.477 6 12C6 19.25 16 34 16 34S26 19.25 26 12C26 6.477 21.523 2 16 2Z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <!-- Inner circle -->
      <circle cx="16" cy="12" r="5" fill="white"/>
      <circle cx="16" cy="12" r="3" fill="${color}"/>
      <!-- Highlight -->
      <circle cx="14.5" cy="10.5" r="1.5" fill="rgba(255,255,255,0.8)"/>
    </svg>
  `;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size * 1.25),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size * 1.25)
  };
};

export const createModernSquareIcon = (color: string, size: number = 24): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Drop shadow -->
      <rect x="1" y="1" width="22" height="22" rx="4" fill="rgba(0,0,0,0.15)"/>
      <!-- Main square -->
      <rect x="0" y="0" width="22" height="22" rx="4" fill="${color}" stroke="white" stroke-width="2"/>
      <!-- Inner content -->
      <rect x="6" y="6" width="10" height="10" rx="2" fill="white"/>
      <rect x="8" y="8" width="6" height="6" rx="1" fill="${color}"/>
      <!-- Highlight -->
      <rect x="7" y="7" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.7)"/>
    </svg>
  `;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size / 2)
  };
};

// Color palette for modern markers
export const MarkerColors = {
  // Primary colors (vibrant but professional)
  RECENT: '#EF4444',      // Red - for recently created
  VERIFIED: '#10B981',    // Green - for verified locations
  GEOCODED: '#3B82F6',    // Blue - for geocoded locations
  VERIFYING: '#F97316',   // Orange - for verification in progress

  // Site submit colors (by status)
  SUBMITTED: '#8B5CF6',   // Purple
  APPROVED: '#059669',    // Dark green
  REJECTED: '#DC2626',    // Dark red
  PENDING: '#F59E0B',     // Amber

  // Property types
  RETAIL: '#EC4899',      // Pink
  OFFICE: '#6366F1',      // Indigo
  INDUSTRIAL: '#78716C',  // Warm gray
  MIXED_USE: '#14B8A6',   // Teal

  // Neutral
  DEFAULT: '#6B7280'      // Gray
} as const;

// Predefined marker styles for different use cases
export const ModernMarkerStyles = {
  // For properties - use circular markers
  property: {
    recent: () => createModernMarkerIcon(MarkerColors.RECENT, 32),
    verified: () => createModernMarkerIcon(MarkerColors.VERIFIED, 28),
    geocoded: () => createModernMarkerIcon(MarkerColors.GEOCODED, 28),
    verifying: () => createModernMarkerIcon(MarkerColors.VERIFYING, 32)
  },

  // For site submits - use pin-style markers
  siteSubmit: {
    submitted: () => createModernPinIcon(MarkerColors.SUBMITTED, 28),
    approved: () => createModernPinIcon(MarkerColors.APPROVED, 28),
    rejected: () => createModernPinIcon(MarkerColors.REJECTED, 28),
    pending: () => createModernPinIcon(MarkerColors.PENDING, 28)
  },

  // For special markers - use square markers
  special: {
    retail: () => createModernSquareIcon(MarkerColors.RETAIL, 24),
    office: () => createModernSquareIcon(MarkerColors.OFFICE, 24),
    industrial: () => createModernSquareIcon(MarkerColors.INDUSTRIAL, 24),
    mixedUse: () => createModernSquareIcon(MarkerColors.MIXED_USE, 24)
  }
} as const;