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
    PostgrestVersion: "13.0.5"
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
          created_by_id: string | null
          deal_id: string | null
          description: string | null
          direction: string | null
          email_id: string | null
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
          updated_by_id: string | null
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
          created_by_id?: string | null
          deal_id?: string | null
          description?: string | null
          direction?: string | null
          email_id?: string | null
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
          updated_by_id?: string | null
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
          created_by_id?: string | null
          deal_id?: string | null
          description?: string | null
          direction?: string | null
          email_id?: string | null
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
          updated_by_id?: string | null
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "activity_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "activity_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
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
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
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
            foreignKeyName: "activity_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_activity_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            foreignKeyName: "fk_activity_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "fk_activity_site_submit_id"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
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
      agent_corrections: {
        Row: {
          correct_object_id: string
          correct_object_type: string
          created_at: string | null
          created_by_user_id: string | null
          email_id: string
          email_subject: string | null
          feedback_text: string | null
          id: string
          incorrect_link_id: string | null
          incorrect_object_id: string | null
          incorrect_object_type: string | null
          sender_email: string | null
        }
        Insert: {
          correct_object_id: string
          correct_object_type: string
          created_at?: string | null
          created_by_user_id?: string | null
          email_id: string
          email_subject?: string | null
          feedback_text?: string | null
          id?: string
          incorrect_link_id?: string | null
          incorrect_object_id?: string | null
          incorrect_object_type?: string | null
          sender_email?: string | null
        }
        Update: {
          correct_object_id?: string
          correct_object_type?: string
          created_at?: string | null
          created_by_user_id?: string | null
          email_id?: string
          email_subject?: string | null
          feedback_text?: string | null
          id?: string
          incorrect_link_id?: string | null
          incorrect_object_id?: string | null
          incorrect_object_type?: string | null
          sender_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_corrections_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_corrections_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_rules: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          match_pattern: string | null
          priority: number | null
          rule_text: string
          rule_type: string
          target_object_id: string | null
          target_object_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          match_pattern?: string | null
          priority?: number | null
          rule_text: string
          rule_type?: string
          target_object_id?: string | null
          target_object_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          match_pattern?: string | null
          priority?: number | null
          rule_text?: string
          rule_type?: string
          target_object_id?: string | null
          target_object_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_correction_log: {
        Row: {
          correct_object_id: string | null
          correction_type: string
          created_at: string | null
          email_id: string | null
          email_snippet: string | null
          id: string
          incorrect_object_id: string | null
          object_type: string | null
          reasoning_hint: string | null
          sender_email: string | null
          user_id: string
        }
        Insert: {
          correct_object_id?: string | null
          correction_type: string
          created_at?: string | null
          email_id?: string | null
          email_snippet?: string | null
          id?: string
          incorrect_object_id?: string | null
          object_type?: string | null
          reasoning_hint?: string | null
          sender_email?: string | null
          user_id: string
        }
        Update: {
          correct_object_id?: string | null
          correction_type?: string
          created_at?: string | null
          email_id?: string | null
          email_snippet?: string | null
          id?: string
          incorrect_object_id?: string | null
          object_type?: string | null
          reasoning_hint?: string | null
          sender_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_correction_log_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_correction_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_financial_context: {
        Row: {
          context_text: string
          context_type: string
          created_at: string | null
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          context_text: string
          context_type: string
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          context_text?: string
          context_type?: string
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_financial_context_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_financial_queries: {
        Row: {
          confidence_score: number | null
          context_used: Json | null
          created_at: string | null
          id: string
          query_text: string
          query_type: string | null
          response_text: string | null
          user_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          context_used?: Json | null
          created_at?: string | null
          id?: string
          query_text: string
          query_type?: string | null
          response_text?: string | null
          user_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          context_used?: Json | null
          created_at?: string | null
          id?: string
          query_text?: string
          query_type?: string | null
          response_text?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_financial_queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
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
          deal_team_id: string | null
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
          deal_team_id?: string | null
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
          deal_team_id?: string | null
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
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "assignment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "assignment_deal_team_id_fkey"
            columns: ["deal_team_id"]
            isOneToOne: false
            referencedRelation: "deal_team"
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
            referencedColumns: ["auth_user_id"]
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
          qb_vendor_id: string | null
          qb_vendor_name: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          name: string
          qb_vendor_id?: string | null
          qb_vendor_name?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          qb_vendor_id?: string | null
          qb_vendor_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
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
          logo_url: string | null
          owner_id: string | null
          parent_id: string | null
          phone: string | null
          qb_customer_id: string | null
          qb_vendor_id: string | null
          qb_vendor_name: string | null
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
          logo_url?: string | null
          owner_id?: string | null
          parent_id?: string | null
          phone?: string | null
          qb_customer_id?: string | null
          qb_vendor_id?: string | null
          qb_vendor_name?: string | null
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
          logo_url?: string | null
          owner_id?: string | null
          parent_id?: string | null
          phone?: string | null
          qb_customer_id?: string | null
          qb_vendor_id?: string | null
          qb_vendor_name?: string | null
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
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedColumns: ["auth_user_id"]
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
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "commission_split_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "commission_split_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_split_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
          hunter_lead_id: string | null
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
          portal_access_enabled: boolean | null
          portal_invite_expires_at: string | null
          portal_invite_sent_at: string | null
          portal_invite_status: string | null
          portal_invite_token: string | null
          portal_last_login_at: string | null
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
          hunter_lead_id?: string | null
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
          portal_access_enabled?: boolean | null
          portal_invite_expires_at?: string | null
          portal_invite_sent_at?: string | null
          portal_invite_status?: string | null
          portal_invite_token?: string | null
          portal_last_login_at?: string | null
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
          hunter_lead_id?: string | null
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
          portal_access_enabled?: boolean | null
          portal_invite_expires_at?: string | null
          portal_invite_sent_at?: string | null
          portal_invite_status?: string | null
          portal_invite_token?: string | null
          portal_last_login_at?: string | null
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
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["hunter_lead_id"]
            isOneToOne: false
            referencedRelation: "hunter_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["hunter_lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["hunter_lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["hunter_lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["lead_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_contact_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contact_client_relation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "contact_client_relation_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contact_client_role_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            referencedColumns: ["auth_user_id"]
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
            referencedColumns: ["auth_user_id"]
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
      contact_deal_role: {
        Row: {
          contact_id: string
          created_at: string | null
          created_by_id: string | null
          deal_id: string
          id: string
          is_active: boolean | null
          notes: string | null
          role_id: string
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          created_by_id?: string | null
          deal_id: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          role_id: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          created_by_id?: string | null
          deal_id?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          role_id?: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_deal_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deal_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_deal_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_deal_role_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "contact_deal_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_role_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deal_role_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      contact_deal_role_type: {
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
          deal_field_name: string | null
          deal_id: string
          description: string | null
          id: string
          is_default: boolean | null
          is_timeline_linked: boolean | null
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
          deal_field_name?: string | null
          deal_id: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_timeline_linked?: boolean | null
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
          deal_field_name?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_timeline_linked?: boolean | null
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
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "critical_date_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "critical_date_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      deal: {
        Row: {
          agci: number | null
          assignment_id: string | null
          bill_to_address_city: string | null
          bill_to_address_state: string | null
          bill_to_address_street: string | null
          bill_to_address_zip: string | null
          bill_to_bcc_emails: string | null
          bill_to_cc_emails: string | null
          bill_to_company_name: string | null
          bill_to_contact_name: string | null
          bill_to_email: string | null
          bill_to_phone: string | null
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
          house_only: boolean | null
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
          bill_to_address_city?: string | null
          bill_to_address_state?: string | null
          bill_to_address_street?: string | null
          bill_to_address_zip?: string | null
          bill_to_bcc_emails?: string | null
          bill_to_cc_emails?: string | null
          bill_to_company_name?: string | null
          bill_to_contact_name?: string | null
          bill_to_email?: string | null
          bill_to_phone?: string | null
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
          house_only?: boolean | null
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
          bill_to_address_city?: string | null
          bill_to_address_state?: string | null
          bill_to_address_street?: string | null
          bill_to_address_zip?: string | null
          bill_to_bcc_emails?: string | null
          bill_to_cc_emails?: string | null
          bill_to_company_name?: string | null
          bill_to_contact_name?: string | null
          bill_to_email?: string | null
          bill_to_phone?: string | null
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
          house_only?: boolean | null
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
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_referral_payee_client_id_fkey"
            columns: ["referral_payee_client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
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
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_deal_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "deal_contact_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
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
            referencedColumns: ["auth_user_id"]
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
      deal_synopsis: {
        Row: {
          alert_level: string | null
          alert_reason: string | null
          ball_in_court: string | null
          ball_in_court_type: string | null
          days_since_activity: number | null
          deal_id: string
          generated_at: string | null
          id: string
          key_document_status: string | null
          last_activity_at: string | null
          stalled_threshold_days: number | null
          status_summary: string | null
          synopsis_json: Json | null
        }
        Insert: {
          alert_level?: string | null
          alert_reason?: string | null
          ball_in_court?: string | null
          ball_in_court_type?: string | null
          days_since_activity?: number | null
          deal_id: string
          generated_at?: string | null
          id?: string
          key_document_status?: string | null
          last_activity_at?: string | null
          stalled_threshold_days?: number | null
          status_summary?: string | null
          synopsis_json?: Json | null
        }
        Update: {
          alert_level?: string | null
          alert_reason?: string | null
          ball_in_court?: string | null
          ball_in_court_type?: string | null
          days_since_activity?: number | null
          deal_id?: string
          generated_at?: string | null
          id?: string
          key_document_status?: string | null
          last_activity_at?: string | null
          stalled_threshold_days?: number | null
          status_summary?: string | null
          synopsis_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_synopsis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_synopsis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_synopsis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
        ]
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
      dropbox_sync_cache: {
        Row: {
          checked_at: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          mapped_folder_name: string
          mapped_folder_path: string
          property_name: string
          status: string
          updated_at: string
        }
        Insert: {
          checked_at?: string
          created_at?: string
          entity_id: string
          entity_type?: string
          id?: string
          mapped_folder_name: string
          mapped_folder_path: string
          property_name: string
          status: string
          updated_at?: string
        }
        Update: {
          checked_at?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          mapped_folder_name?: string
          mapped_folder_path?: string
          property_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dropbox_sync_cache_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dropbox_sync_cache_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dropbox_sync_cache_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dropbox_sync_cache_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          created_at: string | null
          email_id: string
          filename: string
          gmail_attachment_id: string
          id: string
          mime_type: string | null
          size_bytes: number | null
        }
        Insert: {
          created_at?: string | null
          email_id: string
          filename: string
          gmail_attachment_id: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
        }
        Update: {
          created_at?: string | null
          email_id?: string
          filename?: string
          gmail_attachment_id?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_object_link: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          created_by_user_id: string | null
          email_id: string
          id: string
          link_source: string
          object_id: string
          object_type: string
          reasoning_log: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          created_by_user_id?: string | null
          email_id: string
          id?: string
          link_source: string
          object_id: string
          object_type: string
          reasoning_log?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          created_by_user_id?: string | null
          email_id?: string
          id?: string
          link_source?: string
          object_id?: string
          object_type?: string
          reasoning_log?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_object_link_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_object_link_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_visibility: {
        Row: {
          created_at: string | null
          email_id: string
          folder_label: string | null
          gmail_connection_id: string | null
          id: string
          is_read: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_id: string
          folder_label?: string | null
          gmail_connection_id?: string | null
          id?: string
          is_read?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_id?: string
          folder_label?: string | null
          gmail_connection_id?: string | null
          id?: string
          is_read?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_visibility_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_visibility_gmail_connection_id_fkey"
            columns: ["gmail_connection_id"]
            isOneToOne: false
            referencedRelation: "gmail_connection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_visibility_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          agent_reasoning_log: Json | null
          ai_processed: boolean | null
          ai_processed_at: string | null
          body_html: string | null
          body_text: string | null
          created_at: string | null
          direction: string
          gmail_id: string
          id: string
          in_reply_to: string | null
          message_id: string
          received_at: string
          recipient_list: Json | null
          references_header: string | null
          sender_email: string
          sender_name: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          agent_reasoning_log?: Json | null
          ai_processed?: boolean | null
          ai_processed_at?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          direction: string
          gmail_id: string
          id?: string
          in_reply_to?: string | null
          message_id: string
          received_at: string
          recipient_list?: Json | null
          references_header?: string | null
          sender_email: string
          sender_name?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          agent_reasoning_log?: Json | null
          ai_processed?: boolean | null
          ai_processed_at?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          direction?: string
          gmail_id?: string
          id?: string
          in_reply_to?: string | null
          message_id?: string
          received_at?: string
          recipient_list?: Json | null
          references_header?: string | null
          sender_email?: string
          sender_name?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: []
      }
      financial_snapshot: {
        Row: {
          created_at: string | null
          expenses_by_account: Json | null
          id: string
          income_by_account: Json | null
          net_cash_flow: number | null
          period_type: string
          receivables_30_60: number | null
          receivables_60_90: number | null
          receivables_current: number | null
          receivables_over_90: number | null
          snapshot_date: string
          total_expenses: number | null
          total_income: number | null
          total_payables: number | null
          total_receivables: number | null
        }
        Insert: {
          created_at?: string | null
          expenses_by_account?: Json | null
          id?: string
          income_by_account?: Json | null
          net_cash_flow?: number | null
          period_type: string
          receivables_30_60?: number | null
          receivables_60_90?: number | null
          receivables_current?: number | null
          receivables_over_90?: number | null
          snapshot_date: string
          total_expenses?: number | null
          total_income?: number | null
          total_payables?: number | null
          total_receivables?: number | null
        }
        Update: {
          created_at?: string | null
          expenses_by_account?: Json | null
          id?: string
          income_by_account?: Json | null
          net_cash_flow?: number | null
          period_type?: string
          receivables_30_60?: number | null
          receivables_60_90?: number | null
          receivables_current?: number | null
          receivables_over_90?: number | null
          snapshot_date?: string
          total_expenses?: number | null
          total_income?: number | null
          total_payables?: number | null
          total_receivables?: number | null
        }
        Relationships: []
      }
      gmail_connection: {
        Row: {
          access_token: string
          created_at: string | null
          google_email: string
          id: string
          is_active: boolean | null
          last_history_id: string | null
          last_sync_at: string | null
          refresh_token: string
          sync_error: string | null
          sync_error_at: string | null
          token_expires_at: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          google_email: string
          id?: string
          is_active?: boolean | null
          last_history_id?: string | null
          last_sync_at?: string | null
          refresh_token: string
          sync_error?: string | null
          sync_error_at?: string | null
          token_expires_at: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          google_email?: string
          id?: string
          is_active?: boolean | null
          last_history_id?: string | null
          last_sync_at?: string | null
          refresh_token?: string
          sync_error?: string | null
          sync_error_at?: string | null
          token_expires_at?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_connection_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      goal: {
        Row: {
          created_at: string | null
          created_by_id: string | null
          goal_type: string
          id: string
          target_value: number
          updated_at: string | null
          updated_by_id: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          created_by_id?: string | null
          goal_type: string
          id?: string
          target_value: number
          updated_at?: string | null
          updated_by_id?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          created_by_id?: string | null
          goal_type?: string
          id?: string
          target_value?: number
          updated_at?: string | null
          updated_by_id?: string | null
          year?: number
        }
        Relationships: []
      }
      hunter_contact_enrichment: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          email: string | null
          enrichment_source: string
          id: string
          is_primary: boolean | null
          is_verified: boolean | null
          lead_id: string | null
          linkedin_url: string | null
          person_name: string
          phone: string | null
          source_url: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          email?: string | null
          enrichment_source: string
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          lead_id?: string | null
          linkedin_url?: string | null
          person_name: string
          phone?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          email?: string | null
          enrichment_source?: string
          id?: string
          is_primary?: boolean | null
          is_verified?: boolean | null
          lead_id?: string | null
          linkedin_url?: string | null
          person_name?: string
          phone?: string | null
          source_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "hunter_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      hunter_feedback: {
        Row: {
          concept_name: string | null
          corrected_value: string | null
          created_at: string | null
          created_by: string | null
          feedback_note: string | null
          feedback_type: string
          id: string
          lead_id: string | null
          original_value: string | null
          outreach_draft_id: string | null
          sender_domain: string | null
          signal_id: string | null
        }
        Insert: {
          concept_name?: string | null
          corrected_value?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_note?: string | null
          feedback_type: string
          id?: string
          lead_id?: string | null
          original_value?: string | null
          outreach_draft_id?: string | null
          sender_domain?: string | null
          signal_id?: string | null
        }
        Update: {
          concept_name?: string | null
          corrected_value?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_note?: string | null
          feedback_type?: string
          id?: string
          lead_id?: string | null
          original_value?: string | null
          outreach_draft_id?: string | null
          sender_domain?: string | null
          signal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "hunter_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "hunter_feedback_outreach_draft_id_fkey"
            columns: ["outreach_draft_id"]
            isOneToOne: false
            referencedRelation: "hunter_outreach_draft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_outreach_draft_id_fkey"
            columns: ["outreach_draft_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "hunter_signal"
            referencedColumns: ["id"]
          },
        ]
      }
      hunter_lead: {
        Row: {
          concept_name: string
          created_at: string | null
          existing_client_id: string | null
          existing_contact_id: string | null
          first_seen_at: string | null
          geo_relevance: string | null
          id: string
          industry_segment: string | null
          key_person_name: string | null
          key_person_title: string | null
          last_signal_at: string | null
          news_only: boolean | null
          normalized_name: string
          score_reasoning: string | null
          signal_strength: string
          status: string | null
          target_geography: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          concept_name: string
          created_at?: string | null
          existing_client_id?: string | null
          existing_contact_id?: string | null
          first_seen_at?: string | null
          geo_relevance?: string | null
          id?: string
          industry_segment?: string | null
          key_person_name?: string | null
          key_person_title?: string | null
          last_signal_at?: string | null
          news_only?: boolean | null
          normalized_name: string
          score_reasoning?: string | null
          signal_strength: string
          status?: string | null
          target_geography?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          concept_name?: string
          created_at?: string | null
          existing_client_id?: string | null
          existing_contact_id?: string | null
          first_seen_at?: string | null
          geo_relevance?: string | null
          id?: string
          industry_segment?: string | null
          key_person_name?: string | null
          key_person_title?: string | null
          last_signal_at?: string | null
          news_only?: boolean | null
          normalized_name?: string
          score_reasoning?: string | null
          signal_strength?: string
          status?: string | null
          target_geography?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_contact_id_fkey"
            columns: ["existing_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_contact_id_fkey"
            columns: ["existing_contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_contact_id_fkey"
            columns: ["existing_contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      hunter_lead_signal: {
        Row: {
          created_at: string | null
          extracted_summary: string | null
          id: string
          lead_id: string | null
          mentioned_geography: string[] | null
          mentioned_person: string | null
          signal_id: string | null
        }
        Insert: {
          created_at?: string | null
          extracted_summary?: string | null
          id?: string
          lead_id?: string | null
          mentioned_geography?: string[] | null
          mentioned_person?: string | null
          signal_id?: string | null
        }
        Update: {
          created_at?: string | null
          extracted_summary?: string | null
          id?: string
          lead_id?: string | null
          mentioned_geography?: string[] | null
          mentioned_person?: string | null
          signal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "hunter_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "hunter_signal"
            referencedColumns: ["id"]
          },
        ]
      }
      hunter_outreach_draft: {
        Row: {
          ai_reasoning: string | null
          body: string
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string | null
          enrichment_id: string | null
          error_message: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          lead_id: string | null
          outreach_type: string
          sent_at: string | null
          sent_by_user_email: string | null
          sent_email_id: string | null
          signal_summary: string | null
          source_url: string | null
          status: string | null
          subject: string | null
          updated_at: string | null
          user_edited_body: string | null
          user_edited_subject: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          body: string
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string | null
          enrichment_id?: string | null
          error_message?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          lead_id?: string | null
          outreach_type: string
          sent_at?: string | null
          sent_by_user_email?: string | null
          sent_email_id?: string | null
          signal_summary?: string | null
          source_url?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_edited_body?: string | null
          user_edited_subject?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          body?: string
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string | null
          enrichment_id?: string | null
          error_message?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          lead_id?: string | null
          outreach_type?: string
          sent_at?: string | null
          sent_by_user_email?: string | null
          sent_email_id?: string | null
          signal_summary?: string | null
          source_url?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_edited_body?: string | null
          user_edited_subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_outreach_draft_enrichment_id_fkey"
            columns: ["enrichment_id"]
            isOneToOne: false
            referencedRelation: "hunter_contact_enrichment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "hunter_lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      hunter_run_log: {
        Row: {
          briefing_email_id: string | null
          briefing_sent_at: string | null
          completed_at: string | null
          contacts_enriched: number | null
          errors: Json | null
          id: string
          leads_created: number | null
          leads_updated: number | null
          outreach_drafted: number | null
          signals_collected: number | null
          sources_scraped: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          briefing_email_id?: string | null
          briefing_sent_at?: string | null
          completed_at?: string | null
          contacts_enriched?: number | null
          errors?: Json | null
          id?: string
          leads_created?: number | null
          leads_updated?: number | null
          outreach_drafted?: number | null
          signals_collected?: number | null
          sources_scraped?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          briefing_email_id?: string | null
          briefing_sent_at?: string | null
          completed_at?: string | null
          contacts_enriched?: number | null
          errors?: Json | null
          id?: string
          leads_created?: number | null
          leads_updated?: number | null
          outreach_drafted?: number | null
          signals_collected?: number | null
          sources_scraped?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      hunter_signal: {
        Row: {
          content_hash: string | null
          content_type: string
          created_at: string | null
          id: string
          is_processed: boolean | null
          processed_at: string | null
          raw_content: string | null
          scraped_at: string | null
          source_id: string | null
          source_published_at: string | null
          source_title: string | null
          source_url: string
        }
        Insert: {
          content_hash?: string | null
          content_type: string
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          processed_at?: string | null
          raw_content?: string | null
          scraped_at?: string | null
          source_id?: string | null
          source_published_at?: string | null
          source_title?: string | null
          source_url: string
        }
        Update: {
          content_hash?: string | null
          content_type?: string
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          processed_at?: string | null
          raw_content?: string | null
          scraped_at?: string | null
          source_id?: string | null
          source_published_at?: string | null
          source_title?: string | null
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunter_signal_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "hunter_source"
            referencedColumns: ["id"]
          },
        ]
      }
      hunter_source: {
        Row: {
          auth_type: string | null
          base_url: string
          consecutive_failures: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_scraped_at: string | null
          login_url: string | null
          name: string
          requires_auth: boolean | null
          scrape_config: Json | null
          slug: string
          source_type: string
          updated_at: string | null
        }
        Insert: {
          auth_type?: string | null
          base_url: string
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_scraped_at?: string | null
          login_url?: string | null
          name: string
          requires_auth?: boolean | null
          scrape_config?: Json | null
          slug: string
          source_type: string
          updated_at?: string | null
        }
        Update: {
          auth_type?: string | null
          base_url?: string
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_scraped_at?: string | null
          login_url?: string | null
          name?: string
          requires_auth?: boolean | null
          scrape_config?: Json | null
          slug?: string
          source_type?: string
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
          created_by_id: string | null
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
          updated_by_id: string | null
          visibility: string | null
        }
        Insert: {
          body?: string | null
          content_size?: number | null
          created_at?: string | null
          created_by?: string | null
          created_by_id?: string | null
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
          updated_by_id?: string | null
          visibility?: string | null
        }
        Update: {
          body?: string | null
          content_size?: number | null
          created_at?: string | null
          created_by?: string | null
          created_by_id?: string | null
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
          updated_by_id?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "note_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "note_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_note_object_link_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            foreignKeyName: "fk_note_object_link_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "fk_note_object_link_note_id"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "note"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_note_object_link_site_submit_id"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "note_object_link_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            foreignKeyName: "note_object_link_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
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
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
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
          qb_invoice_number: string | null
          qb_last_sync: string | null
          qb_payment_id: string | null
          qb_sync_pending: boolean | null
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
          qb_invoice_number?: string | null
          qb_last_sync?: string | null
          qb_payment_id?: string | null
          qb_sync_pending?: boolean | null
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
          qb_invoice_number?: string | null
          qb_last_sync?: string | null
          qb_payment_id?: string | null
          qb_sync_pending?: boolean | null
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
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "payment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "payment_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "payment_split_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
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
            foreignKeyName: "payment_split_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      portal_invite_log: {
        Row: {
          accepted_at: string | null
          contact_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          invite_email: string
          invite_token: string
          invited_by_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          accepted_at?: string | null
          contact_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invite_email: string
          invite_token: string
          invited_by_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          accepted_at?: string | null
          contact_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invite_email?: string
          invite_token?: string
          invited_by_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_invite_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_invite_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "portal_invite_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      portal_site_submit_view: {
        Row: {
          created_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          site_submit_id: string
          user_id: string
          view_count: number | null
        }
        Insert: {
          created_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          site_submit_id: string
          user_id: string
          view_count?: number | null
        }
        Update: {
          created_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          site_submit_id?: string
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_site_submit_view_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "portal_site_submit_view_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_user_client_access: {
        Row: {
          client_id: string
          contact_id: string
          created_at: string | null
          granted_at: string | null
          granted_by_id: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          contact_id: string
          created_at?: string | null
          granted_at?: string | null
          granted_by_id?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          contact_id?: string
          created_at?: string | null
          granted_at?: string | null
          granted_by_id?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_user_client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_user_client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_user_client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_user_client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_user_client_access_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_user_client_access_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "portal_user_client_access_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      processed_message_ids: {
        Row: {
          action: string
          created_at: string | null
          gmail_connection_id: string | null
          id: string
          message_id: string
          processed_at: string
        }
        Insert: {
          action?: string
          created_at?: string | null
          gmail_connection_id?: string | null
          id?: string
          message_id: string
          processed_at?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          gmail_connection_id?: string | null
          id?: string
          message_id?: string
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processed_message_ids_gmail_connection_id_fkey"
            columns: ["gmail_connection_id"]
            isOneToOne: false
            referencedRelation: "gmail_connection"
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
          created_by_sf_id: string | null
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
          updated_by_sf_id: string | null
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
          created_by_sf_id?: string | null
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
          updated_by_sf_id?: string | null
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
          created_by_sf_id?: string | null
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
          updated_by_sf_id?: string | null
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
          {
            foreignKeyName: "property_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "property_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "fk_property_contact_updated_by_id"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "property_contact_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
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
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "property_unit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
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
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      prospecting_target: {
        Row: {
          assigned_to: string | null
          company_name: string
          contacts_found: number | null
          converted_at: string | null
          converted_client_id: string | null
          converted_contact_id: string | null
          created_at: string | null
          created_by_id: string | null
          id: string
          notes: string | null
          owner_id: string | null
          priority: number | null
          research_notes: string | null
          researched_at: string | null
          researched_by: string | null
          source: string | null
          status: string | null
          target_date: string | null
          updated_at: string | null
          updated_by_id: string | null
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_name: string
          contacts_found?: number | null
          converted_at?: string | null
          converted_client_id?: string | null
          converted_contact_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          priority?: number | null
          research_notes?: string | null
          researched_at?: string | null
          researched_by?: string | null
          source?: string | null
          status?: string | null
          target_date?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_name?: string
          contacts_found?: number | null
          converted_at?: string | null
          converted_client_id?: string | null
          converted_contact_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          priority?: number | null
          research_notes?: string | null
          researched_at?: string | null
          researched_by?: string | null
          source?: string | null
          status?: string | null
          target_date?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_target_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_target_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_researched_by_fkey"
            columns: ["researched_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_account: {
        Row: {
          account_sub_type: string | null
          account_type: string
          active: boolean | null
          alert_threshold_pct: number | null
          budget_amount: number | null
          budget_annual: number | null
          budget_monthly: number | null
          budget_notes: string | null
          created_at: string | null
          current_balance: number | null
          fully_qualified_name: string | null
          id: string
          last_synced_at: string | null
          name: string
          qb_account_id: string
          updated_at: string | null
        }
        Insert: {
          account_sub_type?: string | null
          account_type: string
          active?: boolean | null
          alert_threshold_pct?: number | null
          budget_amount?: number | null
          budget_annual?: number | null
          budget_monthly?: number | null
          budget_notes?: string | null
          created_at?: string | null
          current_balance?: number | null
          fully_qualified_name?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          qb_account_id: string
          updated_at?: string | null
        }
        Update: {
          account_sub_type?: string | null
          account_type?: string
          active?: boolean | null
          alert_threshold_pct?: number | null
          budget_amount?: number | null
          budget_annual?: number | null
          budget_monthly?: number | null
          budget_notes?: string | null
          created_at?: string | null
          current_balance?: number | null
          fully_qualified_name?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          qb_account_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      qb_commission_entry: {
        Row: {
          amount: number
          commission_mapping_id: string | null
          created_at: string | null
          created_by_id: string | null
          error_message: string | null
          id: string
          payment_split_id: string
          qb_doc_number: string | null
          qb_entity_id: string
          qb_entity_type: string
          status: string
          transaction_date: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          commission_mapping_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          error_message?: string | null
          id?: string
          payment_split_id: string
          qb_doc_number?: string | null
          qb_entity_id: string
          qb_entity_type: string
          status?: string
          transaction_date: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          commission_mapping_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          error_message?: string | null
          id?: string
          payment_split_id?: string
          qb_doc_number?: string | null
          qb_entity_id?: string
          qb_entity_type?: string
          status?: string
          transaction_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_commission_entry_commission_mapping_id_fkey"
            columns: ["commission_mapping_id"]
            isOneToOne: false
            referencedRelation: "qb_commission_mapping"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_commission_entry_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "qb_commission_entry_payment_split_id_fkey"
            columns: ["payment_split_id"]
            isOneToOne: false
            referencedRelation: "payment_split"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_commission_mapping: {
        Row: {
          broker_id: string | null
          client_id: string | null
          created_at: string | null
          created_by_id: string | null
          description_template: string | null
          entity_type: string
          id: string
          is_active: boolean | null
          payment_method: string
          qb_credit_account_id: string | null
          qb_credit_account_name: string | null
          qb_debit_account_id: string
          qb_debit_account_name: string
          qb_vendor_id: string | null
          qb_vendor_name: string | null
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          broker_id?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          description_template?: string | null
          entity_type: string
          id?: string
          is_active?: boolean | null
          payment_method: string
          qb_credit_account_id?: string | null
          qb_credit_account_name?: string | null
          qb_debit_account_id: string
          qb_debit_account_name: string
          qb_vendor_id?: string | null
          qb_vendor_name?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          broker_id?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by_id?: string | null
          description_template?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean | null
          payment_method?: string
          qb_credit_account_id?: string | null
          qb_credit_account_name?: string | null
          qb_debit_account_id?: string
          qb_debit_account_name?: string
          qb_vendor_id?: string | null
          qb_vendor_name?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_commission_mapping_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "broker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_commission_mapping_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_commission_mapping_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "qb_commission_mapping_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "qb_commission_mapping_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "qb_commission_mapping_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "qb_commission_mapping_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      qb_connection: {
        Row: {
          access_token: string
          access_token_expires_at: string
          connected_at: string | null
          connected_by: string | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string
          status: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          realm_id?: string
          refresh_token?: string
          refresh_token_expires_at?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_connection_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_expense: {
        Row: {
          account_id: string | null
          account_name: string | null
          ai_parsed_memo: Json | null
          amount: number
          anomaly_reason: string | null
          anomaly_score: number | null
          balance: number | null
          category: string | null
          description: string | null
          id: string
          imported_at: string | null
          is_paid: boolean | null
          is_recurring: boolean | null
          payment_date: string | null
          qb_entity_id: string | null
          qb_entity_type: string | null
          qb_line_id: string | null
          qb_transaction_id: string
          recurring_group_id: string | null
          recurring_pattern: string | null
          sync_token: string | null
          transaction_date: string
          transaction_type: string | null
          updated_at: string | null
          vendor_name: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          ai_parsed_memo?: Json | null
          amount: number
          anomaly_reason?: string | null
          anomaly_score?: number | null
          balance?: number | null
          category?: string | null
          description?: string | null
          id?: string
          imported_at?: string | null
          is_paid?: boolean | null
          is_recurring?: boolean | null
          payment_date?: string | null
          qb_entity_id?: string | null
          qb_entity_type?: string | null
          qb_line_id?: string | null
          qb_transaction_id: string
          recurring_group_id?: string | null
          recurring_pattern?: string | null
          sync_token?: string | null
          transaction_date: string
          transaction_type?: string | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          ai_parsed_memo?: Json | null
          amount?: number
          anomaly_reason?: string | null
          anomaly_score?: number | null
          balance?: number | null
          category?: string | null
          description?: string | null
          id?: string
          imported_at?: string | null
          is_paid?: boolean | null
          is_recurring?: boolean | null
          payment_date?: string | null
          qb_entity_id?: string | null
          qb_entity_type?: string | null
          qb_line_id?: string | null
          qb_transaction_id?: string
          recurring_group_id?: string | null
          recurring_pattern?: string | null
          sync_token?: string | null
          transaction_date?: string
          transaction_type?: string | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      qb_item: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          expense_account_id: string | null
          expense_account_name: string | null
          fully_qualified_name: string | null
          id: string
          income_account_id: string | null
          income_account_name: string | null
          item_type: string | null
          last_synced_at: string | null
          name: string
          qb_item_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          expense_account_id?: string | null
          expense_account_name?: string | null
          fully_qualified_name?: string | null
          id?: string
          income_account_id?: string | null
          income_account_name?: string | null
          item_type?: string | null
          last_synced_at?: string | null
          name: string
          qb_item_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          expense_account_id?: string | null
          expense_account_name?: string | null
          fully_qualified_name?: string | null
          id?: string
          income_account_id?: string | null
          income_account_name?: string | null
          item_type?: string | null
          last_synced_at?: string | null
          name?: string
          qb_item_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      qb_sync_log: {
        Row: {
          created_at: string | null
          direction: string
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          id: string
          qb_entity_id: string | null
          retry_count: number | null
          status: string
          sync_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          direction: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          qb_entity_id?: string | null
          retry_count?: number | null
          status?: string
          sync_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          qb_entity_id?: string | null
          retry_count?: number | null
          status?: string
          sync_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      restaurant_location: {
        Row: {
          category: string | null
          chain: string | null
          chain_no: string | null
          co_fr: string | null
          co_fr_no: string | null
          county: string | null
          created_at: string | null
          dma_market: string | null
          dma_no: string | null
          geoaddress: string | null
          geocity: string | null
          geoquality: string | null
          geostate: string | null
          geozip: string | null
          geozip4: string | null
          latitude: number | null
          longitude: number | null
          seg_no: string | null
          segment: string | null
          source_year: number | null
          store_no: string
          subsegment: string | null
          updated_at: string | null
          verified_at: string | null
          verified_latitude: number | null
          verified_longitude: number | null
          verified_source: string | null
          yr_built: number | null
        }
        Insert: {
          category?: string | null
          chain?: string | null
          chain_no?: string | null
          co_fr?: string | null
          co_fr_no?: string | null
          county?: string | null
          created_at?: string | null
          dma_market?: string | null
          dma_no?: string | null
          geoaddress?: string | null
          geocity?: string | null
          geoquality?: string | null
          geostate?: string | null
          geozip?: string | null
          geozip4?: string | null
          latitude?: number | null
          longitude?: number | null
          seg_no?: string | null
          segment?: string | null
          source_year?: number | null
          store_no: string
          subsegment?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_latitude?: number | null
          verified_longitude?: number | null
          verified_source?: string | null
          yr_built?: number | null
        }
        Update: {
          category?: string | null
          chain?: string | null
          chain_no?: string | null
          co_fr?: string | null
          co_fr_no?: string | null
          county?: string | null
          created_at?: string | null
          dma_market?: string | null
          dma_no?: string | null
          geoaddress?: string | null
          geocity?: string | null
          geoquality?: string | null
          geostate?: string | null
          geozip?: string | null
          geozip4?: string | null
          latitude?: number | null
          longitude?: number | null
          seg_no?: string | null
          segment?: string | null
          source_year?: number | null
          store_no?: string
          subsegment?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_latitude?: number | null
          verified_longitude?: number | null
          verified_source?: string | null
          yr_built?: number | null
        }
        Relationships: []
      }
      restaurant_trend: {
        Row: {
          created_at: string | null
          curr_annual_sls_k: number | null
          curr_mkt_grade: string | null
          curr_mkt_index: number | null
          curr_natl_grade: string | null
          curr_natl_index: number | null
          label_cng_cmg: string | null
          label_cng_lt_png: string | null
          label_png: string | null
          label_png_pmg: string | null
          past_annual_sls_k: number | null
          past_mkt_grade: string | null
          past_mkt_index: number | null
          past_natl_grade: string | null
          past_natl_index: number | null
          past_yrs: number | null
          store_no: string
          survey_yr_last_c: number | null
          survey_yr_last_p: number | null
          survey_yr_next_c: number | null
          survey_yr_next_p: number | null
          trend_id: string
          ttl_no_surveys_c: number | null
          ttl_no_surveys_p: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          curr_annual_sls_k?: number | null
          curr_mkt_grade?: string | null
          curr_mkt_index?: number | null
          curr_natl_grade?: string | null
          curr_natl_index?: number | null
          label_cng_cmg?: string | null
          label_cng_lt_png?: string | null
          label_png?: string | null
          label_png_pmg?: string | null
          past_annual_sls_k?: number | null
          past_mkt_grade?: string | null
          past_mkt_index?: number | null
          past_natl_grade?: string | null
          past_natl_index?: number | null
          past_yrs?: number | null
          store_no: string
          survey_yr_last_c?: number | null
          survey_yr_last_p?: number | null
          survey_yr_next_c?: number | null
          survey_yr_next_p?: number | null
          trend_id?: string
          ttl_no_surveys_c?: number | null
          ttl_no_surveys_p?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          curr_annual_sls_k?: number | null
          curr_mkt_grade?: string | null
          curr_mkt_index?: number | null
          curr_natl_grade?: string | null
          curr_natl_index?: number | null
          label_cng_cmg?: string | null
          label_cng_lt_png?: string | null
          label_png?: string | null
          label_png_pmg?: string | null
          past_annual_sls_k?: number | null
          past_mkt_grade?: string | null
          past_mkt_index?: number | null
          past_natl_grade?: string | null
          past_natl_index?: number | null
          past_yrs?: number | null
          store_no?: string
          survey_yr_last_c?: number | null
          survey_yr_last_p?: number | null
          survey_yr_next_c?: number | null
          survey_yr_next_p?: number | null
          trend_id?: string
          ttl_no_surveys_c?: number | null
          ttl_no_surveys_p?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_trend_store_no_fkey"
            columns: ["store_no"]
            isOneToOne: false
            referencedRelation: "restaurant_location"
            referencedColumns: ["store_no"]
          },
        ]
      }
      role: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          name: string
          permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          name: string
          permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          name?: string
          permissions?: Json | null
          updated_at?: string | null
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
          email_sent_at: string | null
          email_sent_by_id: string | null
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
          email_sent_at?: string | null
          email_sent_by_id?: string | null
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
          email_sent_at?: string | null
          email_sent_by_id?: string | null
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedColumns: ["auth_user_id"]
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
            foreignKeyName: "site_submit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
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
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      site_submit_comment: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          is_edited: boolean | null
          site_submit_id: string
          updated_at: string | null
          updated_by_id: string | null
          visibility: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          site_submit_id: string
          updated_at?: string | null
          updated_by_id?: string | null
          visibility?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          site_submit_id?: string
          updated_at?: string | null
          updated_by_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_submit_comment_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "site_submit_comment_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
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
      unmatched_email_queue: {
        Row: {
          created_at: string | null
          email_id: string
          gmail_connection_id: string | null
          id: string
          match_reason: string | null
          matched_object_id: string | null
          matched_object_name: string | null
          matched_object_type: string | null
          received_at: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          sender_email: string
          sender_name: string | null
          snippet: string | null
          status: string | null
          subject: string | null
          suggested_company: string | null
          suggested_contact_name: string | null
        }
        Insert: {
          created_at?: string | null
          email_id: string
          gmail_connection_id?: string | null
          id?: string
          match_reason?: string | null
          matched_object_id?: string | null
          matched_object_name?: string | null
          matched_object_type?: string | null
          received_at: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          sender_email: string
          sender_name?: string | null
          snippet?: string | null
          status?: string | null
          subject?: string | null
          suggested_company?: string | null
          suggested_contact_name?: string | null
        }
        Update: {
          created_at?: string | null
          email_id?: string
          gmail_connection_id?: string | null
          id?: string
          match_reason?: string | null
          matched_object_id?: string | null
          matched_object_name?: string | null
          matched_object_type?: string | null
          received_at?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          sender_email?: string
          sender_name?: string | null
          snippet?: string | null
          status?: string | null
          subject?: string | null
          suggested_company?: string | null
          suggested_contact_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unmatched_email_queue_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_email_queue_gmail_connection_id_fkey"
            columns: ["gmail_connection_id"]
            isOneToOne: false
            referencedRelation: "gmail_connection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_email_queue_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
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
          auth_user_id?: string | null
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
          auth_user_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "fk_user_ovis_role"
            columns: ["ovis_role"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["name"]
          },
        ]
      }
    }
    Views: {
      budget_vs_actual: {
        Row: {
          account_id: string | null
          account_name: string | null
          account_type: string | null
          alert_threshold_pct: number | null
          budget_annual: number | null
          budget_monthly: number | null
          fully_qualified_name: string | null
          mtd_actual: number | null
          mtd_pct_used: number | null
          qb_account_id: string | null
          ytd_actual: number | null
          ytd_pct_used: number | null
        }
        Relationships: []
      }
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
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_referral_payee_client_id_fkey"
            columns: ["referral_payee_client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
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
            referencedColumns: ["auth_user_id"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "fk_deal_client_id"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
        ]
      }
      invoice_aging: {
        Row: {
          aging_bucket: string | null
          client_id: string | null
          client_name: string | null
          days_overdue: number | null
          deal_id: string | null
          deal_name: string | null
          due_date: string | null
          id: string | null
          orep_invoice: string | null
          payment_amount: number | null
          payment_status: string | null
          qb_invoice_id: string | null
        }
        Relationships: []
      }
      portal_site_submit_status: {
        Row: {
          client_id: string | null
          has_unread_comments: boolean | null
          has_unread_updates: boolean | null
          last_viewed_at: string | null
          latest_comment_at: string | null
          site_submit_id: string | null
          site_submit_name: string | null
          site_submit_updated_at: string | null
          submit_stage_id: string | null
          user_id: string | null
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_submit_stage_id_fkey"
            columns: ["submit_stage_id"]
            isOneToOne: false
            referencedRelation: "submit_stage"
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
          {
            foreignKeyName: "property_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "property_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
          {
            foreignKeyName: "property_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "property_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
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
          {
            foreignKeyName: "property_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "property_updated_by_id_fkey"
            columns: ["updated_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      restaurant_latest_trends: {
        Row: {
          curr_annual_sls_k: number | null
          curr_mkt_grade: string | null
          curr_natl_grade: string | null
          store_no: string | null
          trend_id: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_trend_store_no_fkey"
            columns: ["store_no"]
            isOneToOne: false
            referencedRelation: "restaurant_location"
            referencedColumns: ["store_no"]
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
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "contact_client_role_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
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
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
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
      v_contact_deal_roles: {
        Row: {
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          deal_id: string | null
          deal_name: string | null
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
            foreignKeyName: "contact_deal_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deal_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_deal_role_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "contact_deal_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_role_type"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hunter_dashboard: {
        Row: {
          concept_name: string | null
          contacts_found: number | null
          existing_client_id: string | null
          existing_client_name: string | null
          existing_contact_email: string | null
          existing_contact_id: string | null
          existing_contact_name: string | null
          first_seen_at: string | null
          geo_relevance: string | null
          id: string | null
          industry_segment: string | null
          key_person_name: string | null
          key_person_title: string | null
          last_signal_at: string | null
          latest_signal_summary: string | null
          latest_signal_title: string | null
          latest_signal_url: string | null
          news_only: boolean | null
          pending_outreach: number | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          signal_count: number | null
          signal_strength: string | null
          status: string | null
          target_geography: string[] | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_client_id_fkey"
            columns: ["existing_client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_contact_id_fkey"
            columns: ["existing_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_contact_id_fkey"
            columns: ["existing_contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "hunter_lead_existing_contact_id_fkey"
            columns: ["existing_contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      v_hunter_outreach_queue: {
        Row: {
          ai_reasoning: string | null
          body: string | null
          concept_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          id: string | null
          industry_segment: string | null
          lead_id: string | null
          outreach_type: string | null
          signal_strength: string | null
          signal_summary: string | null
          source_url: string | null
          status: string | null
          subject: string | null
        }
        Relationships: []
      }
      v_hunter_reconnect: {
        Row: {
          client_id: string | null
          client_name: string | null
          concept_name: string | null
          contact_email: string | null
          contact_id: string | null
          contact_mobile: string | null
          contact_name: string | null
          contact_phone: string | null
          last_signal_at: string | null
          latest_news: string | null
          lead_id: string | null
          signal_strength: string | null
          source_title: string | null
          source_url: string | null
        }
        Relationships: []
      }
      v_prospecting_target: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          company_name: string | null
          contacts_found: number | null
          converted_at: string | null
          converted_client_id: string | null
          converted_contact_id: string | null
          created_at: string | null
          id: string | null
          notes: string | null
          owner_id: string | null
          owner_name: string | null
          priority: number | null
          research_notes: string | null
          researched_at: string | null
          researched_by: string | null
          researched_by_name: string | null
          source: string | null
          status: string | null
          target_date: string | null
          updated_at: string | null
          website: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_target_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_target_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_target_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_target_researched_by_fkey"
            columns: ["researched_by"]
            isOneToOne: false
            referencedRelation: "user"
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
      create_timeline_critical_dates: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
      generate_payments_for_deal: {
        Args: { deal_uuid: string }
        Returns: string
      }
      get_current_user_role: { Args: never; Returns: string }
      get_portal_user_clients: {
        Args: { p_user_id: string }
        Returns: {
          client_id: string
          client_name: string
        }[]
      }
      get_user_role:
        | { Args: never; Returns: string }
        | { Args: { user_id: string }; Returns: string }
      has_full_access: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_assistant: { Args: never; Returns: boolean }
      is_broker: { Args: never; Returns: boolean }
      is_client_visible_stage: {
        Args: { p_stage_name: string }
        Returns: boolean
      }
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
      record_portal_site_submit_view: {
        Args: { p_site_submit_id: string; p_user_id: string }
        Returns: undefined
      }
      refresh_restaurant_latest_trends: { Args: never; Returns: undefined }
      regenerate_payment_splits_for_deal: {
        Args: { p_deal_id: string }
        Returns: string
      }
      sync_deal_field_to_critical_date: {
        Args: { p_deal_id: string; p_field_name: string; p_new_value: string }
        Returns: undefined
      }
      unlock_payment: { Args: { payment_uuid: string }; Returns: undefined }
      user_has_portal_client_access: {
        Args: { p_client_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      prospecting_target_status:
        | "needs_research"
        | "researching"
        | "ready"
        | "calling"
        | "converted"
        | "disqualified"
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
  public: {
    Enums: {
      prospecting_target_status: [
        "needs_research",
        "researching",
        "ready",
        "calling",
        "converted",
        "disqualified",
      ],
    },
  },
} as const
