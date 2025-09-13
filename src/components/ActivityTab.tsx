import React from 'react';
import GenericActivityTab from './GenericActivityTab';
import { ActivityTabConfig, ParentObject } from '../types/activity';

interface ActivityTabProps {
  dealId: string;
}

// Legacy wrapper component for backward compatibility
const ActivityTab: React.FC<ActivityTabProps> = ({ dealId }) => {
  const parentObject: ParentObject = {
    id: dealId,
    type: 'deal',
    name: '' // Will be fetched by the generic component
  };

  const config: ActivityTabConfig = {
    parentObject,
    title: 'Activities',
    showSummary: true,
    allowAdd: true,
    allowEdit: true
  };

  return <GenericActivityTab config={config} />;
};

export default ActivityTab;