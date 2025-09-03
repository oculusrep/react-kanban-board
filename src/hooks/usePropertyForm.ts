import { useState, useCallback } from 'react';
import { Database } from '../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];

interface FormValidation {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

interface UsePropertyFormResult {
  formData: Partial<Property>;
  setFormData: (data: Partial<Property>) => void;
  updateField: (field: keyof Property, value: any) => void;
  validation: FormValidation;
  resetForm: (property?: Property) => void;
  isDirty: boolean;
}

export const usePropertyForm = (initialProperty?: Property): UsePropertyFormResult => {
  const [formData, setFormDataState] = useState<Partial<Property>>(
    initialProperty || {}
  );
  const [originalData, setOriginalData] = useState<Partial<Property>>(
    initialProperty || {}
  );

  const setFormData = useCallback((data: Partial<Property>) => {
    setFormDataState(data);
  }, []);

  const updateField = useCallback((field: keyof Property, value: any) => {
    setFormDataState(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const resetForm = useCallback((property?: Property) => {
    const newData = property || {};
    setFormDataState(newData);
    setOriginalData(newData);
  }, []);

  // Validation logic
  const validation: FormValidation = (() => {
    const errors: Record<string, string> = {};
    const warnings: string[] = [];

    // Required field validations
    if (!formData.property_name?.trim()) {
      errors.property_name = 'Property name is required';
    }

    // Address validation
    if (!formData.address?.trim()) {
      errors.address = 'Address is required';
    }

    if (!formData.city?.trim()) {
      errors.city = 'City is required';
    }

    if (!formData.state?.trim()) {
      errors.state = 'State is required';
    }

    // Price validations
    const askingLeasePrice = Number(formData.asking_lease_price);
    const askingPurchasePrice = Number(formData.asking_purchase_price);
    
    if (askingLeasePrice < 0) {
      errors.asking_lease_price = 'Lease price cannot be negative';
    }
    
    if (askingPurchasePrice < 0) {
      errors.asking_purchase_price = 'Purchase price cannot be negative';
    }

    // PSF validations
    const rentPsf = Number(formData.rent_psf);
    const nnnPsf = Number(formData.nnn_psf);
    
    if (rentPsf < 0) {
      errors.rent_psf = 'Rent PSF cannot be negative';
    }
    
    if (nnnPsf < 0) {
      errors.nnn_psf = 'NNN PSF cannot be negative';
    }

    // Square footage validations
    const buildingSqft = Number(formData.building_sqft);
    const availableSqft = Number(formData.available_sqft);
    
    if (buildingSqft < 0) {
      errors.building_sqft = 'Building square footage cannot be negative';
    }
    
    if (availableSqft < 0) {
      errors.available_sqft = 'Available square footage cannot be negative';
    }

    if (availableSqft > 0 && buildingSqft > 0 && availableSqft > buildingSqft) {
      warnings.push('Available square footage exceeds building square footage');
    }

    // Traffic count validation
    const trafficCount = Number(formData.traffic_count);
    if (trafficCount < 0) {
      errors.traffic_count = 'Traffic count cannot be negative';
    }

    // Coordinate validations
    const latitude = Number(formData.latitude);
    const longitude = Number(formData.longitude);
    
    if (latitude && (latitude < -90 || latitude > 90)) {
      errors.latitude = 'Latitude must be between -90 and 90';
    }
    
    if (longitude && (longitude < -180 || longitude > 180)) {
      errors.longitude = 'Longitude must be between -180 and 180';
    }

    // Warnings for missing optional but important fields
    if (!formData.property_type_id) {
      warnings.push('Property type is not set');
    }

    if (!formData.property_stage_id) {
      warnings.push('Property stage is not set');
    }

    if (!formData.contact_id) {
      warnings.push('No contact assigned to this property');
    }

    if (askingLeasePrice === 0 && askingPurchasePrice === 0) {
      warnings.push('No pricing information available');
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings
    };
  })();

  // Check if form is dirty (has unsaved changes)
  const isDirty = JSON.stringify(formData) !== JSON.stringify(originalData);

  return {
    formData,
    setFormData,
    updateField,
    validation,
    resetForm,
    isDirty
  };
};