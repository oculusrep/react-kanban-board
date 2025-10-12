/**
 * Database Schema Additions for Contact Roles System
 *
 * These types should be added to database-schema.ts after running the migration.
 * They define the new contact_client_role_type and contact_client_role tables.
 *
 * To add to database-schema.ts:
 * 1. Insert contact_client_role_type after contact_client_relation
 * 2. Insert contact_client_role after contact_client_role_type
 * 3. Add the Views section at the end of Tables
 */

// Add these table definitions to the Tables object in database-schema.ts

export interface ContactClientRoleTypeTables {
  contact_client_role_type: {
    Row: {
      id: string
      role_name: string
      description: string | null
      is_active: boolean
      sort_order: number
      created_at: string
      updated_at: string
    }
    Insert: {
      id?: string
      role_name: string
      description?: string | null
      is_active?: boolean
      sort_order?: number
      created_at?: string
      updated_at?: string
    }
    Update: {
      id?: string
      role_name?: string
      description?: string | null
      is_active?: boolean
      sort_order?: number
      created_at?: string
      updated_at?: string
    }
    Relationships: []
  }
  contact_client_role: {
    Row: {
      id: string
      contact_id: string
      client_id: string
      role_id: string
      is_active: boolean
      notes: string | null
      created_at: string
      created_by_id: string | null
      updated_at: string
      updated_by_id: string | null
    }
    Insert: {
      id?: string
      contact_id: string
      client_id: string
      role_id: string
      is_active?: boolean
      notes?: string | null
      created_at?: string
      created_by_id?: string | null
      updated_at?: string
      updated_by_id?: string | null
    }
    Update: {
      id?: string
      contact_id?: string
      client_id?: string
      role_id?: string
      is_active?: boolean
      notes?: string | null
      created_at?: string
      created_by_id?: string | null
      updated_at?: string
      updated_by_id?: string | null
    }
    Relationships: [
      {
        foreignKeyName: "contact_client_role_contact_id_fkey"
        columns: ["contact_id"]
        isOneToOne: false
        referencedRelation: "contact"
        referencedColumns: ["id"]
      },
      {
        foreignKeyName: "contact_client_role_client_id_fkey"
        columns: ["client_id"]
        isOneToOne: false
        referencedRelation: "client"
        referencedColumns: ["id"]
      },
      {
        foreignKeyName: "contact_client_role_role_id_fkey"
        columns: ["role_id"]
        isOneToOne: false
        referencedRelation: "contact_client_role_type"
        referencedColumns: ["id"]
      },
      {
        foreignKeyName: "contact_client_role_created_by_id_fkey"
        columns: ["created_by_id"]
        isOneToOne: false
        referencedRelation: "user"
        referencedColumns: ["id"]
      },
      {
        foreignKeyName: "contact_client_role_updated_by_id_fkey"
        columns: ["updated_by_id"]
        isOneToOne: false
        referencedRelation: "user"
        referencedColumns: ["id"]
      }
    ]
  }
}

// Add these view definitions to a new Views object in database-schema.ts
export interface ContactRoleViews {
  v_contact_client_roles: {
    Row: {
      id: string
      contact_id: string
      contact_name: string
      contact_email: string | null
      client_id: string
      client_name: string
      role_id: string
      role_name: string
      role_description: string | null
      is_active: boolean
      notes: string | null
      created_at: string
      updated_at: string
    }
    Insert: never
    Update: never
    Relationships: []
  }
  v_site_selectors_by_client: {
    Row: {
      client_id: string
      client_name: string
      contact_id: string
      contact_name: string
      email: string
      phone: string | null
      mobile_phone: string | null
      is_active: boolean
      notes: string | null
    }
    Insert: never
    Update: never
    Relationships: []
  }
}

/**
 * Helper types for working with contact roles
 */
export type ContactClientRoleType = ContactClientRoleTypeTables['contact_client_role_type']['Row']
export type ContactClientRole = ContactClientRoleTypeTables['contact_client_role']['Row']
export type ContactClientRoleInsert = ContactClientRoleTypeTables['contact_client_role']['Insert']
export type ContactClientRoleUpdate = ContactClientRoleTypeTables['contact_client_role']['Update']

// View types
export type ContactClientRoleView = ContactRoleViews['v_contact_client_roles']['Row']
export type SiteSelectorByClient = ContactRoleViews['v_site_selectors_by_client']['Row']

/**
 * Predefined role names as constants for type safety
 */
export const CONTACT_ROLE_NAMES = {
  SITE_SELECTOR: 'Site Selector',
  FRANCHISEE: 'Franchisee',
  FRANCHISOR: 'Franchisor',
  REAL_ESTATE_LEAD: 'Real Estate Lead',
  ATTORNEY: 'Attorney',
  LENDER: 'Lender',
  CONTRACTOR: 'Contractor',
  ENGINEER: 'Engineer',
} as const

export type ContactRoleName = typeof CONTACT_ROLE_NAMES[keyof typeof CONTACT_ROLE_NAMES]
