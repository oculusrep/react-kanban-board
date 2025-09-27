// Stage-based marker generator with icons
export interface StageConfig {
  color: string;
  iconPath: string; // SVG path data for the icon
  category: string;
}

// Stage configurations with SVG icon paths (simplified Lucide React icons)
export const STAGE_CONFIGURATIONS: Record<string, StageConfig> = {
  // Early Pipeline (Blue tones)
  'Pre-Submittal': {
    color: '#64748b',
    iconPath: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z', // Edit
    category: 'pipeline'
  },
  'Ready to Submit': {
    color: '#3b82f6',
    iconPath: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', // Upload
    category: 'pipeline'
  },
  'Submitted-Reviewing': {
    color: '#2563eb',
    iconPath: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z', // Eye
    category: 'pipeline'
  },
  'Not Available': {
    color: '#4b5563',
    iconPath: 'M6 4h4v16H6zM14 4h4v16h-4z', // Pause
    category: 'declined'
  },

  // Active Review (Orange/Yellow tones)
  'Mike to Review': {
    color: '#f97316',
    iconPath: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM16 11l2 2 4-4', // UserCheck
    category: 'review'
  },
  'LOI': {
    color: '#ca8a04',
    iconPath: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8', // FileText
    category: 'review'
  },
  'Tour': {
    color: '#6366f1',
    iconPath: 'M3 11l19-9-9 19-2-8-8-2z', // Navigation
    category: 'review'
  },

  // Contract Phase (Purple tones)
  'At Lease/PSA': {
    color: '#a855f7',
    iconPath: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z', // HandHeart
    category: 'contract'
  },
  'Under Contract / Contingent': {
    color: '#9333ea',
    iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4', // Shield
    category: 'contract'
  },
  'Executed Deal': {
    color: '#7c3aed',
    iconPath: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14l-3-3', // CheckCircle
    category: 'contract'
  },

  // Construction & Opening
  'Closed - Under Construction': {
    color: '#c2410c',
    iconPath: 'M2 20h20M8.5 14.5L4 9l4-7 4 7-4.5 5.5zM16 20v-5a4 4 0 1 1 8 0v5', // Construction
    category: 'construction'
  },
  'Store Open': {
    color: '#15803d',
    iconPath: 'M3 21h18M6 21V7h12v14M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 12h4', // Store
    category: 'construction'
  },

  // Success States (Green tones)
  'Booked': {
    color: '#22c55e',
    iconPath: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', // DollarSign
    category: 'success'
  },
  'Protected': {
    color: '#0891b2',
    iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', // Shield
    category: 'success'
  },

  // Monitoring (Light blue)
  'Monitor': {
    color: '#0ea5e9',
    iconPath: 'M11 2a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM21 21l-4.35-4.35', // Search
    category: 'monitoring'
  },
  'Pursuing Ownership': {
    color: '#dc2626',
    iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zM12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z', // Target/Bullseye
    category: 'monitoring'
  },
  'Unassigned Territory': {
    color: '#6b7280',
    iconPath: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z', // MapPin
    category: 'monitoring'
  },

  // Declined/Ended (Dark tones)
  'Lost / Killed': {
    color: '#1f2937',
    iconPath: 'M18 6L6 18M6 6l12 12', // XCircle
    category: 'declined'
  },
  'Pass': {
    color: '#6b7280',
    iconPath: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zM12 20c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z', // Circle with diagonal line (prohibited)
    category: 'declined'
  },
  'Use Conflict': {
    color: '#a16207',
    iconPath: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 15.75h.007v.008H12v-.008z', // AlertCircle
    category: 'declined'
  },
  'Use Declined': {
    color: '#991b1b',
    iconPath: 'M18 6L6 18M6 6l12 12', // XCircle
    category: 'declined'
  }
};

// Create SVG data URL for a stage
export const createStageMarkerSVG = (stageName: string, size: number = 32): string => {
  const config = STAGE_CONFIGURATIONS[stageName] || {
    color: '#3b82f6',
    iconPath: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    category: 'monitoring'
  };

  const iconSize = size * 0.5;
  const iconOffset = (size - iconSize) / 2;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 6}" viewBox="0 0 ${size} ${size + 6}">
      <!-- Pin body -->
      <circle cx="${size/2}" cy="${size/2}" r="${(size-4)/2}"
              fill="${config.color}"
              stroke="white"
              stroke-width="2"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"/>

      <!-- Pin tail -->
      <polygon points="${size/2},${size-2} ${size/2-3},${size-8} ${size/2+3},${size-8}"
               fill="${config.color}"
               stroke="white"
               stroke-width="1"/>

      <!-- Icon -->
      <g transform="translate(${iconOffset}, ${iconOffset}) scale(${iconSize/24})">
        <path d="${config.iconPath}"
              fill="white"
              stroke="none"/>
      </g>
    </svg>
  `;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};

// Create Google Maps Icon object for a stage
export const createStageMarkerIcon = (stageName: string, size: number = 32): google.maps.Icon => {
  return {
    url: createStageMarkerSVG(stageName, size),
    scaledSize: new google.maps.Size(size, size + 6),
    anchor: new google.maps.Point(size/2, size)
  };
};