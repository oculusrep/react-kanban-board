// Modern marker designs using SVG for better scalability and contemporary look

export const createModernMarkerIcon = (color: string, size: number = 28): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Enhanced drop shadow for better visibility -->
      <circle cx="14" cy="15" r="13" fill="rgba(0,0,0,0.25)" />
      <!-- Thick white border for high contrast -->
      <circle cx="14" cy="14" r="12" fill="white" stroke="${color}" stroke-width="3"/>
      <!-- Pulsing ring effect for animation -->
      <circle cx="14" cy="14" r="10" fill="none" stroke="${color}" stroke-width="1" opacity="0.5">
        <animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/>
      </circle>
      <!-- Inner dot with better contrast -->
      <circle cx="14" cy="14" r="5" fill="${color}"/>
      <!-- Bright highlight for 3D effect -->
      <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.9)"/>
      <!-- Small center dot for precision -->
      <circle cx="14" cy="14" r="1.5" fill="white"/>
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

// New distinctive diamond marker for maximum visibility
export const createDiamondMarkerIcon = (color: string, size: number = 30): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Enhanced shadow -->
      <path d="M15 3L25 15L15 27L5 15Z" fill="rgba(0,0,0,0.3)" transform="translate(1,1)"/>
      <!-- White border for contrast -->
      <path d="M15 2L26 15L15 28L4 15Z" fill="white" stroke="${color}" stroke-width="2"/>
      <!-- Inner diamond -->
      <path d="M15 6L22 15L15 24L8 15Z" fill="${color}"/>
      <!-- Highlight -->
      <path d="M15 8L18 15L15 18L12 15Z" fill="rgba(255,255,255,0.8)"/>
      <!-- Center dot -->
      <circle cx="15" cy="15" r="2" fill="white"/>
    </svg>
  `;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size / 2)
  };
};

// Hexagonal marker for another distinctive option
export const createHexagonMarkerIcon = (color: string, size: number = 28): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow -->
      <path d="M14 2L22 7V19L14 24L6 19V7L14 2Z" fill="rgba(0,0,0,0.2)" transform="translate(1,1)"/>
      <!-- Main hexagon with thick border -->
      <path d="M14 1L23 6.5V19.5L14 25L5 19.5V6.5L14 1Z" fill="white" stroke="${color}" stroke-width="3"/>
      <!-- Inner hexagon -->
      <path d="M14 5L19 8.5V17.5L14 21L9 17.5V8.5L14 5Z" fill="${color}"/>
      <!-- Highlight -->
      <path d="M14 8L16.5 9.5V16.5L14 18L11.5 16.5V9.5L14 8Z" fill="rgba(255,255,255,0.7)"/>
      <!-- Center -->
      <circle cx="14" cy="14" r="1.5" fill="white"/>
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
  // For properties - use distinctive diamond markers for maximum visibility
  property: {
    recent: () => createDiamondMarkerIcon(MarkerColors.RECENT, 32),
    verified: () => createHexagonMarkerIcon(MarkerColors.VERIFIED, 30),
    geocoded: () => createDiamondMarkerIcon(MarkerColors.GEOCODED, 30),
    verifying: () => createModernMarkerIcon(MarkerColors.VERIFYING, 32) // Enhanced with animation
  },

  // For site submits - use pin-style markers (traditional but enhanced)
  siteSubmit: {
    submitted: () => createModernPinIcon(MarkerColors.SUBMITTED, 28),
    approved: () => createModernPinIcon(MarkerColors.APPROVED, 28),
    rejected: () => createModernPinIcon(MarkerColors.REJECTED, 28),
    pending: () => createModernPinIcon(MarkerColors.PENDING, 28)
  },

  // For special markers - use varied shapes for differentiation
  special: {
    retail: () => createHexagonMarkerIcon(MarkerColors.RETAIL, 26),
    office: () => createModernSquareIcon(MarkerColors.OFFICE, 24),
    industrial: () => createDiamondMarkerIcon(MarkerColors.INDUSTRIAL, 28),
    mixedUse: () => createHexagonMarkerIcon(MarkerColors.MIXED_USE, 26)
  },

  // Alternative high-visibility styles (for when you need maximum distinction)
  highVisibility: {
    diamonds: {
      recent: () => createDiamondMarkerIcon(MarkerColors.RECENT, 34),
      verified: () => createDiamondMarkerIcon(MarkerColors.VERIFIED, 30),
      geocoded: () => createDiamondMarkerIcon(MarkerColors.GEOCODED, 30),
      verifying: () => createDiamondMarkerIcon(MarkerColors.VERIFYING, 34)
    },
    hexagons: {
      recent: () => createHexagonMarkerIcon(MarkerColors.RECENT, 32),
      verified: () => createHexagonMarkerIcon(MarkerColors.VERIFIED, 28),
      geocoded: () => createHexagonMarkerIcon(MarkerColors.GEOCODED, 28),
      verifying: () => createHexagonMarkerIcon(MarkerColors.VERIFYING, 32)
    },
    enhanced: {
      recent: () => createModernMarkerIcon(MarkerColors.RECENT, 34),
      verified: () => createModernMarkerIcon(MarkerColors.VERIFIED, 30),
      geocoded: () => createModernMarkerIcon(MarkerColors.GEOCODED, 30),
      verifying: () => createModernMarkerIcon(MarkerColors.VERIFYING, 34)
    }
  }
} as const;