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
      <!-- Main pin shape - wider and more rounded -->
      <path d="M16 2C9.373 2 4 7.373 4 14C4 22.5 16 34 16 34S28 22.5 28 14C28 7.373 22.627 2 16 2Z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <!-- Inner circle - larger -->
      <circle cx="16" cy="14" r="7" fill="white"/>
      <circle cx="16" cy="14" r="5" fill="${color}"/>
      <!-- Highlight -->
      <circle cx="14" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
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

// House-shaped marker for maximum distinction from Google's round markers
export const createHouseMarkerIcon = (color: string, size: number = 30): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Drop shadow -->
      <path d="M15 3L27 13V27H3V13L15 3Z" fill="rgba(0,0,0,0.2)" transform="translate(1,1)"/>
      <!-- Main house shape -->
      <path d="M15 2L28 12V28H2V12L15 2Z" fill="white" stroke="${color}" stroke-width="2"/>
      <!-- House body -->
      <rect x="6" y="12" width="18" height="16" fill="${color}"/>
      <!-- Roof -->
      <path d="M15 2L26 11H4L15 2Z" fill="${color}"/>
      <!-- Door/window -->
      <rect x="12" y="18" width="6" height="8" fill="white" rx="1"/>
      <!-- Door handle -->
      <circle cx="16.5" cy="22" r="0.8" fill="${color}"/>
      <!-- Highlight on roof -->
      <path d="M15 4L22 9H8L15 4Z" fill="rgba(255,255,255,0.3)"/>
    </svg>
  `;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size - 2)
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

// Function to create muted Google Places marker styles (subtle, not hidden)
export const createMutedPlacesStyle = () => {
  return [
    {
      featureType: "poi",
      elementType: "labels.icon",
      stylers: [
        { visibility: "on" },
        { saturation: -50 }, // Less saturated colors
        { lightness: 20 },   // Lighter appearance
        { gamma: 0.8 }       // Reduced contrast
      ]
    },
    {
      featureType: "poi",
      elementType: "labels.text",
      stylers: [
        { visibility: "on" },
        { color: "#888888" },    // Gray text instead of black
        { weight: 0.8 },         // Thinner text
        { saturation: -30 }      // Less colorful
      ]
    },
    {
      featureType: "poi.business",
      elementType: "labels.icon",
      stylers: [
        { visibility: "on" },
        { saturation: -60 },     // Very muted colors
        { lightness: 30 },       // Much lighter
        { gamma: 0.7 }           // Low contrast
      ]
    },
    {
      featureType: "poi.business",
      elementType: "labels.text",
      stylers: [
        { visibility: "simplified" },
        { color: "#999999" },    // Light gray text
        { weight: 0.6 }          // Thin text
      ]
    },
    {
      featureType: "transit",
      elementType: "labels.icon",
      stylers: [
        { visibility: "on" },
        { saturation: -40 },
        { lightness: 25 },
        { gamma: 0.8 }
      ]
    },
    {
      featureType: "transit",
      elementType: "labels.text",
      stylers: [
        { color: "#aaaaaa" },
        { weight: 0.7 }
      ]
    }
  ];
};

// Function to create muted places style optimized for satellite view (more visible labels)
export const createSatelliteMutedPlacesStyle = () => {
  return [
    {
      featureType: "poi",
      elementType: "labels.icon",
      stylers: [
        { visibility: "on" },
        { saturation: -50 }, // Less saturated colors
        { lightness: 20 },   // Lighter appearance
        { gamma: 0.8 }       // Reduced contrast
      ]
    },
    {
      featureType: "poi",
      elementType: "labels.text",
      stylers: [
        { visibility: "on" },
        { color: "#ffffff" },    // White text for visibility on satellite
        { weight: 0.6 },         // Thinner weight
        { saturation: -20 }      // Less colorful but more visible
      ]
    },
    {
      featureType: "poi",
      elementType: "labels.text.stroke",
      stylers: [
        { visibility: "on" },
        { color: "#666666" },    // Gray shadow/stroke
        { weight: 2.0 }          // Stroke width for shadow effect
      ]
    },
    {
      featureType: "poi.business",
      elementType: "labels.icon",
      stylers: [
        { visibility: "on" },
        { saturation: -60 },     // Very muted colors
        { lightness: 30 },       // Much lighter
        { gamma: 0.7 }           // Low contrast
      ]
    },
    {
      featureType: "poi.business",
      elementType: "labels.text",
      stylers: [
        { visibility: "on" },    // Show all business labels
        { color: "#ffffff" },    // White text for visibility on satellite
        { weight: 0.7 }          // Thinner text
      ]
    },
    {
      featureType: "poi.business",
      elementType: "labels.text.stroke",
      stylers: [
        { visibility: "on" },
        { color: "#666666" },    // Gray shadow/stroke
        { weight: 2.0 }          // Stroke width for shadow effect
      ]
    },
    {
      featureType: "transit",
      elementType: "labels.icon",
      stylers: [
        { visibility: "on" },
        { saturation: -40 },
        { lightness: 25 },
        { gamma: 0.8 }
      ]
    },
    {
      featureType: "transit",
      elementType: "labels.text",
      stylers: [
        { color: "#ffffff" },    // White text for satellite view
        { weight: 0.6 }          // Thinner text
      ]
    },
    {
      featureType: "transit",
      elementType: "labels.text.stroke",
      stylers: [
        { visibility: "on" },
        { color: "#666666" },    // Gray shadow/stroke
        { weight: 2.0 }          // Stroke width for shadow effect
      ]
    }
  ];
};

// Google-style blue dot marker for live GPS tracking
export const createGoogleBlueDotIcon = (size: number = 24): google.maps.Icon => {
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Outer white ring -->
      <circle cx="12" cy="12" r="11" fill="white" stroke="white" stroke-width="2"/>
      <!-- Blue dot -->
      <circle cx="12" cy="12" r="8" fill="#4285F4"/>
      <!-- Inner white dot for 3D effect -->
      <circle cx="12" cy="12" r="5" fill="white" fill-opacity="0.3"/>
    </svg>
  `;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, size),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size / 2)
  };
};

// Create accuracy circle options for Google Maps
export const createAccuracyCircleOptions = (
  center: google.maps.LatLng | google.maps.LatLngLiteral,
  radiusMeters: number
): google.maps.CircleOptions => {
  return {
    center,
    radius: radiusMeters,
    fillColor: '#4285F4',
    fillOpacity: 0.15,
    strokeColor: '#4285F4',
    strokeOpacity: 0.4,
    strokeWeight: 1,
    clickable: false,
    zIndex: 1
  };
};

// Color palette for modern markers
export const MarkerColors = {
  // Primary colors (vibrant but professional)
  RECENT: '#EF4444',      // Red - for recently created
  VERIFIED: '#10B981',    // Green - for verified locations
  GEOCODED: '#3B82F6',    // Blue - for geocoded locations
  VERIFYING: '#F97316',   // Orange - for verification in progress
  USER_LOCATION: '#8B5CF6',  // Purple - for user's static location (distinct from properties and GPS)
  GPS_TRACKING: '#4285F4',   // Google blue - for live GPS tracking

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
  // For properties - use modern pin markers
  property: {
    recent: () => createModernPinIcon(MarkerColors.RECENT, 32),
    verified: () => createModernPinIcon(MarkerColors.VERIFIED, 30),
    geocoded: () => createModernPinIcon(MarkerColors.GEOCODED, 30),
    verifying: () => createModernPinIcon(MarkerColors.VERIFYING, 32),
    selected: () => createModernPinIcon('#FF6B00', 60) // Large orange pin for selected property
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
  },

  // Alternative styles if you want to try different shapes
  alternative: {
    // Original circular design (your preferred icons)
    circular: {
      recent: () => createModernMarkerIcon(MarkerColors.RECENT, 32),
      verified: () => createModernMarkerIcon(MarkerColors.VERIFIED, 28),
      geocoded: () => createModernMarkerIcon(MarkerColors.GEOCODED, 28),
      verifying: () => createModernMarkerIcon(MarkerColors.VERIFYING, 32)
    },
    // Hexagonal alternative
    hexagon: {
      recent: () => createHexagonMarkerIcon(MarkerColors.RECENT, 32),
      verified: () => createHexagonMarkerIcon(MarkerColors.VERIFIED, 28),
      geocoded: () => createHexagonMarkerIcon(MarkerColors.GEOCODED, 28),
      verifying: () => createHexagonMarkerIcon(MarkerColors.VERIFYING, 32)
    }
  }
} as const;