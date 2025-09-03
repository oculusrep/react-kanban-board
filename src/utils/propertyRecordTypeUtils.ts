import { supabase } from '../lib/supabaseClient';

// Utility functions for handling property record type data migration
// Handles legacy sf_property_record_type (text) -> property_record_type_id (UUID) mapping

export interface LegacyRecordTypeMapping {
  legacyValue: string;
  newId: string | null;
  label: string;
}

// Check if property has legacy RecordTypeId data from Salesforce
export const checkForLegacyRecordType = async (propertyId: string): Promise<string | null> => {
  try {
    // Check the salesforce_Property__c table for RecordTypeId by matching sf_id
    const { data: propData, error: propError } = await supabase
      .from('property')
      .select('sf_id')
      .eq('id', propertyId)
      .single();

    if (propError || !propData?.sf_id) {
      console.log('No sf_id found for property:', propError?.message);
      return null;
    }

    // Query Salesforce table for RecordTypeId
    const { data, error } = await supabase
      .from('salesforce_Property__c')
      .select('RecordTypeId')
      .eq('Id', propData.sf_id)
      .single();

    if (error) {
      console.log('RecordTypeId field not found:', error.message);
      return null;
    }

    return (data as any)?.RecordTypeId || null;
  } catch (error) {
    console.log('Error checking for legacy record type:', error);
    return null;
  }
};

// Get display value for property record type (checks both new and legacy)
export const getPropertyRecordTypeDisplayValue = async (
  property: any,
  propertyRecordTypes: Array<{ id: string; label: string }>
): Promise<string> => {
  // First try the new property_record_type_id
  if (property.property_record_type_id) {
    const recordType = propertyRecordTypes.find(rt => rt.id === property.property_record_type_id);
    if (recordType) {
      return recordType.label;
    }
  }

  // If no new ID found, check for legacy data
  const legacyValue = await checkForLegacyRecordType(property.id);
  if (legacyValue) {
    return `${legacyValue} (Legacy)`;
  }

  return 'Not set';
};

// Create mapping options that include legacy values
export const createRecordTypeOptions = async (
  propertyRecordTypes: Array<{ id: string; label: string }>,
  includeEmpty: boolean = true
) => {
  const options = [...propertyRecordTypes.map(type => ({ id: type.id, label: type.label }))];
  
  if (includeEmpty) {
    options.unshift({ id: '', label: 'None' });
  }

  return options;
};