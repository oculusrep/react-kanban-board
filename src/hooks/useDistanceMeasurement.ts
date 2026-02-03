/**
 * React Hook for Distance Measurement
 *
 * Manages state and interactions for measuring distances on the map:
 * - Point-to-point measurement
 * - Distance from user's current location
 * - Multiple measurement points
 * - Travel mode switching (driving, walking, etc.)
 */

import { useState, useCallback, useEffect } from 'react';
import {
  calculateStraightLineDistance,
  calculateDrivingDistanceWithCache,
  formatDistance,
  formatDuration,
  type LatLng,
  type StraightLineDistance,
  type DrivingDistanceResult,
  type TravelMode,
} from '../services/distanceService';

export interface MeasurementPoint {
  position: LatLng;
  label?: string;
  marker?: google.maps.Marker;
}

export interface DistanceMeasurement {
  from: MeasurementPoint;
  to: MeasurementPoint;
  straightLine: StraightLineDistance;
  driving?: DrivingDistanceResult;
  mode: TravelMode;
  calculating: boolean;
}

interface UseDistanceMeasurementOptions {
  autoCalculateDriving?: boolean;
  defaultMode?: TravelMode;
  includeTraffic?: boolean;
}

export function useDistanceMeasurement(options: UseDistanceMeasurementOptions = {}) {
  const {
    autoCalculateDriving = true,
    defaultMode = 'DRIVING',
    includeTraffic = true,
  } = options;

  const [isActive, setIsActive] = useState(false);
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [measurements, setMeasurements] = useState<DistanceMeasurement[]>([]);
  const [mode, setMode] = useState<TravelMode>(defaultMode);
  const [calculating, setCalculating] = useState(false);

  /**
   * Start distance measurement mode
   */
  const startMeasurement = useCallback(() => {
    setIsActive(true);
    setPoints([]);
    setMeasurements([]);
  }, []);

  /**
   * Stop distance measurement mode and clear all points
   */
  const stopMeasurement = useCallback(() => {
    setIsActive(false);
    setPoints([]);
    setMeasurements([]);
  }, []);

  /**
   * Add a measurement point
   */
  const addPoint = useCallback(
    async (point: MeasurementPoint) => {
      const newPoints = [...points, point];
      setPoints(newPoints);

      // If we have at least 2 points, calculate distance to previous point
      if (newPoints.length >= 2) {
        const from = newPoints[newPoints.length - 2];
        const to = newPoints[newPoints.length - 1];

        // Calculate straight-line distance immediately
        const straightLine = calculateStraightLineDistance(from.position, to.position);

        const measurement: DistanceMeasurement = {
          from,
          to,
          straightLine,
          mode,
          calculating: autoCalculateDriving,
        };

        setMeasurements(prev => [...prev, measurement]);

        // Calculate driving distance asynchronously if enabled
        if (autoCalculateDriving) {
          try {
            setCalculating(true);
            const driving = await calculateDrivingDistanceWithCache(
              from.position,
              to.position,
              { mode, includeTraffic }
            );

            setMeasurements(prev =>
              prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, driving, calculating: false } : m
              )
            );
          } catch (error) {
            console.error('Error calculating driving distance:', error);
            setMeasurements(prev =>
              prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, calculating: false } : m
              )
            );
          } finally {
            setCalculating(false);
          }
        }
      }
    },
    [points, mode, autoCalculateDriving, includeTraffic]
  );

  /**
   * Remove the last point
   */
  const removeLastPoint = useCallback(() => {
    if (points.length > 0) {
      setPoints(prev => prev.slice(0, -1));
      setMeasurements(prev => prev.slice(0, -1));
    }
  }, [points.length]);

  /**
   * Clear all points but stay in measurement mode
   */
  const clearPoints = useCallback(() => {
    setPoints([]);
    setMeasurements([]);
  }, []);

  /**
   * Change travel mode and recalculate driving distances
   */
  const changeTravelMode = useCallback(
    async (newMode: TravelMode) => {
      setMode(newMode);

      if (measurements.length > 0 && autoCalculateDriving) {
        setCalculating(true);

        const updatedMeasurements = await Promise.all(
          measurements.map(async measurement => {
            try {
              const driving = await calculateDrivingDistanceWithCache(
                measurement.from.position,
                measurement.to.position,
                { mode: newMode, includeTraffic }
              );
              return { ...measurement, mode: newMode, driving, calculating: false };
            } catch (error) {
              console.error('Error recalculating distance:', error);
              return { ...measurement, mode: newMode, calculating: false };
            }
          })
        );

        setMeasurements(updatedMeasurements);
        setCalculating(false);
      }
    },
    [measurements, autoCalculateDriving, includeTraffic]
  );

  /**
   * Calculate distance from a point to user's current location
   */
  const calculateDistanceFromUserLocation = useCallback(
    async (
      userLocation: LatLng,
      targetLocation: LatLng,
      travelMode: TravelMode = mode
    ): Promise<{
      straightLine: StraightLineDistance;
      driving?: DrivingDistanceResult;
    }> => {
      const straightLine = calculateStraightLineDistance(userLocation, targetLocation);

      let driving: DrivingDistanceResult | undefined;

      if (autoCalculateDriving) {
        try {
          driving = await calculateDrivingDistanceWithCache(userLocation, targetLocation, {
            mode: travelMode,
            includeTraffic,
          });
        } catch (error) {
          console.error('Error calculating driving distance from user location:', error);
        }
      }

      return { straightLine, driving };
    },
    [mode, autoCalculateDriving, includeTraffic]
  );

  /**
   * Get total distance for all measurement segments
   */
  const getTotalDistance = useCallback(() => {
    const straightLineTotal = measurements.reduce(
      (total, m) => total + m.straightLine.meters,
      0
    );

    const drivingTotal = measurements.reduce((total, m) => {
      if (m.driving?.distance) {
        return total + m.driving.distance.value;
      }
      return total;
    }, 0);

    const durationTotal = measurements.reduce((total, m) => {
      if (m.driving?.duration) {
        return total + m.driving.duration.value;
      }
      return total;
    }, 0);

    const durationInTrafficTotal = measurements.reduce((total, m) => {
      if (m.driving?.durationInTraffic) {
        return total + m.driving.durationInTraffic.value;
      }
      return total;
    }, 0);

    return {
      straightLine: {
        meters: straightLineTotal,
        kilometers: straightLineTotal / 1000,
        miles: straightLineTotal / 1609.34,
        feet: straightLineTotal * 3.28084,
      },
      driving: measurements.every(m => m.driving)
        ? {
            meters: drivingTotal,
            kilometers: drivingTotal / 1000,
            miles: drivingTotal / 1609.34,
            formatted: formatDistance({
              meters: drivingTotal,
              kilometers: drivingTotal / 1000,
              miles: drivingTotal / 1609.34,
              feet: drivingTotal * 3.28084,
            }),
          }
        : undefined,
      duration: durationTotal > 0 ? formatDuration(durationTotal) : undefined,
      durationInTraffic:
        durationInTrafficTotal > 0 ? formatDuration(durationInTrafficTotal) : undefined,
    };
  }, [measurements]);

  return {
    // State
    isActive,
    points,
    measurements,
    mode,
    calculating,

    // Actions
    startMeasurement,
    stopMeasurement,
    addPoint,
    removeLastPoint,
    clearPoints,
    changeTravelMode,
    calculateDistanceFromUserLocation,
    getTotalDistance,

    // Computed
    hasPoints: points.length > 0,
    hasMeasurements: measurements.length > 0,
    pointCount: points.length,
  };
}
