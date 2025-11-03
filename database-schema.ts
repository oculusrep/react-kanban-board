export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity: {
        Row: {
          activity_date: string | null
          activity_priority_id: string | null
          activity_task_type_id: string | null
          activity_type_id: string | null
          assignment_id: string | null
          call_disposition: string | null
          call_duration_seconds: number | null
          client_id: string | null
          completed_at: string | null
          completed_call: boolean | null
          completed_property_call: boolean | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          description: string | null
          id: string
          is_high_priority: boolean | null
          is_property_prospecting_call: boolean | null
          is_prospecting_call: boolean | null
          meeting_held: boolean | null
          owner_id: string | null
          property_id: string | null
          related_object_id: string | null
          related_object_type: string | null
          sf_account_id: string | null
          sf_created_by_id: string | null
          sf_id: string | null
          sf_is_closed: boolean | null
          sf_is_recurring: boolean | null
          sf_owner_id: string | null
          sf_status: string | null
          sf_task_priority: string | null
          sf_task_subtype: string | null
          sf_task_type: string | null
          sf_updated_by: string | null
          sf_what_id: string | null
          sf_who_id: string | null
          site_submit_id: string | null
          status_id: string | null
          subject: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          activity_date?: string | null
          activity_priority_id?: string | null
          activity_task_type_id?: string | null
          activity_type_id?: string | null
          assignment_id?: string | null
          call_disposition?: string | null
          call_duration_seconds?: number | null
          client_id?: string | null
          completed_at?: string | null
          completed_call?: boolean | null
          completed_property_call?: boolean | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          is_high_priority?: boolean | null
          is_property_prospecting_call?: boolean | null
          is_prospecting_call?: boolean | null
          meeting_held?: boolean | null
          owner_id?: string | null
          property_id?: string | null
          related_object_id?: string | null
          related_object_type?: string | null
          sf_account_id?: string | null
          sf_created_by_id?: string | null
          sf_id?: string | null
          sf_is_closed?: boolean | null
          sf_is_recurring?: boolean | null
          sf_owner_id?: string | null
          sf_status?: string | null
          sf_task_priority?: string | null
          sf_task_subtype?: string | null
          sf_task_type?: string | null
          sf_updated_by?: string | null
          sf_what_id?: string | null
          sf_who_id?: string | null
          site_submit_id?: string | null
          status_id?: string | null
          subject?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          activity_date?: string | null
          activity_priority_id?: string | null
          activity_task_type_id?: string | null
          activity_type_id?: string | null
          assignment_id?: string | null
          call_disposition?: string | null
          call_duration_seconds?: number | null
          client_id?: string | null
          completed_at?: string | null
          completed_call?: boolean | null
          completed_property_call?: boolean | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          is_high_priority?: boolean | null
          is_property_prospecting_call?: boolean | null
          is_prospecting_call?: boolean | null
          meeting_held?: boolean | null
          owner_id?: string | null
          property_id?: string | null
          related_object_id?: string | null
          related_object_type?: string | null
          sf_account_id?: string | null
          sf_created_by_id?: string | null
          sf_id?: string | null
          sf_is_closed?: boolean | null
          sf_is_recurring?: boolean | null
          sf_owner_id?: string | null
          sf_status?: string | null
          sf_task_priority?: string | null
          sf_task_subtype?: string | null
          sf_task_type?: string | null
          sf_updated_by?: string | null
          sf_what_id?: string | null
          sf_who_id?: string | null
          site_submit_id?: string | null
          status_id?: string | null
          subject?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_activity_priority_id_fkey"
            columns: ["activity_priority_id"]
            isOneToOne: false
            referencedRelation: "activity_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_activity_task_type_id_fkey"
            columns: ["activity_task_type_id"]
            isOneToOne: false
            referencedRelation: "activity_task_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "activity_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_assignment_id"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_activity_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "fk_activity_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_owner_id"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_priority_id"
            columns: ["activity_priority_id"]
            isOneToOne: false
            referencedRelation: "activity_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_site_submit_id"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_status_id"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "activity_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_task_type_id"
            columns: ["activity_task_type_id"]
            isOneToOne: false
            referencedRelation: "activity_task_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_type_id"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_activity_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_priority: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          is_high_priority: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_high_priority?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_high_priority?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      activity_status: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          id: string
          is_closed: boolean | null
          is_default: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          is_default?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          is_default?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      activity_task_type: {
        Row: {
          active: boolean | null
          category: string | null
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      activity_type: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      assignment: {
        Row: {
          assignment_name: string | null
          assignment_value: number | null
          client_id: string | null
          commission: number | null
          created_at: string | null
          created_by_id: string | null
          deal_id: string | null
          due_date: string | null
          fee: number | null
          id: string
          owner_id: string | null
          priority_id: string | null
          progress: string | null
          referral_fee: number | null
          referral_payee_id: string | null
          scoped: boolean | null
          sf_account_id: string | null
          sf_created_by_id: string | null
          sf_id: string | null
          sf_num_of_pursuing_ownership: string | null
          sf_num_of_site_submits: string | null
          sf_number_of_pursuing_ownership: number | null
          sf_number_of_site_submits: number | null
          sf_opportunity_id: string | null
          sf_owner_id: string | null
          sf_priority: string | null
          sf_referral_payee: string | null
          sf_scoped_formula: string | null
          sf_transaction_type: string | null
          site_criteria: string | null
          transaction_type_id: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
        }
        Insert: {
          assignment_name?: string | null
          assignment_value?: number | null
          client_id?: string | null
          commission?: number | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          due_date?: string | null
          fee?: number | null
          id?: string
          owner_id?: string | null
          priority_id?: string | null
          progress?: string | null
          referral_fee?: number | null
          referral_payee_id?: string | null
          scoped?: boolean | null
          sf_account_id?: string | null
          sf_created_by_id?: string | null
          sf_id?: string | null
          sf_num_of_pursuing_ownership?: string | null
          sf_num_of_site_submits?: string | null
          sf_number_of_pursuing_ownership?: number | null
          sf_number_of_site_submits?: number | null
          sf_opportunity_id?: string | null
          sf_owner_id?: string | null
          sf_priority?: string | null
          sf_referral_payee?: string | null
          sf_scoped_formula?: string | null
          sf_transaction_type?: string | null
          site_criteria?: string | null
          transaction_type_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Update: {
          assignment_name?: string | null
          assignment_value?: number | null
          client_id?: string | null
          commission?: number | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          due_date?: string | null
          fee?: number | null
          id?: string
          owner_id?: string | null
          priority_id?: string | null
          progress?: string | null
          referral_fee?: number | null
          referral_payee_id?: string | null
          scoped?: boolean | null
          sf_account_id?: string | null
          sf_created_by_id?: string | null
          sf_id?: string | null
          sf_num_of_pursuing_ownership?: string | null
          sf_num_of_site_submits?: string | null
          sf_number_of_pursuing_ownership?: number | null
          sf_number_of_site_submits?: number | null
          sf_opportunity_id?: string | null
          sf_owner_id?: string | null
          sf_priority?: string | null
          sf_referral_payee?: string | null
          sf_scoped_formula?: string | null
          sf_transaction_type?: string | null
          site_criteria?: string | null
          transaction_type_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_priority_id_fkey"
            columns: ["priority_id"]
            isOneToOne: false
            referencedRelation: "assignment_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_priority: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      attachment: {
        Row: {
          created_at: string | null
          deal_id: string | null
          file_name: string | null
          file_url: string
          id: string
          last_modified_at: string | null
          last_modified_by: string | null
          note_id: string | null
          property_id: string | null
          site_submit_id: string | null
          thread_message_id: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          deal_id?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          note_id?: string | null
          property_id?: string | null
          site_submit_id?: string | null
          thread_message_id?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          deal_id?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          note_id?: string | null
          property_id?: string | null
          site_submit_id?: string | null
          thread_message_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_attachment_thread_message"
            columns: ["thread_message_id"]
            isOneToOne: false
            referencedRelation: "thread_message"
            referencedColumns: ["id"]
          },
        ]
      }
      broker: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      client: {
        Row: {
          billing_city: string | null
          billing_country: string | null
          billing_state: string | null
          billing_street: string | null
          billing_zip: string | null
          client_name: string | null
          client_type_id: string | null
          created_at: string | null
          created_by_id: string | null
          description: string | null
          id: string
          is_active_client: boolean | null
          owner_id: string | null
          parent_id: string | null
          phone: string | null
          sf_account_source: string | null
          sf_client_type: string | null
          sf_created_by_id: string | null
          sf_id: string | null
          sf_maps_assignment_rule: string | null
          sf_owner_id: string | null
          sf_parent_id: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_state: string | null
          shipping_street: string | null
          shipping_zip: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
          website: string | null
        }
        Insert: {
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          client_name?: string | null
          client_type_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          description?: string | null
          id?: string
          is_active_client?: boolean | null
          owner_id?: string | null
          parent_id?: string | null
          phone?: string | null
          sf_account_source?: string | null
          sf_client_type?: string | null
          sf_created_by_id?: string | null
          sf_id?: string | null
          sf_maps_assignment_rule?: string | null
          sf_owner_id?: string | null
          sf_parent_id?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          website?: string | null
        }
        Update: {
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          client_name?: string | null
          client_type_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          description?: string | null
          id?: string
          is_active_client?: boolean | null
          owner_id?: string | null
          parent_id?: string | null
          phone?: string | null
          sf_account_source?: string | null
          sf_client_type?: string | null
          sf_created_by_id?: string | null
          sf_id?: string | null
          sf_maps_assignment_rule?: string | null
          sf_owner_id?: string | null
          sf_parent_id?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          shipping_zip?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_client_type_id_fkey"
            columns: ["client_type_id"]
            isOneToOne: false
            referencedRelation: "client_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      client_type: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      commission_split: {
        Row: {
          broker_id: string | null
          created_at: string | null
          created_by_id: string | null
          deal_id: string | null
          id: string
          owner_id: string | null
          sf_agci: number | null
          sf_broker_id: string | null
          sf_broker_total: number | null
          sf_created_by_id: string | null
          sf_deal_dollars: number | null
          sf_deal_id: string | null
          sf_deal_percent: number | null
          sf_deal_stage: string | null
          sf_deal_usd: number | null
          sf_gci: number | null
          sf_house_dollars: number | null
          sf_house_percent: number | null
          sf_id: string | null
          sf_net_commission: number | null
          sf_oculus_net: number | null
          sf_opportunity_fee: number | null
          sf_opportunity_info: string | null
          sf_origination_percent: number | null
          sf_origination_usd: number | null
          sf_owner_id: string | null
          sf_payment_amount: number | null
          sf_payment_date: string | null
          sf_payment_name: string | null
          sf_payment_received: boolean | null
          sf_referral_fee_percent: number | null
          sf_site_dollars: number | null
          sf_site_percent: number | null
          sf_site_usd: number | null
          sf_split_percent: number | null
          sf_split_usd: number | null
          sf_system_mod_stamp: string | null
          sf_updated_by_id: string | null
          split_broker_total: number | null
          split_deal_percent: number | null
          split_deal_usd: number | null
          split_name: string | null
          split_origination_percent: number | null
          split_origination_usd: number | null
          split_site_percent: number | null
          split_site_usd: number | null
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          broker_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          id?: string
          owner_id?: string | null
          sf_agci?: number | null
          sf_broker_id?: string | null
          sf_broker_total?: number | null
          sf_created_by_id?: string | null
          sf_deal_dollars?: number | null
          sf_deal_id?: string | null
          sf_deal_percent?: number | null
          sf_deal_stage?: string | null
          sf_deal_usd?: number | null
          sf_gci?: number | null
          sf_house_dollars?: number | null
          sf_house_percent?: number | null
          sf_id?: string | null
          sf_net_commission?: number | null
          sf_oculus_net?: number | null
          sf_opportunity_fee?: number | null
          sf_opportunity_info?: string | null
          sf_origination_percent?: number | null
          sf_origination_usd?: number | null
          sf_owner_id?: string | null
          sf_payment_amount?: number | null
          sf_payment_date?: string | null
          sf_payment_name?: string | null
          sf_payment_received?: boolean | null
          sf_referral_fee_percent?: number | null
          sf_site_dollars?: number | null
          sf_site_percent?: number | null
          sf_site_usd?: number | null
          sf_split_percent?: number | null
          sf_split_usd?: number | null
          sf_system_mod_stamp?: string | null
          sf_updated_by_id?: string | null
          split_broker_total?: number | null
          split_deal_percent?: number | null
          split_deal_usd?: number | null
          split_name?: string | null
          split_origination_percent?: number | null
          split_origination_usd?: number | null
          split_site_percent?: number | null
          split_site_usd?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          broker_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          id?: string
          owner_id?: string | null
          sf_agci?: number | null
          sf_broker_id?: string | null
          sf_broker_total?: number | null
          sf_created_by_id?: string | null
          sf_deal_dollars?: number | null
          sf_deal_id?: string | null
          sf_deal_percent?: number | null
          sf_deal_stage?: string | null
          sf_deal_usd?: number | null
          sf_gci?: number | null
          sf_house_dollars?: number | null
          sf_house_percent?: number | null
          sf_id?: string | null
          sf_net_commission?: number | null
          sf_oculus_net?: number | null
          sf_opportunity_fee?: number | null
          sf_opportunity_info?: string | null
          sf_origination_percent?: number | null
          sf_origination_usd?: number | null
          sf_owner_id?: string | null
          sf_payment_amount?: number | null
          sf_payment_date?: string | null
          sf_payment_name?: string | null
          sf_payment_received?: boolean | null
          sf_referral_fee_percent?: number | null
          sf_site_dollars?: number | null
          sf_site_percent?: number | null
          sf_site_usd?: number | null
          sf_split_percent?: number | null
          sf_split_usd?: number | null
          sf_system_mod_stamp?: string | null
          sf_updated_by_id?: string | null
          split_broker_total?: number | null
          split_deal_percent?: number | null
          split_deal_usd?: number | null
          split_name?: string | null
          split_origination_percent?: number | null
          split_origination_usd?: number | null
          split_site_percent?: number | null
          split_site_usd?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_split_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "broker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_split_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_split_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_split_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_split_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_split_updated_by_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          client_id: string | null
          company: string | null
          contact_tags: string | null
          created_at: string | null
          created_by_id: string | null
          email: string | null
          fax: string | null
          first_name: string | null
          icsc_profile_link: string | null
          id: string
          is_site_selector: boolean | null
          last_name: string | null
          lead_status_id: string | null
          linked_in_connection: boolean | null
          linked_in_profile_link: string | null
          mailing_city: string | null
          mailing_country: string | null
          mailing_state: string | null
          mailing_street: string | null
          mailing_zip: string | null
          middle_name: string | null
          mobile_phone: string | null
          owner_id: string | null
          personal_email: string | null
          phone: string | null
          retail_sphere_link: string | null
          salutation: string | null
          sf_account_id: string | null
          sf_contact_name: string | null
          sf_contact_type: string | null
          sf_converted_date: string | null
          sf_created_by_id: string | null
          sf_email_campaigns: string | null
          sf_email_list: string | null
          sf_id: string | null
          sf_individual_id: string | null
          sf_lead_list: string | null
          sf_lead_notes: string | null
          sf_lead_source: string | null
          sf_lead_status: string | null
          sf_lead_tags: string | null
          sf_master_record_id: string | null
          sf_name: string | null
          sf_owner_id: string | null
          sf_photo_url: string | null
          sf_tenant_rep_id: string | null
          source_type: string
          tenant_rep_contact_id: string | null
          tenant_repped: boolean | null
          title: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
          website: string | null
        }
        Insert: {
          client_id?: string | null
          company?: string | null
          contact_tags?: string | null
          created_at?: string | null
          created_by_id?: string | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          icsc_profile_link?: string | null
          id?: string
          is_site_selector?: boolean | null
          last_name?: string | null
          lead_status_id?: string | null
          linked_in_connection?: boolean | null
          linked_in_profile_link?: string | null
          mailing_city?: string | null
          mailing_country?: string | null
          mailing_state?: string | null
          mailing_street?: string | null
          mailing_zip?: string | null
          middle_name?: string | null
          mobile_phone?: string | null
          owner_id?: string | null
          personal_email?: string | null
          phone?: string | null
          retail_sphere_link?: string | null
          salutation?: string | null
          sf_account_id?: string | null
          sf_contact_name?: string | null
          sf_contact_type?: string | null
          sf_converted_date?: string | null
          sf_created_by_id?: string | null
          sf_email_campaigns?: string | null
          sf_email_list?: string | null
          sf_id?: string | null
          sf_individual_id?: string | null
          sf_lead_list?: string | null
          sf_lead_notes?: string | null
          sf_lead_source?: string | null
          sf_lead_status?: string | null
          sf_lead_tags?: string | null
          sf_master_record_id?: string | null
          sf_name?: string | null
          sf_owner_id?: string | null
          sf_photo_url?: string | null
          sf_tenant_rep_id?: string | null
          source_type?: string
          tenant_rep_contact_id?: string | null
          tenant_repped?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          website?: string | null
        }
        Update: {
          client_id?: string | null
          company?: string | null
          contact_tags?: string | null
          created_at?: string | null
          created_by_id?: string | null
          email?: string | null
          fax?: string | null
          first_name?: string | null
          icsc_profile_link?: string | null
          id?: string
          is_site_selector?: boolean | null
          last_name?: string | null
          lead_status_id?: string | null
          linked_in_connection?: boolean | null
          linked_in_profile_link?: string | null
          mailing_city?: string | null
          mailing_country?: string | null
          mailing_state?: string | null
          mailing_street?: string | null
          mailing_zip?: string | null
          middle_name?: string | null
          mobile_phone?: string | null
          owner_id?: string | null
          personal_email?: string | null
          phone?: string | null
          retail_sphere_link?: string | null
          salutation?: string | null
          sf_account_id?: string | null
          sf_contact_name?: string | null
          sf_contact_type?: string | null
          sf_converted_date?: string | null
          sf_created_by_id?: string | null
          sf_email_campaigns?: string | null
          sf_email_list?: string | null
          sf_id?: string | null
          sf_individual_id?: string | null
          sf_lead_list?: string | null
          sf_lead_notes?: string | null
          sf_lead_source?: string | null
          sf_lead_status?: string | null
          sf_lead_tags?: string | null
          sf_master_record_id?: string | null
          sf_name?: string | null
          sf_owner_id?: string | null
          sf_photo_url?: string | null
          sf_tenant_rep_id?: string | null
          source_type?: string
          tenant_rep_contact_id?: string | null
          tenant_repped?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_lead_status_id_fkey"
            columns: ["lead_status_id"]
            isOneToOne: false
            referencedRelation: "lead_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tenant_rep_contact_id_fkey"
            columns: ["tenant_rep_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tenant_rep_contact_id_fkey"
            columns: ["tenant_rep_contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contact_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contact_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
        ]
      }
      contact_client_relation: {
        Row: {
          client_id: string
          contact_id: string
          created_at: string | null
          created_by_id: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          role: string | null
          sf_relation_id: string | null
          synced_from_salesforce: boolean | null
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          client_id: string
          contact_id: string
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          role?: string | null
          sf_relation_id?: string | null
          synced_from_salesforce?: boolean | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          client_id?: string
          contact_id?: string
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          role?: string | null
          sf_relation_id?: string | null
          synced_from_salesforce?: boolean | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_client_relation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_client_relation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contact_client_relation_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_client_relation_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_client_relation_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_client_relation_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_client_role: {
        Row: {
          client_id: string
          contact_id: string
          created_at: string | null
          created_by_id: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          role_id: string
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          client_id: string
          contact_id: string
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          role_id: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          client_id?: string
          contact_id?: string
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          role_id?: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_client_role_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_client_role_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contact_client_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_client_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_client_role_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
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
            foreignKeyName: "contact_client_role_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_client_role_type: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          role_name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          role_name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          role_name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contact_contact_type: {
        Row: {
          contact_id: string | null
          contact_type_id: string | null
          id: string
        }
        Insert: {
          contact_id?: string | null
          contact_type_id?: string | null
          id?: string
        }
        Update: {
          contact_id?: string | null
          contact_type_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_contact_type_contact_type_id_fkey"
            columns: ["contact_type_id"]
            isOneToOne: false
            referencedRelation: "contact_type"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lead_list: {
        Row: {
          contact_id: string
          lead_list_id: string
        }
        Insert: {
          contact_id: string
          lead_list_id: string
        }
        Update: {
          contact_id?: string
          lead_list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_lead_list_lead_list_id_fkey"
            columns: ["lead_list_id"]
            isOneToOne: false
            referencedRelation: "lead_list"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_role: {
        Row: {
          active: boolean | null
          created_at: string | null
          label: string
          role_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          label: string
          role_id?: string
          sort_order: number
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          label?: string
          role_id?: string
          sort_order?: number
        }
        Relationships: []
      }
      contact_type: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      critical_date: {
        Row: {
          created_at: string | null
          created_by_id: string | null
          critical_date: string | null
          deal_id: string
          description: string | null
          id: string
          is_default: boolean | null
          send_email: boolean | null
          send_email_days_prior: number | null
          sent_at: string | null
          sf_id: string | null
          sf_opportunity_id: string | null
          subject: string
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_id?: string | null
          critical_date?: string | null
          deal_id: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          send_email?: boolean | null
          send_email_days_prior?: number | null
          sent_at?: string | null
          sf_id?: string | null
          sf_opportunity_id?: string | null
          subject: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_id?: string | null
          critical_date?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          send_email?: boolean | null
          send_email_days_prior?: number | null
          sent_at?: string | null
          sf_id?: string | null
          sf_opportunity_id?: string | null
          subject?: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "critical_date_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_date_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_date_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "critical_date_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      deal: {
        Row: {
          agci: number | null
          assignment_id: string | null
          booked: boolean | null
          booked_date: string | null
          calculated_fee: number | null
          client_id: string | null
          closed_date: string | null
          commission_percent: number | null
          contact_id: string | null
          contract_signed_date: string | null
          created_at: string | null
          created_by_id: string | null
          created_by_sf_id: string | null
          deal_name: string | null
          deal_percent: number | null
          deal_team_id: string | null
          deal_type_id: string | null
          deal_usd: number | null
          deal_value: number | null
          fee: number | null
          flat_fee_override: number | null
          gci: number | null
          house_percent: number | null
          house_usd: number | null
          id: string
          kanban_position: number | null
          last_stage_change_at: string | null
          lead_source: string | null
          loi_signed_date: string | null
          loss_reason: string | null
          number_of_payments: number | null
          oculus_net: number | null
          origination_percent: number | null
          origination_usd: number | null
          owner_id: string | null
          probability: number | null
          property_id: string | null
          property_unit_id: string | null
          record_type_id: string | null
          referral_fee_percent: number | null
          referral_fee_usd: number | null
          referral_payee_client_id: string | null
          representation_id: string | null
          sf_account_id: string | null
          sf_address: string | null
          sf_assignment_id: string | null
          sf_booked_month: string | null
          sf_booked_year: string | null
          sf_broker: string | null
          sf_broker_total_arty: number | null
          sf_broker_total_greg: number | null
          sf_broker_total_mike: number | null
          sf_city: string | null
          sf_contact_id: string | null
          sf_contingency_date_est: string | null
          sf_fiscal_year: number | null
          sf_id: string | null
          sf_is_closed: boolean | null
          sf_lead_source: string | null
          sf_map_link: string | null
          sf_mike_gci: number | null
          sf_multiple_payments: boolean | null
          sf_payment_1: number | null
          sf_property_unit: string | null
          sf_record_type_id: string | null
          sf_referral_payee: string | null
          sf_representation_id: string | null
          sf_site_submit_id: string | null
          sf_stage_name: string | null
          sf_state: string | null
          sf_system_mod_stamp: string | null
          sf_transaction_type: string | null
          sf_zip: string | null
          site_percent: number | null
          site_submit_id: string | null
          site_usd: number | null
          size_acres: number | null
          size_sqft: number | null
          stage_id: string | null
          target_close_date: string | null
          transaction_type_id: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
          weighted_fee: number | null
        }
        Insert: {
          agci?: number | null
          assignment_id?: string | null
          booked?: boolean | null
          booked_date?: string | null
          calculated_fee?: number | null
          client_id?: string | null
          closed_date?: string | null
          commission_percent?: number | null
          contact_id?: string | null
          contract_signed_date?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_sf_id?: string | null
          deal_name?: string | null
          deal_percent?: number | null
          deal_team_id?: string | null
          deal_type_id?: string | null
          deal_usd?: number | null
          deal_value?: number | null
          fee?: number | null
          flat_fee_override?: number | null
          gci?: number | null
          house_percent?: number | null
          house_usd?: number | null
          id?: string
          kanban_position?: number | null
          last_stage_change_at?: string | null
          lead_source?: string | null
          loi_signed_date?: string | null
          loss_reason?: string | null
          number_of_payments?: number | null
          oculus_net?: number | null
          origination_percent?: number | null
          origination_usd?: number | null
          owner_id?: string | null
          probability?: number | null
          property_id?: string | null
          property_unit_id?: string | null
          record_type_id?: string | null
          referral_fee_percent?: number | null
          referral_fee_usd?: number | null
          referral_payee_client_id?: string | null
          representation_id?: string | null
          sf_account_id?: string | null
          sf_address?: string | null
          sf_assignment_id?: string | null
          sf_booked_month?: string | null
          sf_booked_year?: string | null
          sf_broker?: string | null
          sf_broker_total_arty?: number | null
          sf_broker_total_greg?: number | null
          sf_broker_total_mike?: number | null
          sf_city?: string | null
          sf_contact_id?: string | null
          sf_contingency_date_est?: string | null
          sf_fiscal_year?: number | null
          sf_id?: string | null
          sf_is_closed?: boolean | null
          sf_lead_source?: string | null
          sf_map_link?: string | null
          sf_mike_gci?: number | null
          sf_multiple_payments?: boolean | null
          sf_payment_1?: number | null
          sf_property_unit?: string | null
          sf_record_type_id?: string | null
          sf_referral_payee?: string | null
          sf_representation_id?: string | null
          sf_site_submit_id?: string | null
          sf_stage_name?: string | null
          sf_state?: string | null
          sf_system_mod_stamp?: string | null
          sf_transaction_type?: string | null
          sf_zip?: string | null
          site_percent?: number | null
          site_submit_id?: string | null
          site_usd?: number | null
          size_acres?: number | null
          size_sqft?: number | null
          stage_id?: string | null
          target_close_date?: string | null
          transaction_type_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          weighted_fee?: number | null
        }
        Update: {
          agci?: number | null
          assignment_id?: string | null
          booked?: boolean | null
          booked_date?: string | null
          calculated_fee?: number | null
          client_id?: string | null
          closed_date?: string | null
          commission_percent?: number | null
          contact_id?: string | null
          contract_signed_date?: string | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_sf_id?: string | null
          deal_name?: string | null
          deal_percent?: number | null
          deal_team_id?: string | null
          deal_type_id?: string | null
          deal_usd?: number | null
          deal_value?: number | null
          fee?: number | null
          flat_fee_override?: number | null
          gci?: number | null
          house_percent?: number | null
          house_usd?: number | null
          id?: string
          kanban_position?: number | null
          last_stage_change_at?: string | null
          lead_source?: string | null
          loi_signed_date?: string | null
          loss_reason?: string | null
          number_of_payments?: number | null
          oculus_net?: number | null
          origination_percent?: number | null
          origination_usd?: number | null
          owner_id?: string | null
          probability?: number | null
          property_id?: string | null
          property_unit_id?: string | null
          record_type_id?: string | null
          referral_fee_percent?: number | null
          referral_fee_usd?: number | null
          referral_payee_client_id?: string | null
          representation_id?: string | null
          sf_account_id?: string | null
          sf_address?: string | null
          sf_assignment_id?: string | null
          sf_booked_month?: string | null
          sf_booked_year?: string | null
          sf_broker?: string | null
          sf_broker_total_arty?: number | null
          sf_broker_total_greg?: number | null
          sf_broker_total_mike?: number | null
          sf_city?: string | null
          sf_contact_id?: string | null
          sf_contingency_date_est?: string | null
          sf_fiscal_year?: number | null
          sf_id?: string | null
          sf_is_closed?: boolean | null
          sf_lead_source?: string | null
          sf_map_link?: string | null
          sf_mike_gci?: number | null
          sf_multiple_payments?: boolean | null
          sf_payment_1?: number | null
          sf_property_unit?: string | null
          sf_record_type_id?: string | null
          sf_referral_payee?: string | null
          sf_representation_id?: string | null
          sf_site_submit_id?: string | null
          sf_stage_name?: string | null
          sf_state?: string | null
          sf_system_mod_stamp?: string | null
          sf_transaction_type?: string | null
          sf_zip?: string | null
          site_percent?: number | null
          site_submit_id?: string | null
          site_usd?: number | null
          size_acres?: number | null
          size_sqft?: number | null
          stage_id?: string | null
          target_close_date?: string | null
          transaction_type_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          weighted_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_referral_payee_client_id_fkey"
            columns: ["referral_payee_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_referral_payee_client_id_fkey"
            columns: ["referral_payee_client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_site_submit_fk"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deal_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deal_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_deal_stage_id"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contact: {
        Row: {
          contact_id: string | null
          created_at: string | null
          created_by_id: string | null
          deal_id: string | null
          id: string
          primary_contact: boolean | null
          role_id: string | null
          sf_contact_id: string | null
          sf_created_by: string | null
          sf_id: string | null
          sf_modified_by: string | null
          sf_opportunity_id: string | null
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          id?: string
          primary_contact?: boolean | null
          role_id?: string | null
          sf_contact_id?: string | null
          sf_created_by?: string | null
          sf_id?: string | null
          sf_modified_by?: string | null
          sf_opportunity_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          id?: string
          primary_contact?: boolean | null
          role_id?: string | null
          sf_contact_id?: string | null
          sf_created_by?: string | null
          sf_id?: string | null
          sf_modified_by?: string | null
          sf_opportunity_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_contact_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "deal_contact_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "contact_role"
            referencedColumns: ["role_id"]
          },
          {
            foreignKeyName: "deal_contact_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_record_type: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      deal_representation: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      deal_source: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      deal_stage: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      deal_team: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      deal_type: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      dropbox_mapping: {
        Row: {
          created_at: string | null
          dropbox_folder_path: string
          entity_id: string
          entity_type: string
          id: string
          last_verified_at: string | null
          sf_id: string
          sfdb_file_found: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dropbox_folder_path: string
          entity_id: string
          entity_type: string
          id?: string
          last_verified_at?: string | null
          sf_id: string
          sfdb_file_found?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dropbox_folder_path?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_verified_at?: string | null
          sf_id?: string
          sfdb_file_found?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_list: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      lead_source: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      lead_status: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      note: {
        Row: {
          body: string | null
          content_size: number | null
          created_at: string | null
          created_by: string | null
          id: string
          sf_content_document_id: string | null
          sf_content_note_id: string | null
          sf_content_version_id: string | null
          sf_created_by_id: string | null
          sf_updated_by_id: string | null
          share_type: string | null
          title: string | null
          updated_at: string | null
          updated_by: string | null
          visibility: string | null
        }
        Insert: {
          body?: string | null
          content_size?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          sf_content_document_id?: string | null
          sf_content_note_id?: string | null
          sf_content_version_id?: string | null
          sf_created_by_id?: string | null
          sf_updated_by_id?: string | null
          share_type?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          visibility?: string | null
        }
        Update: {
          body?: string | null
          content_size?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          sf_content_document_id?: string | null
          sf_content_note_id?: string | null
          sf_content_version_id?: string | null
          sf_created_by_id?: string | null
          sf_updated_by_id?: string | null
          share_type?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_note_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      note_backup: {
        Row: {
          assignment_id: string | null
          body: string | null
          client_id: string | null
          contact_id: string | null
          content_size: number | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          id: string | null
          is_private: boolean | null
          last_modified_at: string | null
          last_modified_by: string | null
          owner_id: string | null
          property_id: string | null
          related_object_id: string | null
          related_object_type: string | null
          sf_content_document_id: string | null
          sf_content_document_link_id: string | null
          sf_content_note_id: string | null
          sf_content_version_id: string | null
          sf_created_by: string | null
          sf_created_by_id: string | null
          sf_modified_by: string | null
          sf_note_id: string | null
          sf_owner_id: string | null
          sf_parent_id: string | null
          sf_updated_by_id: string | null
          share_type: string | null
          site_submit_id: string | null
          summary_for_thread_id: string | null
          title: string | null
          updated_at: string | null
          updated_by: string | null
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          assignment_id?: string | null
          body?: string | null
          client_id?: string | null
          contact_id?: string | null
          content_size?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          id?: string | null
          is_private?: boolean | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          owner_id?: string | null
          property_id?: string | null
          related_object_id?: string | null
          related_object_type?: string | null
          sf_content_document_id?: string | null
          sf_content_document_link_id?: string | null
          sf_content_note_id?: string | null
          sf_content_version_id?: string | null
          sf_created_by?: string | null
          sf_created_by_id?: string | null
          sf_modified_by?: string | null
          sf_note_id?: string | null
          sf_owner_id?: string | null
          sf_parent_id?: string | null
          sf_updated_by_id?: string | null
          share_type?: string | null
          site_submit_id?: string | null
          summary_for_thread_id?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          assignment_id?: string | null
          body?: string | null
          client_id?: string | null
          contact_id?: string | null
          content_size?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          id?: string | null
          is_private?: boolean | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          owner_id?: string | null
          property_id?: string | null
          related_object_id?: string | null
          related_object_type?: string | null
          sf_content_document_id?: string | null
          sf_content_document_link_id?: string | null
          sf_content_note_id?: string | null
          sf_content_version_id?: string | null
          sf_created_by?: string | null
          sf_created_by_id?: string | null
          sf_modified_by?: string | null
          sf_note_id?: string | null
          sf_owner_id?: string | null
          sf_parent_id?: string | null
          sf_updated_by_id?: string | null
          share_type?: string | null
          site_submit_id?: string | null
          summary_for_thread_id?: string | null
          title?: string | null
          updated_at?: string | null
          updated_by?: string | null
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      note_object_link: {
        Row: {
          assignment_id: string | null
          client_id: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          id: string
          note_id: string
          object_id: string | null
          object_type: string
          property_id: string | null
          related_object_id: string | null
          related_object_type: string | null
          sf_content_document_link_id: string | null
          site_submit_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          note_id: string
          object_id?: string | null
          object_type: string
          property_id?: string | null
          related_object_id?: string | null
          related_object_type?: string | null
          sf_content_document_link_id?: string | null
          site_submit_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          id?: string
          note_id?: string
          object_id?: string | null
          object_type?: string
          property_id?: string | null
          related_object_id?: string | null
          related_object_type?: string | null
          sf_content_document_link_id?: string | null
          site_submit_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_note_object_link_assignment_id"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_note_object_link_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "fk_note_object_link_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_note_id"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "note"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_site_submit_id"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "note_object_link_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "note_object_link_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "note"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_object_link_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      payment: {
        Row: {
          agci: number | null
          amount_override: boolean | null
          created_at: string | null
          created_by_id: string | null
          deal_id: string | null
          deleted_at: string | null
          id: string
          invoice_sent: boolean | null
          is_active: boolean | null
          locked: boolean | null
          orep_invoice: string | null
          override_at: string | null
          override_by: string | null
          payment_amount: number | null
          payment_date_estimated: string | null
          payment_invoice_date: string | null
          payment_name: string | null
          payment_received: boolean | null
          payment_received_date: string | null
          payment_sequence: number | null
          qb_invoice_id: string | null
          qb_last_sync: string | null
          qb_payment_id: string | null
          qb_sync_status: string | null
          referral_fee_paid: boolean | null
          referral_fee_paid_date: string | null
          referral_fee_percent_override: number | null
          referral_fee_usd: number | null
          sf_agci: number | null
          sf_billing_entity: string | null
          sf_broker_paid_greg: boolean | null
          sf_broker_paid_mike: boolean | null
          sf_broker_total_arty: number | null
          sf_broker_total_greg: number | null
          sf_broker_total_mike: number | null
          sf_created_by_id: string | null
          sf_deal_percent: number | null
          sf_deal_usd: number | null
          sf_greg_gci: number | null
          sf_greg_gci_credit: number | null
          sf_greg_gci_percent_credit: number | null
          sf_greg_net_commission: number | null
          sf_greg_split: number | null
          sf_house_percent: number | null
          sf_house_usd: number | null
          sf_id: string | null
          sf_invoice_sent_date: string | null
          sf_mike_commission: number | null
          sf_mike_gci_credit_retired: number | null
          sf_mike_gci_credits: number | null
          sf_mike_gci_percent: number | null
          sf_mike_net_comission: number | null
          sf_mike_pmt_gci: number | null
          sf_mike_split: number | null
          sf_net_commission: number | null
          sf_net_commission_overwrite: number | null
          sf_net_commission_percent: number | null
          sf_net_commission_percentages: number | null
          sf_net_commissions: number | null
          sf_net_payment_received: number | null
          sf_oculus_net: number | null
          sf_opportunity_id: string | null
          sf_origination_percent: number | null
          sf_origination_usd: number | null
          sf_payment_amount: number | null
          sf_payment_date_actual: string | null
          sf_payment_date_est: string | null
          sf_payment_date_received: string | null
          sf_payment_invoice_date: string | null
          sf_payment_status: string | null
          sf_received_date: string | null
          sf_referral_fee: number | null
          sf_referral_fee_percent: number | null
          sf_referral_payee: string | null
          sf_referral_payee_1: string | null
          sf_referral_payee_id: string | null
          sf_site_percent: number | null
          sf_site_usd: number | null
          sf_type: string | null
          sf_updated_by_id: string | null
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          agci?: number | null
          amount_override?: boolean | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          deleted_at?: string | null
          id?: string
          invoice_sent?: boolean | null
          is_active?: boolean | null
          locked?: boolean | null
          orep_invoice?: string | null
          override_at?: string | null
          override_by?: string | null
          payment_amount?: number | null
          payment_date_estimated?: string | null
          payment_invoice_date?: string | null
          payment_name?: string | null
          payment_received?: boolean | null
          payment_received_date?: string | null
          payment_sequence?: number | null
          qb_invoice_id?: string | null
          qb_last_sync?: string | null
          qb_payment_id?: string | null
          qb_sync_status?: string | null
          referral_fee_paid?: boolean | null
          referral_fee_paid_date?: string | null
          referral_fee_percent_override?: number | null
          referral_fee_usd?: number | null
          sf_agci?: number | null
          sf_billing_entity?: string | null
          sf_broker_paid_greg?: boolean | null
          sf_broker_paid_mike?: boolean | null
          sf_broker_total_arty?: number | null
          sf_broker_total_greg?: number | null
          sf_broker_total_mike?: number | null
          sf_created_by_id?: string | null
          sf_deal_percent?: number | null
          sf_deal_usd?: number | null
          sf_greg_gci?: number | null
          sf_greg_gci_credit?: number | null
          sf_greg_gci_percent_credit?: number | null
          sf_greg_net_commission?: number | null
          sf_greg_split?: number | null
          sf_house_percent?: number | null
          sf_house_usd?: number | null
          sf_id?: string | null
          sf_invoice_sent_date?: string | null
          sf_mike_commission?: number | null
          sf_mike_gci_credit_retired?: number | null
          sf_mike_gci_credits?: number | null
          sf_mike_gci_percent?: number | null
          sf_mike_net_comission?: number | null
          sf_mike_pmt_gci?: number | null
          sf_mike_split?: number | null
          sf_net_commission?: number | null
          sf_net_commission_overwrite?: number | null
          sf_net_commission_percent?: number | null
          sf_net_commission_percentages?: number | null
          sf_net_commissions?: number | null
          sf_net_payment_received?: number | null
          sf_oculus_net?: number | null
          sf_opportunity_id?: string | null
          sf_origination_percent?: number | null
          sf_origination_usd?: number | null
          sf_payment_amount?: number | null
          sf_payment_date_actual?: string | null
          sf_payment_date_est?: string | null
          sf_payment_date_received?: string | null
          sf_payment_invoice_date?: string | null
          sf_payment_status?: string | null
          sf_received_date?: string | null
          sf_referral_fee?: number | null
          sf_referral_fee_percent?: number | null
          sf_referral_payee?: string | null
          sf_referral_payee_1?: string | null
          sf_referral_payee_id?: string | null
          sf_site_percent?: number | null
          sf_site_usd?: number | null
          sf_type?: string | null
          sf_updated_by_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          agci?: number | null
          amount_override?: boolean | null
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string | null
          deleted_at?: string | null
          id?: string
          invoice_sent?: boolean | null
          is_active?: boolean | null
          locked?: boolean | null
          orep_invoice?: string | null
          override_at?: string | null
          override_by?: string | null
          payment_amount?: number | null
          payment_date_estimated?: string | null
          payment_invoice_date?: string | null
          payment_name?: string | null
          payment_received?: boolean | null
          payment_received_date?: string | null
          payment_sequence?: number | null
          qb_invoice_id?: string | null
          qb_last_sync?: string | null
          qb_payment_id?: string | null
          qb_sync_status?: string | null
          referral_fee_paid?: boolean | null
          referral_fee_paid_date?: string | null
          referral_fee_percent_override?: number | null
          referral_fee_usd?: number | null
          sf_agci?: number | null
          sf_billing_entity?: string | null
          sf_broker_paid_greg?: boolean | null
          sf_broker_paid_mike?: boolean | null
          sf_broker_total_arty?: number | null
          sf_broker_total_greg?: number | null
          sf_broker_total_mike?: number | null
          sf_created_by_id?: string | null
          sf_deal_percent?: number | null
          sf_deal_usd?: number | null
          sf_greg_gci?: number | null
          sf_greg_gci_credit?: number | null
          sf_greg_gci_percent_credit?: number | null
          sf_greg_net_commission?: number | null
          sf_greg_split?: number | null
          sf_house_percent?: number | null
          sf_house_usd?: number | null
          sf_id?: string | null
          sf_invoice_sent_date?: string | null
          sf_mike_commission?: number | null
          sf_mike_gci_credit_retired?: number | null
          sf_mike_gci_credits?: number | null
          sf_mike_gci_percent?: number | null
          sf_mike_net_comission?: number | null
          sf_mike_pmt_gci?: number | null
          sf_mike_split?: number | null
          sf_net_commission?: number | null
          sf_net_commission_overwrite?: number | null
          sf_net_commission_percent?: number | null
          sf_net_commission_percentages?: number | null
          sf_net_commissions?: number | null
          sf_net_payment_received?: number | null
          sf_oculus_net?: number | null
          sf_opportunity_id?: string | null
          sf_origination_percent?: number | null
          sf_origination_usd?: number | null
          sf_payment_amount?: number | null
          sf_payment_date_actual?: string | null
          sf_payment_date_est?: string | null
          sf_payment_date_received?: string | null
          sf_payment_invoice_date?: string | null
          sf_payment_status?: string | null
          sf_received_date?: string | null
          sf_referral_fee?: number | null
          sf_referral_fee_percent?: number | null
          sf_referral_payee?: string | null
          sf_referral_payee_1?: string | null
          sf_referral_payee_id?: string | null
          sf_site_percent?: number | null
          sf_site_usd?: number | null
          sf_type?: string | null
          sf_updated_by_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_updated_by_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_split: {
        Row: {
          broker_id: string | null
          commission_split_id: string | null
          created_at: string | null
          created_by_id: string | null
          id: string
          paid: boolean | null
          paid_date: string | null
          payment_id: string | null
          sf_broker: string | null
          sf_broker_picklist: string | null
          sf_commission_split_id: string | null
          sf_created_by_id: string | null
          sf_deal_usd: number | null
          sf_id: string | null
          sf_origination_usd: number | null
          sf_owner_id: string | null
          sf_payment_info: string | null
          sf_site_usd: number | null
          sf_split_name: string | null
          sf_updated_by_id: string | null
          split_broker_total: number | null
          split_deal_percent: number | null
          split_deal_percent_override: number | null
          split_deal_usd: number | null
          split_origination_percent: number | null
          split_origination_percent_override: number | null
          split_origination_usd: number | null
          split_site_percent: number | null
          split_site_percent_override: number | null
          split_site_usd: number | null
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          broker_id?: string | null
          commission_split_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          paid?: boolean | null
          paid_date?: string | null
          payment_id?: string | null
          sf_broker?: string | null
          sf_broker_picklist?: string | null
          sf_commission_split_id?: string | null
          sf_created_by_id?: string | null
          sf_deal_usd?: number | null
          sf_id?: string | null
          sf_origination_usd?: number | null
          sf_owner_id?: string | null
          sf_payment_info?: string | null
          sf_site_usd?: number | null
          sf_split_name?: string | null
          sf_updated_by_id?: string | null
          split_broker_total?: number | null
          split_deal_percent?: number | null
          split_deal_percent_override?: number | null
          split_deal_usd?: number | null
          split_origination_percent?: number | null
          split_origination_percent_override?: number | null
          split_origination_usd?: number | null
          split_site_percent?: number | null
          split_site_percent_override?: number | null
          split_site_usd?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          broker_id?: string | null
          commission_split_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          paid?: boolean | null
          paid_date?: string | null
          payment_id?: string | null
          sf_broker?: string | null
          sf_broker_picklist?: string | null
          sf_commission_split_id?: string | null
          sf_created_by_id?: string | null
          sf_deal_usd?: number | null
          sf_id?: string | null
          sf_origination_usd?: number | null
          sf_owner_id?: string | null
          sf_payment_info?: string | null
          sf_site_usd?: number | null
          sf_split_name?: string | null
          sf_updated_by_id?: string | null
          split_broker_total?: number | null
          split_deal_percent?: number | null
          split_deal_percent_override?: number | null
          split_deal_usd?: number | null
          split_origination_percent?: number | null
          split_origination_percent_override?: number | null
          split_origination_usd?: number | null
          split_site_percent?: number | null
          split_site_percent_override?: number | null
          split_site_usd?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_split_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "broker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_split_commission_split_id_fkey"
            columns: ["commission_split_id"]
            isOneToOne: false
            referencedRelation: "commission_split"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_split_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_split_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_split_updated_by_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      property: {
        Row: {
          "1_mile_pop": number | null
          "3_mile_pop": number | null
          acres: number | null
          address: string | null
          all_in_rent: number | null
          asking_lease_price: number | null
          asking_purchase_price: number | null
          available_sqft: number | null
          building_sqft: number | null
          city: string | null
          contact_id: string | null
          contact_made: boolean | null
          costar_link: string | null
          country: string | null
          county: string | null
          created_at: string | null
          created_by_id: string | null
          deal_type_id: string | null
          demographics: string | null
          description: string | null
          hh_income_median_3_mile: number | null
          id: string
          landlord: string | null
          latitude: number | null
          layer_notes: string | null
          lease_expiration_date: string | null
          letter_sent: boolean | null
          longitude: number | null
          map_link: string | null
          marketing_materials: string | null
          nnn_psf: number | null
          owner_id: string | null
          parcel_id: string | null
          property_name: string | null
          property_notes: string | null
          property_record_type_id: string | null
          property_stage_id: string | null
          property_type_id: string | null
          rent_psf: number | null
          reonomy_link: string | null
          sf_id: string | null
          site_plan: string | null
          state: string | null
          tax_url: string | null
          total_traffic: number | null
          trade_area: string | null
          traffic_count: number | null
          traffic_count_2nd: number | null
          updated_at: string | null
          updated_by_id: string | null
          verified_latitude: number | null
          verified_longitude: number | null
          zip: string | null
        }
        Insert: {
          "1_mile_pop"?: number | null
          "3_mile_pop"?: number | null
          acres?: number | null
          address?: string | null
          all_in_rent?: number | null
          asking_lease_price?: number | null
          asking_purchase_price?: number | null
          available_sqft?: number | null
          building_sqft?: number | null
          city?: string | null
          contact_id?: string | null
          contact_made?: boolean | null
          costar_link?: string | null
          country?: string | null
          county?: string | null
          created_at?: string | null
          created_by_id?: string | null
          deal_type_id?: string | null
          demographics?: string | null
          description?: string | null
          hh_income_median_3_mile?: number | null
          id?: string
          landlord?: string | null
          latitude?: number | null
          layer_notes?: string | null
          lease_expiration_date?: string | null
          letter_sent?: boolean | null
          longitude?: number | null
          map_link?: string | null
          marketing_materials?: string | null
          nnn_psf?: number | null
          owner_id?: string | null
          parcel_id?: string | null
          property_name?: string | null
          property_notes?: string | null
          property_record_type_id?: string | null
          property_stage_id?: string | null
          property_type_id?: string | null
          rent_psf?: number | null
          reonomy_link?: string | null
          sf_id?: string | null
          site_plan?: string | null
          state?: string | null
          tax_url?: string | null
          total_traffic?: number | null
          trade_area?: string | null
          traffic_count?: number | null
          traffic_count_2nd?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
          verified_latitude?: number | null
          verified_longitude?: number | null
          zip?: string | null
        }
        Update: {
          "1_mile_pop"?: number | null
          "3_mile_pop"?: number | null
          acres?: number | null
          address?: string | null
          all_in_rent?: number | null
          asking_lease_price?: number | null
          asking_purchase_price?: number | null
          available_sqft?: number | null
          building_sqft?: number | null
          city?: string | null
          contact_id?: string | null
          contact_made?: boolean | null
          costar_link?: string | null
          country?: string | null
          county?: string | null
          created_at?: string | null
          created_by_id?: string | null
          deal_type_id?: string | null
          demographics?: string | null
          description?: string | null
          hh_income_median_3_mile?: number | null
          id?: string
          landlord?: string | null
          latitude?: number | null
          layer_notes?: string | null
          lease_expiration_date?: string | null
          letter_sent?: boolean | null
          longitude?: number | null
          map_link?: string | null
          marketing_materials?: string | null
          nnn_psf?: number | null
          owner_id?: string | null
          parcel_id?: string | null
          property_name?: string | null
          property_notes?: string | null
          property_record_type_id?: string | null
          property_stage_id?: string | null
          property_type_id?: string | null
          rent_psf?: number | null
          reonomy_link?: string | null
          sf_id?: string | null
          site_plan?: string | null
          state?: string | null
          tax_url?: string | null
          total_traffic?: number | null
          trade_area?: string | null
          traffic_count?: number | null
          traffic_count_2nd?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
          verified_latitude?: number | null
          verified_longitude?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_property_record_type_id"
            columns: ["property_record_type_id"]
            isOneToOne: false
            referencedRelation: "property_record_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_stage_id"
            columns: ["property_stage_id"]
            isOneToOne: false
            referencedRelation: "property_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_type_id"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_type"
            referencedColumns: ["id"]
          },
        ]
      }
      property_contact: {
        Row: {
          contact_id: string | null
          created_at: string | null
          created_by_id: string | null
          id: string
          property_id: string | null
          sf_contact_id: string | null
          sf_contact_name: string | null
          sf_created_by_id: string | null
          sf_email: string | null
          sf_id: string | null
          sf_join_name: string | null
          sf_mobile_phone: string | null
          sf_owner_id: string | null
          sf_phone: string | null
          sf_property_id: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          property_id?: string | null
          sf_contact_id?: string | null
          sf_contact_name?: string | null
          sf_created_by_id?: string | null
          sf_email?: string | null
          sf_id?: string | null
          sf_join_name?: string | null
          sf_mobile_phone?: string | null
          sf_owner_id?: string | null
          sf_phone?: string | null
          sf_property_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          property_id?: string | null
          sf_contact_id?: string | null
          sf_contact_name?: string | null
          sf_created_by_id?: string | null
          sf_email?: string | null
          sf_id?: string | null
          sf_join_name?: string | null
          sf_mobile_phone?: string | null
          sf_owner_id?: string | null
          sf_phone?: string | null
          sf_property_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_property_contact_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_contact_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "fk_property_contact_created_by_id"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_contact_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_contact_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_contact_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_contact_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_contact_updated_by_id"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "property_contact_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_contact_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      property_record_type: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      property_special_layer: {
        Row: {
          created_at: string | null
          id: string
          property_id: string
          special_layer_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          property_id: string
          special_layer_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          property_id?: string
          special_layer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_special_layer_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_special_layer_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_special_layer_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_special_layer_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_special_layer_special_layer_id_fkey"
            columns: ["special_layer_id"]
            isOneToOne: false
            referencedRelation: "special_layer"
            referencedColumns: ["id"]
          },
        ]
      }
      property_stage: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      property_type: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      property_unit: {
        Row: {
          created_at: string | null
          created_by_id: string | null
          created_by_sf_id: string | null
          deal_id: string | null
          end_cap: boolean | null
          end_cap_drive_thru: boolean | null
          id: string
          inline: boolean | null
          lease_expiration_date: string | null
          nnn: number | null
          patio: boolean | null
          property_id: string | null
          property_unit_name: string | null
          rent: number | null
          second_gen_restaurant: boolean | null
          sf_id: string | null
          site_submit_id: string | null
          sqft: number | null
          unit_notes: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_id?: string | null
          created_by_sf_id?: string | null
          deal_id?: string | null
          end_cap?: boolean | null
          end_cap_drive_thru?: boolean | null
          id?: string
          inline?: boolean | null
          lease_expiration_date?: string | null
          nnn?: number | null
          patio?: boolean | null
          property_id?: string | null
          property_unit_name?: string | null
          rent?: number | null
          second_gen_restaurant?: boolean | null
          sf_id?: string | null
          site_submit_id?: string | null
          sqft?: number | null
          unit_notes?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_id?: string | null
          created_by_sf_id?: string | null
          deal_id?: string | null
          end_cap?: boolean | null
          end_cap_drive_thru?: boolean | null
          id?: string
          inline?: boolean | null
          lease_expiration_date?: string | null
          nnn?: number | null
          patio?: boolean | null
          property_id?: string | null
          property_unit_name?: string | null
          rent?: number | null
          second_gen_restaurant?: boolean | null
          sf_id?: string | null
          site_submit_id?: string | null
          sqft?: number | null
          unit_notes?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_unit_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_unit_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_Account: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountSource: string | null
          BillingAddress: Json | null
          BillingCity: string | null
          BillingCountry: string | null
          BillingGeocodeAccuracy: string | null
          BillingLatitude: number | null
          BillingLongitude: number | null
          BillingPostalCode: string | null
          BillingState: string | null
          BillingStreet: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Description: string | null
          Id: string | null
          Industry: string | null
          IsDeleted: boolean | null
          IsPriorityRecord: boolean | null
          Jigsaw: string | null
          JigsawCompanyId: string | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          maps__AssignmentRule__c: string | null
          MasterRecordId: string | null
          Name: string | null
          NumberOfEmployees: number | null
          OwnerId: string | null
          ParentId: string | null
          Phone: string | null
          PhotoUrl: string | null
          ShippingAddress: Json | null
          ShippingCity: string | null
          ShippingCountry: string | null
          ShippingGeocodeAccuracy: string | null
          ShippingLatitude: number | null
          ShippingLongitude: number | null
          ShippingPostalCode: string | null
          ShippingState: string | null
          ShippingStreet: string | null
          SicDesc: string | null
          SystemModstamp: string | null
          Type: string | null
          Website: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountSource?: string | null
          BillingAddress?: Json | null
          BillingCity?: string | null
          BillingCountry?: string | null
          BillingGeocodeAccuracy?: string | null
          BillingLatitude?: number | null
          BillingLongitude?: number | null
          BillingPostalCode?: string | null
          BillingState?: string | null
          BillingStreet?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Id?: string | null
          Industry?: string | null
          IsDeleted?: boolean | null
          IsPriorityRecord?: boolean | null
          Jigsaw?: string | null
          JigsawCompanyId?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          maps__AssignmentRule__c?: string | null
          MasterRecordId?: string | null
          Name?: string | null
          NumberOfEmployees?: number | null
          OwnerId?: string | null
          ParentId?: string | null
          Phone?: string | null
          PhotoUrl?: string | null
          ShippingAddress?: Json | null
          ShippingCity?: string | null
          ShippingCountry?: string | null
          ShippingGeocodeAccuracy?: string | null
          ShippingLatitude?: number | null
          ShippingLongitude?: number | null
          ShippingPostalCode?: string | null
          ShippingState?: string | null
          ShippingStreet?: string | null
          SicDesc?: string | null
          SystemModstamp?: string | null
          Type?: string | null
          Website?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccountSource?: string | null
          BillingAddress?: Json | null
          BillingCity?: string | null
          BillingCountry?: string | null
          BillingGeocodeAccuracy?: string | null
          BillingLatitude?: number | null
          BillingLongitude?: number | null
          BillingPostalCode?: string | null
          BillingState?: string | null
          BillingStreet?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Id?: string | null
          Industry?: string | null
          IsDeleted?: boolean | null
          IsPriorityRecord?: boolean | null
          Jigsaw?: string | null
          JigsawCompanyId?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          maps__AssignmentRule__c?: string | null
          MasterRecordId?: string | null
          Name?: string | null
          NumberOfEmployees?: number | null
          OwnerId?: string | null
          ParentId?: string | null
          Phone?: string | null
          PhotoUrl?: string | null
          ShippingAddress?: Json | null
          ShippingCity?: string | null
          ShippingCountry?: string | null
          ShippingGeocodeAccuracy?: string | null
          ShippingLatitude?: number | null
          ShippingLongitude?: number | null
          ShippingPostalCode?: string | null
          ShippingState?: string | null
          ShippingStreet?: string | null
          SicDesc?: string | null
          SystemModstamp?: string | null
          Type?: string | null
          Website?: string | null
        }
        Relationships: []
      }
      salesforce_AccountContactRelation: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId: string | null
          ContactId: string | null
          CreatedById: string | null
          CreatedDate: string | null
          EndDate: string | null
          Id: string | null
          Is_Site_Selector__c: boolean | null
          IsActive: boolean | null
          IsDeleted: boolean | null
          IsDirect: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Relationship_Strength__c: string | null
          Roles: string | null
          StartDate: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId?: string | null
          ContactId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          EndDate?: string | null
          Id?: string | null
          Is_Site_Selector__c?: boolean | null
          IsActive?: boolean | null
          IsDeleted?: boolean | null
          IsDirect?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Relationship_Strength__c?: string | null
          Roles?: string | null
          StartDate?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccountId?: string | null
          ContactId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          EndDate?: string | null
          Id?: string | null
          Is_Site_Selector__c?: boolean | null
          IsActive?: boolean | null
          IsDeleted?: boolean | null
          IsDirect?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Relationship_Strength__c?: string | null
          Roles?: string | null
          StartDate?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_ActivityFieldHistory: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ActivityId: string | null
          ChangedById: string | null
          ChangedDate: string | null
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          FieldName: string | null
          Id: string | null
          IsDataAvailable: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          NewValueDateTime: string | null
          NewValueNumber: number | null
          NewValueText: string | null
          OldValueDateTime: string | null
          OldValueNumber: number | null
          OldValueText: string | null
          Operation: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ActivityId?: string | null
          ChangedById?: string | null
          ChangedDate?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          FieldName?: string | null
          Id?: string | null
          IsDataAvailable?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          NewValueDateTime?: string | null
          NewValueNumber?: number | null
          NewValueText?: string | null
          OldValueDateTime?: string | null
          OldValueNumber?: number | null
          OldValueText?: string | null
          Operation?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ActivityId?: string | null
          ChangedById?: string | null
          ChangedDate?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          FieldName?: string | null
          Id?: string | null
          IsDataAvailable?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          NewValueDateTime?: string | null
          NewValueNumber?: number | null
          NewValueText?: string | null
          OldValueDateTime?: string | null
          OldValueNumber?: number | null
          OldValueText?: string | null
          Operation?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_Assignment__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c: string | null
          Assignment_Value__c: number | null
          Commission__c: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Due_Date__c: string | null
          Fee__c: number | null
          Id: string | null
          IsDeleted: boolean | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Name: string | null
          Num_of_Pursuing_Ownership__c: string | null
          Num_of_Site_Submits__c: string | null
          Number_of_Pursuing_Ownership_Site_Submit__c: number | null
          Number_of_Site_Submits__c: number | null
          Opportunity__c: string | null
          OwnerId: string | null
          Priority__c: string | null
          Progress__c: string | null
          Referral_Fee__c: number | null
          Referral_Payee__c: string | null
          Scoped__c: boolean | null
          Scoped_f__c: string | null
          Site_Criteria__c: string | null
          SystemModstamp: string | null
          Transaction_Type__c: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c?: string | null
          Assignment_Value__c?: number | null
          Commission__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Due_Date__c?: string | null
          Fee__c?: number | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Name?: string | null
          Num_of_Pursuing_Ownership__c?: string | null
          Num_of_Site_Submits__c?: string | null
          Number_of_Pursuing_Ownership_Site_Submit__c?: number | null
          Number_of_Site_Submits__c?: number | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Priority__c?: string | null
          Progress__c?: string | null
          Referral_Fee__c?: number | null
          Referral_Payee__c?: string | null
          Scoped__c?: boolean | null
          Scoped_f__c?: string | null
          Site_Criteria__c?: string | null
          SystemModstamp?: string | null
          Transaction_Type__c?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Account__c?: string | null
          Assignment_Value__c?: number | null
          Commission__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Due_Date__c?: string | null
          Fee__c?: number | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Name?: string | null
          Num_of_Pursuing_Ownership__c?: string | null
          Num_of_Site_Submits__c?: string | null
          Number_of_Pursuing_Ownership_Site_Submit__c?: number | null
          Number_of_Site_Submits__c?: number | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Priority__c?: string | null
          Progress__c?: string | null
          Referral_Fee__c?: number | null
          Referral_Payee__c?: string | null
          Scoped__c?: boolean | null
          Scoped_f__c?: string | null
          Site_Criteria__c?: string | null
          SystemModstamp?: string | null
          Transaction_Type__c?: string | null
        }
        Relationships: []
      }
      salesforce_Commission_Split__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AGCI__c: number | null
          Broker__c: string | null
          Broker_Total__c: number | null
          CommSplit_Dollars__c: number | null
          CommSplit_Percent__c: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Deal_Dollars__c: number | null
          Deal_Percent__c: number | null
          GCI__c: number | null
          House_Dollars__c: number | null
          House_Percent__c: number | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          Net_Commission__c: number | null
          Oculus_Net__c: number | null
          Opportunity__c: string | null
          Opportunity_Fee__c: number | null
          Opportunity_Info__c: string | null
          Opportunity_Stage__c: string | null
          Origination_Dollars__c: number | null
          Origination_Percent__c: number | null
          OwnerId: string | null
          Payment_Amount__c: number | null
          Payment_Date__c: string | null
          Payment_Name__c: string | null
          Payment_Received__c: boolean | null
          Referral_Fee_Percent__c: number | null
          Site_Dollars__c: number | null
          Site_Percent__c: number | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AGCI__c?: number | null
          Broker__c?: string | null
          Broker_Total__c?: number | null
          CommSplit_Dollars__c?: number | null
          CommSplit_Percent__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          GCI__c?: number | null
          House_Dollars__c?: number | null
          House_Percent__c?: number | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Net_Commission__c?: number | null
          Oculus_Net__c?: number | null
          Opportunity__c?: string | null
          Opportunity_Fee__c?: number | null
          Opportunity_Info__c?: string | null
          Opportunity_Stage__c?: string | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          OwnerId?: string | null
          Payment_Amount__c?: number | null
          Payment_Date__c?: string | null
          Payment_Name__c?: string | null
          Payment_Received__c?: boolean | null
          Referral_Fee_Percent__c?: number | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AGCI__c?: number | null
          Broker__c?: string | null
          Broker_Total__c?: number | null
          CommSplit_Dollars__c?: number | null
          CommSplit_Percent__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          GCI__c?: number | null
          House_Dollars__c?: number | null
          House_Percent__c?: number | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Net_Commission__c?: number | null
          Oculus_Net__c?: number | null
          Opportunity__c?: string | null
          Opportunity_Fee__c?: number | null
          Opportunity_Info__c?: string | null
          Opportunity_Stage__c?: string | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          OwnerId?: string | null
          Payment_Amount__c?: number | null
          Payment_Date__c?: string | null
          Payment_Name__c?: string | null
          Payment_Received__c?: boolean | null
          Referral_Fee_Percent__c?: number | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_Commission_Split__Share: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccessLevel: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          ParentId: string | null
          RowCause: string | null
          UserOrGroupId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccessLevel?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          ParentId?: string | null
          RowCause?: string | null
          UserOrGroupId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccessLevel?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          ParentId?: string | null
          RowCause?: string | null
          UserOrGroupId?: string | null
        }
        Relationships: []
      }
      salesforce_Contact: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId: string | null
          Add_to_Developer_Blast__c: boolean | null
          Add_to_Leasing_Agent_Blast__c: boolean | null
          Company__c: string | null
          Contact_Tags__c: string | null
          Contact_Type__c: string | null
          ContactSource: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Department: string | null
          Developer_Email_Blast__c: boolean | null
          Email: string | null
          Email_List__c: string | null
          EmailBouncedDate: string | null
          EmailBouncedReason: string | null
          Fax: string | null
          FirstName: string | null
          HQ_Name__c: string | null
          Id: string | null
          IndividualId: string | null
          Is_Site_Selector__c: boolean | null
          IsDeleted: boolean | null
          IsEmailBounced: boolean | null
          IsPriorityRecord: boolean | null
          Jigsaw: string | null
          JigsawContactId: string | null
          LastActivityDate: string | null
          LastCURequestDate: string | null
          LastCUUpdateDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastName: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Leasing_Email_Blast__c: boolean | null
          LinkedIN_Connection__c: boolean | null
          MailingAddress: Json | null
          MailingCity: string | null
          MailingCountry: string | null
          MailingGeocodeAccuracy: string | null
          MailingLatitude: number | null
          MailingLongitude: number | null
          MailingPostalCode: string | null
          MailingState: string | null
          MailingStreet: string | null
          MasterRecordId: string | null
          MiddleName: string | null
          MobilePhone: string | null
          Name: string | null
          OwnerId: string | null
          Personal_Email__c: string | null
          Phone: string | null
          PhotoUrl: string | null
          ReportsToId: string | null
          Salutation: string | null
          Suffix: string | null
          SystemModstamp: string | null
          Title: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId?: string | null
          Add_to_Developer_Blast__c?: boolean | null
          Add_to_Leasing_Agent_Blast__c?: boolean | null
          Company__c?: string | null
          Contact_Tags__c?: string | null
          Contact_Type__c?: string | null
          ContactSource?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Department?: string | null
          Developer_Email_Blast__c?: boolean | null
          Email?: string | null
          Email_List__c?: string | null
          EmailBouncedDate?: string | null
          EmailBouncedReason?: string | null
          Fax?: string | null
          FirstName?: string | null
          HQ_Name__c?: string | null
          Id?: string | null
          IndividualId?: string | null
          Is_Site_Selector__c?: boolean | null
          IsDeleted?: boolean | null
          IsEmailBounced?: boolean | null
          IsPriorityRecord?: boolean | null
          Jigsaw?: string | null
          JigsawContactId?: string | null
          LastActivityDate?: string | null
          LastCURequestDate?: string | null
          LastCUUpdateDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastName?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Leasing_Email_Blast__c?: boolean | null
          LinkedIN_Connection__c?: boolean | null
          MailingAddress?: Json | null
          MailingCity?: string | null
          MailingCountry?: string | null
          MailingGeocodeAccuracy?: string | null
          MailingLatitude?: number | null
          MailingLongitude?: number | null
          MailingPostalCode?: string | null
          MailingState?: string | null
          MailingStreet?: string | null
          MasterRecordId?: string | null
          MiddleName?: string | null
          MobilePhone?: string | null
          Name?: string | null
          OwnerId?: string | null
          Personal_Email__c?: string | null
          Phone?: string | null
          PhotoUrl?: string | null
          ReportsToId?: string | null
          Salutation?: string | null
          Suffix?: string | null
          SystemModstamp?: string | null
          Title?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccountId?: string | null
          Add_to_Developer_Blast__c?: boolean | null
          Add_to_Leasing_Agent_Blast__c?: boolean | null
          Company__c?: string | null
          Contact_Tags__c?: string | null
          Contact_Type__c?: string | null
          ContactSource?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Department?: string | null
          Developer_Email_Blast__c?: boolean | null
          Email?: string | null
          Email_List__c?: string | null
          EmailBouncedDate?: string | null
          EmailBouncedReason?: string | null
          Fax?: string | null
          FirstName?: string | null
          HQ_Name__c?: string | null
          Id?: string | null
          IndividualId?: string | null
          Is_Site_Selector__c?: boolean | null
          IsDeleted?: boolean | null
          IsEmailBounced?: boolean | null
          IsPriorityRecord?: boolean | null
          Jigsaw?: string | null
          JigsawContactId?: string | null
          LastActivityDate?: string | null
          LastCURequestDate?: string | null
          LastCUUpdateDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastName?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Leasing_Email_Blast__c?: boolean | null
          LinkedIN_Connection__c?: boolean | null
          MailingAddress?: Json | null
          MailingCity?: string | null
          MailingCountry?: string | null
          MailingGeocodeAccuracy?: string | null
          MailingLatitude?: number | null
          MailingLongitude?: number | null
          MailingPostalCode?: string | null
          MailingState?: string | null
          MailingStreet?: string | null
          MasterRecordId?: string | null
          MiddleName?: string | null
          MobilePhone?: string | null
          Name?: string | null
          OwnerId?: string | null
          Personal_Email__c?: string | null
          Phone?: string | null
          PhotoUrl?: string | null
          ReportsToId?: string | null
          Salutation?: string | null
          Suffix?: string | null
          SystemModstamp?: string | null
          Title?: string | null
        }
        Relationships: []
      }
      salesforce_ContentDocument: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ArchivedById: string | null
          ArchivedDate: string | null
          ContentAssetId: string | null
          ContentModifiedDate: string | null
          ContentSize: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Description: string | null
          FileExtension: string | null
          FileType: string | null
          Id: string | null
          IsArchived: boolean | null
          IsDeleted: boolean | null
          IsInternalOnly: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          LatestPublishedVersionId: string | null
          OwnerId: string | null
          ParentId: string | null
          PublishStatus: string | null
          SharingOption: string | null
          SharingPrivacy: string | null
          SystemModstamp: string | null
          Title: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ArchivedById?: string | null
          ArchivedDate?: string | null
          ContentAssetId?: string | null
          ContentModifiedDate?: string | null
          ContentSize?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          FileExtension?: string | null
          FileType?: string | null
          Id?: string | null
          IsArchived?: boolean | null
          IsDeleted?: boolean | null
          IsInternalOnly?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          LatestPublishedVersionId?: string | null
          OwnerId?: string | null
          ParentId?: string | null
          PublishStatus?: string | null
          SharingOption?: string | null
          SharingPrivacy?: string | null
          SystemModstamp?: string | null
          Title?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ArchivedById?: string | null
          ArchivedDate?: string | null
          ContentAssetId?: string | null
          ContentModifiedDate?: string | null
          ContentSize?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          FileExtension?: string | null
          FileType?: string | null
          Id?: string | null
          IsArchived?: boolean | null
          IsDeleted?: boolean | null
          IsInternalOnly?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          LatestPublishedVersionId?: string | null
          OwnerId?: string | null
          ParentId?: string | null
          PublishStatus?: string | null
          SharingOption?: string | null
          SharingPrivacy?: string | null
          SystemModstamp?: string | null
          Title?: string | null
        }
        Relationships: []
      }
      salesforce_ContentDocumentLink: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ContentDocumentId: string | null
          Id: string | null
          IsDeleted: boolean | null
          LinkedEntityId: string | null
          ShareType: string | null
          SystemModstamp: string | null
          Visibility: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ContentDocumentId?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LinkedEntityId?: string | null
          ShareType?: string | null
          SystemModstamp?: string | null
          Visibility?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ContentDocumentId?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LinkedEntityId?: string | null
          ShareType?: string | null
          SystemModstamp?: string | null
          Visibility?: string | null
        }
        Relationships: []
      }
      salesforce_ContentDocumentLink_airbyte_tmp: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ContentDocumentId: string | null
          Id: string | null
          IsDeleted: boolean | null
          LinkedEntityId: string | null
          ShareType: string | null
          SystemModstamp: string | null
          Visibility: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ContentDocumentId?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LinkedEntityId?: string | null
          ShareType?: string | null
          SystemModstamp?: string | null
          Visibility?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ContentDocumentId?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LinkedEntityId?: string | null
          ShareType?: string | null
          SystemModstamp?: string | null
          Visibility?: string | null
        }
        Relationships: []
      }
      salesforce_ContentNote: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Content: string | null
          ContentModifiedDate: string | null
          ContentSize: number | null
          CreatedById: string | null
          CreatedDate: string | null
          FileExtension: string | null
          FileType: string | null
          Id: string | null
          IsDeleted: boolean | null
          IsReadOnly: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastViewedDate: string | null
          LatestContentId: string | null
          LatestPublishedVersionId: string | null
          OwnerId: string | null
          SharingPrivacy: string | null
          TextPreview: string | null
          Title: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Content?: string | null
          ContentModifiedDate?: string | null
          ContentSize?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          FileExtension?: string | null
          FileType?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsReadOnly?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastViewedDate?: string | null
          LatestContentId?: string | null
          LatestPublishedVersionId?: string | null
          OwnerId?: string | null
          SharingPrivacy?: string | null
          TextPreview?: string | null
          Title?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Content?: string | null
          ContentModifiedDate?: string | null
          ContentSize?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          FileExtension?: string | null
          FileType?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsReadOnly?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastViewedDate?: string | null
          LatestContentId?: string | null
          LatestPublishedVersionId?: string | null
          OwnerId?: string | null
          SharingPrivacy?: string | null
          TextPreview?: string | null
          Title?: string | null
        }
        Relationships: []
      }
      salesforce_ContentVersion: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Checksum: string | null
          ContentBodyId: string | null
          ContentDocumentId: string | null
          ContentLocation: string | null
          ContentModifiedById: string | null
          ContentModifiedDate: string | null
          ContentSize: number | null
          ContentUrl: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Description: string | null
          ExternalDataSourceId: string | null
          ExternalDocumentInfo1: string | null
          ExternalDocumentInfo2: string | null
          FeaturedContentBoost: number | null
          FeaturedContentDate: string | null
          FileExtension: string | null
          FileType: string | null
          FirstPublishLocationId: string | null
          Id: string | null
          IsAssetEnabled: boolean | null
          IsDeleted: boolean | null
          IsLatest: boolean | null
          IsMajorVersion: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          NegativeRatingCount: number | null
          Origin: string | null
          OwnerId: string | null
          PathOnClient: string | null
          PositiveRatingCount: number | null
          PublishStatus: string | null
          RatingCount: number | null
          ReasonForChange: string | null
          SharingOption: string | null
          SharingPrivacy: string | null
          SystemModstamp: string | null
          TagCsv: string | null
          TextPreview: string | null
          Title: string | null
          VersionData: string | null
          VersionDataUrl: string | null
          VersionNumber: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Checksum?: string | null
          ContentBodyId?: string | null
          ContentDocumentId?: string | null
          ContentLocation?: string | null
          ContentModifiedById?: string | null
          ContentModifiedDate?: string | null
          ContentSize?: number | null
          ContentUrl?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          ExternalDataSourceId?: string | null
          ExternalDocumentInfo1?: string | null
          ExternalDocumentInfo2?: string | null
          FeaturedContentBoost?: number | null
          FeaturedContentDate?: string | null
          FileExtension?: string | null
          FileType?: string | null
          FirstPublishLocationId?: string | null
          Id?: string | null
          IsAssetEnabled?: boolean | null
          IsDeleted?: boolean | null
          IsLatest?: boolean | null
          IsMajorVersion?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          NegativeRatingCount?: number | null
          Origin?: string | null
          OwnerId?: string | null
          PathOnClient?: string | null
          PositiveRatingCount?: number | null
          PublishStatus?: string | null
          RatingCount?: number | null
          ReasonForChange?: string | null
          SharingOption?: string | null
          SharingPrivacy?: string | null
          SystemModstamp?: string | null
          TagCsv?: string | null
          TextPreview?: string | null
          Title?: string | null
          VersionData?: string | null
          VersionDataUrl?: string | null
          VersionNumber?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Checksum?: string | null
          ContentBodyId?: string | null
          ContentDocumentId?: string | null
          ContentLocation?: string | null
          ContentModifiedById?: string | null
          ContentModifiedDate?: string | null
          ContentSize?: number | null
          ContentUrl?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          ExternalDataSourceId?: string | null
          ExternalDocumentInfo1?: string | null
          ExternalDocumentInfo2?: string | null
          FeaturedContentBoost?: number | null
          FeaturedContentDate?: string | null
          FileExtension?: string | null
          FileType?: string | null
          FirstPublishLocationId?: string | null
          Id?: string | null
          IsAssetEnabled?: boolean | null
          IsDeleted?: boolean | null
          IsLatest?: boolean | null
          IsMajorVersion?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          NegativeRatingCount?: number | null
          Origin?: string | null
          OwnerId?: string | null
          PathOnClient?: string | null
          PositiveRatingCount?: number | null
          PublishStatus?: string | null
          RatingCount?: number | null
          ReasonForChange?: string | null
          SharingOption?: string | null
          SharingPrivacy?: string | null
          SystemModstamp?: string | null
          TagCsv?: string | null
          TextPreview?: string | null
          Title?: string | null
          VersionData?: string | null
          VersionDataUrl?: string | null
          VersionNumber?: string | null
        }
        Relationships: []
      }
      salesforce_Critical_Date__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          Critical_Date__c: string | null
          Critical_Date_Name__c: string | null
          Description__c: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Name: string | null
          Opportunity__c: string | null
          OwnerId: string | null
          Send_Email__c: boolean | null
          Send_Email_Date__c: string | null
          Send_Email_Days_Prior__c: number | null
          Subject__c: string | null
          SystemModstamp: string | null
          Temp_UpdateName__c: boolean | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          Critical_Date__c?: string | null
          Critical_Date_Name__c?: string | null
          Description__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Send_Email__c?: boolean | null
          Send_Email_Date__c?: string | null
          Send_Email_Days_Prior__c?: number | null
          Subject__c?: string | null
          SystemModstamp?: string | null
          Temp_UpdateName__c?: boolean | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          Critical_Date__c?: string | null
          Critical_Date_Name__c?: string | null
          Description__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Send_Email__c?: boolean | null
          Send_Email_Date__c?: string | null
          Send_Email_Days_Prior__c?: number | null
          Subject__c?: string | null
          SystemModstamp?: string | null
          Temp_UpdateName__c?: boolean | null
        }
        Relationships: []
      }
      salesforce_Critical_Date__Share: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccessLevel: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          ParentId: string | null
          RowCause: string | null
          UserOrGroupId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccessLevel?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          ParentId?: string | null
          RowCause?: string | null
          UserOrGroupId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccessLevel?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          ParentId?: string | null
          RowCause?: string | null
          UserOrGroupId?: string | null
        }
        Relationships: []
      }
      salesforce_J_Property_2_Account__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          Property__c: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Property__c?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Account__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Property__c?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_J_Property_2_Contacts__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Contact__c: string | null
          Contact_Name__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Email__c: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          MobilePhone__c: string | null
          Name: string | null
          OwnerId: string | null
          Phone__c: string | null
          Property__c: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Contact__c?: string | null
          Contact_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Email__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MobilePhone__c?: string | null
          Name?: string | null
          OwnerId?: string | null
          Phone__c?: string | null
          Property__c?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Contact__c?: string | null
          Contact_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Email__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MobilePhone__c?: string | null
          Name?: string | null
          OwnerId?: string | null
          Phone__c?: string | null
          Property__c?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_J_Property_2_Opportunity__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account_Name__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          Opportunity__c: string | null
          OwnerId: string | null
          Priority__c: string | null
          Property__c: string | null
          Property_Stage__c: string | null
          StageName__c: string | null
          SystemModstamp: string | null
          Target_Close_Date__c: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Priority__c?: string | null
          Property__c?: string | null
          Property_Stage__c?: string | null
          StageName__c?: string | null
          SystemModstamp?: string | null
          Target_Close_Date__c?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Account_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Priority__c?: string | null
          Property__c?: string | null
          Property_Stage__c?: string | null
          StageName__c?: string | null
          SystemModstamp?: string | null
          Target_Close_Date__c?: string | null
        }
        Relationships: []
      }
      salesforce_J_Property_2_Opportunity__History: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          Field: string | null
          Id: string | null
          IsDeleted: boolean | null
          NewValue: string | null
          OldValue: string | null
          ParentId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Relationships: []
      }
      salesforce_Lead: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Address: Json | null
          City: string | null
          Company: string | null
          ConvertedAccountId: string | null
          ConvertedContactId: string | null
          ConvertedDate: string | null
          ConvertedOpportunityId: string | null
          Country: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Email: string | null
          Email_Campaigns__c: string | null
          EmailBouncedDate: string | null
          EmailBouncedReason: string | null
          FirstName: string | null
          GeocodeAccuracy: string | null
          ICSC_Profile_Link__c: string | null
          Id: string | null
          IndividualId: string | null
          Industry: string | null
          IsConverted: boolean | null
          IsDeleted: boolean | null
          IsPriorityRecord: boolean | null
          IsUnreadByOwner: boolean | null
          Jigsaw: string | null
          JigsawContactId: string | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastName: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Latitude: number | null
          Lead_List__c: string | null
          Lead_Notes__c: string | null
          Lead_Tags__c: string | null
          LeadSource: string | null
          LinkedIN_Connection__c: boolean | null
          LinkedIN_Profile_Link__c: string | null
          Longitude: number | null
          maps__AssignmentRule__c: string | null
          MasterRecordId: string | null
          MiddleName: string | null
          MobilePhone: string | null
          Name: string | null
          NumberOfEmployees: number | null
          OwnerId: string | null
          Phone: string | null
          PhotoUrl: string | null
          PostalCode: string | null
          Rating: string | null
          RetailSphere_Link__c: string | null
          Salutation: string | null
          State: string | null
          Status: string | null
          Street: string | null
          Suffix: string | null
          SystemModstamp: string | null
          Tenant_Rep__c: string | null
          Tenant_Repped__c: boolean | null
          Title: string | null
          Website: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Address?: Json | null
          City?: string | null
          Company?: string | null
          ConvertedAccountId?: string | null
          ConvertedContactId?: string | null
          ConvertedDate?: string | null
          ConvertedOpportunityId?: string | null
          Country?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Email?: string | null
          Email_Campaigns__c?: string | null
          EmailBouncedDate?: string | null
          EmailBouncedReason?: string | null
          FirstName?: string | null
          GeocodeAccuracy?: string | null
          ICSC_Profile_Link__c?: string | null
          Id?: string | null
          IndividualId?: string | null
          Industry?: string | null
          IsConverted?: boolean | null
          IsDeleted?: boolean | null
          IsPriorityRecord?: boolean | null
          IsUnreadByOwner?: boolean | null
          Jigsaw?: string | null
          JigsawContactId?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastName?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Latitude?: number | null
          Lead_List__c?: string | null
          Lead_Notes__c?: string | null
          Lead_Tags__c?: string | null
          LeadSource?: string | null
          LinkedIN_Connection__c?: boolean | null
          LinkedIN_Profile_Link__c?: string | null
          Longitude?: number | null
          maps__AssignmentRule__c?: string | null
          MasterRecordId?: string | null
          MiddleName?: string | null
          MobilePhone?: string | null
          Name?: string | null
          NumberOfEmployees?: number | null
          OwnerId?: string | null
          Phone?: string | null
          PhotoUrl?: string | null
          PostalCode?: string | null
          Rating?: string | null
          RetailSphere_Link__c?: string | null
          Salutation?: string | null
          State?: string | null
          Status?: string | null
          Street?: string | null
          Suffix?: string | null
          SystemModstamp?: string | null
          Tenant_Rep__c?: string | null
          Tenant_Repped__c?: boolean | null
          Title?: string | null
          Website?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Address?: Json | null
          City?: string | null
          Company?: string | null
          ConvertedAccountId?: string | null
          ConvertedContactId?: string | null
          ConvertedDate?: string | null
          ConvertedOpportunityId?: string | null
          Country?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Email?: string | null
          Email_Campaigns__c?: string | null
          EmailBouncedDate?: string | null
          EmailBouncedReason?: string | null
          FirstName?: string | null
          GeocodeAccuracy?: string | null
          ICSC_Profile_Link__c?: string | null
          Id?: string | null
          IndividualId?: string | null
          Industry?: string | null
          IsConverted?: boolean | null
          IsDeleted?: boolean | null
          IsPriorityRecord?: boolean | null
          IsUnreadByOwner?: boolean | null
          Jigsaw?: string | null
          JigsawContactId?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastName?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Latitude?: number | null
          Lead_List__c?: string | null
          Lead_Notes__c?: string | null
          Lead_Tags__c?: string | null
          LeadSource?: string | null
          LinkedIN_Connection__c?: boolean | null
          LinkedIN_Profile_Link__c?: string | null
          Longitude?: number | null
          maps__AssignmentRule__c?: string | null
          MasterRecordId?: string | null
          MiddleName?: string | null
          MobilePhone?: string | null
          Name?: string | null
          NumberOfEmployees?: number | null
          OwnerId?: string | null
          Phone?: string | null
          PhotoUrl?: string | null
          PostalCode?: string | null
          Rating?: string | null
          RetailSphere_Link__c?: string | null
          Salutation?: string | null
          State?: string | null
          Status?: string | null
          Street?: string | null
          Suffix?: string | null
          SystemModstamp?: string | null
          Tenant_Rep__c?: string | null
          Tenant_Repped__c?: boolean | null
          Title?: string | null
          Website?: string | null
        }
        Relationships: []
      }
      salesforce_LeadFeed: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BestCommentId: string | null
          Body: string | null
          CommentCount: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          InsertedById: string | null
          IsDeleted: boolean | null
          IsRichText: boolean | null
          LastModifiedDate: string | null
          LikeCount: number | null
          LinkUrl: string | null
          ParentId: string | null
          RelatedRecordId: string | null
          SystemModstamp: string | null
          Title: string | null
          Type: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BestCommentId?: string | null
          Body?: string | null
          CommentCount?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          InsertedById?: string | null
          IsDeleted?: boolean | null
          IsRichText?: boolean | null
          LastModifiedDate?: string | null
          LikeCount?: number | null
          LinkUrl?: string | null
          ParentId?: string | null
          RelatedRecordId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
          Type?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          BestCommentId?: string | null
          Body?: string | null
          CommentCount?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          InsertedById?: string | null
          IsDeleted?: boolean | null
          IsRichText?: boolean | null
          LastModifiedDate?: string | null
          LikeCount?: number | null
          LinkUrl?: string | null
          ParentId?: string | null
          RelatedRecordId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
          Type?: string | null
        }
        Relationships: []
      }
      salesforce_LeadStatus: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ApiName: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsConverted: boolean | null
          IsDefault: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          MasterLabel: string | null
          SortOrder: number | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ApiName?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsConverted?: boolean | null
          IsDefault?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MasterLabel?: string | null
          SortOrder?: number | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ApiName?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsConverted?: boolean | null
          IsDefault?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MasterLabel?: string | null
          SortOrder?: number | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_Note: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Body: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          IsPrivate: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          OwnerId: string | null
          ParentId: string | null
          SystemModstamp: string | null
          Title: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Body?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsPrivate?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          OwnerId?: string | null
          ParentId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Body?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsPrivate?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          OwnerId?: string | null
          ParentId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
        }
        Relationships: []
      }
      salesforce_Opportunity: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId: string | null
          Address__c: string | null
          AGCI__c: number | null
          Amount: number | null
          Assign_To__c: string | null
          Assignment__c: string | null
          Booked__c: boolean | null
          Booked_Date__c: string | null
          Booked_Month__c: string | null
          Booked_Year__c: string | null
          Broker__c: string | null
          Broker_Total_Arty__c: number | null
          Broker_Total_Greg__c: number | null
          Broker_Total_Mike__c: number | null
          Budget__c: number | null
          Budget_Confirmed__c: boolean | null
          Calculated_Amount__c: number | null
          CampaignId: string | null
          City__c: string | null
          Close_Date_Est__c: string | null
          Closed_Date__c: string | null
          CloseDate: string | null
          Comments__c: string | null
          Commission__c: number | null
          Commission_Agreement_File_Uploaded__c: boolean | null
          Commission_Agreement_Link__c: string | null
          Company_Dollar__c: number | null
          ContactId: string | null
          Contingency_Date_Est__c: string | null
          ContractId: string | null
          CountPayment1__c: number | null
          CountPayment2__c: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Deal_Dollars__c: number | null
          Deal_Percent__c: number | null
          Deal_Value__c: number | null
          Delivery_Date__c: string | null
          Description: string | null
          Discovery_Completed__c: boolean | null
          Estimated_Open_Date__c: string | null
          Fiscal: string | null
          FiscalQuarter: number | null
          FiscalYear: number | null
          ForecastCategory: string | null
          ForecastCategoryName: string | null
          Gap__c: string | null
          GCI__c: number | null
          Greg_Commission__c: number | null
          Greg_Commission_Split__c: number | null
          Greg_GCI_Credit__c: number | null
          Greg_GCI_Percent__c: number | null
          HasOpenActivity: boolean | null
          HasOpportunityLineItem: boolean | null
          HasOverdueTask: boolean | null
          House_Dollars__c: number | null
          House_Percent__c: number | null
          Id: string | null
          Invoice_Request_File_Uploaded__c: boolean | null
          Invoice_Request_Link__c: string | null
          IsClosed: boolean | null
          IsDeleted: boolean | null
          IsWon: boolean | null
          LastActivityDate: string | null
          LastAmountChangedHistoryId: string | null
          LastCloseDateChangedHistoryId: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastStageChangeDate: string | null
          LastViewedDate: string | null
          LeadSource: string | null
          Lease_PSA_File_Uploaded__c: boolean | null
          Lease_PSA_Link__c: string | null
          Lease_PSA_Signed_Date__c: string | null
          LOI_Executed_File_Uploaded__c: boolean | null
          LOI_Executed_Link__c: string | null
          LOI_Signed_Date__c: string | null
          Loss_Reason__c: string | null
          Map_Link__c: string | null
          Mike_Commission__c: number | null
          Mike_Commission_Split__c: number | null
          Mike_GCI_Credit__c: number | null
          Mike_s_GCI__c: number | null
          Mike_s_Total_GCI_Credit__c: number | null
          Motivation__c: string | null
          Multiple_Payments__c: boolean | null
          Name: string | null
          Net_Commission_Calculated__c: number | null
          Net_Commission_Percentage__c: number | null
          Net_Commissions__c: number | null
          NextStep: string | null
          OBC_Collater__c: boolean | null
          Oculus_Net__c: number | null
          Origination_Dollars__c: number | null
          Origination_Percent__c: number | null
          OwnerId: string | null
          Payment_1__c: number | null
          Payment_1_Date_Est__c: string | null
          Payment_1_Received__c: boolean | null
          Payment_2_Date_Est__c: string | null
          Payment_2_Received__c: boolean | null
          Payment_Amt_2__c: number | null
          Pmt_1_Date_Actual__c: string | null
          Pmt_1_Invoice_Date__c: string | null
          Pmt_1_Invoice_Sent__c: boolean | null
          Pmt_2_Date_Actual__c: string | null
          Pmt_2_Invoice_Date__c: string | null
          Pmt_2_Invoice_Sent__c: boolean | null
          Pricebook2Id: string | null
          Probability: number | null
          Property__c: string | null
          Property_Type__c: string | null
          Property_Unit__c: string | null
          PushCount: number | null
          RecordTypeId: string | null
          Referral_Fee__c: number | null
          Referral_Fee_p__c: number | null
          Referral_Payee__c: string | null
          Referral_Payee_Account__c: string | null
          Rent_Commencement_Date__c: string | null
          Represent__c: string | null
          ROI_Analysis_Completed__c: boolean | null
          Site_Dollars__c: number | null
          Site_Percent__c: number | null
          Site_Submits__c: string | null
          Size_Acres__c: number | null
          Size_Sqft__c: number | null
          StageName: string | null
          State__c: string | null
          SyncedQuoteId: string | null
          SystemModstamp: string | null
          TotalPaymentRecord__c: number | null
          Transaction_Type__c: string | null
          Type: string | null
          Weighted_Fee__c: number | null
          Zip__c: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId?: string | null
          Address__c?: string | null
          AGCI__c?: number | null
          Amount?: number | null
          Assign_To__c?: string | null
          Assignment__c?: string | null
          Booked__c?: boolean | null
          Booked_Date__c?: string | null
          Booked_Month__c?: string | null
          Booked_Year__c?: string | null
          Broker__c?: string | null
          Broker_Total_Arty__c?: number | null
          Broker_Total_Greg__c?: number | null
          Broker_Total_Mike__c?: number | null
          Budget__c?: number | null
          Budget_Confirmed__c?: boolean | null
          Calculated_Amount__c?: number | null
          CampaignId?: string | null
          City__c?: string | null
          Close_Date_Est__c?: string | null
          Closed_Date__c?: string | null
          CloseDate?: string | null
          Comments__c?: string | null
          Commission__c?: number | null
          Commission_Agreement_File_Uploaded__c?: boolean | null
          Commission_Agreement_Link__c?: string | null
          Company_Dollar__c?: number | null
          ContactId?: string | null
          Contingency_Date_Est__c?: string | null
          ContractId?: string | null
          CountPayment1__c?: number | null
          CountPayment2__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          Deal_Value__c?: number | null
          Delivery_Date__c?: string | null
          Description?: string | null
          Discovery_Completed__c?: boolean | null
          Estimated_Open_Date__c?: string | null
          Fiscal?: string | null
          FiscalQuarter?: number | null
          FiscalYear?: number | null
          ForecastCategory?: string | null
          ForecastCategoryName?: string | null
          Gap__c?: string | null
          GCI__c?: number | null
          Greg_Commission__c?: number | null
          Greg_Commission_Split__c?: number | null
          Greg_GCI_Credit__c?: number | null
          Greg_GCI_Percent__c?: number | null
          HasOpenActivity?: boolean | null
          HasOpportunityLineItem?: boolean | null
          HasOverdueTask?: boolean | null
          House_Dollars__c?: number | null
          House_Percent__c?: number | null
          Id?: string | null
          Invoice_Request_File_Uploaded__c?: boolean | null
          Invoice_Request_Link__c?: string | null
          IsClosed?: boolean | null
          IsDeleted?: boolean | null
          IsWon?: boolean | null
          LastActivityDate?: string | null
          LastAmountChangedHistoryId?: string | null
          LastCloseDateChangedHistoryId?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastStageChangeDate?: string | null
          LastViewedDate?: string | null
          LeadSource?: string | null
          Lease_PSA_File_Uploaded__c?: boolean | null
          Lease_PSA_Link__c?: string | null
          Lease_PSA_Signed_Date__c?: string | null
          LOI_Executed_File_Uploaded__c?: boolean | null
          LOI_Executed_Link__c?: string | null
          LOI_Signed_Date__c?: string | null
          Loss_Reason__c?: string | null
          Map_Link__c?: string | null
          Mike_Commission__c?: number | null
          Mike_Commission_Split__c?: number | null
          Mike_GCI_Credit__c?: number | null
          Mike_s_GCI__c?: number | null
          Mike_s_Total_GCI_Credit__c?: number | null
          Motivation__c?: string | null
          Multiple_Payments__c?: boolean | null
          Name?: string | null
          Net_Commission_Calculated__c?: number | null
          Net_Commission_Percentage__c?: number | null
          Net_Commissions__c?: number | null
          NextStep?: string | null
          OBC_Collater__c?: boolean | null
          Oculus_Net__c?: number | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          OwnerId?: string | null
          Payment_1__c?: number | null
          Payment_1_Date_Est__c?: string | null
          Payment_1_Received__c?: boolean | null
          Payment_2_Date_Est__c?: string | null
          Payment_2_Received__c?: boolean | null
          Payment_Amt_2__c?: number | null
          Pmt_1_Date_Actual__c?: string | null
          Pmt_1_Invoice_Date__c?: string | null
          Pmt_1_Invoice_Sent__c?: boolean | null
          Pmt_2_Date_Actual__c?: string | null
          Pmt_2_Invoice_Date__c?: string | null
          Pmt_2_Invoice_Sent__c?: boolean | null
          Pricebook2Id?: string | null
          Probability?: number | null
          Property__c?: string | null
          Property_Type__c?: string | null
          Property_Unit__c?: string | null
          PushCount?: number | null
          RecordTypeId?: string | null
          Referral_Fee__c?: number | null
          Referral_Fee_p__c?: number | null
          Referral_Payee__c?: string | null
          Referral_Payee_Account__c?: string | null
          Rent_Commencement_Date__c?: string | null
          Represent__c?: string | null
          ROI_Analysis_Completed__c?: boolean | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          Site_Submits__c?: string | null
          Size_Acres__c?: number | null
          Size_Sqft__c?: number | null
          StageName?: string | null
          State__c?: string | null
          SyncedQuoteId?: string | null
          SystemModstamp?: string | null
          TotalPaymentRecord__c?: number | null
          Transaction_Type__c?: string | null
          Type?: string | null
          Weighted_Fee__c?: number | null
          Zip__c?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccountId?: string | null
          Address__c?: string | null
          AGCI__c?: number | null
          Amount?: number | null
          Assign_To__c?: string | null
          Assignment__c?: string | null
          Booked__c?: boolean | null
          Booked_Date__c?: string | null
          Booked_Month__c?: string | null
          Booked_Year__c?: string | null
          Broker__c?: string | null
          Broker_Total_Arty__c?: number | null
          Broker_Total_Greg__c?: number | null
          Broker_Total_Mike__c?: number | null
          Budget__c?: number | null
          Budget_Confirmed__c?: boolean | null
          Calculated_Amount__c?: number | null
          CampaignId?: string | null
          City__c?: string | null
          Close_Date_Est__c?: string | null
          Closed_Date__c?: string | null
          CloseDate?: string | null
          Comments__c?: string | null
          Commission__c?: number | null
          Commission_Agreement_File_Uploaded__c?: boolean | null
          Commission_Agreement_Link__c?: string | null
          Company_Dollar__c?: number | null
          ContactId?: string | null
          Contingency_Date_Est__c?: string | null
          ContractId?: string | null
          CountPayment1__c?: number | null
          CountPayment2__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          Deal_Value__c?: number | null
          Delivery_Date__c?: string | null
          Description?: string | null
          Discovery_Completed__c?: boolean | null
          Estimated_Open_Date__c?: string | null
          Fiscal?: string | null
          FiscalQuarter?: number | null
          FiscalYear?: number | null
          ForecastCategory?: string | null
          ForecastCategoryName?: string | null
          Gap__c?: string | null
          GCI__c?: number | null
          Greg_Commission__c?: number | null
          Greg_Commission_Split__c?: number | null
          Greg_GCI_Credit__c?: number | null
          Greg_GCI_Percent__c?: number | null
          HasOpenActivity?: boolean | null
          HasOpportunityLineItem?: boolean | null
          HasOverdueTask?: boolean | null
          House_Dollars__c?: number | null
          House_Percent__c?: number | null
          Id?: string | null
          Invoice_Request_File_Uploaded__c?: boolean | null
          Invoice_Request_Link__c?: string | null
          IsClosed?: boolean | null
          IsDeleted?: boolean | null
          IsWon?: boolean | null
          LastActivityDate?: string | null
          LastAmountChangedHistoryId?: string | null
          LastCloseDateChangedHistoryId?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastStageChangeDate?: string | null
          LastViewedDate?: string | null
          LeadSource?: string | null
          Lease_PSA_File_Uploaded__c?: boolean | null
          Lease_PSA_Link__c?: string | null
          Lease_PSA_Signed_Date__c?: string | null
          LOI_Executed_File_Uploaded__c?: boolean | null
          LOI_Executed_Link__c?: string | null
          LOI_Signed_Date__c?: string | null
          Loss_Reason__c?: string | null
          Map_Link__c?: string | null
          Mike_Commission__c?: number | null
          Mike_Commission_Split__c?: number | null
          Mike_GCI_Credit__c?: number | null
          Mike_s_GCI__c?: number | null
          Mike_s_Total_GCI_Credit__c?: number | null
          Motivation__c?: string | null
          Multiple_Payments__c?: boolean | null
          Name?: string | null
          Net_Commission_Calculated__c?: number | null
          Net_Commission_Percentage__c?: number | null
          Net_Commissions__c?: number | null
          NextStep?: string | null
          OBC_Collater__c?: boolean | null
          Oculus_Net__c?: number | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          OwnerId?: string | null
          Payment_1__c?: number | null
          Payment_1_Date_Est__c?: string | null
          Payment_1_Received__c?: boolean | null
          Payment_2_Date_Est__c?: string | null
          Payment_2_Received__c?: boolean | null
          Payment_Amt_2__c?: number | null
          Pmt_1_Date_Actual__c?: string | null
          Pmt_1_Invoice_Date__c?: string | null
          Pmt_1_Invoice_Sent__c?: boolean | null
          Pmt_2_Date_Actual__c?: string | null
          Pmt_2_Invoice_Date__c?: string | null
          Pmt_2_Invoice_Sent__c?: boolean | null
          Pricebook2Id?: string | null
          Probability?: number | null
          Property__c?: string | null
          Property_Type__c?: string | null
          Property_Unit__c?: string | null
          PushCount?: number | null
          RecordTypeId?: string | null
          Referral_Fee__c?: number | null
          Referral_Fee_p__c?: number | null
          Referral_Payee__c?: string | null
          Referral_Payee_Account__c?: string | null
          Rent_Commencement_Date__c?: string | null
          Represent__c?: string | null
          ROI_Analysis_Completed__c?: boolean | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          Site_Submits__c?: string | null
          Size_Acres__c?: number | null
          Size_Sqft__c?: number | null
          StageName?: string | null
          State__c?: string | null
          SyncedQuoteId?: string | null
          SystemModstamp?: string | null
          TotalPaymentRecord__c?: number | null
          Transaction_Type__c?: string | null
          Type?: string | null
          Weighted_Fee__c?: number | null
          Zip__c?: string | null
        }
        Relationships: []
      }
      salesforce_Opportunity_Broker_Total__mdt: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Broker_Name__c: string | null
          DeveloperName: string | null
          Id: string | null
          Label: string | null
          Language: string | null
          MasterLabel: string | null
          NamespacePrefix: string | null
          QualifiedApiName: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Broker_Name__c?: string | null
          DeveloperName?: string | null
          Id?: string | null
          Label?: string | null
          Language?: string | null
          MasterLabel?: string | null
          NamespacePrefix?: string | null
          QualifiedApiName?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Broker_Name__c?: string | null
          DeveloperName?: string | null
          Id?: string | null
          Label?: string | null
          Language?: string | null
          MasterLabel?: string | null
          NamespacePrefix?: string | null
          QualifiedApiName?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_OpportunityContactRole: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ContactId: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          IsPrimary: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          OpportunityId: string | null
          Role: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ContactId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsPrimary?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          OpportunityId?: string | null
          Role?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ContactId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsPrimary?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          OpportunityId?: string | null
          Role?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_OpportunityFeed: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BestCommentId: string | null
          Body: string | null
          CommentCount: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          InsertedById: string | null
          IsDeleted: boolean | null
          IsRichText: boolean | null
          LastModifiedDate: string | null
          LikeCount: number | null
          LinkUrl: string | null
          ParentId: string | null
          RelatedRecordId: string | null
          SystemModstamp: string | null
          Title: string | null
          Type: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BestCommentId?: string | null
          Body?: string | null
          CommentCount?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          InsertedById?: string | null
          IsDeleted?: boolean | null
          IsRichText?: boolean | null
          LastModifiedDate?: string | null
          LikeCount?: number | null
          LinkUrl?: string | null
          ParentId?: string | null
          RelatedRecordId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
          Type?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          BestCommentId?: string | null
          Body?: string | null
          CommentCount?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          InsertedById?: string | null
          IsDeleted?: boolean | null
          IsRichText?: boolean | null
          LastModifiedDate?: string | null
          LikeCount?: number | null
          LinkUrl?: string | null
          ParentId?: string | null
          RelatedRecordId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
          Type?: string | null
        }
        Relationships: []
      }
      salesforce_Payment__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AGCI__c: number | null
          Billing_Entity__c: string | null
          Broker_Paid_Greg__c: boolean | null
          Broker_Paid_Mike__c: boolean | null
          Broker_Total_Arty__c: number | null
          Broker_Total_Greg__c: number | null
          Broker_Total_Mike__c: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Deal_Dollars__c: number | null
          Deal_Percent__c: number | null
          Greg_GCI__c: number | null
          Greg_GCI_Credit__c: number | null
          Greg_GCI_Percent_Credit__c: number | null
          Greg_Net_Commission__c: number | null
          Greg_Split__c: number | null
          House_Dollars__c: number | null
          House_Percent__c: number | null
          Id: string | null
          Invoice_Sent__c: boolean | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Mike_Commission__c: number | null
          Mike_GCI_credit_RETIRED__c: number | null
          Mike_GCI_credits__c: number | null
          Mike_GCI_Percentage__c: number | null
          Mike_Net_Commission__c: number | null
          Mike_PMT_GCI__c: number | null
          Mike_Split__c: number | null
          Name: string | null
          Net_Commission__c: number | null
          Net_Commission_Overwrite__c: number | null
          Net_Commission_Percentage__c: number | null
          Net_Commission_Percentages__c: number | null
          Net_Commissions__c: number | null
          Net_Payment_Received__c: number | null
          Oculus_Net__c: number | null
          Opportunity__c: string | null
          OREP_Invoice__c: string | null
          Origination_Dollars__c: number | null
          Origination_Percent__c: number | null
          Payment_Amount__c: number | null
          Payment_Date_Actual__c: string | null
          Payment_Date_Est__c: string | null
          Payment_Invoice_Date__c: string | null
          Payment_Received__c: boolean | null
          PMT_Received_Date__c: string | null
          Referral_Fee__c: number | null
          Referral_Fee_Paid__c: boolean | null
          Referral_Fee_Percentage__c: number | null
          Referral_Payee__c: string | null
          Referral_Payee_1__c: string | null
          Site_Dollars__c: number | null
          Site_Percent__c: number | null
          SystemModstamp: string | null
          Type__c: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AGCI__c?: number | null
          Billing_Entity__c?: string | null
          Broker_Paid_Greg__c?: boolean | null
          Broker_Paid_Mike__c?: boolean | null
          Broker_Total_Arty__c?: number | null
          Broker_Total_Greg__c?: number | null
          Broker_Total_Mike__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          Greg_GCI__c?: number | null
          Greg_GCI_Credit__c?: number | null
          Greg_GCI_Percent_Credit__c?: number | null
          Greg_Net_Commission__c?: number | null
          Greg_Split__c?: number | null
          House_Dollars__c?: number | null
          House_Percent__c?: number | null
          Id?: string | null
          Invoice_Sent__c?: boolean | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Mike_Commission__c?: number | null
          Mike_GCI_credit_RETIRED__c?: number | null
          Mike_GCI_credits__c?: number | null
          Mike_GCI_Percentage__c?: number | null
          Mike_Net_Commission__c?: number | null
          Mike_PMT_GCI__c?: number | null
          Mike_Split__c?: number | null
          Name?: string | null
          Net_Commission__c?: number | null
          Net_Commission_Overwrite__c?: number | null
          Net_Commission_Percentage__c?: number | null
          Net_Commission_Percentages__c?: number | null
          Net_Commissions__c?: number | null
          Net_Payment_Received__c?: number | null
          Oculus_Net__c?: number | null
          Opportunity__c?: string | null
          OREP_Invoice__c?: string | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          Payment_Amount__c?: number | null
          Payment_Date_Actual__c?: string | null
          Payment_Date_Est__c?: string | null
          Payment_Invoice_Date__c?: string | null
          Payment_Received__c?: boolean | null
          PMT_Received_Date__c?: string | null
          Referral_Fee__c?: number | null
          Referral_Fee_Paid__c?: boolean | null
          Referral_Fee_Percentage__c?: number | null
          Referral_Payee__c?: string | null
          Referral_Payee_1__c?: string | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          SystemModstamp?: string | null
          Type__c?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AGCI__c?: number | null
          Billing_Entity__c?: string | null
          Broker_Paid_Greg__c?: boolean | null
          Broker_Paid_Mike__c?: boolean | null
          Broker_Total_Arty__c?: number | null
          Broker_Total_Greg__c?: number | null
          Broker_Total_Mike__c?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          Greg_GCI__c?: number | null
          Greg_GCI_Credit__c?: number | null
          Greg_GCI_Percent_Credit__c?: number | null
          Greg_Net_Commission__c?: number | null
          Greg_Split__c?: number | null
          House_Dollars__c?: number | null
          House_Percent__c?: number | null
          Id?: string | null
          Invoice_Sent__c?: boolean | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Mike_Commission__c?: number | null
          Mike_GCI_credit_RETIRED__c?: number | null
          Mike_GCI_credits__c?: number | null
          Mike_GCI_Percentage__c?: number | null
          Mike_Net_Commission__c?: number | null
          Mike_PMT_GCI__c?: number | null
          Mike_Split__c?: number | null
          Name?: string | null
          Net_Commission__c?: number | null
          Net_Commission_Overwrite__c?: number | null
          Net_Commission_Percentage__c?: number | null
          Net_Commission_Percentages__c?: number | null
          Net_Commissions__c?: number | null
          Net_Payment_Received__c?: number | null
          Oculus_Net__c?: number | null
          Opportunity__c?: string | null
          OREP_Invoice__c?: string | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          Payment_Amount__c?: number | null
          Payment_Date_Actual__c?: string | null
          Payment_Date_Est__c?: string | null
          Payment_Invoice_Date__c?: string | null
          Payment_Received__c?: boolean | null
          PMT_Received_Date__c?: string | null
          Referral_Fee__c?: number | null
          Referral_Fee_Paid__c?: boolean | null
          Referral_Fee_Percentage__c?: number | null
          Referral_Payee__c?: string | null
          Referral_Payee_1__c?: string | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          SystemModstamp?: string | null
          Type__c?: string | null
        }
        Relationships: []
      }
      salesforce_Payment_Broker_Total__mdt: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Broker_Name__c: string | null
          DeveloperName: string | null
          Id: string | null
          Label: string | null
          Language: string | null
          MasterLabel: string | null
          NamespacePrefix: string | null
          QualifiedApiName: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Broker_Name__c?: string | null
          DeveloperName?: string | null
          Id?: string | null
          Label?: string | null
          Language?: string | null
          MasterLabel?: string | null
          NamespacePrefix?: string | null
          QualifiedApiName?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Broker_Name__c?: string | null
          DeveloperName?: string | null
          Id?: string | null
          Label?: string | null
          Language?: string | null
          MasterLabel?: string | null
          NamespacePrefix?: string | null
          QualifiedApiName?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_Payment_Split__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Broker__c: string | null
          Broker_Paid__c: boolean | null
          Broker_Picklist__c: string | null
          Broker_Total__c: number | null
          Commission_Split__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Deal_Dollars__c: number | null
          Deal_Percent__c: number | null
          Id: string | null
          IsDeleted: boolean | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          Origination_Dollars__c: number | null
          Origination_Percent__c: number | null
          OwnerId: string | null
          Payment__c: string | null
          Payment_Info__c: string | null
          Site_Dollars__c: number | null
          Site_Percent__c: number | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Broker__c?: string | null
          Broker_Paid__c?: boolean | null
          Broker_Picklist__c?: string | null
          Broker_Total__c?: number | null
          Commission_Split__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          OwnerId?: string | null
          Payment__c?: string | null
          Payment_Info__c?: string | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Broker__c?: string | null
          Broker_Paid__c?: boolean | null
          Broker_Picklist__c?: string | null
          Broker_Total__c?: number | null
          Commission_Split__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Deal_Dollars__c?: number | null
          Deal_Percent__c?: number | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Origination_Dollars__c?: number | null
          Origination_Percent__c?: number | null
          OwnerId?: string | null
          Payment__c?: string | null
          Payment_Info__c?: string | null
          Site_Dollars__c?: number | null
          Site_Percent__c?: number | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_Payment_Split__History: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          Field: string | null
          Id: string | null
          IsDeleted: boolean | null
          NewValue: string | null
          OldValue: string | null
          ParentId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Relationships: []
      }
      salesforce_Payment_Split__Share: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccessLevel: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          ParentId: string | null
          RowCause: string | null
          UserOrGroupId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccessLevel?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          ParentId?: string | null
          RowCause?: string | null
          UserOrGroupId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccessLevel?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          ParentId?: string | null
          RowCause?: string | null
          UserOrGroupId?: string | null
        }
        Relationships: []
      }
      salesforce_Property__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Access__c: string | null
          Acres__c: number | null
          All_In_Rent__c: number | null
          AM_PM__c: string | null
          Asking_Lease_Price__c: number | null
          Asking_Purchase_Price__c: number | null
          Available_Square_Footage__c: number | null
          Available_Units__c: string | null
          Building_Sqft__c: number | null
          Client_Existing_Locations__c: string | null
          Contact_Made__c: boolean | null
          Costar_Link__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Demographics__c: string | null
          Description__c: string | null
          Email_Verified__c: boolean | null
          File_Count__c: number | null
          Flyer__c: boolean | null
          HH_Income_Median_3_mile__c: number | null
          Id: string | null
          Import_Notes__c: string | null
          IsDeleted: boolean | null
          Landlord__c: string | null
          Landlord_Contact_Import__c: string | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Lat_Long__c: Json | null
          Lat_Long__Latitude__s: number | null
          Lat_Long__Longitude__s: number | null
          Layer_Notes__c: string | null
          Lease_Expiration_Date__c: string | null
          Letter_Sent__c: boolean | null
          Map_Link__c: string | null
          Marketing_Materials__c: string | null
          Name: string | null
          NNN_PSF__c: number | null
          Order_Import__c: number | null
          Owner__c: string | null
          Owner_Entity__c: string | null
          OwnerId: string | null
          Parcel_ID__c: string | null
          Phone_Verfied__c: boolean | null
          Primary_Contact__c: string | null
          Priority__c: string | null
          Property_Notes__c: string | null
          Property_Type__c: string | null
          Purchase_Lease__c: string | null
          RecordTypeId: string | null
          Related_Files__c: string | null
          Rent_PSF__c: number | null
          Reonomy_Link__c: string | null
          Site_Address__c: string | null
          Site_City__c: string | null
          Site_Country_Long__c: string | null
          Site_Country_Short__c: string | null
          Site_County__c: string | null
          Site_Plan__c: string | null
          Site_State__c: string | null
          Site_State_Long__c: string | null
          Site_Url__c: string | null
          Site_Zip__c: string | null
          Special_Layers__c: string | null
          stage__c: string | null
          Sub_Trade_Area__c: string | null
          SystemModstamp: string | null
          Tax_URL__c: string | null
          Total_Traffic__c: number | null
          Trade_Area__c: string | null
          Traffic_Count__c: number | null
          Traffic_Count_2nd__c: number | null
          Verified_Latitude__c: number | null
          Verified_Longitude__c: number | null
          X1_Mile_Pop__c: number | null
          X3_Mile_Pop__c: number | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Access__c?: string | null
          Acres__c?: number | null
          All_In_Rent__c?: number | null
          AM_PM__c?: string | null
          Asking_Lease_Price__c?: number | null
          Asking_Purchase_Price__c?: number | null
          Available_Square_Footage__c?: number | null
          Available_Units__c?: string | null
          Building_Sqft__c?: number | null
          Client_Existing_Locations__c?: string | null
          Contact_Made__c?: boolean | null
          Costar_Link__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Demographics__c?: string | null
          Description__c?: string | null
          Email_Verified__c?: boolean | null
          File_Count__c?: number | null
          Flyer__c?: boolean | null
          HH_Income_Median_3_mile__c?: number | null
          Id?: string | null
          Import_Notes__c?: string | null
          IsDeleted?: boolean | null
          Landlord__c?: string | null
          Landlord_Contact_Import__c?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Lat_Long__c?: Json | null
          Lat_Long__Latitude__s?: number | null
          Lat_Long__Longitude__s?: number | null
          Layer_Notes__c?: string | null
          Lease_Expiration_Date__c?: string | null
          Letter_Sent__c?: boolean | null
          Map_Link__c?: string | null
          Marketing_Materials__c?: string | null
          Name?: string | null
          NNN_PSF__c?: number | null
          Order_Import__c?: number | null
          Owner__c?: string | null
          Owner_Entity__c?: string | null
          OwnerId?: string | null
          Parcel_ID__c?: string | null
          Phone_Verfied__c?: boolean | null
          Primary_Contact__c?: string | null
          Priority__c?: string | null
          Property_Notes__c?: string | null
          Property_Type__c?: string | null
          Purchase_Lease__c?: string | null
          RecordTypeId?: string | null
          Related_Files__c?: string | null
          Rent_PSF__c?: number | null
          Reonomy_Link__c?: string | null
          Site_Address__c?: string | null
          Site_City__c?: string | null
          Site_Country_Long__c?: string | null
          Site_Country_Short__c?: string | null
          Site_County__c?: string | null
          Site_Plan__c?: string | null
          Site_State__c?: string | null
          Site_State_Long__c?: string | null
          Site_Url__c?: string | null
          Site_Zip__c?: string | null
          Special_Layers__c?: string | null
          stage__c?: string | null
          Sub_Trade_Area__c?: string | null
          SystemModstamp?: string | null
          Tax_URL__c?: string | null
          Total_Traffic__c?: number | null
          Trade_Area__c?: string | null
          Traffic_Count__c?: number | null
          Traffic_Count_2nd__c?: number | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          X1_Mile_Pop__c?: number | null
          X3_Mile_Pop__c?: number | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Access__c?: string | null
          Acres__c?: number | null
          All_In_Rent__c?: number | null
          AM_PM__c?: string | null
          Asking_Lease_Price__c?: number | null
          Asking_Purchase_Price__c?: number | null
          Available_Square_Footage__c?: number | null
          Available_Units__c?: string | null
          Building_Sqft__c?: number | null
          Client_Existing_Locations__c?: string | null
          Contact_Made__c?: boolean | null
          Costar_Link__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Demographics__c?: string | null
          Description__c?: string | null
          Email_Verified__c?: boolean | null
          File_Count__c?: number | null
          Flyer__c?: boolean | null
          HH_Income_Median_3_mile__c?: number | null
          Id?: string | null
          Import_Notes__c?: string | null
          IsDeleted?: boolean | null
          Landlord__c?: string | null
          Landlord_Contact_Import__c?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Lat_Long__c?: Json | null
          Lat_Long__Latitude__s?: number | null
          Lat_Long__Longitude__s?: number | null
          Layer_Notes__c?: string | null
          Lease_Expiration_Date__c?: string | null
          Letter_Sent__c?: boolean | null
          Map_Link__c?: string | null
          Marketing_Materials__c?: string | null
          Name?: string | null
          NNN_PSF__c?: number | null
          Order_Import__c?: number | null
          Owner__c?: string | null
          Owner_Entity__c?: string | null
          OwnerId?: string | null
          Parcel_ID__c?: string | null
          Phone_Verfied__c?: boolean | null
          Primary_Contact__c?: string | null
          Priority__c?: string | null
          Property_Notes__c?: string | null
          Property_Type__c?: string | null
          Purchase_Lease__c?: string | null
          RecordTypeId?: string | null
          Related_Files__c?: string | null
          Rent_PSF__c?: number | null
          Reonomy_Link__c?: string | null
          Site_Address__c?: string | null
          Site_City__c?: string | null
          Site_Country_Long__c?: string | null
          Site_Country_Short__c?: string | null
          Site_County__c?: string | null
          Site_Plan__c?: string | null
          Site_State__c?: string | null
          Site_State_Long__c?: string | null
          Site_Url__c?: string | null
          Site_Zip__c?: string | null
          Special_Layers__c?: string | null
          stage__c?: string | null
          Sub_Trade_Area__c?: string | null
          SystemModstamp?: string | null
          Tax_URL__c?: string | null
          Total_Traffic__c?: number | null
          Trade_Area__c?: string | null
          Traffic_Count__c?: number | null
          Traffic_Count_2nd__c?: number | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          X1_Mile_Pop__c?: number | null
          X3_Mile_Pop__c?: number | null
        }
        Relationships: []
      }
      salesforce_Property__History: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          Field: string | null
          Id: string | null
          IsDeleted: boolean | null
          NewValue: string | null
          OldValue: string | null
          ParentId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Relationships: []
      }
      salesforce_Property_Contacts__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          OwnerId: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          OwnerId?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          OwnerId?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_Property_Contacts__History: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          Field: string | null
          Id: string | null
          IsDeleted: boolean | null
          NewValue: string | null
          OldValue: string | null
          ParentId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Relationships: []
      }
      salesforce_Property_Unit__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          End_Cap__c: boolean | null
          End_Cap_Drive_Thru__c: boolean | null
          Id: string | null
          Inline__c: boolean | null
          IsDeleted: boolean | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Lease_Expiration_Date__c: string | null
          Name: string | null
          Opportunity__c: string | null
          Patio__c: boolean | null
          Property__c: string | null
          Site_Submits__c: string | null
          SystemModstamp: string | null
          Unit_NNN__c: number | null
          Unit_Notes__c: string | null
          Unit_Rent__c: number | null
          Unit_Sqft__c: number | null
          X2nd_Gen_Restaurant__c: boolean | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          End_Cap__c?: boolean | null
          End_Cap_Drive_Thru__c?: boolean | null
          Id?: string | null
          Inline__c?: boolean | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Lease_Expiration_Date__c?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          Patio__c?: boolean | null
          Property__c?: string | null
          Site_Submits__c?: string | null
          SystemModstamp?: string | null
          Unit_NNN__c?: number | null
          Unit_Notes__c?: string | null
          Unit_Rent__c?: number | null
          Unit_Sqft__c?: number | null
          X2nd_Gen_Restaurant__c?: boolean | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          End_Cap__c?: boolean | null
          End_Cap_Drive_Thru__c?: boolean | null
          Id?: string | null
          Inline__c?: boolean | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Lease_Expiration_Date__c?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          Patio__c?: boolean | null
          Property__c?: string | null
          Site_Submits__c?: string | null
          SystemModstamp?: string | null
          Unit_NNN__c?: number | null
          Unit_Notes__c?: string | null
          Unit_Rent__c?: number | null
          Unit_Sqft__c?: number | null
          X2nd_Gen_Restaurant__c?: boolean | null
        }
        Relationships: []
      }
      salesforce_Property_Unit__History: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          Field: string | null
          Id: string | null
          IsDeleted: boolean | null
          NewValue: string | null
          OldValue: string | null
          ParentId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Relationships: []
      }
      salesforce_Property_Unit_Opportunities__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account_Name__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          Opportunity__c: string | null
          OwnerId: string | null
          Property__c: string | null
          Property_Unit__c: string | null
          SystemModstamp: string | null
          Target_Close_Date__c: string | null
          Unit_Rent__c: number | null
          Unit_Sqft__c: number | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Property__c?: string | null
          Property_Unit__c?: string | null
          SystemModstamp?: string | null
          Target_Close_Date__c?: string | null
          Unit_Rent__c?: number | null
          Unit_Sqft__c?: number | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Account_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          OwnerId?: string | null
          Property__c?: string | null
          Property_Unit__c?: string | null
          SystemModstamp?: string | null
          Target_Close_Date__c?: string | null
          Unit_Rent__c?: number | null
          Unit_Sqft__c?: number | null
        }
        Relationships: []
      }
      salesforce_RecordType: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BusinessProcessId: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Description: string | null
          DeveloperName: string | null
          Id: string | null
          IsActive: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          NamespacePrefix: string | null
          SobjectType: string | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BusinessProcessId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          DeveloperName?: string | null
          Id?: string | null
          IsActive?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          NamespacePrefix?: string | null
          SobjectType?: string | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          BusinessProcessId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          DeveloperName?: string | null
          Id?: string | null
          IsActive?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          NamespacePrefix?: string | null
          SobjectType?: string | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_Restaurant_Trends__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Address__c: string | null
          Annual_Sales__c: number | null
          Broker_Notes__c: string | null
          Chain_Number__c: string | null
          City__c: string | null
          Co_Fr__c: string | null
          County__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Geozip4__c: string | null
          Id: string | null
          IsDeleted: boolean | null
          Last_Updated__c: string | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Lat_Long__c: Json | null
          Lat_Long__Latitude__s: number | null
          Lat_Long__Longitude__s: number | null
          Market_Grade__c: string | null
          Market_Index__c: string | null
          Name: string | null
          National_Grade__c: string | null
          National_Index__c: string | null
          OwnerId: string | null
          Placer_Annual_Visits__c: string | null
          Placer_State_Rank__c: string | null
          Restaurant__c: string | null
          Sales_Year__c: string | null
          State__c: string | null
          Store_Number__c: string | null
          SystemModstamp: string | null
          Verified_Latitude__c: number | null
          Verified_Longitude__c: number | null
          Year_Built__c: string | null
          Zip__c: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Address__c?: string | null
          Annual_Sales__c?: number | null
          Broker_Notes__c?: string | null
          Chain_Number__c?: string | null
          City__c?: string | null
          Co_Fr__c?: string | null
          County__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Geozip4__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          Last_Updated__c?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Lat_Long__c?: Json | null
          Lat_Long__Latitude__s?: number | null
          Lat_Long__Longitude__s?: number | null
          Market_Grade__c?: string | null
          Market_Index__c?: string | null
          Name?: string | null
          National_Grade__c?: string | null
          National_Index__c?: string | null
          OwnerId?: string | null
          Placer_Annual_Visits__c?: string | null
          Placer_State_Rank__c?: string | null
          Restaurant__c?: string | null
          Sales_Year__c?: string | null
          State__c?: string | null
          Store_Number__c?: string | null
          SystemModstamp?: string | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          Year_Built__c?: string | null
          Zip__c?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Address__c?: string | null
          Annual_Sales__c?: number | null
          Broker_Notes__c?: string | null
          Chain_Number__c?: string | null
          City__c?: string | null
          Co_Fr__c?: string | null
          County__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Geozip4__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          Last_Updated__c?: string | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Lat_Long__c?: Json | null
          Lat_Long__Latitude__s?: number | null
          Lat_Long__Longitude__s?: number | null
          Market_Grade__c?: string | null
          Market_Index__c?: string | null
          Name?: string | null
          National_Grade__c?: string | null
          National_Index__c?: string | null
          OwnerId?: string | null
          Placer_Annual_Visits__c?: string | null
          Placer_State_Rank__c?: string | null
          Restaurant__c?: string | null
          Sales_Year__c?: string | null
          State__c?: string | null
          Store_Number__c?: string | null
          SystemModstamp?: string | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          Year_Built__c?: string | null
          Zip__c?: string | null
        }
        Relationships: []
      }
      salesforce_Restaurant_Trends__History: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          Field: string | null
          Id: string | null
          IsDeleted: boolean | null
          NewValue: string | null
          OldValue: string | null
          ParentId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Relationships: []
      }
      salesforce_Site_Submit_Opportunities__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c: string | null
          Account_Name__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Date_Submitted__c: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Name: string | null
          Opportunity__c: string | null
          Opportunity_Name__c: string | null
          OwnerId: string | null
          Site_Submit_Name__c: string | null
          Site_Submits__c: string | null
          StageName__c: string | null
          SystemModstamp: string | null
          Target_Close_Date__c: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c?: string | null
          Account_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Date_Submitted__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          Opportunity_Name__c?: string | null
          OwnerId?: string | null
          Site_Submit_Name__c?: string | null
          Site_Submits__c?: string | null
          StageName__c?: string | null
          SystemModstamp?: string | null
          Target_Close_Date__c?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Account__c?: string | null
          Account_Name__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Date_Submitted__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Name?: string | null
          Opportunity__c?: string | null
          Opportunity_Name__c?: string | null
          OwnerId?: string | null
          Site_Submit_Name__c?: string | null
          Site_Submits__c?: string | null
          StageName__c?: string | null
          SystemModstamp?: string | null
          Target_Close_Date__c?: string | null
        }
        Relationships: []
      }
      salesforce_Site_Submits__c: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c: string | null
          Account_Name__c: string | null
          Assignment__c: string | null
          Competitor_Data__c: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Customer_Comments__c: string | null
          Date_Email_Sent_to_Client__c: string | null
          Date_Submitted__c: string | null
          Deal_Type__c: string | null
          Delivery_Date__c: string | null
          Delivery_Timeframe__c: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastActivityDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          LOI_Date__c: string | null
          LOI_Written__c: boolean | null
          Monitor__c: boolean | null
          Name: string | null
          Notes__c: string | null
          Opportunity__c: string | null
          Opportunity_Stage__c: string | null
          Priority__c: string | null
          Property__c: string | null
          Property_Address__c: string | null
          Property_Latitude__c: number | null
          Property_Longitude__c: number | null
          Property_Unit__c: string | null
          RecordTypeId: string | null
          Site_Submits_Name__c: string | null
          Submit_Stage__c: string | null
          SystemModstamp: string | null
          TI__c: number | null
          Verified_Latitude__c: number | null
          Verified_Longitude__c: number | null
          Year_1_Rent__c: number | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          Account__c?: string | null
          Account_Name__c?: string | null
          Assignment__c?: string | null
          Competitor_Data__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Customer_Comments__c?: string | null
          Date_Email_Sent_to_Client__c?: string | null
          Date_Submitted__c?: string | null
          Deal_Type__c?: string | null
          Delivery_Date__c?: string | null
          Delivery_Timeframe__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          LOI_Date__c?: string | null
          LOI_Written__c?: boolean | null
          Monitor__c?: boolean | null
          Name?: string | null
          Notes__c?: string | null
          Opportunity__c?: string | null
          Opportunity_Stage__c?: string | null
          Priority__c?: string | null
          Property__c?: string | null
          Property_Address__c?: string | null
          Property_Latitude__c?: number | null
          Property_Longitude__c?: number | null
          Property_Unit__c?: string | null
          RecordTypeId?: string | null
          Site_Submits_Name__c?: string | null
          Submit_Stage__c?: string | null
          SystemModstamp?: string | null
          TI__c?: number | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          Year_1_Rent__c?: number | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          Account__c?: string | null
          Account_Name__c?: string | null
          Assignment__c?: string | null
          Competitor_Data__c?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Customer_Comments__c?: string | null
          Date_Email_Sent_to_Client__c?: string | null
          Date_Submitted__c?: string | null
          Deal_Type__c?: string | null
          Delivery_Date__c?: string | null
          Delivery_Timeframe__c?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastActivityDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          LOI_Date__c?: string | null
          LOI_Written__c?: boolean | null
          Monitor__c?: boolean | null
          Name?: string | null
          Notes__c?: string | null
          Opportunity__c?: string | null
          Opportunity_Stage__c?: string | null
          Priority__c?: string | null
          Property__c?: string | null
          Property_Address__c?: string | null
          Property_Latitude__c?: number | null
          Property_Longitude__c?: number | null
          Property_Unit__c?: string | null
          RecordTypeId?: string | null
          Site_Submits_Name__c?: string | null
          Submit_Stage__c?: string | null
          SystemModstamp?: string | null
          TI__c?: number | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          Year_1_Rent__c?: number | null
        }
        Relationships: []
      }
      salesforce_Site_Submits__History: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById: string | null
          CreatedDate: string | null
          DataType: string | null
          Field: string | null
          Id: string | null
          IsDeleted: boolean | null
          NewValue: string | null
          OldValue: string | null
          ParentId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          CreatedById?: string | null
          CreatedDate?: string | null
          DataType?: string | null
          Field?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          NewValue?: string | null
          OldValue?: string | null
          ParentId?: string | null
        }
        Relationships: []
      }
      salesforce_Task: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId: string | null
          ActivityDate: string | null
          CallDisposition: string | null
          CallDurationInSeconds: number | null
          CallObject: string | null
          CallType: string | null
          Completed_Call__c: boolean | null
          Completed_Property_Call__c: boolean | null
          CompletedDateTime: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Description: string | null
          Id: string | null
          IsArchived: boolean | null
          IsClosed: boolean | null
          IsDeleted: boolean | null
          IsHighPriority: boolean | null
          IsRecurrence: boolean | null
          IsReminderSet: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          Lat_Long__c: Json | null
          Lat_Long__Latitude__s: number | null
          Lat_Long__Longitude__s: number | null
          Log_Property_Prospecting_call__c: boolean | null
          Log_Prospecting_Call__c: boolean | null
          maps__BaseObjectId__c: string | null
          maps__LayerId__c: string | null
          maps__WA_AdvRouteWaypoint__c: string | null
          Meeting_Held__c: boolean | null
          OwnerId: string | null
          Priority: string | null
          RecurrenceActivityId: string | null
          RecurrenceDayOfMonth: number | null
          RecurrenceDayOfWeekMask: number | null
          RecurrenceEndDateOnly: string | null
          RecurrenceInstance: string | null
          RecurrenceInterval: number | null
          RecurrenceMonthOfYear: string | null
          RecurrenceRegeneratedType: string | null
          RecurrenceStartDateOnly: string | null
          RecurrenceTimeZoneSidKey: string | null
          RecurrenceType: string | null
          ReminderDateTime: string | null
          Site_Address__c: string | null
          Site_City__c: string | null
          Site_State__c: string | null
          Status: string | null
          Subject: string | null
          SystemModstamp: string | null
          Task_Type__c: string | null
          TaskSubtype: string | null
          Verified_Latitude__c: number | null
          Verified_Longitude__c: number | null
          WhatCount: number | null
          WhatId: string | null
          WhoCount: number | null
          WhoId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId?: string | null
          ActivityDate?: string | null
          CallDisposition?: string | null
          CallDurationInSeconds?: number | null
          CallObject?: string | null
          CallType?: string | null
          Completed_Call__c?: boolean | null
          Completed_Property_Call__c?: boolean | null
          CompletedDateTime?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Id?: string | null
          IsArchived?: boolean | null
          IsClosed?: boolean | null
          IsDeleted?: boolean | null
          IsHighPriority?: boolean | null
          IsRecurrence?: boolean | null
          IsReminderSet?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Lat_Long__c?: Json | null
          Lat_Long__Latitude__s?: number | null
          Lat_Long__Longitude__s?: number | null
          Log_Property_Prospecting_call__c?: boolean | null
          Log_Prospecting_Call__c?: boolean | null
          maps__BaseObjectId__c?: string | null
          maps__LayerId__c?: string | null
          maps__WA_AdvRouteWaypoint__c?: string | null
          Meeting_Held__c?: boolean | null
          OwnerId?: string | null
          Priority?: string | null
          RecurrenceActivityId?: string | null
          RecurrenceDayOfMonth?: number | null
          RecurrenceDayOfWeekMask?: number | null
          RecurrenceEndDateOnly?: string | null
          RecurrenceInstance?: string | null
          RecurrenceInterval?: number | null
          RecurrenceMonthOfYear?: string | null
          RecurrenceRegeneratedType?: string | null
          RecurrenceStartDateOnly?: string | null
          RecurrenceTimeZoneSidKey?: string | null
          RecurrenceType?: string | null
          ReminderDateTime?: string | null
          Site_Address__c?: string | null
          Site_City__c?: string | null
          Site_State__c?: string | null
          Status?: string | null
          Subject?: string | null
          SystemModstamp?: string | null
          Task_Type__c?: string | null
          TaskSubtype?: string | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          WhatCount?: number | null
          WhatId?: string | null
          WhoCount?: number | null
          WhoId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccountId?: string | null
          ActivityDate?: string | null
          CallDisposition?: string | null
          CallDurationInSeconds?: number | null
          CallObject?: string | null
          CallType?: string | null
          Completed_Call__c?: boolean | null
          Completed_Property_Call__c?: boolean | null
          CompletedDateTime?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Description?: string | null
          Id?: string | null
          IsArchived?: boolean | null
          IsClosed?: boolean | null
          IsDeleted?: boolean | null
          IsHighPriority?: boolean | null
          IsRecurrence?: boolean | null
          IsReminderSet?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          Lat_Long__c?: Json | null
          Lat_Long__Latitude__s?: number | null
          Lat_Long__Longitude__s?: number | null
          Log_Property_Prospecting_call__c?: boolean | null
          Log_Prospecting_Call__c?: boolean | null
          maps__BaseObjectId__c?: string | null
          maps__LayerId__c?: string | null
          maps__WA_AdvRouteWaypoint__c?: string | null
          Meeting_Held__c?: boolean | null
          OwnerId?: string | null
          Priority?: string | null
          RecurrenceActivityId?: string | null
          RecurrenceDayOfMonth?: number | null
          RecurrenceDayOfWeekMask?: number | null
          RecurrenceEndDateOnly?: string | null
          RecurrenceInstance?: string | null
          RecurrenceInterval?: number | null
          RecurrenceMonthOfYear?: string | null
          RecurrenceRegeneratedType?: string | null
          RecurrenceStartDateOnly?: string | null
          RecurrenceTimeZoneSidKey?: string | null
          RecurrenceType?: string | null
          ReminderDateTime?: string | null
          Site_Address__c?: string | null
          Site_City__c?: string | null
          Site_State__c?: string | null
          Status?: string | null
          Subject?: string | null
          SystemModstamp?: string | null
          Task_Type__c?: string | null
          TaskSubtype?: string | null
          Verified_Latitude__c?: number | null
          Verified_Longitude__c?: number | null
          WhatCount?: number | null
          WhatId?: string | null
          WhoCount?: number | null
          WhoId?: string | null
        }
        Relationships: []
      }
      salesforce_TaskFeed: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BestCommentId: string | null
          Body: string | null
          CommentCount: number | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          InsertedById: string | null
          IsDeleted: boolean | null
          IsRichText: boolean | null
          LastModifiedDate: string | null
          LikeCount: number | null
          LinkUrl: string | null
          ParentId: string | null
          RelatedRecordId: string | null
          SystemModstamp: string | null
          Title: string | null
          Type: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          BestCommentId?: string | null
          Body?: string | null
          CommentCount?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          InsertedById?: string | null
          IsDeleted?: boolean | null
          IsRichText?: boolean | null
          LastModifiedDate?: string | null
          LikeCount?: number | null
          LinkUrl?: string | null
          ParentId?: string | null
          RelatedRecordId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
          Type?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          BestCommentId?: string | null
          Body?: string | null
          CommentCount?: number | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          InsertedById?: string | null
          IsDeleted?: boolean | null
          IsRichText?: boolean | null
          LastModifiedDate?: string | null
          LikeCount?: number | null
          LinkUrl?: string | null
          ParentId?: string | null
          RelatedRecordId?: string | null
          SystemModstamp?: string | null
          Title?: string | null
          Type?: string | null
        }
        Relationships: []
      }
      salesforce_TaskPriority: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ApiName: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDefault: boolean | null
          IsHighPriority: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          MasterLabel: string | null
          SortOrder: number | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ApiName?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDefault?: boolean | null
          IsHighPriority?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MasterLabel?: string | null
          SortOrder?: number | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ApiName?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDefault?: boolean | null
          IsHighPriority?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MasterLabel?: string | null
          SortOrder?: number | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_TaskRelation: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          IsWhat: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          RelationId: string | null
          SystemModstamp: string | null
          TaskId: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsWhat?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          RelationId?: string | null
          SystemModstamp?: string | null
          TaskId?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccountId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          IsWhat?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          RelationId?: string | null
          SystemModstamp?: string | null
          TaskId?: string | null
        }
        Relationships: []
      }
      salesforce_TaskStatus: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ApiName: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsClosed: boolean | null
          IsDefault: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          MasterLabel: string | null
          SortOrder: number | null
          SystemModstamp: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          ApiName?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsClosed?: boolean | null
          IsDefault?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MasterLabel?: string | null
          SortOrder?: number | null
          SystemModstamp?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          ApiName?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsClosed?: boolean | null
          IsDefault?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          MasterLabel?: string | null
          SortOrder?: number | null
          SystemModstamp?: string | null
        }
        Relationships: []
      }
      salesforce_TaskWhoRelation: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId: string | null
          CreatedById: string | null
          CreatedDate: string | null
          Id: string | null
          IsDeleted: boolean | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          RelationId: string | null
          SystemModstamp: string | null
          TaskId: string | null
          Type: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AccountId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          RelationId?: string | null
          SystemModstamp?: string | null
          TaskId?: string | null
          Type?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AccountId?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          Id?: string | null
          IsDeleted?: boolean | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          RelationId?: string | null
          SystemModstamp?: string | null
          TaskId?: string | null
          Type?: string | null
        }
        Relationships: []
      }
      salesforce_User: {
        Row: {
          _airbyte_extracted_at: string
          _airbyte_generation_id: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AboutMe: string | null
          AccountId: string | null
          Address: Json | null
          Alias: string | null
          BadgeText: string | null
          BannerPhotoUrl: string | null
          CallCenterId: string | null
          City: string | null
          CommunityNickname: string | null
          CompanyName: string | null
          ContactId: string | null
          Country: string | null
          CreatedById: string | null
          CreatedDate: string | null
          DefaultGroupNotificationFrequency: string | null
          DelegatedApproverId: string | null
          Department: string | null
          DigestFrequency: string | null
          Division: string | null
          Dropbox_for_SF__Dropbox_User_Id__c: string | null
          Email: string | null
          EmailEncodingKey: string | null
          EmailPreferencesAutoBcc: boolean | null
          EmailPreferencesAutoBccStayInTouch: boolean | null
          EmailPreferencesStayInTouchReminder: boolean | null
          EmployeeNumber: string | null
          EndDay: string | null
          Extension: string | null
          Fax: string | null
          FederationIdentifier: string | null
          FirstName: string | null
          ForecastEnabled: boolean | null
          FullPhotoUrl: string | null
          GeocodeAccuracy: string | null
          Id: string | null
          IndividualId: string | null
          IsActive: boolean | null
          IsExtIndicatorVisible: boolean | null
          IsProfilePhotoActive: boolean | null
          LanguageLocaleKey: string | null
          LastLoginDate: string | null
          LastModifiedById: string | null
          LastModifiedDate: string | null
          LastName: string | null
          LastPasswordChangeDate: string | null
          LastReferencedDate: string | null
          LastViewedDate: string | null
          Latitude: number | null
          LocaleSidKey: string | null
          Longitude: number | null
          ManagerId: string | null
          maps__ActivityGenerationObjects__c: string | null
          maps__AllowMapsExports__c: boolean | null
          maps__BetaTester__c: boolean | null
          maps__DefaultLatitude__c: number | null
          maps__DefaultLongitude__c: number | null
          maps__DefaultProximityRadius__c: number | null
          maps__DefaultType__c: string | null
          maps__DefaultZoomLevel__c: number | null
          maps__DeviceId__c: string | null
          maps__DeviceVendor__c: string | null
          maps__DistanceCalculationRule__c: string | null
          maps__EditMapsOrgWideQueries__c: boolean | null
          maps__EditTimesheetEntries__c: boolean | null
          maps__FinishedAdvRouteSetup__c: boolean | null
          maps__MapsSetting__c: string | null
          maps__MaxExportSize__c: number | null
          maps__MaxQuerySize__c: number | null
          maps__PreferredTypeOfMeasurement__c: string | null
          maps__ReceiveBatchExceptionEmails__c: boolean | null
          maps__RequireApprovalProcess__c: boolean | null
          maps__TestUserLookup__c: string | null
          maps__TimesheetPeriod__c: string | null
          maps__TPApprover__c: boolean | null
          maps__TPPublisher__c: boolean | null
          maps__Version__c: string | null
          MediumBannerPhotoUrl: string | null
          MediumPhotoUrl: string | null
          MiddleName: string | null
          MobilePhone: string | null
          Name: string | null
          NumberOfFailedLogins: number | null
          OfflinePdaTrialExpirationDate: string | null
          OfflineTrialExpirationDate: string | null
          OutOfOfficeMessage: string | null
          PasswordExpirationDate: string | null
          Phone: string | null
          PostalCode: string | null
          ProfileId: string | null
          ReceivesAdminInfoEmails: boolean | null
          ReceivesInfoEmails: boolean | null
          SenderEmail: string | null
          SenderName: string | null
          Signature: string | null
          SmallBannerPhotoUrl: string | null
          SmallPhotoUrl: string | null
          StartDay: string | null
          State: string | null
          StayInTouchNote: string | null
          StayInTouchSignature: string | null
          StayInTouchSubject: string | null
          Street: string | null
          SuAccessExpirationDate: string | null
          Suffix: string | null
          SystemModstamp: string | null
          TimeZoneSidKey: string | null
          Title: string | null
          Username: string | null
          UserPermissionsAvantgoUser: boolean | null
          UserPermissionsCallCenterAutoLogin: boolean | null
          UserPermissionsInteractionUser: boolean | null
          UserPermissionsMarketingUser: boolean | null
          UserPermissionsOfflineUser: boolean | null
          UserPermissionsSFContentUser: boolean | null
          UserPermissionsSupportUser: boolean | null
          UserPreferencesActionLauncherEinsteinGptConsent: boolean | null
          UserPreferencesActivityRemindersPopup: boolean | null
          UserPreferencesApexPagesDeveloperMode: boolean | null
          UserPreferencesAssistiveActionsEnabledInActionLauncher: boolean | null
          UserPreferencesCacheDiagnostics: boolean | null
          UserPreferencesCreateLEXAppsWTShown: boolean | null
          UserPreferencesDisableAllFeedsEmail: boolean | null
          UserPreferencesDisableBookmarkEmail: boolean | null
          UserPreferencesDisableChangeCommentEmail: boolean | null
          UserPreferencesDisableEndorsementEmail: boolean | null
          UserPreferencesDisableFileShareNotificationsForApi: boolean | null
          UserPreferencesDisableFollowersEmail: boolean | null
          UserPreferencesDisableLaterCommentEmail: boolean | null
          UserPreferencesDisableLikeEmail: boolean | null
          UserPreferencesDisableMentionsPostEmail: boolean | null
          UserPreferencesDisableMessageEmail: boolean | null
          UserPreferencesDisableProfilePostEmail: boolean | null
          UserPreferencesDisableSharePostEmail: boolean | null
          UserPreferencesDisCommentAfterLikeEmail: boolean | null
          UserPreferencesDisMentionsCommentEmail: boolean | null
          UserPreferencesDisProfPostCommentEmail: boolean | null
          UserPreferencesEnableAutoSubForFeeds: boolean | null
          UserPreferencesEventRemindersCheckboxDefault: boolean | null
          UserPreferencesExcludeMailAppAttachments: boolean | null
          UserPreferencesFavoritesShowTopFavorites: boolean | null
          UserPreferencesFavoritesWTShown: boolean | null
          UserPreferencesGlobalNavBarWTShown: boolean | null
          UserPreferencesGlobalNavGridMenuWTShown: boolean | null
          UserPreferencesHasCelebrationBadge: boolean | null
          UserPreferencesHasSentWarningEmail: boolean | null
          UserPreferencesHasSentWarningEmail238: boolean | null
          UserPreferencesHasSentWarningEmail240: boolean | null
          UserPreferencesHideBiggerPhotoCallout: boolean | null
          UserPreferencesHideBrowseProductRedirectConfirmation: boolean | null
          UserPreferencesHideChatterOnboardingSplash: boolean | null
          UserPreferencesHideCSNDesktopTask: boolean | null
          UserPreferencesHideCSNGetChatterMobileTask: boolean | null
          UserPreferencesHideEndUserOnboardingAssistantModal: boolean | null
          UserPreferencesHideLightningMigrationModal: boolean | null
          UserPreferencesHideOnlineSalesAppTabVisibilityRequirementsModal:
            | boolean
            | null
          UserPreferencesHideOnlineSalesAppWelcomeMat: boolean | null
          UserPreferencesHideS1BrowserUI: boolean | null
          UserPreferencesHideSecondChatterOnboardingSplash: boolean | null
          UserPreferencesHideSfxWelcomeMat: boolean | null
          UserPreferencesLightningExperiencePreferred: boolean | null
          UserPreferencesLiveAgentMiawSetupDeflection: boolean | null
          UserPreferencesNativeEmailClient: boolean | null
          UserPreferencesNewLightningReportRunPageEnabled: boolean | null
          UserPreferencesPathAssistantCollapsed: boolean | null
          UserPreferencesPreviewCustomTheme: boolean | null
          UserPreferencesPreviewLightning: boolean | null
          UserPreferencesReceiveNoNotificationsAsApprover: boolean | null
          UserPreferencesReceiveNotificationsAsDelegatedApprover: boolean | null
          UserPreferencesRecordHomeReservedWTShown: boolean | null
          UserPreferencesRecordHomeSectionCollapseWTShown: boolean | null
          UserPreferencesReminderSoundOff: boolean | null
          UserPreferencesReverseOpenActivitiesView: boolean | null
          UserPreferencesShowCityToExternalUsers: boolean | null
          UserPreferencesShowCityToGuestUsers: boolean | null
          UserPreferencesShowCountryToExternalUsers: boolean | null
          UserPreferencesShowCountryToGuestUsers: boolean | null
          UserPreferencesShowEmailToExternalUsers: boolean | null
          UserPreferencesShowEmailToGuestUsers: boolean | null
          UserPreferencesShowFaxToExternalUsers: boolean | null
          UserPreferencesShowFaxToGuestUsers: boolean | null
          UserPreferencesShowForecastingChangeSignals: boolean | null
          UserPreferencesShowForecastingRoundedAmounts: boolean | null
          UserPreferencesShowManagerToExternalUsers: boolean | null
          UserPreferencesShowManagerToGuestUsers: boolean | null
          UserPreferencesShowMobilePhoneToExternalUsers: boolean | null
          UserPreferencesShowMobilePhoneToGuestUsers: boolean | null
          UserPreferencesShowPostalCodeToExternalUsers: boolean | null
          UserPreferencesShowPostalCodeToGuestUsers: boolean | null
          UserPreferencesShowProfilePicToGuestUsers: boolean | null
          UserPreferencesShowStateToExternalUsers: boolean | null
          UserPreferencesShowStateToGuestUsers: boolean | null
          UserPreferencesShowStreetAddressToExternalUsers: boolean | null
          UserPreferencesShowStreetAddressToGuestUsers: boolean | null
          UserPreferencesShowTitleToExternalUsers: boolean | null
          UserPreferencesShowTitleToGuestUsers: boolean | null
          UserPreferencesShowWorkPhoneToExternalUsers: boolean | null
          UserPreferencesShowWorkPhoneToGuestUsers: boolean | null
          UserPreferencesSortFeedByComment: boolean | null
          UserPreferencesSRHOverrideActivities: boolean | null
          UserPreferencesSuppressEventSFXReminders: boolean | null
          UserPreferencesSuppressTaskSFXReminders: boolean | null
          UserPreferencesTaskRemindersCheckboxDefault: boolean | null
          UserPreferencesUserDebugModePref: boolean | null
          UserRoleId: string | null
          UserType: string | null
        }
        Insert: {
          _airbyte_extracted_at: string
          _airbyte_generation_id?: number | null
          _airbyte_meta: Json
          _airbyte_raw_id: string
          AboutMe?: string | null
          AccountId?: string | null
          Address?: Json | null
          Alias?: string | null
          BadgeText?: string | null
          BannerPhotoUrl?: string | null
          CallCenterId?: string | null
          City?: string | null
          CommunityNickname?: string | null
          CompanyName?: string | null
          ContactId?: string | null
          Country?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          DefaultGroupNotificationFrequency?: string | null
          DelegatedApproverId?: string | null
          Department?: string | null
          DigestFrequency?: string | null
          Division?: string | null
          Dropbox_for_SF__Dropbox_User_Id__c?: string | null
          Email?: string | null
          EmailEncodingKey?: string | null
          EmailPreferencesAutoBcc?: boolean | null
          EmailPreferencesAutoBccStayInTouch?: boolean | null
          EmailPreferencesStayInTouchReminder?: boolean | null
          EmployeeNumber?: string | null
          EndDay?: string | null
          Extension?: string | null
          Fax?: string | null
          FederationIdentifier?: string | null
          FirstName?: string | null
          ForecastEnabled?: boolean | null
          FullPhotoUrl?: string | null
          GeocodeAccuracy?: string | null
          Id?: string | null
          IndividualId?: string | null
          IsActive?: boolean | null
          IsExtIndicatorVisible?: boolean | null
          IsProfilePhotoActive?: boolean | null
          LanguageLocaleKey?: string | null
          LastLoginDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastName?: string | null
          LastPasswordChangeDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Latitude?: number | null
          LocaleSidKey?: string | null
          Longitude?: number | null
          ManagerId?: string | null
          maps__ActivityGenerationObjects__c?: string | null
          maps__AllowMapsExports__c?: boolean | null
          maps__BetaTester__c?: boolean | null
          maps__DefaultLatitude__c?: number | null
          maps__DefaultLongitude__c?: number | null
          maps__DefaultProximityRadius__c?: number | null
          maps__DefaultType__c?: string | null
          maps__DefaultZoomLevel__c?: number | null
          maps__DeviceId__c?: string | null
          maps__DeviceVendor__c?: string | null
          maps__DistanceCalculationRule__c?: string | null
          maps__EditMapsOrgWideQueries__c?: boolean | null
          maps__EditTimesheetEntries__c?: boolean | null
          maps__FinishedAdvRouteSetup__c?: boolean | null
          maps__MapsSetting__c?: string | null
          maps__MaxExportSize__c?: number | null
          maps__MaxQuerySize__c?: number | null
          maps__PreferredTypeOfMeasurement__c?: string | null
          maps__ReceiveBatchExceptionEmails__c?: boolean | null
          maps__RequireApprovalProcess__c?: boolean | null
          maps__TestUserLookup__c?: string | null
          maps__TimesheetPeriod__c?: string | null
          maps__TPApprover__c?: boolean | null
          maps__TPPublisher__c?: boolean | null
          maps__Version__c?: string | null
          MediumBannerPhotoUrl?: string | null
          MediumPhotoUrl?: string | null
          MiddleName?: string | null
          MobilePhone?: string | null
          Name?: string | null
          NumberOfFailedLogins?: number | null
          OfflinePdaTrialExpirationDate?: string | null
          OfflineTrialExpirationDate?: string | null
          OutOfOfficeMessage?: string | null
          PasswordExpirationDate?: string | null
          Phone?: string | null
          PostalCode?: string | null
          ProfileId?: string | null
          ReceivesAdminInfoEmails?: boolean | null
          ReceivesInfoEmails?: boolean | null
          SenderEmail?: string | null
          SenderName?: string | null
          Signature?: string | null
          SmallBannerPhotoUrl?: string | null
          SmallPhotoUrl?: string | null
          StartDay?: string | null
          State?: string | null
          StayInTouchNote?: string | null
          StayInTouchSignature?: string | null
          StayInTouchSubject?: string | null
          Street?: string | null
          SuAccessExpirationDate?: string | null
          Suffix?: string | null
          SystemModstamp?: string | null
          TimeZoneSidKey?: string | null
          Title?: string | null
          Username?: string | null
          UserPermissionsAvantgoUser?: boolean | null
          UserPermissionsCallCenterAutoLogin?: boolean | null
          UserPermissionsInteractionUser?: boolean | null
          UserPermissionsMarketingUser?: boolean | null
          UserPermissionsOfflineUser?: boolean | null
          UserPermissionsSFContentUser?: boolean | null
          UserPermissionsSupportUser?: boolean | null
          UserPreferencesActionLauncherEinsteinGptConsent?: boolean | null
          UserPreferencesActivityRemindersPopup?: boolean | null
          UserPreferencesApexPagesDeveloperMode?: boolean | null
          UserPreferencesAssistiveActionsEnabledInActionLauncher?:
            | boolean
            | null
          UserPreferencesCacheDiagnostics?: boolean | null
          UserPreferencesCreateLEXAppsWTShown?: boolean | null
          UserPreferencesDisableAllFeedsEmail?: boolean | null
          UserPreferencesDisableBookmarkEmail?: boolean | null
          UserPreferencesDisableChangeCommentEmail?: boolean | null
          UserPreferencesDisableEndorsementEmail?: boolean | null
          UserPreferencesDisableFileShareNotificationsForApi?: boolean | null
          UserPreferencesDisableFollowersEmail?: boolean | null
          UserPreferencesDisableLaterCommentEmail?: boolean | null
          UserPreferencesDisableLikeEmail?: boolean | null
          UserPreferencesDisableMentionsPostEmail?: boolean | null
          UserPreferencesDisableMessageEmail?: boolean | null
          UserPreferencesDisableProfilePostEmail?: boolean | null
          UserPreferencesDisableSharePostEmail?: boolean | null
          UserPreferencesDisCommentAfterLikeEmail?: boolean | null
          UserPreferencesDisMentionsCommentEmail?: boolean | null
          UserPreferencesDisProfPostCommentEmail?: boolean | null
          UserPreferencesEnableAutoSubForFeeds?: boolean | null
          UserPreferencesEventRemindersCheckboxDefault?: boolean | null
          UserPreferencesExcludeMailAppAttachments?: boolean | null
          UserPreferencesFavoritesShowTopFavorites?: boolean | null
          UserPreferencesFavoritesWTShown?: boolean | null
          UserPreferencesGlobalNavBarWTShown?: boolean | null
          UserPreferencesGlobalNavGridMenuWTShown?: boolean | null
          UserPreferencesHasCelebrationBadge?: boolean | null
          UserPreferencesHasSentWarningEmail?: boolean | null
          UserPreferencesHasSentWarningEmail238?: boolean | null
          UserPreferencesHasSentWarningEmail240?: boolean | null
          UserPreferencesHideBiggerPhotoCallout?: boolean | null
          UserPreferencesHideBrowseProductRedirectConfirmation?: boolean | null
          UserPreferencesHideChatterOnboardingSplash?: boolean | null
          UserPreferencesHideCSNDesktopTask?: boolean | null
          UserPreferencesHideCSNGetChatterMobileTask?: boolean | null
          UserPreferencesHideEndUserOnboardingAssistantModal?: boolean | null
          UserPreferencesHideLightningMigrationModal?: boolean | null
          UserPreferencesHideOnlineSalesAppTabVisibilityRequirementsModal?:
            | boolean
            | null
          UserPreferencesHideOnlineSalesAppWelcomeMat?: boolean | null
          UserPreferencesHideS1BrowserUI?: boolean | null
          UserPreferencesHideSecondChatterOnboardingSplash?: boolean | null
          UserPreferencesHideSfxWelcomeMat?: boolean | null
          UserPreferencesLightningExperiencePreferred?: boolean | null
          UserPreferencesLiveAgentMiawSetupDeflection?: boolean | null
          UserPreferencesNativeEmailClient?: boolean | null
          UserPreferencesNewLightningReportRunPageEnabled?: boolean | null
          UserPreferencesPathAssistantCollapsed?: boolean | null
          UserPreferencesPreviewCustomTheme?: boolean | null
          UserPreferencesPreviewLightning?: boolean | null
          UserPreferencesReceiveNoNotificationsAsApprover?: boolean | null
          UserPreferencesReceiveNotificationsAsDelegatedApprover?:
            | boolean
            | null
          UserPreferencesRecordHomeReservedWTShown?: boolean | null
          UserPreferencesRecordHomeSectionCollapseWTShown?: boolean | null
          UserPreferencesReminderSoundOff?: boolean | null
          UserPreferencesReverseOpenActivitiesView?: boolean | null
          UserPreferencesShowCityToExternalUsers?: boolean | null
          UserPreferencesShowCityToGuestUsers?: boolean | null
          UserPreferencesShowCountryToExternalUsers?: boolean | null
          UserPreferencesShowCountryToGuestUsers?: boolean | null
          UserPreferencesShowEmailToExternalUsers?: boolean | null
          UserPreferencesShowEmailToGuestUsers?: boolean | null
          UserPreferencesShowFaxToExternalUsers?: boolean | null
          UserPreferencesShowFaxToGuestUsers?: boolean | null
          UserPreferencesShowForecastingChangeSignals?: boolean | null
          UserPreferencesShowForecastingRoundedAmounts?: boolean | null
          UserPreferencesShowManagerToExternalUsers?: boolean | null
          UserPreferencesShowManagerToGuestUsers?: boolean | null
          UserPreferencesShowMobilePhoneToExternalUsers?: boolean | null
          UserPreferencesShowMobilePhoneToGuestUsers?: boolean | null
          UserPreferencesShowPostalCodeToExternalUsers?: boolean | null
          UserPreferencesShowPostalCodeToGuestUsers?: boolean | null
          UserPreferencesShowProfilePicToGuestUsers?: boolean | null
          UserPreferencesShowStateToExternalUsers?: boolean | null
          UserPreferencesShowStateToGuestUsers?: boolean | null
          UserPreferencesShowStreetAddressToExternalUsers?: boolean | null
          UserPreferencesShowStreetAddressToGuestUsers?: boolean | null
          UserPreferencesShowTitleToExternalUsers?: boolean | null
          UserPreferencesShowTitleToGuestUsers?: boolean | null
          UserPreferencesShowWorkPhoneToExternalUsers?: boolean | null
          UserPreferencesShowWorkPhoneToGuestUsers?: boolean | null
          UserPreferencesSortFeedByComment?: boolean | null
          UserPreferencesSRHOverrideActivities?: boolean | null
          UserPreferencesSuppressEventSFXReminders?: boolean | null
          UserPreferencesSuppressTaskSFXReminders?: boolean | null
          UserPreferencesTaskRemindersCheckboxDefault?: boolean | null
          UserPreferencesUserDebugModePref?: boolean | null
          UserRoleId?: string | null
          UserType?: string | null
        }
        Update: {
          _airbyte_extracted_at?: string
          _airbyte_generation_id?: number | null
          _airbyte_meta?: Json
          _airbyte_raw_id?: string
          AboutMe?: string | null
          AccountId?: string | null
          Address?: Json | null
          Alias?: string | null
          BadgeText?: string | null
          BannerPhotoUrl?: string | null
          CallCenterId?: string | null
          City?: string | null
          CommunityNickname?: string | null
          CompanyName?: string | null
          ContactId?: string | null
          Country?: string | null
          CreatedById?: string | null
          CreatedDate?: string | null
          DefaultGroupNotificationFrequency?: string | null
          DelegatedApproverId?: string | null
          Department?: string | null
          DigestFrequency?: string | null
          Division?: string | null
          Dropbox_for_SF__Dropbox_User_Id__c?: string | null
          Email?: string | null
          EmailEncodingKey?: string | null
          EmailPreferencesAutoBcc?: boolean | null
          EmailPreferencesAutoBccStayInTouch?: boolean | null
          EmailPreferencesStayInTouchReminder?: boolean | null
          EmployeeNumber?: string | null
          EndDay?: string | null
          Extension?: string | null
          Fax?: string | null
          FederationIdentifier?: string | null
          FirstName?: string | null
          ForecastEnabled?: boolean | null
          FullPhotoUrl?: string | null
          GeocodeAccuracy?: string | null
          Id?: string | null
          IndividualId?: string | null
          IsActive?: boolean | null
          IsExtIndicatorVisible?: boolean | null
          IsProfilePhotoActive?: boolean | null
          LanguageLocaleKey?: string | null
          LastLoginDate?: string | null
          LastModifiedById?: string | null
          LastModifiedDate?: string | null
          LastName?: string | null
          LastPasswordChangeDate?: string | null
          LastReferencedDate?: string | null
          LastViewedDate?: string | null
          Latitude?: number | null
          LocaleSidKey?: string | null
          Longitude?: number | null
          ManagerId?: string | null
          maps__ActivityGenerationObjects__c?: string | null
          maps__AllowMapsExports__c?: boolean | null
          maps__BetaTester__c?: boolean | null
          maps__DefaultLatitude__c?: number | null
          maps__DefaultLongitude__c?: number | null
          maps__DefaultProximityRadius__c?: number | null
          maps__DefaultType__c?: string | null
          maps__DefaultZoomLevel__c?: number | null
          maps__DeviceId__c?: string | null
          maps__DeviceVendor__c?: string | null
          maps__DistanceCalculationRule__c?: string | null
          maps__EditMapsOrgWideQueries__c?: boolean | null
          maps__EditTimesheetEntries__c?: boolean | null
          maps__FinishedAdvRouteSetup__c?: boolean | null
          maps__MapsSetting__c?: string | null
          maps__MaxExportSize__c?: number | null
          maps__MaxQuerySize__c?: number | null
          maps__PreferredTypeOfMeasurement__c?: string | null
          maps__ReceiveBatchExceptionEmails__c?: boolean | null
          maps__RequireApprovalProcess__c?: boolean | null
          maps__TestUserLookup__c?: string | null
          maps__TimesheetPeriod__c?: string | null
          maps__TPApprover__c?: boolean | null
          maps__TPPublisher__c?: boolean | null
          maps__Version__c?: string | null
          MediumBannerPhotoUrl?: string | null
          MediumPhotoUrl?: string | null
          MiddleName?: string | null
          MobilePhone?: string | null
          Name?: string | null
          NumberOfFailedLogins?: number | null
          OfflinePdaTrialExpirationDate?: string | null
          OfflineTrialExpirationDate?: string | null
          OutOfOfficeMessage?: string | null
          PasswordExpirationDate?: string | null
          Phone?: string | null
          PostalCode?: string | null
          ProfileId?: string | null
          ReceivesAdminInfoEmails?: boolean | null
          ReceivesInfoEmails?: boolean | null
          SenderEmail?: string | null
          SenderName?: string | null
          Signature?: string | null
          SmallBannerPhotoUrl?: string | null
          SmallPhotoUrl?: string | null
          StartDay?: string | null
          State?: string | null
          StayInTouchNote?: string | null
          StayInTouchSignature?: string | null
          StayInTouchSubject?: string | null
          Street?: string | null
          SuAccessExpirationDate?: string | null
          Suffix?: string | null
          SystemModstamp?: string | null
          TimeZoneSidKey?: string | null
          Title?: string | null
          Username?: string | null
          UserPermissionsAvantgoUser?: boolean | null
          UserPermissionsCallCenterAutoLogin?: boolean | null
          UserPermissionsInteractionUser?: boolean | null
          UserPermissionsMarketingUser?: boolean | null
          UserPermissionsOfflineUser?: boolean | null
          UserPermissionsSFContentUser?: boolean | null
          UserPermissionsSupportUser?: boolean | null
          UserPreferencesActionLauncherEinsteinGptConsent?: boolean | null
          UserPreferencesActivityRemindersPopup?: boolean | null
          UserPreferencesApexPagesDeveloperMode?: boolean | null
          UserPreferencesAssistiveActionsEnabledInActionLauncher?:
            | boolean
            | null
          UserPreferencesCacheDiagnostics?: boolean | null
          UserPreferencesCreateLEXAppsWTShown?: boolean | null
          UserPreferencesDisableAllFeedsEmail?: boolean | null
          UserPreferencesDisableBookmarkEmail?: boolean | null
          UserPreferencesDisableChangeCommentEmail?: boolean | null
          UserPreferencesDisableEndorsementEmail?: boolean | null
          UserPreferencesDisableFileShareNotificationsForApi?: boolean | null
          UserPreferencesDisableFollowersEmail?: boolean | null
          UserPreferencesDisableLaterCommentEmail?: boolean | null
          UserPreferencesDisableLikeEmail?: boolean | null
          UserPreferencesDisableMentionsPostEmail?: boolean | null
          UserPreferencesDisableMessageEmail?: boolean | null
          UserPreferencesDisableProfilePostEmail?: boolean | null
          UserPreferencesDisableSharePostEmail?: boolean | null
          UserPreferencesDisCommentAfterLikeEmail?: boolean | null
          UserPreferencesDisMentionsCommentEmail?: boolean | null
          UserPreferencesDisProfPostCommentEmail?: boolean | null
          UserPreferencesEnableAutoSubForFeeds?: boolean | null
          UserPreferencesEventRemindersCheckboxDefault?: boolean | null
          UserPreferencesExcludeMailAppAttachments?: boolean | null
          UserPreferencesFavoritesShowTopFavorites?: boolean | null
          UserPreferencesFavoritesWTShown?: boolean | null
          UserPreferencesGlobalNavBarWTShown?: boolean | null
          UserPreferencesGlobalNavGridMenuWTShown?: boolean | null
          UserPreferencesHasCelebrationBadge?: boolean | null
          UserPreferencesHasSentWarningEmail?: boolean | null
          UserPreferencesHasSentWarningEmail238?: boolean | null
          UserPreferencesHasSentWarningEmail240?: boolean | null
          UserPreferencesHideBiggerPhotoCallout?: boolean | null
          UserPreferencesHideBrowseProductRedirectConfirmation?: boolean | null
          UserPreferencesHideChatterOnboardingSplash?: boolean | null
          UserPreferencesHideCSNDesktopTask?: boolean | null
          UserPreferencesHideCSNGetChatterMobileTask?: boolean | null
          UserPreferencesHideEndUserOnboardingAssistantModal?: boolean | null
          UserPreferencesHideLightningMigrationModal?: boolean | null
          UserPreferencesHideOnlineSalesAppTabVisibilityRequirementsModal?:
            | boolean
            | null
          UserPreferencesHideOnlineSalesAppWelcomeMat?: boolean | null
          UserPreferencesHideS1BrowserUI?: boolean | null
          UserPreferencesHideSecondChatterOnboardingSplash?: boolean | null
          UserPreferencesHideSfxWelcomeMat?: boolean | null
          UserPreferencesLightningExperiencePreferred?: boolean | null
          UserPreferencesLiveAgentMiawSetupDeflection?: boolean | null
          UserPreferencesNativeEmailClient?: boolean | null
          UserPreferencesNewLightningReportRunPageEnabled?: boolean | null
          UserPreferencesPathAssistantCollapsed?: boolean | null
          UserPreferencesPreviewCustomTheme?: boolean | null
          UserPreferencesPreviewLightning?: boolean | null
          UserPreferencesReceiveNoNotificationsAsApprover?: boolean | null
          UserPreferencesReceiveNotificationsAsDelegatedApprover?:
            | boolean
            | null
          UserPreferencesRecordHomeReservedWTShown?: boolean | null
          UserPreferencesRecordHomeSectionCollapseWTShown?: boolean | null
          UserPreferencesReminderSoundOff?: boolean | null
          UserPreferencesReverseOpenActivitiesView?: boolean | null
          UserPreferencesShowCityToExternalUsers?: boolean | null
          UserPreferencesShowCityToGuestUsers?: boolean | null
          UserPreferencesShowCountryToExternalUsers?: boolean | null
          UserPreferencesShowCountryToGuestUsers?: boolean | null
          UserPreferencesShowEmailToExternalUsers?: boolean | null
          UserPreferencesShowEmailToGuestUsers?: boolean | null
          UserPreferencesShowFaxToExternalUsers?: boolean | null
          UserPreferencesShowFaxToGuestUsers?: boolean | null
          UserPreferencesShowForecastingChangeSignals?: boolean | null
          UserPreferencesShowForecastingRoundedAmounts?: boolean | null
          UserPreferencesShowManagerToExternalUsers?: boolean | null
          UserPreferencesShowManagerToGuestUsers?: boolean | null
          UserPreferencesShowMobilePhoneToExternalUsers?: boolean | null
          UserPreferencesShowMobilePhoneToGuestUsers?: boolean | null
          UserPreferencesShowPostalCodeToExternalUsers?: boolean | null
          UserPreferencesShowPostalCodeToGuestUsers?: boolean | null
          UserPreferencesShowProfilePicToGuestUsers?: boolean | null
          UserPreferencesShowStateToExternalUsers?: boolean | null
          UserPreferencesShowStateToGuestUsers?: boolean | null
          UserPreferencesShowStreetAddressToExternalUsers?: boolean | null
          UserPreferencesShowStreetAddressToGuestUsers?: boolean | null
          UserPreferencesShowTitleToExternalUsers?: boolean | null
          UserPreferencesShowTitleToGuestUsers?: boolean | null
          UserPreferencesShowWorkPhoneToExternalUsers?: boolean | null
          UserPreferencesShowWorkPhoneToGuestUsers?: boolean | null
          UserPreferencesSortFeedByComment?: boolean | null
          UserPreferencesSRHOverrideActivities?: boolean | null
          UserPreferencesSuppressEventSFXReminders?: boolean | null
          UserPreferencesSuppressTaskSFXReminders?: boolean | null
          UserPreferencesTaskRemindersCheckboxDefault?: boolean | null
          UserPreferencesUserDebugModePref?: boolean | null
          UserRoleId?: string | null
          UserType?: string | null
        }
        Relationships: []
      }
      site_submit: {
        Row: {
          assignment_id: string | null
          client_id: string | null
          code: string | null
          competitor_data: string | null
          created_at: string | null
          created_by_id: string | null
          customer_comments: string | null
          date_submitted: string | null
          deal_id: string | null
          delivery_date: string | null
          delivery_timeframe: string | null
          id: string
          loi_date: string | null
          loi_written: boolean | null
          monitor: boolean | null
          notes: string | null
          property_id: string | null
          property_unit_id: string | null
          record_type_id: string | null
          sf_account: string | null
          sf_created_by_id: string | null
          sf_deal_type: string | null
          sf_id: string | null
          sf_opportunity_stage: string | null
          sf_priority: string | null
          sf_property_id: string | null
          sf_property_latitude: number | null
          sf_property_longitude: number | null
          sf_property_unit: string | null
          sf_record_type_id: string | null
          sf_submit_stage: string | null
          site_submit_deal_type_id: string | null
          site_submit_name: string | null
          site_submit_priority_id: string | null
          submit_stage_id: string | null
          ti: number | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
          verified_latitude: number | null
          verified_longitude: number | null
          year_1_rent: number | null
        }
        Insert: {
          assignment_id?: string | null
          client_id?: string | null
          code?: string | null
          competitor_data?: string | null
          created_at?: string | null
          created_by_id?: string | null
          customer_comments?: string | null
          date_submitted?: string | null
          deal_id?: string | null
          delivery_date?: string | null
          delivery_timeframe?: string | null
          id?: string
          loi_date?: string | null
          loi_written?: boolean | null
          monitor?: boolean | null
          notes?: string | null
          property_id?: string | null
          property_unit_id?: string | null
          record_type_id?: string | null
          sf_account?: string | null
          sf_created_by_id?: string | null
          sf_deal_type?: string | null
          sf_id?: string | null
          sf_opportunity_stage?: string | null
          sf_priority?: string | null
          sf_property_id?: string | null
          sf_property_latitude?: number | null
          sf_property_longitude?: number | null
          sf_property_unit?: string | null
          sf_record_type_id?: string | null
          sf_submit_stage?: string | null
          site_submit_deal_type_id?: string | null
          site_submit_name?: string | null
          site_submit_priority_id?: string | null
          submit_stage_id?: string | null
          ti?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          verified_latitude?: number | null
          verified_longitude?: number | null
          year_1_rent?: number | null
        }
        Update: {
          assignment_id?: string | null
          client_id?: string | null
          code?: string | null
          competitor_data?: string | null
          created_at?: string | null
          created_by_id?: string | null
          customer_comments?: string | null
          date_submitted?: string | null
          deal_id?: string | null
          delivery_date?: string | null
          delivery_timeframe?: string | null
          id?: string
          loi_date?: string | null
          loi_written?: boolean | null
          monitor?: boolean | null
          notes?: string | null
          property_id?: string | null
          property_unit_id?: string | null
          record_type_id?: string | null
          sf_account?: string | null
          sf_created_by_id?: string | null
          sf_deal_type?: string | null
          sf_id?: string | null
          sf_opportunity_stage?: string | null
          sf_priority?: string | null
          sf_property_id?: string | null
          sf_property_latitude?: number | null
          sf_property_longitude?: number | null
          sf_property_unit?: string | null
          sf_record_type_id?: string | null
          sf_submit_stage?: string | null
          site_submit_deal_type_id?: string | null
          site_submit_name?: string | null
          site_submit_priority_id?: string | null
          submit_stage_id?: string | null
          ti?: number | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          verified_latitude?: number | null
          verified_longitude?: number | null
          year_1_rent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_site_submit_stage_id"
            columns: ["submit_stage_id"]
            isOneToOne: false
            referencedRelation: "submit_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_property_unit_id_fkey"
            columns: ["property_unit_id"]
            isOneToOne: false
            referencedRelation: "property_unit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_record_type_id_fkey"
            columns: ["record_type_id"]
            isOneToOne: false
            referencedRelation: "site_submit_record_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_site_submit_deal_type_id_fkey"
            columns: ["site_submit_deal_type_id"]
            isOneToOne: false
            referencedRelation: "site_submit_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_site_submit_priority_id_fkey"
            columns: ["site_submit_priority_id"]
            isOneToOne: false
            referencedRelation: "site_submit_priority"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_submit_stage_id_fkey"
            columns: ["submit_stage_id"]
            isOneToOne: false
            referencedRelation: "submit_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      site_submit_deal_type: {
        Row: {
          created_at: string | null
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          position: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      site_submit_priority: {
        Row: {
          created_at: string | null
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          position: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      site_submit_record_type: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      special_layer: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      submit_stage: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      thread_message: {
        Row: {
          body: string
          created_at: string | null
          created_by: string
          deal_id: string | null
          id: string
          last_modified_at: string | null
          last_modified_by: string | null
          property_id: string | null
          site_submit_id: string | null
          visible_to_client: boolean | null
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by: string
          deal_id?: string | null
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          property_id?: string | null
          site_submit_id?: string | null
          visible_to_client?: boolean | null
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string
          deal_id?: string | null
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          property_id?: string | null
          site_submit_id?: string | null
          visible_to_client?: boolean | null
        }
        Relationships: []
      }
      transaction_type: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      user: {
        Row: {
          active: boolean | null
          created_at: string | null
          created_by_id: string | null
          created_by_sf_id: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          mobile_phone: string | null
          name: string | null
          ovis_role: string | null
          sf_id: string | null
          sf_profile_id: string | null
          sf_user_role_id: string | null
          sf_user_type: string | null
          sf_username: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_sf_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          mobile_phone?: string | null
          name?: string | null
          ovis_role?: string | null
          sf_id?: string | null
          sf_profile_id?: string | null
          sf_user_role_id?: string | null
          sf_user_type?: string | null
          sf_username?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          created_by_id?: string | null
          created_by_sf_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          mobile_phone?: string | null
          name?: string | null
          ovis_role?: string | null
          sf_id?: string | null
          sf_profile_id?: string | null
          sf_user_role_id?: string | null
          sf_user_type?: string | null
          sf_username?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      deal_with_stage: {
        Row: {
          agci: number | null
          assignment_id: string | null
          booked: boolean | null
          booked_date: string | null
          calculated_fee: number | null
          client_id: string | null
          close_date: string | null
          closed_date: string | null
          commission_percent: number | null
          contact_id: string | null
          contract_signed_date: string | null
          created_at: string | null
          created_by_id: string | null
          created_by_sf_id: string | null
          deal_name: string | null
          deal_percent: number | null
          deal_team_id: string | null
          deal_type_id: string | null
          deal_usd: number | null
          deal_value: number | null
          fee: number | null
          flat_fee_override: number | null
          gci: number | null
          house_percent: number | null
          house_usd: number | null
          id: string | null
          last_stage_change_at: string | null
          lead_source: string | null
          loi_signed_date: string | null
          loss_reason: string | null
          number_of_payments: number | null
          oculus_net: number | null
          origination_percent: number | null
          origination_usd: number | null
          owner_id: string | null
          probability: number | null
          property_id: string | null
          property_unit: string | null
          record_type_id: string | null
          referral_fee_percent: number | null
          referral_fee_usd: number | null
          referral_payee_client_id: string | null
          representation_id: string | null
          sf_account_id: string | null
          sf_address: string | null
          sf_assignment_id: string | null
          sf_booked_month: string | null
          sf_booked_year: string | null
          sf_broker: string | null
          sf_broker_total_arty: number | null
          sf_broker_total_greg: number | null
          sf_broker_total_mike: number | null
          sf_city: string | null
          sf_contact_id: string | null
          sf_contingency_date_est: string | null
          sf_fiscal_year: number | null
          sf_id: string | null
          sf_is_closed: boolean | null
          sf_lead_source: string | null
          sf_map_link: string | null
          sf_mike_gci: number | null
          sf_multiple_payments: boolean | null
          sf_payment_1: number | null
          sf_record_type_id: string | null
          sf_referral_payee: string | null
          sf_representation_id: string | null
          sf_site_submit_id: string | null
          sf_stage_name: string | null
          sf_state: string | null
          sf_system_mod_stamp: string | null
          sf_transaction_type: string | null
          sf_zip: string | null
          site_percent: number | null
          site_submit_id: string | null
          site_usd: number | null
          size_acres: number | null
          size_sqft: number | null
          stage_id: string | null
          stage_name: string | null
          stage_sort_order: number | null
          transaction_type_id: string | null
          updated_at: string | null
          updated_by: string | null
          updated_by_sf_id: string | null
          weighted_fee: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_referral_payee_client_id_fkey"
            columns: ["referral_payee_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_referral_payee_client_id_fkey"
            columns: ["referral_payee_client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_site_submit_fk"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_updated_by_id_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deal_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deal_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_deal_stage_id"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_id"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
        ]
      }
      property_with_deal_type: {
        Row: {
          "1_mile_pop": number | null
          "3_mile_pop": number | null
          address: string | null
          all_in_rent: number | null
          asking_lease_price: number | null
          asking_purchase_price: number | null
          available_sqft: number | null
          building_sqft: number | null
          city: string | null
          contact_id: string | null
          contact_made: boolean | null
          costar_link: string | null
          country: string | null
          county: string | null
          created_at: string | null
          created_by_id: string | null
          deal_type_id: string | null
          deal_type_name: string | null
          deal_type_sort_order: number | null
          demographics: string | null
          description: string | null
          hh_income_median_3_mile: number | null
          id: string | null
          landlord: string | null
          latitude: number | null
          layer_notes: string | null
          lease_expiration_date: string | null
          letter_sent: boolean | null
          longitude: number | null
          map_link: string | null
          marketing_materials: string | null
          nnn_psf: number | null
          owner_id: string | null
          parcel_id: string | null
          property_name: string | null
          property_notes: string | null
          property_record_type_id: string | null
          property_stage_id: string | null
          property_type_id: string | null
          rent_psf: number | null
          reonomy_link: string | null
          sf_id: string | null
          site_plan: string | null
          state: string | null
          tax_url: string | null
          total_traffic: number | null
          trade_area: string | null
          traffic_count: number | null
          traffic_count_2nd: number | null
          updated_at: string | null
          updated_by_id: string | null
          verified_latitude: number | null
          verified_longitude: number | null
          zip: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_property_record_type_id"
            columns: ["property_record_type_id"]
            isOneToOne: false
            referencedRelation: "property_record_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_stage_id"
            columns: ["property_stage_id"]
            isOneToOne: false
            referencedRelation: "property_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_type_id"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_type"
            referencedColumns: ["id"]
          },
        ]
      }
      property_with_stage: {
        Row: {
          "1_mile_pop": number | null
          "3_mile_pop": number | null
          address: string | null
          all_in_rent: number | null
          asking_lease_price: number | null
          asking_purchase_price: number | null
          available_sqft: number | null
          building_sqft: number | null
          city: string | null
          contact_id: string | null
          contact_made: boolean | null
          costar_link: string | null
          country: string | null
          county: string | null
          created_at: string | null
          created_by_id: string | null
          deal_type_id: string | null
          demographics: string | null
          description: string | null
          hh_income_median_3_mile: number | null
          id: string | null
          landlord: string | null
          latitude: number | null
          layer_notes: string | null
          lease_expiration_date: string | null
          letter_sent: boolean | null
          longitude: number | null
          map_link: string | null
          marketing_materials: string | null
          nnn_psf: number | null
          owner_id: string | null
          parcel_id: string | null
          property_name: string | null
          property_notes: string | null
          property_record_type_id: string | null
          property_stage_id: string | null
          property_stage_name: string | null
          property_stage_sort_order: number | null
          property_type_id: string | null
          rent_psf: number | null
          reonomy_link: string | null
          sf_id: string | null
          site_plan: string | null
          state: string | null
          tax_url: string | null
          total_traffic: number | null
          trade_area: string | null
          traffic_count: number | null
          traffic_count_2nd: number | null
          updated_at: string | null
          updated_by_id: string | null
          verified_latitude: number | null
          verified_longitude: number | null
          zip: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_property_record_type_id"
            columns: ["property_record_type_id"]
            isOneToOne: false
            referencedRelation: "property_record_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_stage_id"
            columns: ["property_stage_id"]
            isOneToOne: false
            referencedRelation: "property_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_type_id"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_type"
            referencedColumns: ["id"]
          },
        ]
      }
      property_with_type: {
        Row: {
          "1_mile_pop": number | null
          "3_mile_pop": number | null
          address: string | null
          all_in_rent: number | null
          asking_lease_price: number | null
          asking_purchase_price: number | null
          available_sqft: number | null
          building_sqft: number | null
          city: string | null
          contact_id: string | null
          contact_made: boolean | null
          costar_link: string | null
          country: string | null
          county: string | null
          created_at: string | null
          created_by_id: string | null
          deal_type_id: string | null
          demographics: string | null
          description: string | null
          hh_income_median_3_mile: number | null
          id: string | null
          landlord: string | null
          latitude: number | null
          layer_notes: string | null
          lease_expiration_date: string | null
          letter_sent: boolean | null
          longitude: number | null
          map_link: string | null
          marketing_materials: string | null
          nnn_psf: number | null
          owner_id: string | null
          parcel_id: string | null
          property_name: string | null
          property_notes: string | null
          property_record_type_id: string | null
          property_stage_id: string | null
          property_type_id: string | null
          property_type_name: string | null
          property_type_sort_order: number | null
          rent_psf: number | null
          reonomy_link: string | null
          sf_id: string | null
          site_plan: string | null
          state: string | null
          tax_url: string | null
          total_traffic: number | null
          trade_area: string | null
          traffic_count: number | null
          traffic_count_2nd: number | null
          updated_at: string | null
          updated_by_id: string | null
          verified_latitude: number | null
          verified_longitude: number | null
          zip: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_property_record_type_id"
            columns: ["property_record_type_id"]
            isOneToOne: false
            referencedRelation: "property_record_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_stage_id"
            columns: ["property_stage_id"]
            isOneToOne: false
            referencedRelation: "property_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_property_type_id"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_type"
            referencedColumns: ["id"]
          },
        ]
      }
      v_contact_client_roles: {
        Row: {
          client_id: string | null
          client_name: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          notes: string | null
          role_description: string | null
          role_id: string | null
          role_name: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_client_role_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_client_role_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contact_client_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_client_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_client_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "contact_client_role_type"
            referencedColumns: ["id"]
          },
        ]
      }
      v_site_selectors_by_client: {
        Row: {
          client_id: string | null
          client_name: string | null
          contact_id: string | null
          contact_name: string | null
          email: string | null
          is_active: boolean | null
          mobile_phone: string | null
          notes: string | null
          phone: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_operations: { Args: never; Returns: boolean }
      create_payment_splits_for_payment: {
        Args: { p_payment_id: string; p_user_id?: string }
        Returns: undefined
      }
      generate_payments_for_deal: {
        Args: { deal_uuid: string }
        Returns: string
      }
      get_current_user_role: { Args: never; Returns: string }
      get_user_role:
        | { Args: { user_id: string }; Returns: string }
        | { Args: never; Returns: string }
      has_full_access: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_assistant: { Args: never; Returns: boolean }
      is_broker: { Args: never; Returns: boolean }
      lock_payment: { Args: { payment_uuid: string }; Returns: undefined }
      override_payment_amount: {
        Args: { p_new_amount: number; p_payment_id: string }
        Returns: {
          result_agci: number
          result_payment_amount: number
          result_payment_id: string
          result_referral_fee_usd: number
        }[]
      }
      unlock_payment: { Args: { payment_uuid: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
