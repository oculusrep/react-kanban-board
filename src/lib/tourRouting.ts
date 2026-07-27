// Pure helpers for tour route scheduling — coordinate resolution and time math.
// No Google Maps or Supabase deps so this stays unit-testable.

export interface LatLng {
  lat: number;
  lng: number;
}

// Precedence (see feedback_coordinate_resolution):
// site_submit.verified → property.verified → site_submit.sf_property → property.lat/lng
export interface StopCoordSource {
  verified_latitude: number | null;
  verified_longitude: number | null;
  sf_property_latitude: number | null;
  sf_property_longitude: number | null;
  property?: {
    latitude: number | null;
    longitude: number | null;
    verified_latitude: number | null;
    verified_longitude: number | null;
  } | null;
}

export function resolveStopCoord(ss: StopCoordSource | null | undefined): LatLng | null {
  if (!ss) return null;
  if (ss.verified_latitude != null && ss.verified_longitude != null) {
    return { lat: ss.verified_latitude, lng: ss.verified_longitude };
  }
  const p = ss.property;
  if (p?.verified_latitude != null && p?.verified_longitude != null) {
    return { lat: p.verified_latitude, lng: p.verified_longitude };
  }
  if (ss.sf_property_latitude != null && ss.sf_property_longitude != null) {
    return { lat: ss.sf_property_latitude, lng: ss.sf_property_longitude };
  }
  if (p?.latitude != null && p?.longitude != null) {
    return { lat: p.latitude, lng: p.longitude };
  }
  return null;
}

// "HH:MM" or "HH:MM:SS" -> minutes since midnight (null if unset).
export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function minutesToHHMM(min: number): string {
  const wrapped = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMinutesDuration(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export interface ScheduledStop {
  arrivalMin: number; // clock minutes since midnight (if startMin known), else elapsed
  departMin: number;
}

export interface DaySchedule {
  stops: ScheduledStop[];
  finishMin: number;
  totalDriveMin: number;
  totalStopMin: number;
  hasStart: boolean;
}

// legSeconds: driving seconds between consecutive stops (length = stops-1).
// stopDurationsMin: service minutes per stop (length = stops).
// startMin: day start (minutes since midnight) or null (then times are elapsed from 0).
// opts.leadSeconds: drive from a start address to the first stop (added before first arrival).
// opts.tailSeconds: drive from the last stop to an end address (added to the finish time).
export function computeDaySchedule(
  startMin: number | null,
  legSeconds: number[],
  stopDurationsMin: number[],
  opts?: { leadSeconds?: number; tailSeconds?: number }
): DaySchedule {
  const base = startMin ?? 0;
  const stops: ScheduledStop[] = [];
  let cursor = base;
  let totalDrive = 0;
  const totalStop = stopDurationsMin.reduce((a, b) => a + b, 0);

  const lead = (opts?.leadSeconds ?? 0) / 60;
  if (lead > 0) {
    totalDrive += lead;
    cursor += lead;
  }

  for (let i = 0; i < stopDurationsMin.length; i++) {
    if (i > 0) {
      const legMin = (legSeconds[i - 1] ?? 0) / 60;
      totalDrive += legMin;
      cursor += legMin;
    }
    const arrival = cursor;
    const depart = arrival + stopDurationsMin[i];
    stops.push({ arrivalMin: arrival, departMin: depart });
    cursor = depart;
  }

  const tail = (opts?.tailSeconds ?? 0) / 60;
  if (tail > 0) {
    totalDrive += tail;
    cursor += tail;
  }

  return {
    stops,
    finishMin: cursor,
    totalDriveMin: totalDrive,
    totalStopMin: totalStop,
    hasStart: startMin != null,
  };
}

// Per-day marker/route color palette (brand-leaning, distinct hues).
export const DAY_COLORS = ['#002147', '#4A6B94', '#A27B5C', '#3F7D5C', '#7A4A94', '#94623F'];
export function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length];
}
