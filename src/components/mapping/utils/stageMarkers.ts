// Stage-based marker generator with icons
export interface StageConfig {
  color: string;
  iconPath: string; // SVG path data for the icon
  category: string;
}

// Stage configurations with simplified SVG icon paths (optimized for small marker size)
export const STAGE_CONFIGURATIONS: Record<string, StageConfig> = {
  // Early Pipeline (Blue tones)
  'Pre-Submittal': {
    color: '#64748b',
    iconPath: 'M6 4h12v12H6z M18 18l-6-6 M15 9h3', // Edit (simplified)
    category: 'pipeline'
  },
  'Ready to Submit': {
    color: '#3b82f6',
    iconPath: 'M12 4L8 8h3v8h2v-8h3z', // Upload (simplified arrow up)
    category: 'pipeline'
  },
  'Submitted-Reviewing': {
    color: '#2563eb',
    iconPath: 'M12 8c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4z M12 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z', // Eye (simplified)
    category: 'pipeline'
  },
  'Not Available': {
    color: '#4b5563',
    iconPath: 'M8 6h2v12H8z M14 6h2v12h-2z', // Pause (simplified)
    category: 'declined'
  },

  // Active Review (Orange/Yellow tones)
  'Mike to Review': {
    color: '#f97316',
    iconPath: 'M12 6c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4z M16 14l2 2 4-4', // UserCheck (simplified)
    category: 'review'
  },
  'LOI': {
    color: '#ca8a04',
    iconPath: 'M7 4h8l3 3v11H7z M9 10h6 M9 13h6 M9 16h4', // FileText (simplified)
    category: 'review'
  },
  'Tour': {
    color: '#6366f1',
    iconPath: 'M6 12l12-6-6 12-2-4z', // Navigation (simplified arrow)
    category: 'review'
  },

  // Contract Phase (Purple tones)
  'At Lease/PSA': {
    color: '#a855f7',
    iconPath: 'M12 6c3.3 0 6 2.7 6 6 0 2-1 3.8-2.5 4.8L12 20l-3.5-3.2C7 15.8 6 14 6 12c0-3.3 2.7-6 6-6z', // Heart (simplified)
    category: 'contract'
  },
  'Under Contract / Contingent': {
    color: '#9333ea',
    iconPath: 'M12 4l6 3v6c0 3-6 6-6 6s-6-3-6-6V7z M10 11l2 2 4-4', // Shield (simplified)
    category: 'contract'
  },
  'Executed Deal': {
    color: '#7c3aed',
    iconPath: 'M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M9 12l2 2 4-4', // CheckCircle (simplified)
    category: 'contract'
  },

  // Construction & Opening
  'Closed - Under Construction': {
    color: '#c2410c',
    iconPath: 'M12 4l6 4v12H6V8z M9 12h6 M9 15h6', // Construction (simplified)
    category: 'construction'
  },
  'Store Open': {
    color: '#15803d',
    iconPath: 'M6 8h12v12H6z M6 8V6h12v2 M10 12h4', // Store (simplified)
    category: 'construction'
  },

  // Success States (Green tones)
  'Booked': {
    color: '#22c55e',
    iconPath: 'M12 4v16 M8 8c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.1-.4 2.1-1.1 2.9 M7 16c0-2.8 2.2-5 5-5s5 2.2 5 5', // Dollar (simplified)
    category: 'success'
  },
  'Protected': {
    color: '#0891b2',
    iconPath: 'M12 4l6 3v6c0 3-6 6-6 6s-6-3-6-6V7z', // Shield (simplified)
    category: 'success'
  },

  // Monitoring (Light blue)
  'Monitor': {
    color: '#0ea5e9',
    iconPath: 'M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M18 18l-2-2', // Search (simplified)
    category: 'monitoring'
  },
  'Pursuing Ownership': {
    color: '#dc2626',
    iconPath: 'M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M12 8c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4z M12 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z', // Target (simplified)
    category: 'monitoring'
  },
  'Unassigned Territory': {
    color: '#6b7280',
    iconPath: 'M12 4c3.3 0 6 2.7 6 6 0 4-6 10-6 10s-6-6-6-10c0-3.3 2.7-6 6-6z M12 7c1.7 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.3-3 3-3z', // MapPin (simplified)
    category: 'monitoring'
  },

  // Declined/Ended (Dark tones)
  'Lost / Killed': {
    color: '#1f2937',
    iconPath: 'M6 6l12 12 M18 6L6 18', // X (simplified)
    category: 'declined'
  },
  'Pass': {
    color: '#6b7280',
    iconPath: 'M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M6 6l12 12', // Ban (simplified)
    category: 'declined'
  },
  'Use Conflict': {
    color: '#a16207',
    iconPath: 'M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z M12 8v4 M12 16h.01', // AlertCircle (simplified)
    category: 'declined'
  },
  'Use Declined': {
    color: '#991b1b',
    iconPath: 'M6 6l12 12 M18 6L6 18', // X (simplified)
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
      <g transform="translate(${iconOffset}, ${iconOffset})">
        <path d="${config.iconPath}"
              fill="white"
              stroke="white"
              stroke-width="0.5"
              stroke-linejoin="round"
              stroke-linecap="round"
              transform="scale(${iconSize/24})"/>
      </g>
    </svg>
  `;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};

// Create SVG data URL for a verified stage marker (with double border to indicate it's verified)
export const createVerifiedStageMarkerSVG = (stageName: string, size: number = 32): string => {
  const config = STAGE_CONFIGURATIONS[stageName] || {
    color: '#3b82f6',
    iconPath: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    category: 'monitoring'
  };

  const iconSize = size * 0.5;
  const iconOffset = (size - iconSize) / 2;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 6}" viewBox="0 0 ${size} ${size + 6}">
      <!-- Outer verified ring -->
      <circle cx="${size/2}" cy="${size/2}" r="${(size-2)/2}"
              fill="none"
              stroke="#10b981"
              stroke-width="3"
              stroke-dasharray="2,2"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"/>

      <!-- Pin body -->
      <circle cx="${size/2}" cy="${size/2}" r="${(size-8)/2}"
              fill="${config.color}"
              stroke="white"
              stroke-width="2"/>

      <!-- Pin tail -->
      <polygon points="${size/2},${size-2} ${size/2-3},${size-8} ${size/2+3},${size-8}"
               fill="${config.color}"
               stroke="white"
               stroke-width="1"/>

      <!-- Icon -->
      <g transform="translate(${iconOffset}, ${iconOffset})">
        <path d="${config.iconPath}"
              fill="white"
              stroke="white"
              stroke-width="0.5"
              stroke-linejoin="round"
              stroke-linecap="round"
              transform="scale(${iconSize/24})"/>
      </g>

      <!-- Verified checkmark overlay -->
      <circle cx="${size-6}" cy="6" r="4" fill="#10b981" stroke="white" stroke-width="1"/>
      <path d="M${size-8} 6 L${size-6} 8 L${size-4} 4" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};

// Create Google Maps Icon object for a verified stage (with visual distinction)
export const createVerifiedStageMarkerIcon = (stageName: string, size: number = 32): google.maps.Icon => {
  return {
    url: createVerifiedStageMarkerSVG(stageName, size),
    scaledSize: new google.maps.Size(size, size + 6),
    anchor: new google.maps.Point(size/2, size)
  };
};

// Create Google Maps Icon object for a stage
export const createStageMarkerIcon = (stageName: string, size: number = 32): google.maps.Icon => {
  return {
    url: createStageMarkerSVG(stageName, size),
    scaledSize: new google.maps.Size(size, size + 6),
    anchor: new google.maps.Point(size/2, size)
  };
};