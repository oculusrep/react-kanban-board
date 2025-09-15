import React from 'react';
import { Assignment } from '../lib/types';
import AssignmentDetailsForm from './AssignmentDetailsForm';

interface AssignmentOverviewTabProps {
  assignment: Assignment;
  isNewAssignment: boolean;
  onSave: (assignment: Assignment) => void;
}

const AssignmentOverviewTab: React.FC<AssignmentOverviewTabProps> = ({
  assignment,
  isNewAssignment,
  onSave
}) => {
  return (
    <div>
      <AssignmentDetailsForm
        assignment={assignment}
        onSave={onSave}
      />
    </div>
  );
};

export default AssignmentOverviewTab;