/**
 * Permission Types and Definitions
 *
 * This file defines the standard permissions available in the system.
 * Permissions are stored in the role.permissions JSONB field.
 */

export interface RolePermissions {
  // User Management
  can_manage_users?: boolean;
  can_view_users?: boolean;

  // Deal Management
  can_create_deals?: boolean;
  can_edit_deals?: boolean;
  can_delete_deals?: boolean;
  can_view_all_deals?: boolean; // vs only own deals

  // Property Management
  can_create_properties?: boolean;
  can_edit_properties?: boolean;
  can_delete_properties?: boolean;

  // Client Management
  can_create_clients?: boolean;
  can_edit_clients?: boolean;
  can_delete_clients?: boolean;

  // Contact Management
  can_create_contacts?: boolean;
  can_edit_contacts?: boolean;
  can_delete_contacts?: boolean;

  // Assignment Management
  can_create_assignments?: boolean;
  can_edit_assignments?: boolean;
  can_delete_assignments?: boolean;

  // Site Submit Management
  can_create_site_submits?: boolean;
  can_edit_site_submits?: boolean;
  can_delete_site_submits?: boolean;

  // Financial Access
  can_view_financials?: boolean;
  can_edit_financials?: boolean;
  can_manage_payments?: boolean;

  // Reporting & Analytics
  can_view_reports?: boolean;
  can_export_data?: boolean;

  // Individual Report Permissions
  can_view_deal_reconciliation?: boolean;
  can_view_payment_reconciliation?: boolean;
  can_view_deal_compare?: boolean;
  can_view_deal_compare_salesforce?: boolean;
  can_view_property_data_quality?: boolean;
  can_view_assignments_report?: boolean;
  can_view_site_submit_dashboard?: boolean;
  can_view_dropbox_sync_admin?: boolean;
  can_view_rob_report?: boolean;
  can_view_goal_dashboard?: boolean;

  // Tab-Level Visibility (Deal Page)
  can_view_deal_commission_tab?: boolean;
  can_view_deal_payments_tab?: boolean;
  can_view_deal_documents_tab?: boolean;
  can_view_deal_activity_tab?: boolean;

  // Tab-Level Visibility (Property Page)
  can_view_property_financial_tab?: boolean;
  can_view_property_documents_tab?: boolean;
  can_view_property_activity_tab?: boolean;

  // Tab-Level Visibility (Client Page)
  can_view_client_financial_tab?: boolean;
  can_view_client_deals_tab?: boolean;

  // System Administration
  can_manage_system_settings?: boolean;
  can_view_audit_logs?: boolean;

  // Integrations
  can_access_gmail_integration?: boolean;

  // Map Features
  can_verify_restaurant_locations?: boolean;
}

export interface PermissionDefinition {
  key: keyof RolePermissions;
  label: string;
  description: string;
  category: PermissionCategory;
  defaultValue: boolean;
}

export type PermissionCategory =
  | 'user_management'
  | 'deal_management'
  | 'property_management'
  | 'client_management'
  | 'contact_management'
  | 'assignment_management'
  | 'site_submit_management'
  | 'financial_access'
  | 'reporting'
  | 'tab_visibility'
  | 'system_admin'
  | 'integrations'
  | 'map_features';

/**
 * Standard permission definitions with descriptions
 */
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // User Management
  {
    key: 'can_manage_users',
    label: 'Manage Users',
    description: 'Create, edit, delete users and manage roles',
    category: 'user_management',
    defaultValue: false,
  },
  {
    key: 'can_view_users',
    label: 'View Users',
    description: 'View user list and user details',
    category: 'user_management',
    defaultValue: true,
  },

  // Deal Management
  {
    key: 'can_create_deals',
    label: 'Create Deals',
    description: 'Create new deals',
    category: 'deal_management',
    defaultValue: true,
  },
  {
    key: 'can_edit_deals',
    label: 'Edit Deals',
    description: 'Edit existing deals',
    category: 'deal_management',
    defaultValue: true,
  },
  {
    key: 'can_delete_deals',
    label: 'Delete Deals',
    description: 'Delete deals from the system',
    category: 'deal_management',
    defaultValue: false,
  },
  {
    key: 'can_view_all_deals',
    label: 'View All Deals',
    description: 'View all deals (not just own deals)',
    category: 'deal_management',
    defaultValue: true,
  },

  // Property Management
  {
    key: 'can_create_properties',
    label: 'Create Properties',
    description: 'Add new properties',
    category: 'property_management',
    defaultValue: true,
  },
  {
    key: 'can_edit_properties',
    label: 'Edit Properties',
    description: 'Edit property details',
    category: 'property_management',
    defaultValue: true,
  },
  {
    key: 'can_delete_properties',
    label: 'Delete Properties',
    description: 'Delete properties from the system',
    category: 'property_management',
    defaultValue: false,
  },

  // Client Management
  {
    key: 'can_create_clients',
    label: 'Create Clients',
    description: 'Add new clients',
    category: 'client_management',
    defaultValue: true,
  },
  {
    key: 'can_edit_clients',
    label: 'Edit Clients',
    description: 'Edit client information',
    category: 'client_management',
    defaultValue: true,
  },
  {
    key: 'can_delete_clients',
    label: 'Delete Clients',
    description: 'Delete clients from the system',
    category: 'client_management',
    defaultValue: false,
  },

  // Contact Management
  {
    key: 'can_create_contacts',
    label: 'Create Contacts',
    description: 'Add new contacts',
    category: 'contact_management',
    defaultValue: true,
  },
  {
    key: 'can_edit_contacts',
    label: 'Edit Contacts',
    description: 'Edit contact information',
    category: 'contact_management',
    defaultValue: true,
  },
  {
    key: 'can_delete_contacts',
    label: 'Delete Contacts',
    description: 'Delete contacts from the system',
    category: 'contact_management',
    defaultValue: false,
  },

  // Assignment Management
  {
    key: 'can_create_assignments',
    label: 'Create Assignments',
    description: 'Create new assignments',
    category: 'assignment_management',
    defaultValue: true,
  },
  {
    key: 'can_edit_assignments',
    label: 'Edit Assignments',
    description: 'Edit assignment details',
    category: 'assignment_management',
    defaultValue: true,
  },
  {
    key: 'can_delete_assignments',
    label: 'Delete Assignments',
    description: 'Delete assignments from the system',
    category: 'assignment_management',
    defaultValue: false,
  },

  // Site Submit Management
  {
    key: 'can_create_site_submits',
    label: 'Create Site Submits',
    description: 'Add new site submits',
    category: 'site_submit_management',
    defaultValue: true,
  },
  {
    key: 'can_edit_site_submits',
    label: 'Edit Site Submits',
    description: 'Edit site submit information',
    category: 'site_submit_management',
    defaultValue: true,
  },
  {
    key: 'can_delete_site_submits',
    label: 'Delete Site Submits',
    description: 'Delete site submits from the system',
    category: 'site_submit_management',
    defaultValue: false,
  },

  // Financial Access
  {
    key: 'can_view_financials',
    label: 'View Financials',
    description: 'View financial data (commission, payments, etc.)',
    category: 'financial_access',
    defaultValue: false,
  },
  {
    key: 'can_edit_financials',
    label: 'Edit Financials',
    description: 'Edit financial information',
    category: 'financial_access',
    defaultValue: false,
  },
  {
    key: 'can_manage_payments',
    label: 'Manage Payments',
    description: 'Access payment dashboard and manage payments',
    category: 'financial_access',
    defaultValue: false,
  },

  // Reporting & Analytics
  {
    key: 'can_view_reports',
    label: 'View Reports',
    description: 'Access reports and analytics pages',
    category: 'reporting',
    defaultValue: true,
  },
  {
    key: 'can_export_data',
    label: 'Export Data',
    description: 'Export data to CSV/Excel',
    category: 'reporting',
    defaultValue: true,
  },

  // Individual Report Permissions
  {
    key: 'can_view_deal_reconciliation',
    label: 'Deal Reconciliation Report',
    description: 'View the deal reconciliation report',
    category: 'reporting',
    defaultValue: true,
  },
  {
    key: 'can_view_payment_reconciliation',
    label: 'Payment Reconciliation Report',
    description: 'View the payment reconciliation report (financial)',
    category: 'reporting',
    defaultValue: false,
  },
  {
    key: 'can_view_deal_compare',
    label: 'Deal Comparison Report',
    description: 'View the deal comparison report',
    category: 'reporting',
    defaultValue: true,
  },
  {
    key: 'can_view_deal_compare_salesforce',
    label: 'Deal vs Salesforce Report',
    description: 'Compare deals with Salesforce data',
    category: 'reporting',
    defaultValue: true,
  },
  {
    key: 'can_view_property_data_quality',
    label: 'Property Data Quality Report',
    description: 'View property data quality metrics',
    category: 'reporting',
    defaultValue: true,
  },
  {
    key: 'can_view_assignments_report',
    label: 'Assignments Report',
    description: 'View the assignments report',
    category: 'reporting',
    defaultValue: true,
  },
  {
    key: 'can_view_site_submit_dashboard',
    label: 'Site Submit Dashboard',
    description: 'Access the site submit dashboard',
    category: 'reporting',
    defaultValue: true,
  },
  {
    key: 'can_view_dropbox_sync_admin',
    label: 'Dropbox Sync Admin',
    description: 'Access dropbox sync administration (admin only)',
    category: 'reporting',
    defaultValue: false,
  },
  {
    key: 'can_view_rob_report',
    label: 'Rob Report',
    description: 'View the Rob Report (deal pipeline and commission summary)',
    category: 'reporting',
    defaultValue: false,
  },
  {
    key: 'can_view_goal_dashboard',
    label: 'Goal Dashboard',
    description: 'View the Goal Dashboard for coaching sessions and goal tracking',
    category: 'reporting',
    defaultValue: false,
  },

  // Tab-Level Visibility
  {
    key: 'can_view_deal_commission_tab',
    label: 'Deal Commission Tab',
    description: 'View commission details on deal pages',
    category: 'tab_visibility',
    defaultValue: false,
  },
  {
    key: 'can_view_deal_payments_tab',
    label: 'Deal Payments Tab',
    description: 'View payments information on deal pages',
    category: 'tab_visibility',
    defaultValue: false,
  },
  {
    key: 'can_view_deal_documents_tab',
    label: 'Deal Documents Tab',
    description: 'View documents tab on deal pages',
    category: 'tab_visibility',
    defaultValue: true,
  },
  {
    key: 'can_view_deal_activity_tab',
    label: 'Deal Activity Tab',
    description: 'View activity/history tab on deal pages',
    category: 'tab_visibility',
    defaultValue: true,
  },
  {
    key: 'can_view_property_financial_tab',
    label: 'Property Financial Tab',
    description: 'View financial information on property pages',
    category: 'tab_visibility',
    defaultValue: false,
  },
  {
    key: 'can_view_property_documents_tab',
    label: 'Property Documents Tab',
    description: 'View documents tab on property pages',
    category: 'tab_visibility',
    defaultValue: true,
  },
  {
    key: 'can_view_property_activity_tab',
    label: 'Property Activity Tab',
    description: 'View activity/history tab on property pages',
    category: 'tab_visibility',
    defaultValue: true,
  },
  {
    key: 'can_view_client_financial_tab',
    label: 'Client Financial Tab',
    description: 'View financial information on client pages',
    category: 'tab_visibility',
    defaultValue: false,
  },
  {
    key: 'can_view_client_deals_tab',
    label: 'Client Deals Tab',
    description: 'View deals associated with clients',
    category: 'tab_visibility',
    defaultValue: true,
  },

  // System Administration
  {
    key: 'can_manage_system_settings',
    label: 'Manage System Settings',
    description: 'Access and modify system-wide settings',
    category: 'system_admin',
    defaultValue: false,
  },
  {
    key: 'can_view_audit_logs',
    label: 'View Audit Logs',
    description: 'View system audit logs and user activity',
    category: 'system_admin',
    defaultValue: false,
  },

  // Integrations
  {
    key: 'can_access_gmail_integration',
    label: 'Gmail Integration',
    description: 'Access Gmail Integration settings and connect Gmail account',
    category: 'integrations',
    defaultValue: false,
  },

  // Map Features
  {
    key: 'can_verify_restaurant_locations',
    label: 'Verify Restaurant Locations',
    description: 'Right-click on Restaurant Trends pins to verify/update pin location',
    category: 'map_features',
    defaultValue: false,
  },
];

/**
 * Category display names and descriptions
 */
export const PERMISSION_CATEGORIES: Record<PermissionCategory, { label: string; description: string }> = {
  user_management: {
    label: 'User Management',
    description: 'Permissions related to managing users and roles',
  },
  deal_management: {
    label: 'Deal Management',
    description: 'Permissions for creating, editing, and managing deals',
  },
  property_management: {
    label: 'Property Management',
    description: 'Permissions for managing properties',
  },
  client_management: {
    label: 'Client Management',
    description: 'Permissions for managing clients',
  },
  contact_management: {
    label: 'Contact Management',
    description: 'Permissions for managing contacts',
  },
  assignment_management: {
    label: 'Assignment Management',
    description: 'Permissions for managing assignments',
  },
  site_submit_management: {
    label: 'Site Submit Management',
    description: 'Permissions for managing site submits',
  },
  financial_access: {
    label: 'Financial Access',
    description: 'Permissions for viewing and managing financial data',
  },
  reporting: {
    label: 'Reporting & Analytics',
    description: 'Permissions for reports and data export',
  },
  tab_visibility: {
    label: 'Tab Visibility',
    description: 'Control which tabs are visible on detail pages (deals, properties, clients)',
  },
  system_admin: {
    label: 'System Administration',
    description: 'Advanced system administration permissions',
  },
  integrations: {
    label: 'Integrations',
    description: 'Third-party integrations like Gmail, QuickBooks, etc.',
  },
  map_features: {
    label: 'Map Features',
    description: 'Permissions for map-specific features like pin verification',
  },
};

/**
 * Get permissions grouped by category
 */
export function getPermissionsByCategory(): Record<PermissionCategory, PermissionDefinition[]> {
  const grouped: Record<string, PermissionDefinition[]> = {};

  PERMISSION_DEFINITIONS.forEach((perm) => {
    if (!grouped[perm.category]) {
      grouped[perm.category] = [];
    }
    grouped[perm.category].push(perm);
  });

  return grouped as Record<PermissionCategory, PermissionDefinition[]>;
}

/**
 * Get default permissions for a new role
 */
export function getDefaultPermissions(): RolePermissions {
  const defaults: RolePermissions = {};

  PERMISSION_DEFINITIONS.forEach((perm) => {
    defaults[perm.key] = perm.defaultValue;
  });

  return defaults;
}
