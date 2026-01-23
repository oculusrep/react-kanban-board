// Advanced Marker utilities using AdvancedMarkerElement with custom HTML
// Supports teardrop and circle marker styles with enhanced visibility

export type MarkerShape = 'teardrop' | 'circle';

// Cache for the marker library
let markerLibrary: google.maps.MarkerLibrary | null = null;

/**
 * Load the Google Maps marker library (required for AdvancedMarkerElement)
 * This must be called before creating any AdvancedMarkerElements
 */
export async function loadMarkerLibrary(): Promise<google.maps.MarkerLibrary> {
  if (markerLibrary) {
    return markerLibrary;
  }

  try {
    markerLibrary = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary;
    console.log('✅ Google Maps marker library loaded');
    return markerLibrary;
  } catch (error) {
    console.error('❌ Failed to load marker library:', error);
    throw error;
  }
}

/**
 * Check if the marker library is loaded
 */
export function isMarkerLibraryLoaded(): boolean {
  return markerLibrary !== null;
}

/**
 * Get the loaded marker library (throws if not loaded)
 */
export function getMarkerLibrary(): google.maps.MarkerLibrary {
  if (!markerLibrary) {
    throw new Error('Marker library not loaded. Call loadMarkerLibrary() first.');
  }
  return markerLibrary;
}

export interface AdvancedMarkerOptions {
  color: string;
  shape: MarkerShape;
  size?: number; // Base size in pixels (default: 44 for better visibility)
  icon?: string; // SVG path for interior icon
  verified?: boolean; // Show verification indicator
  zIndex?: number;
  draggable?: boolean;
  strokeWidth?: number; // White border thickness (default: 3, use 4 for property markers)
}

// Stage configurations with Lucide-compatible icon definitions
// Icons are rendered as strokes (not fills) to match Lucide React icons in the legend
export interface StageConfig {
  color: string;
  icon: LucideIconDef;
  category: string;
}

// Lucide icon definitions - supports paths, circles, rects, lines, and polygons
export interface LucideIconDef {
  paths?: string[];
  circles?: { cx: number; cy: number; r: number }[];
  rects?: { x: number; y: number; width: number; height: number; rx?: number }[];
  lines?: { x1: number; y1: number; x2: number; y2: number }[];
  polygons?: string[];
}

export const STAGE_CONFIGURATIONS: Record<string, StageConfig> = {
  // Early Pipeline (Blue tones)
  'Pre-Submittal': {
    color: '#64748b',
    icon: {
      // Edit/Pencil icon
      paths: [
        'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
        'm15 5 4 4'
      ]
    },
    category: 'pipeline'
  },
  'Ready to Submit': {
    color: '#3b82f6',
    icon: {
      // Upload icon
      paths: [
        'M12 3v12',
        'm17 8-5-5-5 5',
        'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'
      ]
    },
    category: 'pipeline'
  },
  'Submitted-Reviewing': {
    color: '#2563eb',
    icon: {
      // Eye icon
      paths: [
        'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'
      ],
      circles: [{ cx: 12, cy: 12, r: 3 }]
    },
    category: 'pipeline'
  },
  'Not Available': {
    color: '#4b5563',
    icon: {
      // Pause icon - two vertical rectangles
      rects: [
        { x: 14, y: 3, width: 5, height: 18, rx: 1 },
        { x: 5, y: 3, width: 5, height: 18, rx: 1 }
      ]
    },
    category: 'declined'
  },

  // Active Review (Orange/Yellow tones)
  'Mike to Review': {
    color: '#f97316',
    icon: {
      // UserCheck icon
      paths: [
        'm16 11 2 2 4-4',
        'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'
      ],
      circles: [{ cx: 9, cy: 7, r: 4 }]
    },
    category: 'review'
  },
  'LOI': {
    color: '#ca8a04',
    icon: {
      // FileText icon
      paths: [
        'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
        'M14 2v5a1 1 0 0 0 1 1h5',
        'M10 9H8',
        'M16 13H8',
        'M16 17H8'
      ]
    },
    category: 'review'
  },
  'Tour': {
    color: '#6366f1',
    icon: {
      // Navigation icon (polygon)
      polygons: ['3 11 22 2 13 21 11 13 3 11']
    },
    category: 'review'
  },

  // Contract Phase (Purple tones)
  'At Lease/PSA': {
    color: '#a855f7',
    icon: {
      // HandHeart icon (simplified)
      paths: [
        'M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16',
        'm2 15 6 6',
        'M19 5.5a2.5 2.5 0 0 0-5 0c0 1 .5 1.8 1.2 2.5L16 9l.8-1c.7-.7 1.2-1.5 1.2-2.5'
      ]
    },
    category: 'contract'
  },
  'Under Contract / Contingent': {
    color: '#9333ea',
    icon: {
      // Shield with check
      paths: [
        'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
        'm9 12 2 2 4-4'
      ]
    },
    category: 'contract'
  },
  'Executed Deal': {
    color: '#7c3aed',
    icon: {
      // CircleCheck icon
      paths: ['m9 12 2 2 4-4'],
      circles: [{ cx: 12, cy: 12, r: 10 }]
    },
    category: 'contract'
  },

  // Construction & Opening
  'Closed - Under Construction': {
    color: '#c2410c',
    icon: {
      // Construction icon
      paths: [
        'M17 14v7',
        'M7 14v7',
        'M17 3v3',
        'M7 3v3',
        'M10 14 2.3 6.3',
        'm14 6 7.7 7.7',
        'm8 6 8 8'
      ],
      rects: [{ x: 2, y: 6, width: 20, height: 8, rx: 1 }]
    },
    category: 'construction'
  },
  'Store Open': {
    color: '#15803d',
    icon: {
      // Store icon
      paths: [
        'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5',
        'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244',
        'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05'
      ]
    },
    category: 'construction'
  },

  // Success States (Green tones)
  'Booked': {
    color: '#22c55e',
    icon: {
      // DollarSign icon
      paths: ['M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
      lines: [{ x1: 12, y1: 2, x2: 12, y2: 22 }]
    },
    category: 'success'
  },
  'Protected': {
    color: '#0891b2',
    icon: {
      // Shield icon
      paths: [
        'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
      ]
    },
    category: 'success'
  },

  // Monitoring (Light blue)
  'Monitor': {
    color: '#0ea5e9',
    icon: {
      // Search icon
      paths: ['m21 21-4.34-4.34'],
      circles: [{ cx: 11, cy: 11, r: 8 }]
    },
    category: 'monitoring'
  },
  'Pursuing Ownership': {
    color: '#dc2626',
    icon: {
      // Target icon - three concentric circles
      circles: [
        { cx: 12, cy: 12, r: 10 },
        { cx: 12, cy: 12, r: 6 },
        { cx: 12, cy: 12, r: 2 }
      ]
    },
    category: 'monitoring'
  },
  'Unassigned Territory': {
    color: '#6b7280',
    icon: {
      // MapPin icon
      paths: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'],
      circles: [{ cx: 12, cy: 10, r: 3 }]
    },
    category: 'monitoring'
  },

  // Declined/Ended (Dark tones)
  'Lost / Killed': {
    color: '#1f2937',
    icon: {
      // CircleX icon
      paths: ['m15 9-6 6', 'm9 9 6 6'],
      circles: [{ cx: 12, cy: 12, r: 10 }]
    },
    category: 'declined'
  },
  'Pass': {
    color: '#6b7280',
    icon: {
      // Ban icon
      paths: ['M4.929 4.929 19.07 19.071'],
      circles: [{ cx: 12, cy: 12, r: 10 }]
    },
    category: 'declined'
  },
  'Use Conflict': {
    color: '#a16207',
    icon: {
      // CircleAlert icon
      circles: [{ cx: 12, cy: 12, r: 10 }],
      lines: [
        { x1: 12, y1: 8, x2: 12, y2: 12 },
        { x1: 12, y1: 16, x2: 12.01, y2: 16 }
      ]
    },
    category: 'declined'
  },
  'Use Declined': {
    color: '#991b1b',
    icon: {
      // CircleX icon
      paths: ['m15 9-6 6', 'm9 9 6 6'],
      circles: [{ cx: 12, cy: 12, r: 10 }]
    },
    category: 'declined'
  }
};

// Default config for unknown stages (MapPin icon)
const DEFAULT_STAGE_CONFIG: StageConfig = {
  color: '#3b82f6',
  icon: {
    paths: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'],
    circles: [{ cx: 12, cy: 10, r: 3 }]
  },
  category: 'monitoring'
};

// Property marker icon configurations (separate from stages)
const PROPERTY_ICON_CONFIGS: Record<string, LucideIconDef> = {
  verified: {
    // CircleCheck icon
    paths: ['m9 12 2 2 4-4'],
    circles: [{ cx: 12, cy: 12, r: 10 }]
  },
  recent: {
    // Plus icon
    lines: [
      { x1: 12, y1: 5, x2: 12, y2: 19 },
      { x1: 5, y1: 12, x2: 19, y2: 12 }
    ]
  },
  geocoded: {
    // MapPin icon (no inner circle)
    paths: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0']
  },
  default: {
    // MapPin icon with inner circle
    paths: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'],
    circles: [{ cx: 12, cy: 10, r: 3 }]
  },
  selected: {
    // Crosshair/target icon for selected property
    circles: [{ cx: 12, cy: 12, r: 10 }],
    lines: [
      { x1: 22, y1: 12, x2: 18, y2: 12 },
      { x1: 6, y1: 12, x2: 2, y2: 12 },
      { x1: 12, y1: 2, x2: 12, y2: 6 },
      { x1: 12, y1: 18, x2: 12, y2: 22 }
    ]
  },
  verifying: {
    // Move/drag icon for verifying location
    paths: [
      'M5 9l-3 3 3 3',
      'M9 5l3-3 3 3',
      'M15 19l-3 3-3-3',
      'M19 9l3 3-3 3'
    ],
    lines: [
      { x1: 2, y1: 12, x2: 22, y2: 12 },
      { x1: 12, y1: 2, x2: 12, y2: 22 }
    ]
  }
};

/**
 * Render a Lucide icon definition into an SVG group
 * Uses stroke-based rendering to match Lucide React icons
 */
function renderLucideIcon(
  iconDef: LucideIconDef,
  iconSize: number,
  iconOffset: number,
  offsetY: number = 0
): SVGGElement {
  const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const scale = iconSize / 24;
  iconGroup.setAttribute('transform', `translate(${iconOffset}, ${iconOffset + offsetY}) scale(${scale})`);

  // Common stroke attributes for Lucide icons
  const setStrokeAttrs = (el: SVGElement) => {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', 'white');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
  };

  // Render paths
  if (iconDef.paths) {
    iconDef.paths.forEach(d => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      setStrokeAttrs(path);
      iconGroup.appendChild(path);
    });
  }

  // Render circles
  if (iconDef.circles) {
    iconDef.circles.forEach(c => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', `${c.cx}`);
      circle.setAttribute('cy', `${c.cy}`);
      circle.setAttribute('r', `${c.r}`);
      setStrokeAttrs(circle);
      iconGroup.appendChild(circle);
    });
  }

  // Render rectangles
  if (iconDef.rects) {
    iconDef.rects.forEach(r => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', `${r.x}`);
      rect.setAttribute('y', `${r.y}`);
      rect.setAttribute('width', `${r.width}`);
      rect.setAttribute('height', `${r.height}`);
      if (r.rx) rect.setAttribute('rx', `${r.rx}`);
      setStrokeAttrs(rect);
      iconGroup.appendChild(rect);
    });
  }

  // Render lines
  if (iconDef.lines) {
    iconDef.lines.forEach(l => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${l.x1}`);
      line.setAttribute('y1', `${l.y1}`);
      line.setAttribute('x2', `${l.x2}`);
      line.setAttribute('y2', `${l.y2}`);
      setStrokeAttrs(line);
      iconGroup.appendChild(line);
    });
  }

  // Render polygons
  if (iconDef.polygons) {
    iconDef.polygons.forEach(points => {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', points);
      setStrokeAttrs(polygon);
      iconGroup.appendChild(polygon);
    });
  }

  return iconGroup;
}

/**
 * Create a teardrop-shaped marker element
 */
function createTeardropElement(options: AdvancedMarkerOptions): HTMLElement {
  const size = options.size || 38;
  const config = STAGE_CONFIGURATIONS[options.icon || ''] || { ...DEFAULT_STAGE_CONFIG, color: options.color };
  const color = options.color || config.color;

  const container = document.createElement('div');
  container.className = 'advanced-marker-teardrop';
  container.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size + 10}px;
    cursor: pointer;
    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
    transition: transform 0.15s ease-out;
  `;

  // SVG teardrop shape
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', `${size}`);
  svg.setAttribute('height', `${size + 10}`);
  svg.setAttribute('viewBox', `0 0 ${size} ${size + 10}`);
  svg.style.overflow = 'visible';

  // Teardrop path - classic Google Maps pin shape
  const cx = size / 2;
  const r = (size - 6) / 2; // Radius of the circle part
  const tipY = size + 6; // Y position of the tip

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // Teardrop: circle on top, point at bottom
  const d = `
    M ${cx} ${tipY}
    C ${cx - r * 0.6} ${size - 2}, ${cx - r} ${r + 6}, ${cx - r} ${r + 3}
    A ${r} ${r} 0 1 1 ${cx + r} ${r + 3}
    C ${cx + r} ${r + 6}, ${cx + r * 0.6} ${size - 2}, ${cx} ${tipY}
    Z
  `;
  path.setAttribute('d', d);
  path.setAttribute('fill', color);
  path.setAttribute('stroke', 'white');
  path.setAttribute('stroke-width', '3');

  svg.appendChild(path);

  // Icon inside the marker (Lucide-style stroke-based icons)
  if (config.icon) {
    const iconSize = size * 0.45;
    const iconOffset = (size - iconSize) / 2;
    const iconGroup = renderLucideIcon(config.icon, iconSize, iconOffset, -2);
    svg.appendChild(iconGroup);
  }

  // Verified badge
  if (options.verified) {
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('transform', `translate(${size - 10}, 2)`);

    const badgeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badgeCircle.setAttribute('cx', '6');
    badgeCircle.setAttribute('cy', '6');
    badgeCircle.setAttribute('r', '6');
    badgeCircle.setAttribute('fill', '#10b981');
    badgeCircle.setAttribute('stroke', 'white');
    badgeCircle.setAttribute('stroke-width', '2');

    const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    checkPath.setAttribute('d', 'M3 6 L5 8 L9 4');
    checkPath.setAttribute('stroke', 'white');
    checkPath.setAttribute('stroke-width', '2');
    checkPath.setAttribute('fill', 'none');
    checkPath.setAttribute('stroke-linecap', 'round');
    checkPath.setAttribute('stroke-linejoin', 'round');

    badge.appendChild(badgeCircle);
    badge.appendChild(checkPath);
    svg.appendChild(badge);
  }

  container.appendChild(svg);

  // Hover effect
  container.addEventListener('mouseenter', () => {
    container.style.transform = 'scale(1.15)';
  });
  container.addEventListener('mouseleave', () => {
    container.style.transform = 'scale(1)';
  });

  return container;
}

/**
 * Create a circle-with-tail marker element
 */
function createCircleElement(options: AdvancedMarkerOptions): HTMLElement {
  const size = options.size || 38;
  const config = STAGE_CONFIGURATIONS[options.icon || ''] || { ...DEFAULT_STAGE_CONFIG, color: options.color };
  const color = options.color || config.color;

  const container = document.createElement('div');
  container.className = 'advanced-marker-circle';
  container.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size + 8}px;
    cursor: pointer;
    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
    transition: transform 0.15s ease-out;
  `;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', `${size}`);
  svg.setAttribute('height', `${size + 8}`);
  svg.setAttribute('viewBox', `0 0 ${size} ${size + 8}`);
  svg.style.overflow = 'visible';

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 6) / 2;

  // Main circle
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', `${cx}`);
  circle.setAttribute('cy', `${cy}`);
  circle.setAttribute('r', `${r}`);
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '3');

  svg.appendChild(circle);

  // Tail/pointer
  const tail = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  const tailWidth = 6;
  tail.setAttribute('points', `
    ${cx},${size + 4}
    ${cx - tailWidth},${size - 6}
    ${cx + tailWidth},${size - 6}
  `);
  tail.setAttribute('fill', color);
  tail.setAttribute('stroke', 'white');
  tail.setAttribute('stroke-width', '2');
  tail.setAttribute('stroke-linejoin', 'round');

  svg.appendChild(tail);

  // Icon inside the marker (Lucide-style stroke-based icons)
  if (config.icon) {
    const iconSize = size * 0.5;
    const iconOffset = (size - iconSize) / 2;
    const iconGroup = renderLucideIcon(config.icon, iconSize, iconOffset, 0);
    svg.appendChild(iconGroup);
  }

  // Verified badge
  if (options.verified) {
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('transform', `translate(${size - 10}, 0)`);

    const badgeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badgeCircle.setAttribute('cx', '6');
    badgeCircle.setAttribute('cy', '6');
    badgeCircle.setAttribute('r', '6');
    badgeCircle.setAttribute('fill', '#10b981');
    badgeCircle.setAttribute('stroke', 'white');
    badgeCircle.setAttribute('stroke-width', '2');

    const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    checkPath.setAttribute('d', 'M3 6 L5 8 L9 4');
    checkPath.setAttribute('stroke', 'white');
    checkPath.setAttribute('stroke-width', '2');
    checkPath.setAttribute('fill', 'none');
    checkPath.setAttribute('stroke-linecap', 'round');
    checkPath.setAttribute('stroke-linejoin', 'round');

    badge.appendChild(badgeCircle);
    badge.appendChild(checkPath);
    svg.appendChild(badge);
  }

  container.appendChild(svg);

  // Hover effect
  container.addEventListener('mouseenter', () => {
    container.style.transform = 'scale(1.15)';
  });
  container.addEventListener('mouseleave', () => {
    container.style.transform = 'scale(1)';
  });

  return container;
}

/**
 * Create a marker element based on shape type
 */
export function createMarkerElement(options: AdvancedMarkerOptions): HTMLElement {
  if (options.shape === 'teardrop') {
    return createTeardropElement(options);
  }
  return createCircleElement(options);
}

/**
 * Create a marker element for a specific stage
 */
export function createStageMarkerElement(
  stageName: string,
  shape: MarkerShape,
  verified: boolean = false,
  size: number = 38
): HTMLElement {
  const config = STAGE_CONFIGURATIONS[stageName] || DEFAULT_STAGE_CONFIG;
  return createMarkerElement({
    color: config.color,
    shape,
    size,
    icon: stageName,
    verified
  });
}

/**
 * Create a property marker element
 * Uses larger size (44px) and brighter colors for better visibility against POIs
 */
export function createPropertyMarkerElement(
  type: 'verified' | 'recent' | 'geocoded' | 'default' | 'selected' | 'verifying',
  shape: MarkerShape,
  size: number = 44,  // Larger default size for better visibility
  isVerifiedLocation: boolean = false  // Show checkmark badge if location is verified
): HTMLElement {
  // Colors for property markers - all regular pins are blue, only selected/verifying are orange
  const colors: Record<string, string> = {
    verified: '#007AFF',  // Blue (same as default - no special color for verified)
    recent: '#FF3B30',    // Bright red for recently created
    geocoded: '#007AFF',  // Blue
    default: '#007AFF',   // Blue (consistent color for all regular pins)
    selected: '#FF9500',  // Bright orange for selected
    verifying: '#FF9500'  // Bright orange for verifying
  };

  const color = colors[type] || colors.default;
  const iconDef = PROPERTY_ICON_CONFIGS[type] || PROPERTY_ICON_CONFIGS.default;

  // Show checkmark badge if location is verified (passed separately from type)
  return createPropertyMarkerWithIcon(color, shape, size, iconDef, isVerifiedLocation, 4);
}

/**
 * Internal function to create a property marker with a specific icon definition
 */
function createPropertyMarkerWithIcon(
  color: string,
  shape: MarkerShape,
  size: number,
  iconDef: LucideIconDef,
  verified: boolean,
  strokeWidth: number = 3
): HTMLElement {
  if (shape === 'teardrop') {
    return createTeardropWithIcon(color, size, iconDef, verified, strokeWidth);
  }
  return createCircleWithIcon(color, size, iconDef, verified, strokeWidth);
}

/**
 * Create teardrop marker with custom icon definition
 */
function createTeardropWithIcon(
  color: string,
  size: number,
  iconDef: LucideIconDef,
  verified: boolean,
  strokeWidth: number = 3
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'advanced-marker-teardrop';
  container.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size + 10}px;
    cursor: pointer;
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
    transition: transform 0.15s ease-out;
  `;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', `${size}`);
  svg.setAttribute('height', `${size + 10}`);
  svg.setAttribute('viewBox', `0 0 ${size} ${size + 10}`);
  svg.style.overflow = 'visible';

  const cx = size / 2;
  const r = (size - 6) / 2;
  const tipY = size + 6;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = `
    M ${cx} ${tipY}
    C ${cx - r * 0.6} ${size - 2}, ${cx - r} ${r + 6}, ${cx - r} ${r + 3}
    A ${r} ${r} 0 1 1 ${cx + r} ${r + 3}
    C ${cx + r} ${r + 6}, ${cx + r * 0.6} ${size - 2}, ${cx} ${tipY}
    Z
  `;
  path.setAttribute('d', d);
  path.setAttribute('fill', color);
  path.setAttribute('stroke', 'white');
  path.setAttribute('stroke-width', `${strokeWidth}`);
  svg.appendChild(path);

  // Add icon
  const iconSize = size * 0.45;
  const iconOffset = (size - iconSize) / 2;
  const iconGroup = renderLucideIcon(iconDef, iconSize, iconOffset, -2);
  svg.appendChild(iconGroup);

  // Verified badge
  if (verified) {
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('transform', `translate(${size - 10}, 2)`);

    const badgeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badgeCircle.setAttribute('cx', '6');
    badgeCircle.setAttribute('cy', '6');
    badgeCircle.setAttribute('r', '6');
    badgeCircle.setAttribute('fill', '#10b981');
    badgeCircle.setAttribute('stroke', 'white');
    badgeCircle.setAttribute('stroke-width', '2');

    const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    checkPath.setAttribute('d', 'M3 6 L5 8 L9 4');
    checkPath.setAttribute('stroke', 'white');
    checkPath.setAttribute('stroke-width', '2');
    checkPath.setAttribute('fill', 'none');
    checkPath.setAttribute('stroke-linecap', 'round');
    checkPath.setAttribute('stroke-linejoin', 'round');

    badge.appendChild(badgeCircle);
    badge.appendChild(checkPath);
    svg.appendChild(badge);
  }

  container.appendChild(svg);

  container.addEventListener('mouseenter', () => {
    container.style.transform = 'scale(1.15)';
  });
  container.addEventListener('mouseleave', () => {
    container.style.transform = 'scale(1)';
  });

  return container;
}

/**
 * Create circle marker with custom icon definition
 */
function createCircleWithIcon(
  color: string,
  size: number,
  iconDef: LucideIconDef,
  verified: boolean,
  strokeWidth: number = 3
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'advanced-marker-circle';
  container.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size + 8}px;
    cursor: pointer;
    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
    transition: transform 0.15s ease-out;
  `;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', `${size}`);
  svg.setAttribute('height', `${size + 8}`);
  svg.setAttribute('viewBox', `0 0 ${size} ${size + 8}`);
  svg.style.overflow = 'visible';

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 6) / 2;

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', `${cx}`);
  circle.setAttribute('cy', `${cy}`);
  circle.setAttribute('r', `${r}`);
  circle.setAttribute('fill', color);
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', `${strokeWidth}`);
  svg.appendChild(circle);

  const tail = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  const tailWidth = 6;
  tail.setAttribute('points', `${cx},${size + 4} ${cx - tailWidth},${size - 6} ${cx + tailWidth},${size - 6}`);
  tail.setAttribute('fill', color);
  tail.setAttribute('stroke', 'white');
  tail.setAttribute('stroke-width', `${Math.max(2, strokeWidth - 1)}`);
  tail.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(tail);

  // Add icon
  const iconSize = size * 0.5;
  const iconOffset = (size - iconSize) / 2;
  const iconGroup = renderLucideIcon(iconDef, iconSize, iconOffset, 0);
  svg.appendChild(iconGroup);

  // Verified badge
  if (verified) {
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('transform', `translate(${size - 10}, 0)`);

    const badgeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badgeCircle.setAttribute('cx', '6');
    badgeCircle.setAttribute('cy', '6');
    badgeCircle.setAttribute('r', '6');
    badgeCircle.setAttribute('fill', '#10b981');
    badgeCircle.setAttribute('stroke', 'white');
    badgeCircle.setAttribute('stroke-width', '2');

    const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    checkPath.setAttribute('d', 'M3 6 L5 8 L9 4');
    checkPath.setAttribute('stroke', 'white');
    checkPath.setAttribute('stroke-width', '2');
    checkPath.setAttribute('fill', 'none');
    checkPath.setAttribute('stroke-linecap', 'round');
    checkPath.setAttribute('stroke-linejoin', 'round');

    badge.appendChild(badgeCircle);
    badge.appendChild(checkPath);
    svg.appendChild(badge);
  }

  container.appendChild(svg);

  container.addEventListener('mouseenter', () => {
    container.style.transform = 'scale(1.15)';
  });
  container.addEventListener('mouseleave', () => {
    container.style.transform = 'scale(1)';
  });

  return container;
}

/**
 * Create a user location marker (blue dot style)
 */
export function createUserLocationElement(size: number = 24): HTMLElement {
  const container = document.createElement('div');
  container.className = 'user-location-marker';
  container.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size}px;
    cursor: pointer;
  `;

  // Pulsing background circle
  const pulse = document.createElement('div');
  pulse.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${size * 2}px;
    height: ${size * 2}px;
    background: rgba(66, 133, 244, 0.2);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: pulse 2s ease-out infinite;
  `;
  container.appendChild(pulse);

  // Main blue dot
  const dot = document.createElement('div');
  dot.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${size}px;
    height: ${size}px;
    background: #4285F4;
    border: 3px solid white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  `;
  container.appendChild(dot);

  // Add pulse animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
    }
  `;
  container.appendChild(style);

  return container;
}

/**
 * Create an initial location marker (purple pin)
 */
export function createInitialLocationElement(
  shape: MarkerShape,
  size: number = 44
): HTMLElement {
  return createMarkerElement({
    color: '#8B5CF6', // Purple
    shape,
    size,
    icon: 'Unassigned Territory' // Uses the map pin icon
  });
}

/**
 * Get stage config for a given stage name
 */
export function getStageConfig(stageName: string): StageConfig {
  return STAGE_CONFIGURATIONS[stageName] || DEFAULT_STAGE_CONFIG;
}

/**
 * Create an AdvancedMarkerElement with custom HTML content
 * @param map - The Google Map instance
 * @param position - The marker position
 * @param content - The HTML element to use as the marker content
 * @param options - Additional marker options
 */
export function createAdvancedMarker(
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  content: HTMLElement,
  options: {
    title?: string;
    zIndex?: number;
    gmpDraggable?: boolean;
  } = {}
): google.maps.marker.AdvancedMarkerElement {
  const lib = getMarkerLibrary();
  const { AdvancedMarkerElement } = lib;

  const marker = new AdvancedMarkerElement({
    map,
    position,
    content,
    title: options.title,
    zIndex: options.zIndex,
    gmpDraggable: options.gmpDraggable
  });

  return marker;
}

/**
 * Create a stage marker using AdvancedMarkerElement
 */
export async function createAdvancedStageMarker(
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  stageName: string,
  shape: MarkerShape,
  options: {
    verified?: boolean;
    size?: number;
    title?: string;
    zIndex?: number;
    gmpDraggable?: boolean;
  } = {}
): Promise<google.maps.marker.AdvancedMarkerElement> {
  // Ensure library is loaded
  await loadMarkerLibrary();

  const content = createStageMarkerElement(
    stageName,
    shape,
    options.verified || false,
    options.size || 38
  );

  return createAdvancedMarker(map, position, content, {
    title: options.title,
    zIndex: options.zIndex,
    gmpDraggable: options.gmpDraggable
  });
}

/**
 * Create a property marker using AdvancedMarkerElement
 */
export async function createAdvancedPropertyMarker(
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  type: 'verified' | 'recent' | 'geocoded' | 'default' | 'selected' | 'verifying',
  shape: MarkerShape,
  options: {
    size?: number;
    title?: string;
    zIndex?: number;
    gmpDraggable?: boolean;
  } = {}
): Promise<google.maps.marker.AdvancedMarkerElement> {
  // Ensure library is loaded
  await loadMarkerLibrary();

  const content = createPropertyMarkerElement(
    type,
    shape,
    options.size || 44  // Larger default size for property markers
  );

  return createAdvancedMarker(map, position, content, {
    title: options.title,
    zIndex: options.zIndex,
    gmpDraggable: options.gmpDraggable
  });
}

/**
 * Create a user location marker using AdvancedMarkerElement
 */
export async function createAdvancedUserLocationMarker(
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  options: {
    size?: number;
    title?: string;
    zIndex?: number;
  } = {}
): Promise<google.maps.marker.AdvancedMarkerElement> {
  // Ensure library is loaded
  await loadMarkerLibrary();

  const content = createUserLocationElement(options.size || 24);

  return createAdvancedMarker(map, position, content, {
    title: options.title || 'Your Location',
    zIndex: options.zIndex || 1000
  });
}

/**
 * Create an initial location marker using AdvancedMarkerElement
 */
export async function createAdvancedInitialLocationMarker(
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  shape: MarkerShape,
  options: {
    size?: number;
    title?: string;
    zIndex?: number;
  } = {}
): Promise<google.maps.marker.AdvancedMarkerElement> {
  // Ensure library is loaded
  await loadMarkerLibrary();

  const content = createInitialLocationElement(shape, options.size || 44);

  return createAdvancedMarker(map, position, content, {
    title: options.title || 'Your Initial Location',
    zIndex: options.zIndex
  });
}
