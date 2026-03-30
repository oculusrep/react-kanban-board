import React, { useState, useCallback, useMemo } from 'react';
import GoogleMapContainer from '../mapping/GoogleMapContainer';
import PropertyLayer from '../mapping/layers/PropertyLayer';
import { LayerManagerProvider } from '../mapping/layers/LayerManager';
import { PropertySearchResult } from '../../types/advanced-search';

interface SearchMapViewProps {
  results: PropertySearchResult[];
  selectedPropertyId: string | null;
  onPropertySelect: (propertyId: string) => void;
}

// Convert search results to the format expected by PropertyLayer
function convertToPropertyFormat(results: PropertySearchResult[]) {
  return results.map(result => ({
    id: result.id,
    property_name: result.property_name,
    address: result.address,
    city: result.city,
    state: result.state,
    zip: result.zip,
    latitude: result.latitude ? Number(result.latitude) : null,
    longitude: result.longitude ? Number(result.longitude) : null,
    verified_latitude: result.verified_latitude ? Number(result.verified_latitude) : null,
    verified_longitude: result.verified_longitude ? Number(result.verified_longitude) : null,
    property_notes: result.property_notes,
    rent_psf: result.rent_psf ? Number(result.rent_psf) : null,
    nnn_psf: result.nnn_psf ? Number(result.nnn_psf) : null,
    acres: result.acres ? Number(result.acres) : null,
    building_sqft: result.building_sqft ? Number(result.building_sqft) : null,
    available_sqft: result.available_sqft ? Number(result.available_sqft) : null,
    asking_purchase_price: result.asking_purchase_price ? Number(result.asking_purchase_price) : null,
    asking_lease_price: result.asking_lease_price ? Number(result.asking_lease_price) : null,
    lease_expiration_date: result.lease_expiration_date,
    property_record_type: result.property_record_type,
    // Required fields with defaults
    sf_id: null,
    description: result.description,
    landlord: result.landlord,
    country: result.country,
    county: result.county,
    trade_area: result.trade_area,
    parcel_id: result.parcel_id,
    all_in_rent: result.all_in_rent ? Number(result.all_in_rent) : null,
    costar_link: result.costar_link,
    reonomy_link: result.reonomy_link,
    map_link: result.map_link,
    marketing_materials: result.marketing_materials,
    site_plan: result.site_plan,
    tax_url: result.tax_url,
    layer_notes: result.layer_notes,
    property_type_id: null,
    property_stage_id: null,
    property_record_type_id: null,
    deal_type_id: null,
    contact_id: null,
    contact_made: null,
    letter_sent: null,
    created_by_id: null,
    owner_id: null,
    created_at: null,
    updated_at: null,
    // Demographics (excluded from search but needed for type)
    '1_mile_pop': null,
    '3_mile_pop': null,
    hh_income_median_3_mile: null,
    demographics: null,
    total_traffic: null,
    traffic_count: null,
    traffic_count_2nd: null,
  }));
}

export default function SearchMapView({
  results,
  selectedPropertyId,
  onPropertySelect,
}: SearchMapViewProps) {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

  // Convert results to property format
  const mapProperties = useMemo(() => convertToPropertyFormat(results), [results]);

  // Calculate center based on results
  const defaultCenter = useMemo(() => {
    if (results.length === 0) {
      // Default to US center
      return { lat: 39.8283, lng: -98.5795 };
    }

    // Find center of all valid coordinates
    const validCoords = results
      .map(r => {
        const lat = r.verified_latitude || r.latitude;
        const lng = r.verified_longitude || r.longitude;
        if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
        return null;
      })
      .filter((c): c is { lat: number; lng: number } => c !== null);

    if (validCoords.length === 0) {
      return { lat: 39.8283, lng: -98.5795 };
    }

    const avgLat = validCoords.reduce((sum, c) => sum + c.lat, 0) / validCoords.length;
    const avgLng = validCoords.reduce((sum, c) => sum + c.lng, 0) / validCoords.length;

    return { lat: avgLat, lng: avgLng };
  }, [results]);

  // Calculate zoom based on results spread
  const defaultZoom = useMemo(() => {
    if (results.length === 0) return 4;
    if (results.length === 1) return 15;

    const validCoords = results
      .map(r => {
        const lat = r.verified_latitude || r.latitude;
        const lng = r.verified_longitude || r.longitude;
        if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
        return null;
      })
      .filter((c): c is { lat: number; lng: number } => c !== null);

    if (validCoords.length <= 1) return 15;

    const lats = validCoords.map(c => c.lat);
    const lngs = validCoords.map(c => c.lng);

    const latSpread = Math.max(...lats) - Math.min(...lats);
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);

    const maxSpread = Math.max(latSpread, lngSpread);

    if (maxSpread > 20) return 4;
    if (maxSpread > 10) return 5;
    if (maxSpread > 5) return 6;
    if (maxSpread > 2) return 7;
    if (maxSpread > 1) return 8;
    if (maxSpread > 0.5) return 10;
    if (maxSpread > 0.1) return 12;
    return 14;
  }, [results]);

  const handlePinClick = useCallback((property: { id: string }) => {
    onPropertySelect(property.id);
  }, [onPropertySelect]);

  return (
    <LayerManagerProvider>
      <div className="h-full w-full">
        <GoogleMapContainer
          onMapLoad={setMapInstance}
          defaultCenter={defaultCenter}
          defaultZoom={defaultZoom}
          height="100%"
          width="100%"
        />
        {mapInstance && (
          <PropertyLayer
            map={mapInstance}
            isVisible={true}
            loadingConfig={{ mode: 'static-all' }}
            customProperties={mapProperties}
            selectedPropertyId={selectedPropertyId}
            onPinClick={handlePinClick}
          />
        )}
      </div>
    </LayerManagerProvider>
  );
}
