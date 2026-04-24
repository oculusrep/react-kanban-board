export const HIDDEN_STAGE_NAMES = ['Use Conflict', 'Not Available', 'Use Declined', 'Lost / Killed'];
export const SIGNED_STAGE_NAMES = ['Under Contract / Contingent', 'Booked', 'Executed Payable'];

export const STAGE_DISPLAY_NAMES: Record<string, string> = {
  'Submitted-Reviewing': 'For Review',
};

export const STAGE_TAB_ORDER = ['Submitted-Reviewing', 'LOI', 'At Lease/PSA', 'Pass', 'Store Opened'];

export const CLIENT_VISIBLE_STAGES = [
  'Submitted-Reviewing',
  'Pass',
  'Use Declined',
  'Use Conflict',
  'Not Available',
  'Lost / Killed',
  'LOI',
  'At Lease/PSA',
  'Under Contract / Contingent',
  'Store Opened',
  'Unassigned Territory',
];
