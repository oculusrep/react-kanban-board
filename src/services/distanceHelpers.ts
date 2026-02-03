/**
 * Helper functions for integrating distance information into UI components
 */

import {
  calculateStraightLineDistance,
  calculateDrivingDistanceWithCache,
  formatDistance,
  formatDuration,
  type LatLng,
  type TravelMode,
} from './distanceService';

/**
 * Calculate and format distance from user's GPS location to a target
 * Returns formatted HTML string that can be inserted into info windows
 */
export async function getDistanceInfoHTML(
  userLocation: LatLng | null,
  targetLocation: LatLng,
  options?: {
    mode?: TravelMode;
    includeTraffic?: boolean;
    showStraightLine?: boolean;
  }
): Promise<string> {
  const { mode = 'DRIVING', includeTraffic = true, showStraightLine = true } = options || {};

  if (!userLocation) {
    return `
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
        <div>📍 Enable GPS tracking to see distance from your location</div>
      </div>
    `;
  }

  // Calculate straight-line distance
  const straightLine = calculateStraightLineDistance(userLocation, targetLocation);
  const straightLineFormatted = formatDistance(straightLine);

  // Start building HTML
  let html = `
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
      <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
        Distance from your location
      </div>
  `;

  if (showStraightLine) {
    html += `
      <div style="font-size: 12px; color: #374151; margin-bottom: 4px;">
        <strong>As the crow flies:</strong> ${straightLineFormatted}
      </div>
    `;
  }

  // Try to get driving distance (async)
  try {
    const driving = await calculateDrivingDistanceWithCache(userLocation, targetLocation, {
      mode,
      includeTraffic,
    });

    const modeLabel = mode === 'DRIVING' ? 'Driving' : mode === 'WALKING' ? 'Walking' : mode === 'BICYCLING' ? 'Bicycling' : 'Transit';

    html += `
      <div style="font-size: 12px; color: #1a73e8; margin-bottom: 2px;">
        <strong>${modeLabel}:</strong> ${driving.distance.text}
      </div>
      <div style="font-size: 12px; color: #374151; margin-bottom: 2px;">
        <strong>Time:</strong> ${driving.duration.text}
      </div>
    `;

    if (driving.durationInTraffic && mode === 'DRIVING') {
      html += `
        <div style="font-size: 11px; color: #ea4335;">
          <strong>In traffic:</strong> ${driving.durationInTraffic.text}
        </div>
      `;
    }
  } catch (error) {
    console.error('Error calculating driving distance:', error);
    html += `
      <div style="font-size: 11px; color: #9ca3af; font-style: italic;">
        Driving distance unavailable
      </div>
    `;
  }

  html += `</div>`;

  return html;
}

/**
 * Calculate distance information and return as an object
 * Useful for React components
 */
export async function getDistanceInfo(
  userLocation: LatLng | null,
  targetLocation: LatLng,
  options?: {
    mode?: TravelMode;
    includeTraffic?: boolean;
  }
): Promise<{
  straightLine: string;
  driving?: {
    distance: string;
    duration: string;
    durationInTraffic?: string;
  };
  error?: string;
} | null> {
  const { mode = 'DRIVING', includeTraffic = true } = options || {};

  if (!userLocation) {
    return null;
  }

  // Calculate straight-line distance
  const straightLine = calculateStraightLineDistance(userLocation, targetLocation);
  const straightLineFormatted = formatDistance(straightLine);

  const result: {
    straightLine: string;
    driving?: {
      distance: string;
      duration: string;
      durationInTraffic?: string;
    };
    error?: string;
  } = {
    straightLine: straightLineFormatted,
  };

  // Try to get driving distance
  try {
    const driving = await calculateDrivingDistanceWithCache(userLocation, targetLocation, {
      mode,
      includeTraffic,
    });

    result.driving = {
      distance: driving.distance.text,
      duration: driving.duration.text,
      durationInTraffic: driving.durationInTraffic?.text,
    };
  } catch (error) {
    console.error('Error calculating driving distance:', error);
    result.error = 'Driving distance unavailable';
  }

  return result;
}

/**
 * Add distance information to an existing info window
 * This modifies the info window content to include distance data
 */
export async function addDistanceToInfoWindow(
  infoWindow: google.maps.InfoWindow,
  userLocation: LatLng | null,
  targetLocation: LatLng,
  options?: {
    mode?: TravelMode;
    includeTraffic?: boolean;
    showStraightLine?: boolean;
  }
): Promise<void> {
  const distanceHTML = await getDistanceInfoHTML(userLocation, targetLocation, options);
  const currentContent = infoWindow.getContent() as string;

  // Append distance info before the closing div
  const updatedContent = currentContent.replace(
    /<\/div>\s*$/,
    `${distanceHTML}</div>`
  );

  infoWindow.setContent(updatedContent);
}
