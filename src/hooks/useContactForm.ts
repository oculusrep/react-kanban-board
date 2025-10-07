import { useState, useCallback } from 'react';
import { Database } from '../../database-schema';

type Contact = Database['public']['Tables']['contact']['Row'];

interface FormValidation {
  isValid: boolean;
  errors: Record<string, string>;
}

interface UseContactFormResult {
  formData: Partial<Contact>;
  setFormData: (data: Partial<Contact>) => void;
  updateField: (field: keyof Contact, value: any) => void;
  validation: FormValidation;
  resetForm: (contact?: Contact) => void;
  isDirty: boolean;
}

export const useContactForm = (initialContact?: Contact): UseContactFormResult => {
  const [formData, setFormDataState] = useState<Partial<Contact>>(
    initialContact || {
      first_name: '',
      last_name: '',
      source_type: 'Contact',
      linked_in_connection: false,
      is_site_selector: false,
      tenant_repped: false,
    }
  );

  const [originalData, setOriginalData] = useState<Partial<Contact>>(
    initialContact || {}
  );

  const setFormData = useCallback((data: Partial<Contact>) => {
    setFormDataState(data);
  }, []);

  const updateField = useCallback((field: keyof Contact, value: any) => {
    setFormDataState(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const resetForm = useCallback((contact?: Contact) => {
    const newData = contact || {};
    setFormDataState(newData);
    setOriginalData(newData);
  }, []);

  // Check if form has been modified
  const isDirty = JSON.stringify(formData) !== JSON.stringify(originalData);

  // Validation logic
  const validation: FormValidation = (() => {
    const errors: Record<string, string> = {};

    // Required field validations
    if (!formData.first_name?.trim()) {
      errors.first_name = 'First name is required';
    }

    if (!formData.last_name?.trim()) {
      errors.last_name = 'Last name is required';
    }

    if (!formData.source_type?.trim()) {
      errors.source_type = 'Source type is required';
    }

    // Email format validation
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  })();

  return {
    formData,
    setFormData,
    updateField,
    validation,
    resetForm,
    isDirty
  };
};
