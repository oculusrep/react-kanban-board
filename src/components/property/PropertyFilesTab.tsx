import React from 'react';
import FileManager from '../FileManager/FileManager';

interface PropertyFilesTabProps {
  propertyId: string;
}

/**
 * Displays Dropbox files associated with a property
 * Used in Property Details slideout
 */
export default function PropertyFilesTab({ propertyId }: PropertyFilesTabProps) {
  return (
    <div className="h-full">
      <FileManager
        entityType="property"
        entityId={propertyId}
      />
    </div>
  );
}
