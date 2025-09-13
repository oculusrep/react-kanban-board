import React from 'react';
import GenericActivityTab from '../GenericActivityTab';
import { ActivityTabConfig, ParentObject } from '../../types/activity';

// Example: Contact Activity Tab
interface ContactActivityTabProps {
  contactId: string;
  contactName: string;
}

export const ContactActivityTab: React.FC<ContactActivityTabProps> = ({ contactId, contactName }) => {
  const parentObject: ParentObject = {
    id: contactId,
    type: 'contact',
    name: contactName
  };

  const config: ActivityTabConfig = {
    parentObject,
    title: 'Contact Activities',
    showSummary: true,
    allowAdd: true,
    allowEdit: true
  };

  return <GenericActivityTab config={config} />;
};

// Example: Client Activity Tab
interface ClientActivityTabProps {
  clientId: string;
  clientName: string;
}

export const ClientActivityTab: React.FC<ClientActivityTabProps> = ({ clientId, clientName }) => {
  const parentObject: ParentObject = {
    id: clientId,
    type: 'client',
    name: clientName
  };

  const config: ActivityTabConfig = {
    parentObject,
    title: 'Client Activities',
    showSummary: true,
    allowAdd: true,
    allowEdit: true
  };

  return <GenericActivityTab config={config} />;
};

// Example: Property Activity Tab
interface PropertyActivityTabProps {
  propertyId: string;
  propertyName: string;
}

export const PropertyActivityTab: React.FC<PropertyActivityTabProps> = ({ propertyId, propertyName }) => {
  const parentObject: ParentObject = {
    id: propertyId,
    type: 'property',
    name: propertyName
  };

  const config: ActivityTabConfig = {
    parentObject,
    title: 'Property Activities',
    showSummary: true,
    allowAdd: true,
    allowEdit: true
  };

  return <GenericActivityTab config={config} />;
};

// Example: Site Submit Activity Tab
interface SiteSubmitActivityTabProps {
  siteSubmitId: string;
  siteSubmitName: string;
}

export const SiteSubmitActivityTab: React.FC<SiteSubmitActivityTabProps> = ({ siteSubmitId, siteSubmitName }) => {
  const parentObject: ParentObject = {
    id: siteSubmitId,
    type: 'site_submit',
    name: siteSubmitName
  };

  const config: ActivityTabConfig = {
    parentObject,
    title: 'Site Submit Activities',
    showSummary: false, // Maybe we don't want summary for site submits
    allowAdd: true,
    allowEdit: false // Maybe read-only for site submits
  };

  return <GenericActivityTab config={config} />;
};

// Example: Minimal Activity List (no summary, no add button)
interface ReadOnlyActivityTabProps {
  parentObject: ParentObject;
  title?: string;
}

export const ReadOnlyActivityTab: React.FC<ReadOnlyActivityTabProps> = ({ 
  parentObject, 
  title = 'Activities' 
}) => {
  const config: ActivityTabConfig = {
    parentObject,
    title,
    showSummary: false,
    allowAdd: false,
    allowEdit: false
  };

  return <GenericActivityTab config={config} />;
};

// Example: Custom filtered activity tab
interface FilteredActivityTabProps {
  parentObject: ParentObject;
  allowedTypes?: string[];
  title?: string;
}

export const FilteredActivityTab: React.FC<FilteredActivityTabProps> = ({ 
  parentObject, 
  allowedTypes = [],
  title = 'Filtered Activities' 
}) => {
  const config: ActivityTabConfig = {
    parentObject,
    title,
    showSummary: true,
    allowAdd: true,
    allowEdit: true,
    customFilters: allowedTypes.length > 0 ? [{
      key: 'type',
      label: 'Allowed Types',
      options: allowedTypes.map(type => ({ value: type, label: type }))
    }] : undefined
  };

  return <GenericActivityTab config={config} />;
};