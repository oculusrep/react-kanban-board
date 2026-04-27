// Icon rendering for custom point layers.
//
// A point-type map_layer carries an `icon_config` JSONB describing how its
// markers should look. The renderer in CustomLayerLayer calls
// `buildPointIcon(iconConfig)` to get a google.maps.Icon (data-URI SVG) for
// each marker.
//
// Adding a new built-in icon: add a case to renderInnerIcon() and document the
// name in POINT_ICON_NAMES so future picker UIs can list it.

export type PointIconShape = 'circle' | 'square' | 'diamond';
export type PointIconName = 'bullseye' | 'storefront' | 'pin' | 'flag' | 'dot';

export interface PointIconConfig {
  shape?: PointIconShape;          // outer shape; default 'circle'
  fill?: string;                   // outer fill hex; default '#FACC15' (yellow)
  stroke?: string;                 // outer stroke hex; default '#1F2937'
  strokeWidth?: number;            // outer stroke px; default 2
  size?: number;                   // total px; default 28
  icon?: PointIconName;            // inner icon name; default 'dot'
  iconColor?: string;              // inner icon fill hex; default '#000000'
  labelField?: string;             // attributes key to show on hover/click
  labelOnHover?: boolean;          // default true
}

export const POINT_ICON_NAMES: PointIconName[] = [
  'bullseye',
  'storefront',
  'pin',
  'flag',
  'dot',
];

const DEFAULTS: Required<Omit<PointIconConfig, 'labelField'>> = {
  shape: 'circle',
  fill: '#FACC15',
  stroke: '#1F2937',
  strokeWidth: 2,
  size: 28,
  icon: 'dot',
  iconColor: '#000000',
  labelOnHover: true,
};

export function resolveIconConfig(input: PointIconConfig | null | undefined): Required<Omit<PointIconConfig, 'labelField'>> & { labelField?: string } {
  return {
    ...DEFAULTS,
    ...(input || {}),
  };
}

// Build a google.maps.Icon from an icon_config. The marker SVG is encoded as a
// data URI so it works without any external asset hosting.
export function buildPointIcon(input: PointIconConfig | null | undefined): google.maps.Icon {
  const cfg = resolveIconConfig(input);
  const svg = renderMarkerSvg(cfg);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return {
    url,
    scaledSize: new google.maps.Size(cfg.size, cfg.size),
    anchor: new google.maps.Point(cfg.size / 2, cfg.size / 2),
  };
}

function renderMarkerSvg(cfg: Required<Omit<PointIconConfig, 'labelField'>>): string {
  const s = cfg.size;
  const half = s / 2;
  const r = half - cfg.strokeWidth;
  const outer = renderOuterShape(cfg.shape, half, r, cfg.fill, cfg.stroke, cfg.strokeWidth);
  const inner = renderInnerIcon(cfg.icon, half, r, cfg.iconColor);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${outer}${inner}</svg>`;
}

function renderOuterShape(
  shape: PointIconShape,
  half: number,
  r: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
): string {
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"`;
  switch (shape) {
    case 'square':
      return `<rect x="${half - r}" y="${half - r}" width="${r * 2}" height="${r * 2}" rx="3" ${common} />`;
    case 'diamond':
      return `<polygon points="${half},${half - r} ${half + r},${half} ${half},${half + r} ${half - r},${half}" ${common} />`;
    case 'circle':
    default:
      return `<circle cx="${half}" cy="${half}" r="${r}" ${common} />`;
  }
}

function renderInnerIcon(name: PointIconName, half: number, r: number, color: string): string {
  switch (name) {
    case 'bullseye': {
      // Three concentric rings + center dot, scaled to fit inside outer shape.
      const ring1 = r * 0.70;
      const ring2 = r * 0.45;
      const dot = r * 0.18;
      return `
        <circle cx="${half}" cy="${half}" r="${ring1}" fill="none" stroke="${color}" stroke-width="${Math.max(1.5, r * 0.10)}" />
        <circle cx="${half}" cy="${half}" r="${ring2}" fill="none" stroke="${color}" stroke-width="${Math.max(1.5, r * 0.10)}" />
        <circle cx="${half}" cy="${half}" r="${dot}" fill="${color}" />
      `;
    }
    case 'storefront': {
      // Simple awning + door silhouette.
      const w = r * 1.2;
      const h = r * 1.1;
      const x = half - w / 2;
      const y = half - h / 2;
      const doorW = w * 0.30;
      const doorH = h * 0.55;
      const awning = h * 0.25;
      return `
        <rect x="${x}" y="${y + awning}" width="${w}" height="${h - awning}" fill="${color}" />
        <rect x="${x}" y="${y}" width="${w}" height="${awning}" fill="${color}" opacity="0.85" />
        <rect x="${half - doorW / 2}" y="${y + h - doorH}" width="${doorW}" height="${doorH}" fill="#FFFFFF" opacity="0.85" />
      `;
    }
    case 'pin': {
      // Solid teardrop pointing down.
      const top = half - r * 0.85;
      const tip = half + r * 0.85;
      const w = r * 0.55;
      return `
        <path d="M ${half} ${top}
                 C ${half + w} ${top}, ${half + w} ${half + r * 0.1}, ${half} ${tip}
                 C ${half - w} ${half + r * 0.1}, ${half - w} ${top}, ${half} ${top} Z"
              fill="${color}" />
        <circle cx="${half}" cy="${half - r * 0.25}" r="${r * 0.20}" fill="#FFFFFF" />
      `;
    }
    case 'flag': {
      const poleX = half - r * 0.5;
      const poleTop = half - r * 0.8;
      const poleBottom = half + r * 0.8;
      const flagW = r * 0.85;
      const flagH = r * 0.55;
      return `
        <line x1="${poleX}" y1="${poleTop}" x2="${poleX}" y2="${poleBottom}" stroke="${color}" stroke-width="${Math.max(1.5, r * 0.12)}" stroke-linecap="round" />
        <polygon points="${poleX},${poleTop} ${poleX + flagW},${poleTop + flagH * 0.4} ${poleX},${poleTop + flagH}" fill="${color}" />
      `;
    }
    case 'dot':
    default:
      return `<circle cx="${half}" cy="${half}" r="${r * 0.35}" fill="${color}" />`;
  }
}
