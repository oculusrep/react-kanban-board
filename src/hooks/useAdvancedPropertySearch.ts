import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  FilterGroup,
  FilterCondition,
  PropertySearchResult,
  PropertyUnitMatch,
  SortConfig,
} from '../types/advanced-search';

interface SearchParams {
  filterGroups: FilterGroup[];
  pageSize: number;
  offset: number;
  sortConfig: SortConfig | null;
}

interface SearchResult {
  data: PropertySearchResult[];
  count: number;
}

// Convert a single condition to Supabase filter format
function conditionToFilter(condition: FilterCondition): string | null {
  if (!condition.field || !condition.operator) return null;

  const fieldName = condition.field.key;
  const { operator, value, value2 } = condition;

  switch (operator) {
    case 'contains':
      return `${fieldName}.ilike.%${value}%`;
    case 'equals':
      return `${fieldName}.eq.${value}`;
    case 'starts_with':
      return `${fieldName}.ilike.${value}%`;
    case 'is_empty':
      return `${fieldName}.is.null`;
    case 'is_not_empty':
      return `${fieldName}.not.is.null`;
    case 'greater_than':
      return `${fieldName}.gt.${value}`;
    case 'less_than':
      return `${fieldName}.lt.${value}`;
    case 'between':
      return `and(${fieldName}.gte.${value},${fieldName}.lte.${value2})`;
    case 'before':
      return `${fieldName}.lt.${value}`;
    case 'after':
      return `${fieldName}.gt.${value}`;
    case 'is_true':
      return `${fieldName}.eq.true`;
    case 'is_false':
      return `${fieldName}.eq.false`;
    default:
      return null;
  }
}

// Separate filter groups by table (property vs property_unit)
function separateFiltersByTable(filterGroups: FilterGroup[]): {
  propertyGroups: FilterGroup[];
  unitGroups: FilterGroup[];
} {
  const propertyGroups: FilterGroup[] = [];
  const unitGroups: FilterGroup[] = [];

  for (const group of filterGroups) {
    const propertyConditions = group.conditions.filter(
      c => c.field?.table === 'property' && c.field && c.operator
    );
    const unitConditions = group.conditions.filter(
      c => c.field?.table === 'property_unit' && c.field && c.operator
    );

    if (propertyConditions.length > 0) {
      propertyGroups.push({ ...group, conditions: propertyConditions });
    }
    if (unitConditions.length > 0) {
      unitGroups.push({ ...group, conditions: unitConditions });
    }
  }

  return { propertyGroups, unitGroups };
}

// Build AND conditions string for a group
function buildAndConditions(conditions: FilterCondition[]): string {
  const filters = conditions
    .map(c => conditionToFilter(c))
    .filter((f): f is string => f !== null);

  if (filters.length === 0) return '';
  if (filters.length === 1) return filters[0];
  return `and(${filters.join(',')})`;
}

// Build OR conditions string from multiple groups
function buildOrConditions(groups: FilterGroup[]): string {
  const groupFilters = groups
    .map(g => buildAndConditions(g.conditions))
    .filter(f => f !== '');

  if (groupFilters.length === 0) return '';
  if (groupFilters.length === 1) return groupFilters[0];
  return groupFilters.join(',');
}

export function useAdvancedPropertySearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeSearch = useCallback(async ({
    filterGroups,
    pageSize,
    offset,
    sortConfig,
  }: SearchParams): Promise<SearchResult> => {
    setLoading(true);
    setError(null);

    try {
      const { propertyGroups, unitGroups } = separateFiltersByTable(filterGroups);
      const hasUnitFilters = unitGroups.length > 0;

      let propertyIds: string[] | null = null;
      let matchingUnitsMap: Map<string, PropertyUnitMatch[]> = new Map();

      // Phase 1: If unit filters exist, get matching property IDs
      if (hasUnitFilters) {
        const unitOrConditions = buildOrConditions(unitGroups);

        let unitQuery = supabase
          .from('property_unit')
          .select('property_id, id, property_unit_name, sqft, rent, nnn, patio, inline, end_cap, end_cap_drive_thru, second_gen_restaurant, lease_expiration_date, unit_notes');

        if (unitOrConditions) {
          unitQuery = unitQuery.or(unitOrConditions);
        }

        const { data: matchingUnits, error: unitError } = await unitQuery;

        if (unitError) throw unitError;

        if (!matchingUnits || matchingUnits.length === 0) {
          setLoading(false);
          return { data: [], count: 0 };
        }

        // Get unique property IDs and build units map
        const uniquePropertyIds = new Set<string>();
        for (const unit of matchingUnits) {
          if (unit.property_id) {
            uniquePropertyIds.add(unit.property_id);

            const existing = matchingUnitsMap.get(unit.property_id) || [];
            existing.push({
              id: unit.id,
              property_unit_name: unit.property_unit_name,
              sqft: unit.sqft,
              rent: unit.rent,
              nnn: unit.nnn,
              patio: unit.patio,
              inline: unit.inline,
              end_cap: unit.end_cap,
              end_cap_drive_thru: unit.end_cap_drive_thru,
              second_gen_restaurant: unit.second_gen_restaurant,
              lease_expiration_date: unit.lease_expiration_date,
              unit_notes: unit.unit_notes,
            });
            matchingUnitsMap.set(unit.property_id, existing);
          }
        }

        propertyIds = Array.from(uniquePropertyIds);
      }

      // Phase 2: Query properties
      let query = supabase
        .from('property')
        .select(`
          id,
          property_name,
          description,
          landlord,
          address,
          city,
          state,
          zip,
          country,
          county,
          latitude,
          longitude,
          verified_latitude,
          verified_longitude,
          trade_area,
          parcel_id,
          building_sqft,
          available_sqft,
          acres,
          asking_purchase_price,
          asking_lease_price,
          rent_psf,
          all_in_rent,
          nnn_psf,
          lease_expiration_date,
          costar_link,
          reonomy_link,
          map_link,
          marketing_materials,
          site_plan,
          tax_url,
          property_notes,
          layer_notes,
          property_record_type (id, label)
        `, { count: 'exact' });

      // Filter by property IDs if unit filters were applied
      if (propertyIds !== null) {
        query = query.in('id', propertyIds);
      }

      // Apply property filter conditions
      const propertyOrConditions = buildOrConditions(propertyGroups);
      if (propertyOrConditions) {
        query = query.or(propertyOrConditions);
      }

      // Apply sorting
      const sortField = sortConfig?.field || 'property_name';
      const sortAsc = sortConfig?.direction === 'asc';
      query = query.order(sortField, { ascending: sortAsc, nullsFirst: false });

      // Apply pagination
      query = query.range(offset, offset + pageSize - 1);

      const { data: properties, error: propertyError, count } = await query;

      if (propertyError) throw propertyError;

      // Merge matching units into results
      const results: PropertySearchResult[] = (properties || []).map(property => {
        const units = matchingUnitsMap.get(property.id) || [];
        const hasUnitMatches = units.length > 0;

        return {
          ...property,
          matching_units: hasUnitMatches ? units : undefined,
          has_unit_matches: hasUnitMatches,
          // Flow unit values if single match
          display_sqft: hasUnitMatches && units.length === 1 ? units[0].sqft : property.available_sqft,
          display_rent: hasUnitMatches && units.length === 1 ? units[0].rent : property.rent_psf,
          display_nnn: hasUnitMatches && units.length === 1 ? units[0].nnn : property.nnn_psf,
        };
      });

      setLoading(false);
      return { data: results, count: count || 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      setLoading(false);
      return { data: [], count: 0 };
    }
  }, []);

  return {
    executeSearch,
    loading,
    error,
  };
}
