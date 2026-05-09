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
      account_budget: {
        Row: {
          apr: number | null
          aug: number | null
          created_at: string | null
          created_by: string | null
          dec: number | null
          feb: number | null
          id: string
          jan: number | null
          jul: number | null
          jun: number | null
          mar: number | null
          may: number | null
          notes: string | null
          nov: number | null
          oct: number | null
          qb_account_id: string
          sep: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          apr?: number | null
          aug?: number | null
          created_at?: string | null
          created_by?: string | null
          dec?: number | null
          feb?: number | null
          id?: string
          jan?: number | null
          jul?: number | null
          jun?: number | null
          mar?: number | null
          may?: number | null
          notes?: string | null
          nov?: number | null
          oct?: number | null
          qb_account_id: string
          sep?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          apr?: number | null
          aug?: number | null
          created_at?: string | null
          created_by?: string | null
          dec?: number | null
          feb?: number | null
          id?: string
          jan?: number | null
          jul?: number | null
          jun?: number | null
          mar?: number | null
          may?: number | null
          notes?: string | null
          nov?: number | null
          oct?: number | null
          qb_account_id?: string
          sep?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_budget_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
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
          is_prospecting: boolean | null
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
          target_id: string | null
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
          is_prospecting?: boolean | null
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
          target_id?: string | null
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
          is_prospecting?: boolean | null
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
          target_id?: string | null
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "activity_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "activity_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "activity_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "fk_activity_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "assignment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      clause_type: {
        Row: {
          created_at: string
          default_confidence_tier: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_confidence_tier: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_confidence_tier?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
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
          demographics_drive_times: number[] | null
          demographics_radii: number[] | null
          demographics_sidebar_radius: number | null
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
          starbucks_layer_enabled: boolean
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
          velocity_lease_psa_days_override: number | null
          velocity_loi_days_override: number | null
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
          demographics_drive_times?: number[] | null
          demographics_radii?: number[] | null
          demographics_sidebar_radius?: number | null
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
          starbucks_layer_enabled?: boolean
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          velocity_lease_psa_days_override?: number | null
          velocity_loi_days_override?: number | null
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
          demographics_drive_times?: number[] | null
          demographics_radii?: number[] | null
          demographics_sidebar_radius?: number | null
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
          starbucks_layer_enabled?: boolean
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          velocity_lease_psa_days_override?: number | null
          velocity_loi_days_override?: number | null
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
      client_broker: {
        Row: {
          added_by_id: string | null
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          added_by_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          added_by_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_broker_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_broker_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_broker_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_broker_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_broker_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_broker_user_id_fkey"
            columns: ["user_id"]
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
      comment_templates: {
        Row: {
          clause_type_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string | null
          template_text: string
          updated_at: string
        }
        Insert: {
          clause_type_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          template_text: string
          updated_at?: string
        }
        Update: {
          clause_type_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          template_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_templates_clause_type_id_fkey"
            columns: ["clause_type_id"]
            isOneToOne: false
            referencedRelation: "clause_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "comment_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "comment_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "comment_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
        ]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "commission_split_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
          email_alerts_opt_in: boolean
          fax: string | null
          first_name: string | null
          icsc_profile_link: string | null
          id: string
          is_primary_contact: boolean | null
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
          portal_auth_user_id: string | null
          portal_invite_accepted_at: string | null
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
          target_id: string | null
          tenant_rep_contact_id: string | null
          tenant_repped: boolean | null
          title: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
          website: string | null
          zoominfo_data: Json | null
          zoominfo_last_enriched_at: string | null
          zoominfo_person_id: string | null
          zoominfo_profile_url: string | null
        }
        Insert: {
          client_id?: string | null
          company?: string | null
          contact_tags?: string | null
          created_at?: string | null
          created_by_id?: string | null
          email?: string | null
          email_alerts_opt_in?: boolean
          fax?: string | null
          first_name?: string | null
          icsc_profile_link?: string | null
          id?: string
          is_primary_contact?: boolean | null
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
          portal_auth_user_id?: string | null
          portal_invite_accepted_at?: string | null
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
          target_id?: string | null
          tenant_rep_contact_id?: string | null
          tenant_repped?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          website?: string | null
          zoominfo_data?: Json | null
          zoominfo_last_enriched_at?: string | null
          zoominfo_person_id?: string | null
          zoominfo_profile_url?: string | null
        }
        Update: {
          client_id?: string | null
          company?: string | null
          contact_tags?: string | null
          created_at?: string | null
          created_by_id?: string | null
          email?: string | null
          email_alerts_opt_in?: boolean
          fax?: string | null
          first_name?: string | null
          icsc_profile_link?: string | null
          id?: string
          is_primary_contact?: boolean | null
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
          portal_auth_user_id?: string | null
          portal_invite_accepted_at?: string | null
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
          target_id?: string | null
          tenant_rep_contact_id?: string | null
          tenant_repped?: boolean | null
          title?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          website?: string | null
          zoominfo_data?: Json | null
          zoominfo_last_enriched_at?: string | null
          zoominfo_person_id?: string | null
          zoominfo_profile_url?: string | null
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
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "contact_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      contact_tag: {
        Row: {
          contact_id: string
          created_at: string | null
          created_by_id: string | null
          id: string
          notes: string | null
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          notes?: string | null
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          created_by_id?: string | null
          id?: string
          notes?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_tag_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "contact_tag_type"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tag_type: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          sort_order: number | null
          tag_name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          tag_name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          sort_order?: number | null
          tag_name?: string
          updated_at?: string | null
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "critical_date_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
          closing_deadline_days: number | null
          commission_percent: number | null
          contact_id: string | null
          contingency_period_days: number | null
          contract_signed_date: string | null
          created_at: string
          created_by_id: string | null
          created_by_sf_id: string | null
          current_handoff_date: string | null
          current_handoff_document: string | null
          current_handoff_holder: string | null
          deal_acres: number | null
          deal_all_in_rent: number | null
          deal_asking_ground_lease_price: number | null
          deal_asking_lease_price: number | null
          deal_asking_purchase_price: number | null
          deal_available_sqft: number | null
          deal_building_sqft: number | null
          deal_name: string | null
          deal_nnn: number | null
          deal_nnn_psf: number | null
          deal_percent: number | null
          deal_rent_psf: number | null
          deal_team_id: string | null
          deal_type_id: string | null
          deal_usd: number | null
          deal_value: number | null
          due_diligence_days: number | null
          estimated_execution_date: string | null
          fee: number | null
          flat_fee_override: number | null
          gci: number | null
          house_only: boolean | null
          house_percent: number | null
          house_usd: number | null
          id: string
          is_behind_schedule: boolean | null
          kanban_position: number | null
          landlord_lease_status: string | null
          landlord_name: string | null
          last_stage_change_at: string | null
          lead_source: string | null
          lease_initial_term_years: number | null
          loi_date: string | null
          loi_signed_date: string | null
          loi_written_date: string | null
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
          rent_commencement_days: number | null
          rent_commencement_type: string | null
          rent_type: string | null
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
          tia_amount: number | null
          transaction_type_id: string | null
          updated_at: string | null
          updated_by_id: string | null
          updated_by_sf_id: string | null
          use_clause_notes: string | null
          use_clause_type: string | null
          weeks_behind: number | null
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
          closing_deadline_days?: number | null
          commission_percent?: number | null
          contact_id?: string | null
          contingency_period_days?: number | null
          contract_signed_date?: string | null
          created_at?: string
          created_by_id?: string | null
          created_by_sf_id?: string | null
          current_handoff_date?: string | null
          current_handoff_document?: string | null
          current_handoff_holder?: string | null
          deal_acres?: number | null
          deal_all_in_rent?: number | null
          deal_asking_ground_lease_price?: number | null
          deal_asking_lease_price?: number | null
          deal_asking_purchase_price?: number | null
          deal_available_sqft?: number | null
          deal_building_sqft?: number | null
          deal_name?: string | null
          deal_nnn?: number | null
          deal_nnn_psf?: number | null
          deal_percent?: number | null
          deal_rent_psf?: number | null
          deal_team_id?: string | null
          deal_type_id?: string | null
          deal_usd?: number | null
          deal_value?: number | null
          due_diligence_days?: number | null
          estimated_execution_date?: string | null
          fee?: number | null
          flat_fee_override?: number | null
          gci?: number | null
          house_only?: boolean | null
          house_percent?: number | null
          house_usd?: number | null
          id?: string
          is_behind_schedule?: boolean | null
          kanban_position?: number | null
          landlord_lease_status?: string | null
          landlord_name?: string | null
          last_stage_change_at?: string | null
          lead_source?: string | null
          lease_initial_term_years?: number | null
          loi_date?: string | null
          loi_signed_date?: string | null
          loi_written_date?: string | null
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
          rent_commencement_days?: number | null
          rent_commencement_type?: string | null
          rent_type?: string | null
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
          tia_amount?: number | null
          transaction_type_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          use_clause_notes?: string | null
          use_clause_type?: string | null
          weeks_behind?: number | null
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
          closing_deadline_days?: number | null
          commission_percent?: number | null
          contact_id?: string | null
          contingency_period_days?: number | null
          contract_signed_date?: string | null
          created_at?: string
          created_by_id?: string | null
          created_by_sf_id?: string | null
          current_handoff_date?: string | null
          current_handoff_document?: string | null
          current_handoff_holder?: string | null
          deal_acres?: number | null
          deal_all_in_rent?: number | null
          deal_asking_ground_lease_price?: number | null
          deal_asking_lease_price?: number | null
          deal_asking_purchase_price?: number | null
          deal_available_sqft?: number | null
          deal_building_sqft?: number | null
          deal_name?: string | null
          deal_nnn?: number | null
          deal_nnn_psf?: number | null
          deal_percent?: number | null
          deal_rent_psf?: number | null
          deal_team_id?: string | null
          deal_type_id?: string | null
          deal_usd?: number | null
          deal_value?: number | null
          due_diligence_days?: number | null
          estimated_execution_date?: string | null
          fee?: number | null
          flat_fee_override?: number | null
          gci?: number | null
          house_only?: boolean | null
          house_percent?: number | null
          house_usd?: number | null
          id?: string
          is_behind_schedule?: boolean | null
          kanban_position?: number | null
          landlord_lease_status?: string | null
          landlord_name?: string | null
          last_stage_change_at?: string | null
          lead_source?: string | null
          lease_initial_term_years?: number | null
          loi_date?: string | null
          loi_signed_date?: string | null
          loi_written_date?: string | null
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
          rent_commencement_days?: number | null
          rent_commencement_type?: string | null
          rent_type?: string | null
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
          tia_amount?: number | null
          transaction_type_id?: string | null
          updated_at?: string | null
          updated_by_id?: string | null
          updated_by_sf_id?: string | null
          use_clause_notes?: string | null
          use_clause_type?: string | null
          weeks_behind?: number | null
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_contact_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      deal_rent_schedule: {
        Row: {
          annual_amount: number | null
          created_at: string
          deal_id: string
          id: string
          is_option_period: boolean
          monthly_amount: number | null
          notes: string | null
          per_sqft_amount: number | null
          step_num: number
          updated_at: string
          year_end: number
          year_start: number
        }
        Insert: {
          annual_amount?: number | null
          created_at?: string
          deal_id: string
          id?: string
          is_option_period?: boolean
          monthly_amount?: number | null
          notes?: string | null
          per_sqft_amount?: number | null
          step_num: number
          updated_at?: string
          year_end: number
          year_start: number
        }
        Update: {
          annual_amount?: number | null
          created_at?: string
          deal_id?: string
          id?: string
          is_option_period?: boolean
          monthly_amount?: number | null
          notes?: string | null
          per_sqft_amount?: number | null
          step_num?: number
          updated_at?: string
          year_end?: number
          year_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_rent_schedule_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_rent_schedule_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_rent_schedule_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_rent_schedule_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_rent_schedule_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
        ]
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
      deal_stage_history: {
        Row: {
          changed_at: string
          client_id: string | null
          corrected_date: string | null
          created_at: string
          date_source: string | null
          deal_id: string
          deal_owner_id: string | null
          duration_seconds: number | null
          from_stage_id: string | null
          id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          client_id?: string | null
          corrected_date?: string | null
          created_at?: string
          date_source?: string | null
          deal_id: string
          deal_owner_id?: string | null
          duration_seconds?: number | null
          from_stage_id?: string | null
          id?: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          client_id?: string | null
          corrected_date?: string | null
          created_at?: string
          date_source?: string | null
          deal_id?: string
          deal_owner_id?: string | null
          duration_seconds?: number | null
          from_stage_id?: string | null
          id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stage"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_synopsis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      document_handoff: {
        Row: {
          changed_at: string
          changed_by: string | null
          created_at: string | null
          deal_id: string
          document_type: string
          holder: string
          id: string
          original_changed_at: string | null
        }
        Insert: {
          changed_at: string
          changed_by?: string | null
          created_at?: string | null
          deal_id: string
          document_type: string
          holder: string
          id?: string
          original_changed_at?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string | null
          deal_id?: string
          document_type?: string
          holder?: string
          id?: string
          original_changed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
        ]
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
      email_template: {
        Row: {
          body: string
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_shared: boolean | null
          name: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_shared?: boolean | null
          name: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_shared?: boolean | null
          name?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: []
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
      esri_data_vintage: {
        Row: {
          checked_at: string
          created_at: string
          data_vintage: string | null
          id: string
          notification_sent: boolean | null
          notification_sent_at: string | null
          raw_response: Json | null
          sample_latitude: number
          sample_longitude: number
          sample_population: number | null
        }
        Insert: {
          checked_at?: string
          created_at?: string
          data_vintage?: string | null
          id?: string
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          raw_response?: Json | null
          sample_latitude: number
          sample_longitude: number
          sample_population?: number | null
        }
        Update: {
          checked_at?: string
          created_at?: string
          data_vintage?: string | null
          id?: string
          notification_sent?: boolean | null
          notification_sent_at?: string | null
          raw_response?: Json | null
          sample_latitude?: number
          sample_longitude?: number
          sample_population?: number | null
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
      google_places_api_log: {
        Row: {
          api_endpoint: string
          created_at: string | null
          created_by_id: string | null
          estimated_cost_cents: number | null
          id: string
          query_id: string | null
          request_count: number | null
          request_type: string
          response_status: string | null
          results_count: number | null
        }
        Insert: {
          api_endpoint: string
          created_at?: string | null
          created_by_id?: string | null
          estimated_cost_cents?: number | null
          id?: string
          query_id?: string | null
          request_count?: number | null
          request_type: string
          response_status?: string | null
          results_count?: number | null
        }
        Update: {
          api_endpoint?: string
          created_at?: string | null
          created_by_id?: string | null
          estimated_cost_cents?: number | null
          id?: string
          query_id?: string | null
          request_count?: number | null
          request_type?: string
          response_status?: string | null
          results_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "google_places_api_log_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "google_places_saved_query"
            referencedColumns: ["id"]
          },
        ]
      }
      google_places_result: {
        Row: {
          business_status: string
          created_at: string | null
          first_seen_at: string | null
          formatted_address: string | null
          id: string
          last_seen_at: string | null
          latitude: number
          layer_id: string | null
          longitude: number
          name: string
          phone_number: string | null
          place_id: string
          property_id: string | null
          query_id: string | null
          rating: number | null
          raw_data: Json | null
          types: string[] | null
          user_ratings_total: number | null
          website: string | null
        }
        Insert: {
          business_status: string
          created_at?: string | null
          first_seen_at?: string | null
          formatted_address?: string | null
          id?: string
          last_seen_at?: string | null
          latitude: number
          layer_id?: string | null
          longitude: number
          name: string
          phone_number?: string | null
          place_id: string
          property_id?: string | null
          query_id?: string | null
          rating?: number | null
          raw_data?: Json | null
          types?: string[] | null
          user_ratings_total?: number | null
          website?: string | null
        }
        Update: {
          business_status?: string
          created_at?: string | null
          first_seen_at?: string | null
          formatted_address?: string | null
          id?: string
          last_seen_at?: string | null
          latitude?: number
          layer_id?: string | null
          longitude?: number
          name?: string
          phone_number?: string | null
          place_id?: string
          property_id?: string | null
          query_id?: string | null
          rating?: number | null
          raw_data?: Json | null
          types?: string[] | null
          user_ratings_total?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_places_result_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "map_layer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_places_result_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_places_result_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_places_result_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_places_result_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_places_result_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "google_places_saved_query"
            referencedColumns: ["id"]
          },
        ]
      }
      google_places_saved_query: {
        Row: {
          created_at: string | null
          created_by_id: string | null
          geography_data: Json
          geography_type: string
          grid_size_meters: number | null
          id: string
          last_run_at: string | null
          layer_id: string | null
          name: string
          query_type: string
          result_count: number | null
          search_term: string
          status_filter: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_id?: string | null
          geography_data: Json
          geography_type: string
          grid_size_meters?: number | null
          id?: string
          last_run_at?: string | null
          layer_id?: string | null
          name: string
          query_type?: string
          result_count?: number | null
          search_term: string
          status_filter?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_id?: string | null
          geography_data?: Json
          geography_type?: string
          grid_size_meters?: number | null
          id?: string
          last_run_at?: string | null
          layer_id?: string | null
          name?: string
          query_type?: string
          result_count?: number | null
          search_term?: string
          status_filter?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_places_saved_query_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "map_layer"
            referencedColumns: ["id"]
          },
        ]
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
          linkedin_url: string | null
          person_name: string
          phone: string | null
          source_url: string | null
          target_id: string | null
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
          linkedin_url?: string | null
          person_name: string
          phone?: string | null
          source_url?: string | null
          target_id?: string | null
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
          linkedin_url?: string | null
          person_name?: string
          phone?: string | null
          source_url?: string | null
          target_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_contact_enrichment_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
            referencedColumns: ["id"]
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
          original_value: string | null
          outreach_draft_id: string | null
          sender_domain: string | null
          signal_id: string | null
          target_id: string | null
        }
        Insert: {
          concept_name?: string | null
          corrected_value?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_note?: string | null
          feedback_type: string
          id?: string
          original_value?: string | null
          outreach_draft_id?: string | null
          sender_domain?: string | null
          signal_id?: string | null
          target_id?: string | null
        }
        Update: {
          concept_name?: string | null
          corrected_value?: string | null
          created_at?: string | null
          created_by?: string | null
          feedback_note?: string | null
          feedback_type?: string
          id?: string
          original_value?: string | null
          outreach_draft_id?: string | null
          sender_domain?: string | null
          signal_id?: string | null
          target_id?: string | null
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
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_feedback_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
            referencedColumns: ["id"]
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
          outreach_type: string
          sent_at: string | null
          sent_by_user_email: string | null
          sent_email_id: string | null
          signal_summary: string | null
          source_url: string | null
          status: string | null
          subject: string | null
          target_id: string | null
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
          outreach_type: string
          sent_at?: string | null
          sent_by_user_email?: string | null
          sent_email_id?: string | null
          signal_summary?: string | null
          source_url?: string | null
          status?: string | null
          subject?: string | null
          target_id?: string | null
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
          outreach_type?: string
          sent_at?: string | null
          sent_by_user_email?: string | null
          sent_email_id?: string | null
          signal_summary?: string | null
          source_url?: string | null
          status?: string | null
          subject?: string | null
          target_id?: string | null
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
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_outreach_draft_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
            referencedColumns: ["id"]
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
          scrape_locally_only: boolean | null
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
          scrape_locally_only?: boolean | null
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
          scrape_locally_only?: boolean | null
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
      legal_loi_decision: {
        Row: {
          ai_confidence: number | null
          ai_model: string | null
          ai_position_rank: number | null
          ai_rationale: string | null
          clause_type_id: string | null
          created_at: string
          doc_anchor: string | null
          final_comment_text: string | null
          final_position_rank: number | null
          final_text: string | null
          id: string
          landlord_text_excerpt: string | null
          override_source: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          round_id: string
          severity: string | null
          status: string
          updated_at: string
          was_override: boolean
        }
        Insert: {
          ai_confidence?: number | null
          ai_model?: string | null
          ai_position_rank?: number | null
          ai_rationale?: string | null
          clause_type_id?: string | null
          created_at?: string
          doc_anchor?: string | null
          final_comment_text?: string | null
          final_position_rank?: number | null
          final_text?: string | null
          id?: string
          landlord_text_excerpt?: string | null
          override_source?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_id: string
          severity?: string | null
          status?: string
          updated_at?: string
          was_override?: boolean
        }
        Update: {
          ai_confidence?: number | null
          ai_model?: string | null
          ai_position_rank?: number | null
          ai_rationale?: string | null
          clause_type_id?: string | null
          created_at?: string
          doc_anchor?: string | null
          final_comment_text?: string | null
          final_position_rank?: number | null
          final_text?: string | null
          id?: string
          landlord_text_excerpt?: string | null
          override_source?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_id?: string
          severity?: string | null
          status?: string
          updated_at?: string
          was_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "legal_loi_decision_clause_type_id_fkey"
            columns: ["clause_type_id"]
            isOneToOne: false
            referencedRelation: "clause_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_loi_decision_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "legal_loi_round"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_loi_round: {
        Row: {
          attachment_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          generated_at: string | null
          id: string
          notes: string | null
          round_num: number
          session_id: string
          source_round_id: string | null
        }
        Insert: {
          attachment_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          generated_at?: string | null
          id?: string
          notes?: string | null
          round_num: number
          session_id: string
          source_round_id?: string | null
        }
        Update: {
          attachment_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          generated_at?: string | null
          id?: string
          notes?: string | null
          round_num?: number
          session_id?: string
          source_round_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_loi_round_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_loi_round_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "legal_loi_session"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_loi_round_source_round_id_fkey"
            columns: ["source_round_id"]
            isOneToOne: false
            referencedRelation: "legal_loi_round"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_loi_session: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          id: string
          is_loose: boolean
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          is_loose?: boolean
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          is_loose?: boolean
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_loi_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_loi_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "legal_loi_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "legal_loi_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "legal_loi_session_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "legal_loi_session_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_loi_session_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "legal_loi_session_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "legal_loi_session_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_loi_session_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      legal_playbook: {
        Row: {
          clause_type_id: string
          client_id: string
          confidence_tier: string | null
          created_at: string
          display_heading: string
          guidelines: string | null
          id: string
          is_active: boolean
          rationale: string | null
          source_document: string | null
          updated_at: string
        }
        Insert: {
          clause_type_id: string
          client_id: string
          confidence_tier?: string | null
          created_at?: string
          display_heading: string
          guidelines?: string | null
          id?: string
          is_active?: boolean
          rationale?: string | null
          source_document?: string | null
          updated_at?: string
        }
        Update: {
          clause_type_id?: string
          client_id?: string
          confidence_tier?: string | null
          created_at?: string
          display_heading?: string
          guidelines?: string | null
          id?: string
          is_active?: boolean
          rationale?: string | null
          source_document?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_playbook_clause_type_id_fkey"
            columns: ["clause_type_id"]
            isOneToOne: false
            referencedRelation: "clause_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_playbook_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_playbook_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "legal_playbook_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "legal_playbook_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "legal_playbook_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
        ]
      }
      legal_playbook_position: {
        Row: {
          clause_text: string
          created_at: string
          default_comment_text: string | null
          id: string
          is_active: boolean
          is_floor: boolean
          legal_playbook_id: string
          position_label: string | null
          position_rank: number
          requires_approval: string | null
          updated_at: string
        }
        Insert: {
          clause_text: string
          created_at?: string
          default_comment_text?: string | null
          id?: string
          is_active?: boolean
          is_floor?: boolean
          legal_playbook_id: string
          position_label?: string | null
          position_rank: number
          requires_approval?: string | null
          updated_at?: string
        }
        Update: {
          clause_text?: string
          created_at?: string
          default_comment_text?: string | null
          id?: string
          is_active?: boolean
          is_floor?: boolean
          legal_playbook_id?: string
          position_label?: string | null
          position_rank?: number
          requires_approval?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_playbook_position_legal_playbook_id_fkey"
            columns: ["legal_playbook_id"]
            isOneToOne: false
            referencedRelation: "legal_playbook"
            referencedColumns: ["id"]
          },
        ]
      }
      map_layer: {
        Row: {
          created_at: string | null
          created_by_id: string | null
          default_color: string
          default_opacity: number
          default_stroke_color: string | null
          default_stroke_width: number
          description: string | null
          icon_config: Json | null
          id: string
          is_active: boolean
          layer_type: string
          name: string
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_id?: string | null
          default_color?: string
          default_opacity?: number
          default_stroke_color?: string | null
          default_stroke_width?: number
          description?: string | null
          icon_config?: Json | null
          id?: string
          is_active?: boolean
          layer_type?: string
          name: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_id?: string | null
          default_color?: string
          default_opacity?: number
          default_stroke_color?: string | null
          default_stroke_width?: number
          description?: string | null
          icon_config?: Json | null
          id?: string
          is_active?: boolean
          layer_type?: string
          name?: string
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: []
      }
      map_layer_client_share: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          is_visible_by_default: boolean
          layer_id: string | null
          share_type: string
          shared_at: string | null
          shared_by_id: string | null
          source_layer_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          is_visible_by_default?: boolean
          layer_id?: string | null
          share_type?: string
          shared_at?: string | null
          shared_by_id?: string | null
          source_layer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          is_visible_by_default?: boolean
          layer_id?: string | null
          share_type?: string
          shared_at?: string | null
          shared_by_id?: string | null
          source_layer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_layer_client_share_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_layer_client_share_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "map_layer_client_share_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "map_layer_client_share_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "map_layer_client_share_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "map_layer_client_share_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "map_layer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_layer_client_share_source_layer_id_fkey"
            columns: ["source_layer_id"]
            isOneToOne: false
            referencedRelation: "map_layer"
            referencedColumns: ["id"]
          },
        ]
      }
      map_layer_shape: {
        Row: {
          attributes: Json | null
          color: string
          created_at: string | null
          created_by_id: string | null
          description: string | null
          fill_opacity: number
          geometry: Json
          id: string
          layer_id: string
          name: string | null
          shape_type: string
          sort_order: number | null
          stroke_color: string | null
          stroke_width: number
          updated_at: string | null
          updated_by_id: string | null
        }
        Insert: {
          attributes?: Json | null
          color?: string
          created_at?: string | null
          created_by_id?: string | null
          description?: string | null
          fill_opacity?: number
          geometry: Json
          id?: string
          layer_id: string
          name?: string | null
          shape_type: string
          sort_order?: number | null
          stroke_color?: string | null
          stroke_width?: number
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Update: {
          attributes?: Json | null
          color?: string
          created_at?: string | null
          created_by_id?: string | null
          description?: string | null
          fill_opacity?: number
          geometry?: Json
          id?: string
          layer_id?: string
          name?: string | null
          shape_type?: string
          sort_order?: number | null
          stroke_color?: string | null
          stroke_width?: number
          updated_at?: string | null
          updated_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_layer_shape_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "map_layer"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_brand: {
        Row: {
          brandfetch_domain: string | null
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          last_ingested_at: string | null
          last_verified_at: string | null
          logo_fetched_at: string | null
          logo_url: string | null
          logo_variant: string
          name: string
          normalized_name: string
          places_search_query: string | null
          places_type_filter: string | null
          updated_at: string
        }
        Insert: {
          brandfetch_domain?: string | null
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_ingested_at?: string | null
          last_verified_at?: string | null
          logo_fetched_at?: string | null
          logo_url?: string | null
          logo_variant?: string
          name: string
          normalized_name: string
          places_search_query?: string | null
          places_type_filter?: string | null
          updated_at?: string
        }
        Update: {
          brandfetch_domain?: string | null
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_ingested_at?: string | null
          last_verified_at?: string | null
          logo_fetched_at?: string | null
          logo_url?: string | null
          logo_variant?: string
          name?: string
          normalized_name?: string
          places_search_query?: string | null
          places_type_filter?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_brand_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "merchant_category"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_category: {
        Row: {
          created_at: string
          display_order: number
          id: string
          last_refreshed_at: string | null
          name: string
          refresh_frequency_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          last_refreshed_at?: string | null
          name: string
          refresh_frequency_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          last_refreshed_at?: string | null
          name?: string
          refresh_frequency_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      merchant_closure_alert: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          detected_at: string
          id: string
          location_id: string
          new_status: string
          previous_status: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          detected_at?: string
          id?: string
          location_id: string
          new_status: string
          previous_status?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          detected_at?: string
          id?: string
          location_id?: string
          new_status?: string
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_closure_alert_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_closure_alert_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "merchant_location"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_favorite: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_favorite_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_favorite_brand: {
        Row: {
          brand_id: string
          favorite_id: string
        }
        Insert: {
          brand_id: string
          favorite_id: string
        }
        Update: {
          brand_id?: string
          favorite_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_favorite_brand_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "merchant_brand"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_favorite_brand_favorite_id_fkey"
            columns: ["favorite_id"]
            isOneToOne: false
            referencedRelation: "merchant_favorite"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_favorite_share: {
        Row: {
          favorite_id: string
          permission: string
          shared_at: string
          user_id: string
        }
        Insert: {
          favorite_id: string
          permission?: string
          shared_at?: string
          user_id: string
        }
        Update: {
          favorite_id?: string
          permission?: string
          shared_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_favorite_share_favorite_id_fkey"
            columns: ["favorite_id"]
            isOneToOne: false
            referencedRelation: "merchant_favorite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_favorite_share_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_location: {
        Row: {
          brand_id: string
          business_status: string
          created_at: string
          formatted_address: string | null
          google_place_id: string
          id: string
          last_fetched_at: string
          last_verified_at: string
          latitude: number
          longitude: number
          name: string
          phone: string | null
          previous_status: string | null
          status_changed_at: string | null
          website: string | null
        }
        Insert: {
          brand_id: string
          business_status?: string
          created_at?: string
          formatted_address?: string | null
          google_place_id: string
          id?: string
          last_fetched_at?: string
          last_verified_at?: string
          latitude: number
          longitude: number
          name: string
          phone?: string | null
          previous_status?: string | null
          status_changed_at?: string | null
          website?: string | null
        }
        Update: {
          brand_id?: string
          business_status?: string
          created_at?: string
          formatted_address?: string | null
          google_place_id?: string
          id?: string
          last_fetched_at?: string
          last_verified_at?: string
          latitude?: number
          longitude?: number
          name?: string
          phone?: string | null
          previous_status?: string | null
          status_changed_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_location_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "merchant_brand"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_logs: {
        Row: {
          clause_type_id: string | null
          client_id: string
          created_at: string
          deal_id: string | null
          decision_id: string | null
          id: string
          notes: string | null
          override_source: string | null
          position_used: number | null
          round_id: string | null
          session_id: string | null
          was_override: boolean
        }
        Insert: {
          clause_type_id?: string | null
          client_id: string
          created_at?: string
          deal_id?: string | null
          decision_id?: string | null
          id?: string
          notes?: string | null
          override_source?: string | null
          position_used?: number | null
          round_id?: string | null
          session_id?: string | null
          was_override?: boolean
        }
        Update: {
          clause_type_id?: string | null
          client_id?: string
          created_at?: string
          deal_id?: string | null
          decision_id?: string | null
          id?: string
          notes?: string | null
          override_source?: string | null
          position_used?: number | null
          round_id?: string | null
          session_id?: string | null
          was_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_logs_clause_type_id_fkey"
            columns: ["clause_type_id"]
            isOneToOne: false
            referencedRelation: "clause_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "negotiation_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "negotiation_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "negotiation_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "negotiation_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "negotiation_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "negotiation_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "negotiation_logs_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "legal_loi_decision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_logs_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "legal_loi_round"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "legal_loi_session"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "fk_note_object_link_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "note_object_link_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
          payment_date_auto_calculated: string | null
          payment_date_estimated: string | null
          payment_date_source: string | null
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
          payment_date_auto_calculated?: string | null
          payment_date_estimated?: string | null
          payment_date_source?: string | null
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
          payment_date_auto_calculated?: string | null
          payment_date_estimated?: string | null
          payment_date_source?: string | null
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "payment_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      pending_client_comment_email: {
        Row: {
          client_id: string
          comment_count: number
          created_at: string
          first_comment_at: string
          id: string
          last_comment_at: string
          site_submit_id: string
        }
        Insert: {
          client_id: string
          comment_count?: number
          created_at?: string
          first_comment_at?: string
          id?: string
          last_comment_at?: string
          site_submit_id: string
        }
        Update: {
          client_id?: string
          comment_count?: number
          created_at?: string
          first_comment_at?: string
          id?: string
          last_comment_at?: string
          site_submit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_client_comment_email_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_client_comment_email_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "pending_client_comment_email_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "pending_client_comment_email_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "pending_client_comment_email_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "pending_client_comment_email_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "pending_client_comment_email_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_activity_log: {
        Row: {
          auth_user_id: string | null
          client_id: string | null
          contact_id: string | null
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown
          page_path: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          auth_user_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          page_path?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          auth_user_id?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          page_path?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_activity_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_activity_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "portal_activity_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "portal_activity_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      portal_email_send: {
        Row: {
          activity_ids: string[]
          body_html: string | null
          cc: string[]
          client_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          provider: string
          provider_message_id: string | null
          recipients: string[]
          scope: string | null
          sent_at: string
          site_submit_id: string | null
          status: string
          subject: string
          triggered_by_id: string | null
        }
        Insert: {
          activity_ids?: string[]
          body_html?: string | null
          cc?: string[]
          client_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          provider: string
          provider_message_id?: string | null
          recipients?: string[]
          scope?: string | null
          sent_at?: string
          site_submit_id?: string | null
          status?: string
          subject: string
          triggered_by_id?: string | null
        }
        Update: {
          activity_ids?: string[]
          body_html?: string | null
          cc?: string[]
          client_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          recipients?: string[]
          scope?: string | null
          sent_at?: string
          site_submit_id?: string | null
          status?: string
          subject?: string
          triggered_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_email_send_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_email_send_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_email_send_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_email_send_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_email_send_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "portal_email_send_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "portal_email_send_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_file_visibility: {
        Row: {
          changed_by_id: string | null
          created_at: string | null
          dropbox_path: string
          entity_id: string
          entity_type: string
          id: string
          is_visible: boolean
          site_submit_id: string | null
          updated_at: string | null
        }
        Insert: {
          changed_by_id?: string | null
          created_at?: string | null
          dropbox_path: string
          entity_id: string
          entity_type: string
          id?: string
          is_visible: boolean
          site_submit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          changed_by_id?: string | null
          created_at?: string | null
          dropbox_path?: string
          entity_id?: string
          entity_type?: string
          id?: string
          is_visible?: boolean
          site_submit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_file_visibility_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "portal_file_visibility_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
          daytime_pop_1_mile: number | null
          daytime_pop_10min_drive: number | null
          daytime_pop_3_mile: number | null
          daytime_pop_5_mile: number | null
          deal_type_id: string | null
          demographics: string | null
          description: string | null
          employees_1_mile: number | null
          employees_10min_drive: number | null
          employees_3_mile: number | null
          employees_5_mile: number | null
          esri_enriched_at: string | null
          esri_enriched_latitude: number | null
          esri_enriched_longitude: number | null
          esri_enrichment_data: Json | null
          google_place_id: string | null
          hh_income_avg_1_mile: number | null
          hh_income_avg_10min_drive: number | null
          hh_income_avg_3_mile: number | null
          hh_income_avg_5_mile: number | null
          hh_income_median_1_mile: number | null
          hh_income_median_10min_drive: number | null
          hh_income_median_3_mile: number | null
          hh_income_median_5_mile: number | null
          households_1_mile: number | null
          households_10min_drive: number | null
          households_3_mile: number | null
          households_5_mile: number | null
          id: string
          landlord: string | null
          latitude: number | null
          layer_notes: string | null
          lease_expiration_date: string | null
          letter_sent: boolean | null
          longitude: number | null
          map_link: string | null
          marketing_materials: string | null
          median_age_1_mile: number | null
          median_age_10min_drive: number | null
          median_age_3_mile: number | null
          median_age_5_mile: number | null
          nnn_psf: number | null
          owner_id: string | null
          parcel_id: string | null
          pop_1_mile: number | null
          pop_10min_drive: number | null
          pop_3_mile: number | null
          pop_5_mile: number | null
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
          tapestry_lifemodes: string | null
          tapestry_segment_code: string | null
          tapestry_segment_description: string | null
          tapestry_segment_name: string | null
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
          daytime_pop_1_mile?: number | null
          daytime_pop_10min_drive?: number | null
          daytime_pop_3_mile?: number | null
          daytime_pop_5_mile?: number | null
          deal_type_id?: string | null
          demographics?: string | null
          description?: string | null
          employees_1_mile?: number | null
          employees_10min_drive?: number | null
          employees_3_mile?: number | null
          employees_5_mile?: number | null
          esri_enriched_at?: string | null
          esri_enriched_latitude?: number | null
          esri_enriched_longitude?: number | null
          esri_enrichment_data?: Json | null
          google_place_id?: string | null
          hh_income_avg_1_mile?: number | null
          hh_income_avg_10min_drive?: number | null
          hh_income_avg_3_mile?: number | null
          hh_income_avg_5_mile?: number | null
          hh_income_median_1_mile?: number | null
          hh_income_median_10min_drive?: number | null
          hh_income_median_3_mile?: number | null
          hh_income_median_5_mile?: number | null
          households_1_mile?: number | null
          households_10min_drive?: number | null
          households_3_mile?: number | null
          households_5_mile?: number | null
          id?: string
          landlord?: string | null
          latitude?: number | null
          layer_notes?: string | null
          lease_expiration_date?: string | null
          letter_sent?: boolean | null
          longitude?: number | null
          map_link?: string | null
          marketing_materials?: string | null
          median_age_1_mile?: number | null
          median_age_10min_drive?: number | null
          median_age_3_mile?: number | null
          median_age_5_mile?: number | null
          nnn_psf?: number | null
          owner_id?: string | null
          parcel_id?: string | null
          pop_1_mile?: number | null
          pop_10min_drive?: number | null
          pop_3_mile?: number | null
          pop_5_mile?: number | null
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
          tapestry_lifemodes?: string | null
          tapestry_segment_code?: string | null
          tapestry_segment_description?: string | null
          tapestry_segment_name?: string | null
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
          daytime_pop_1_mile?: number | null
          daytime_pop_10min_drive?: number | null
          daytime_pop_3_mile?: number | null
          daytime_pop_5_mile?: number | null
          deal_type_id?: string | null
          demographics?: string | null
          description?: string | null
          employees_1_mile?: number | null
          employees_10min_drive?: number | null
          employees_3_mile?: number | null
          employees_5_mile?: number | null
          esri_enriched_at?: string | null
          esri_enriched_latitude?: number | null
          esri_enriched_longitude?: number | null
          esri_enrichment_data?: Json | null
          google_place_id?: string | null
          hh_income_avg_1_mile?: number | null
          hh_income_avg_10min_drive?: number | null
          hh_income_avg_3_mile?: number | null
          hh_income_avg_5_mile?: number | null
          hh_income_median_1_mile?: number | null
          hh_income_median_10min_drive?: number | null
          hh_income_median_3_mile?: number | null
          hh_income_median_5_mile?: number | null
          households_1_mile?: number | null
          households_10min_drive?: number | null
          households_3_mile?: number | null
          households_5_mile?: number | null
          id?: string
          landlord?: string | null
          latitude?: number | null
          layer_notes?: string | null
          lease_expiration_date?: string | null
          letter_sent?: boolean | null
          longitude?: number | null
          map_link?: string | null
          marketing_materials?: string | null
          median_age_1_mile?: number | null
          median_age_10min_drive?: number | null
          median_age_3_mile?: number | null
          median_age_5_mile?: number | null
          nnn_psf?: number | null
          owner_id?: string | null
          parcel_id?: string | null
          pop_1_mile?: number | null
          pop_10min_drive?: number | null
          pop_3_mile?: number | null
          pop_5_mile?: number | null
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
          tapestry_lifemodes?: string | null
          tapestry_segment_code?: string | null
          tapestry_segment_description?: string | null
          tapestry_segment_name?: string | null
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
      property_activity: {
        Row: {
          activity_type: string
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          email_subject: string | null
          id: string
          notes: string | null
          property_id: string
        }
        Insert: {
          activity_type: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email_subject?: string | null
          id?: string
          notes?: string | null
          property_id: string
        }
        Update: {
          activity_type?: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email_subject?: string | null
          id?: string
          notes?: string | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "property_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "property_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "property_activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_activity_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
      property_note: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_edited: boolean | null
          is_migrated: boolean | null
          migrated_from: string | null
          property_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_edited?: boolean | null
          is_migrated?: boolean | null
          migrated_from?: string | null
          property_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_edited?: boolean | null
          is_migrated?: boolean | null
          migrated_from?: string | null
          property_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_note_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_note_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_note_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_note_property_id_fkey"
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "property_unit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      prospecting_activity: {
        Row: {
          activity_date: string | null
          activity_type: string
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          email_subject: string | null
          hidden_from_timeline: boolean | null
          id: string
          notes: string | null
          target_id: string | null
        }
        Insert: {
          activity_date?: string | null
          activity_type: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email_subject?: string | null
          hidden_from_timeline?: boolean | null
          id?: string
          notes?: string | null
          target_id?: string | null
        }
        Update: {
          activity_date?: string | null
          activity_type?: string
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email_subject?: string | null
          hidden_from_timeline?: boolean | null
          id?: string
          notes?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_activity_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_activity_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_activity_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_activity_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "prospecting_activity_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "prospecting_activity_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_note: {
        Row: {
          contact_id: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          target_id: string | null
        }
        Insert: {
          contact_id?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          target_id?: string | null
        }
        Update: {
          contact_id?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_note_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_note_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_note_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_note_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "prospecting_note_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_note_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_note_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_note_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "prospecting_note_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "prospecting_note_hunter_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_settings: {
        Row: {
          created_at: string | null
          daily_time_goal_minutes: number | null
          id: string
          stale_lead_days: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_time_goal_minutes?: number | null
          id?: string
          stale_lead_days?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_time_goal_minutes?: number | null
          id?: string
          stale_lead_days?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
      prospecting_time_entry: {
        Row: {
          created_at: string | null
          entry_date: string
          id: string
          minutes: number
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entry_date: string
          id?: string
          minutes: number
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entry_date?: string
          id?: string
          minutes?: number
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      prospecting_vacation_day: {
        Row: {
          created_at: string | null
          id: string
          reason: string | null
          user_id: string
          vacation_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reason?: string | null
          user_id: string
          vacation_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reason?: string | null
          user_id?: string
          vacation_date?: string
        }
        Relationships: []
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
      restaurant_placer_rank: {
        Row: {
          created_at: string | null
          entered_by: string
          id: string
          placer_url: string | null
          rank_date: string
          rank_percentage: number
          rank_position: number
          rank_total: number
          store_no: string
        }
        Insert: {
          created_at?: string | null
          entered_by: string
          id?: string
          placer_url?: string | null
          rank_date?: string
          rank_percentage: number
          rank_position: number
          rank_total: number
          store_no: string
        }
        Update: {
          created_at?: string | null
          entered_by?: string
          id?: string
          placer_url?: string | null
          rank_date?: string
          rank_percentage?: number
          rank_position?: number
          rank_total?: number
          store_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_placer_rank_store_no_fkey"
            columns: ["store_no"]
            isOneToOne: false
            referencedRelation: "restaurant_location"
            referencedColumns: ["store_no"]
          },
        ]
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
      saved_search: {
        Row: {
          column_config: Json | null
          created_at: string | null
          created_by_id: string
          description: string | null
          filter_groups: Json
          id: string
          is_public: boolean | null
          name: string
          sort_config: Json | null
          updated_at: string | null
        }
        Insert: {
          column_config?: Json | null
          created_at?: string | null
          created_by_id: string
          description?: string | null
          filter_groups: Json
          id?: string
          is_public?: boolean | null
          name: string
          sort_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          column_config?: Json | null
          created_at?: string | null
          created_by_id?: string
          description?: string | null
          filter_groups?: Json
          id?: string
          is_public?: boolean | null
          name?: string
          sort_config?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_search_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      site_submit: {
        Row: {
          assignment_id: string | null
          client_demographics: Json | null
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
          client_demographics?: Json | null
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
          client_demographics?: Json | null
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "site_submit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      site_submit_activity: {
        Row: {
          activity_type: string
          actor_kind: string
          actor_user_id: string | null
          client_id: string
          client_visible: boolean
          created_at: string
          id: string
          included_in_send_id: string | null
          payload: Json
          site_submit_id: string
        }
        Insert: {
          activity_type: string
          actor_kind: string
          actor_user_id?: string | null
          client_id: string
          client_visible?: boolean
          created_at?: string
          id?: string
          included_in_send_id?: string | null
          payload?: Json
          site_submit_id: string
        }
        Update: {
          activity_type?: string
          actor_kind?: string
          actor_user_id?: string | null
          client_id?: string
          client_visible?: boolean
          created_at?: string
          id?: string
          included_in_send_id?: string | null
          payload?: Json
          site_submit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_submit_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_activity_included_in_send_id_fkey"
            columns: ["included_in_send_id"]
            isOneToOne: false
            referencedRelation: "portal_email_send"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_activity_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "site_submit_activity_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
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
          parent_comment_id: string | null
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
          parent_comment_id?: string | null
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
          parent_comment_id?: string | null
          site_submit_id?: string
          updated_at?: string | null
          updated_by_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_submit_comment_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "site_submit_comment"
            referencedColumns: ["id"]
          },
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
      site_submit_stage_history: {
        Row: {
          changed_at: string
          changed_by_id: string | null
          client_id: string | null
          created_at: string
          duration_seconds: number | null
          from_stage_id: string | null
          id: string
          site_submit_id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_id?: string | null
          client_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          from_stage_id?: string | null
          id?: string
          site_submit_id: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by_id?: string | null
          client_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          from_stage_id?: string | null
          id?: string
          site_submit_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_submit_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "submit_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_submit_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "submit_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
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
      starbucks_snapshot: {
        Row: {
          annual_rent: number | null
          aws_last_12_wks: number | null
          cash_tc_pct: number | null
          created_at: string
          deal_type: string | null
          id: string
          landlord: string | null
          lease_exp_date: string | null
          lhi_depreciation: number | null
          next_option_type: string | null
          ops_area: string | null
          optns_remain: number | null
          r52_sales_otw: number | null
          rent_pct_of_sales: number | null
          rtm_cash_flow: number | null
          rtm_contribution: number | null
          rtm_sales: number | null
          sales_channel_mix: string | null
          sf: number | null
          snapshot_date: string
          store_age: number | null
          store_number: string
          store_type: string | null
          tc_pct: number | null
        }
        Insert: {
          annual_rent?: number | null
          aws_last_12_wks?: number | null
          cash_tc_pct?: number | null
          created_at?: string
          deal_type?: string | null
          id?: string
          landlord?: string | null
          lease_exp_date?: string | null
          lhi_depreciation?: number | null
          next_option_type?: string | null
          ops_area?: string | null
          optns_remain?: number | null
          r52_sales_otw?: number | null
          rent_pct_of_sales?: number | null
          rtm_cash_flow?: number | null
          rtm_contribution?: number | null
          rtm_sales?: number | null
          sales_channel_mix?: string | null
          sf?: number | null
          snapshot_date: string
          store_age?: number | null
          store_number: string
          store_type?: string | null
          tc_pct?: number | null
        }
        Update: {
          annual_rent?: number | null
          aws_last_12_wks?: number | null
          cash_tc_pct?: number | null
          created_at?: string
          deal_type?: string | null
          id?: string
          landlord?: string | null
          lease_exp_date?: string | null
          lhi_depreciation?: number | null
          next_option_type?: string | null
          ops_area?: string | null
          optns_remain?: number | null
          r52_sales_otw?: number | null
          rent_pct_of_sales?: number | null
          rtm_cash_flow?: number | null
          rtm_contribution?: number | null
          rtm_sales?: number | null
          sales_channel_mix?: string | null
          sf?: number | null
          snapshot_date?: string
          store_age?: number | null
          store_number?: string
          store_type?: string | null
          tc_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "starbucks_snapshot_store_number_fkey"
            columns: ["store_number"]
            isOneToOne: false
            referencedRelation: "starbucks_store"
            referencedColumns: ["store_number"]
          },
        ]
      }
      starbucks_store: {
        Row: {
          city: string | null
          county: string | null
          created_at: string
          latitude: number | null
          longitude: number | null
          market: string | null
          open_date: string | null
          relo_date: string | null
          store_name: string | null
          store_number: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          county?: string | null
          created_at?: string
          latitude?: number | null
          longitude?: number | null
          market?: string | null
          open_date?: string | null
          relo_date?: string | null
          store_name?: string | null
          store_number: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          county?: string | null
          created_at?: string
          latitude?: number | null
          longitude?: number | null
          market?: string | null
          open_date?: string | null
          relo_date?: string | null
          store_name?: string | null
          store_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      streetlight_quota_config: {
        Row: {
          annual_segment_quota: number
          contract_start_date: string
          default_daily_per_user: number
          hard_stop_pct: number
          id: number
          updated_at: string | null
          updated_by: string | null
          warning_pct: number
        }
        Insert: {
          annual_segment_quota?: number
          contract_start_date: string
          default_daily_per_user?: number
          hard_stop_pct?: number
          id?: number
          updated_at?: string | null
          updated_by?: string | null
          warning_pct?: number
        }
        Update: {
          annual_segment_quota?: number
          contract_start_date?: string
          default_daily_per_user?: number
          hard_stop_pct?: number
          id?: number
          updated_at?: string | null
          updated_by?: string | null
          warning_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "streetlight_quota_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      streetlight_segment: {
        Row: {
          bbox_east: number | null
          bbox_north: number | null
          bbox_south: number | null
          bbox_west: number | null
          cached_at: string
          geom: unknown
          id: number
          road_name: string | null
          road_type: string | null
          updated_at: string
        }
        Insert: {
          bbox_east?: number | null
          bbox_north?: number | null
          bbox_south?: number | null
          bbox_west?: number | null
          cached_at?: string
          geom: unknown
          id: number
          road_name?: string | null
          road_type?: string | null
          updated_at?: string
        }
        Update: {
          bbox_east?: number | null
          bbox_north?: number | null
          bbox_south?: number | null
          bbox_west?: number | null
          cached_at?: string
          geom?: unknown
          id?: number
          road_name?: string | null
          road_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      streetlight_segment_metrics: {
        Row: {
          aadt: number | null
          aadt_raw: Json | null
          date_range_end: string
          date_range_start: string
          day_part: string
          day_type: string
          fetched_at: string
          fetched_by: string | null
          id: string
          segment_id: number
          trips_volume: number | null
          truck_pct: number | null
          usage_log_id: string | null
          vhd: number | null
          vmt: number | null
          year_month: string
        }
        Insert: {
          aadt?: number | null
          aadt_raw?: Json | null
          date_range_end: string
          date_range_start: string
          day_part?: string
          day_type?: string
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          segment_id: number
          trips_volume?: number | null
          truck_pct?: number | null
          usage_log_id?: string | null
          vhd?: number | null
          vmt?: number | null
          year_month?: string
        }
        Update: {
          aadt?: number | null
          aadt_raw?: Json | null
          date_range_end?: string
          date_range_start?: string
          day_part?: string
          day_type?: string
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          segment_id?: number
          trips_volume?: number | null
          truck_pct?: number | null
          usage_log_id?: string | null
          vhd?: number | null
          vmt?: number | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "streetlight_segment_metrics_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "streetlight_segment"
            referencedColumns: ["id"]
          },
        ]
      }
      streetlight_usage_log: {
        Row: {
          checked_segment_ids: number[] | null
          date_spec: Json | null
          endpoint: string
          error_message: string | null
          id: string
          org_id: string | null
          request_geometry: Json | null
          requested_at: string
          response_status: string
          segments_billed: number
          segments_new: number
          segments_refresh: number
          segments_requested: number
          segments_wasted: number | null
          user_id: string
        }
        Insert: {
          checked_segment_ids?: number[] | null
          date_spec?: Json | null
          endpoint?: string
          error_message?: string | null
          id?: string
          org_id?: string | null
          request_geometry?: Json | null
          requested_at?: string
          response_status?: string
          segments_billed?: number
          segments_new?: number
          segments_refresh?: number
          segments_requested?: number
          segments_wasted?: number | null
          user_id: string
        }
        Update: {
          checked_segment_ids?: number[] | null
          date_spec?: Json | null
          endpoint?: string
          error_message?: string | null
          id?: string
          org_id?: string | null
          request_geometry?: Json | null
          requested_at?: string
          response_status?: string
          segments_billed?: number
          segments_new?: number
          segments_refresh?: number
          segments_requested?: number
          segments_wasted?: number | null
          user_id?: string
        }
        Relationships: []
      }
      streetlight_usage_log_segment: {
        Row: {
          aadt: number | null
          id: string
          new_spec: Json | null
          prior_spec: Json | null
          segment_id: number
          update_reason: string
          usage_log_id: string
        }
        Insert: {
          aadt?: number | null
          id?: string
          new_spec?: Json | null
          prior_spec?: Json | null
          segment_id: number
          update_reason?: string
          usage_log_id: string
        }
        Update: {
          aadt?: number | null
          id?: string
          new_spec?: Json | null
          prior_spec?: Json | null
          segment_id?: number
          update_reason?: string
          usage_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streetlight_usage_log_segment_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "streetlight_segment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streetlight_usage_log_segment_usage_log_id_fkey"
            columns: ["usage_log_id"]
            isOneToOne: false
            referencedRelation: "streetlight_usage_log"
            referencedColumns: ["id"]
          },
        ]
      }
      streetlight_user_limit: {
        Row: {
          created_at: string
          daily_segment_limit: number
          id: string
          monthly_segment_limit: number | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_segment_limit?: number
          id?: string
          monthly_segment_limit?: number | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_segment_limit?: number
          id?: string
          monthly_segment_limit?: number | null
          notes?: string | null
          updated_at?: string
          user_id?: string
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
      target: {
        Row: {
          concept_name: string
          created_at: string | null
          dismiss_note: string | null
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          existing_client_id: string | null
          existing_contact_id: string | null
          first_seen_at: string | null
          geo_relevance: string | null
          id: string
          industry_segment: string | null
          key_person_name: string | null
          key_person_title: string | null
          last_contacted_at: string | null
          last_signal_at: string | null
          news_only: boolean | null
          normalized_name: string
          score_reasoning: string | null
          signal_strength: string
          source: string
          status: string | null
          target_geography: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          concept_name: string
          created_at?: string | null
          dismiss_note?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          existing_client_id?: string | null
          existing_contact_id?: string | null
          first_seen_at?: string | null
          geo_relevance?: string | null
          id?: string
          industry_segment?: string | null
          key_person_name?: string | null
          key_person_title?: string | null
          last_contacted_at?: string | null
          last_signal_at?: string | null
          news_only?: boolean | null
          normalized_name: string
          score_reasoning?: string | null
          signal_strength: string
          source?: string
          status?: string | null
          target_geography?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          concept_name?: string
          created_at?: string | null
          dismiss_note?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          existing_client_id?: string | null
          existing_contact_id?: string | null
          first_seen_at?: string | null
          geo_relevance?: string | null
          id?: string
          industry_segment?: string | null
          key_person_name?: string | null
          key_person_title?: string | null
          last_contacted_at?: string | null
          last_signal_at?: string | null
          news_only?: boolean | null
          normalized_name?: string
          score_reasoning?: string | null
          signal_strength?: string
          source?: string
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
      target_signal: {
        Row: {
          created_at: string | null
          extracted_summary: string | null
          id: string
          mentioned_geography: string[] | null
          mentioned_person: string | null
          signal_id: string | null
          target_id: string | null
        }
        Insert: {
          created_at?: string | null
          extracted_summary?: string | null
          id?: string
          mentioned_geography?: string[] | null
          mentioned_person?: string | null
          signal_id?: string | null
          target_id?: string | null
        }
        Update: {
          created_at?: string | null
          extracted_summary?: string | null
          id?: string
          mentioned_geography?: string[] | null
          mentioned_person?: string | null
          signal_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_dismissed_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_outreach_queue"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["target_id"]
          },
          {
            foreignKeyName: "hunter_lead_signal_lead_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "v_prospecting_stale_targets"
            referencedColumns: ["id"]
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
      task: {
        Row: {
          assigned_by_id: string | null
          assignment_id: string | null
          category: string
          client_id: string | null
          completed_at: string | null
          completion_note: string | null
          contact_id: string | null
          created_at: string
          created_by_id: string | null
          deal_id: string | null
          description: string | null
          due_at: string | null
          duration_minutes: number | null
          high_flag: boolean
          id: string
          is_inbox: boolean
          last_activity_at: string | null
          migrated_from_activity_id: string | null
          owner_id: string
          parent_task_id: string | null
          private_completion: boolean
          project_id: string | null
          property_id: string | null
          remind_at: string | null
          signal_strength: string | null
          site_submit_id: string | null
          status: string
          subject: string
          top3_date: string | null
          updated_at: string
        }
        Insert: {
          assigned_by_id?: string | null
          assignment_id?: string | null
          category?: string
          client_id?: string | null
          completed_at?: string | null
          completion_note?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          duration_minutes?: number | null
          high_flag?: boolean
          id?: string
          is_inbox?: boolean
          last_activity_at?: string | null
          migrated_from_activity_id?: string | null
          owner_id: string
          parent_task_id?: string | null
          private_completion?: boolean
          project_id?: string | null
          property_id?: string | null
          remind_at?: string | null
          signal_strength?: string | null
          site_submit_id?: string | null
          status?: string
          subject: string
          top3_date?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by_id?: string | null
          assignment_id?: string | null
          category?: string
          client_id?: string | null
          completed_at?: string | null
          completion_note?: string | null
          contact_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          duration_minutes?: number | null
          high_flag?: boolean
          id?: string
          is_inbox?: boolean
          last_activity_at?: string | null
          migrated_from_activity_id?: string | null
          owner_id?: string
          parent_task_id?: string | null
          private_completion?: boolean
          project_id?: string | null
          property_id?: string | null
          remind_at?: string | null
          signal_strength?: string | null
          site_submit_id?: string | null
          status?: string
          subject?: string
          top3_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assigned_by_id_fkey"
            columns: ["assigned_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "task_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "task_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "task_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "task_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "task_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "task_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "task_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "task_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "task_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "task_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "task_project"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_deal_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_with_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "portal_site_submit_status"
            referencedColumns: ["site_submit_id"]
          },
          {
            foreignKeyName: "task_site_submit_id_fkey"
            columns: ["site_submit_id"]
            isOneToOne: false
            referencedRelation: "site_submit"
            referencedColumns: ["id"]
          },
        ]
      }
      task_block_instance: {
        Row: {
          category: string
          created_at: string
          duration_minutes: number
          id: string
          name: string
          on_date: string
          owner_id: string
          start_time: string
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          duration_minutes: number
          id?: string
          name: string
          on_date: string
          owner_id: string
          start_time: string
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          on_date?: string
          owner_id?: string
          start_time?: string
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_block_instance_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_block_instance_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_block_template"
            referencedColumns: ["id"]
          },
        ]
      }
      task_block_scheduled_task: {
        Row: {
          block_instance_id: string
          created_at: string
          id: string
          manual_rank: number
          task_id: string
        }
        Insert: {
          block_instance_id: string
          created_at?: string
          id?: string
          manual_rank?: number
          task_id: string
        }
        Update: {
          block_instance_id?: string
          created_at?: string
          id?: string
          manual_rank?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_block_scheduled_task_block_instance_id_fkey"
            columns: ["block_instance_id"]
            isOneToOne: false
            referencedRelation: "task_block_instance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_block_scheduled_task_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task"
            referencedColumns: ["id"]
          },
        ]
      }
      task_block_template: {
        Row: {
          active: boolean
          byweekday: number[]
          category: string
          created_at: string
          duration_minutes: number
          id: string
          name: string
          owner_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          byweekday: number[]
          category: string
          created_at?: string
          duration_minutes: number
          id?: string
          name: string
          owner_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          byweekday?: number[]
          category?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          owner_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_block_template_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      task_project: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          status: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_project_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
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
      traffic_cache: {
        Row: {
          created_at: string
          fetched_at: string
          id: string
          segments: Json
          state: string
          tile_key: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string
          id?: string
          segments: Json
          state: string
          tile_key: string
        }
        Update: {
          created_at?: string
          fetched_at?: string
          id?: string
          segments?: Json
          state?: string
          tile_key?: string
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
          permissions: Json | null
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
          permissions?: Json | null
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
          permissions?: Json | null
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
      user_email_signature: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          signature_html: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          signature_html: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          signature_html?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_email_signature_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
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
      budget_vs_actual_monthly: {
        Row: {
          account_id: string | null
          account_name: string | null
          account_type: string | null
          apr: number | null
          aug: number | null
          budget_annual: number | null
          budget_current_month: number | null
          budget_year: number | null
          dec: number | null
          feb: number | null
          fully_qualified_name: string | null
          jan: number | null
          jul: number | null
          jun: number | null
          mar: number | null
          may: number | null
          mtd_actual: number | null
          mtd_pct_used: number | null
          nov: number | null
          oct: number | null
          qb_account_id: string | null
          sep: number | null
          ytd_actual: number | null
        }
        Relationships: []
      }
      client_velocity_stats: {
        Row: {
          client_id: string | null
          client_name: string | null
          lease_psa_avg_days: number | null
          lease_psa_deal_count: number | null
          lease_psa_max_days: number | null
          lease_psa_min_days: number | null
          loi_avg_days: number | null
          loi_deal_count: number | null
          loi_max_days: number | null
          loi_min_days: number | null
          velocity_lease_psa_days_override: number | null
          velocity_loi_days_override: number | null
        }
        Relationships: []
      }
      deal_current_stage_info: {
        Row: {
          client_id: string | null
          days_in_stage: number | null
          deal_id: string | null
          deal_name: string | null
          deal_owner_id: string | null
          entered_current_stage_at: string | null
          is_stale: boolean | null
          stage_id: string | null
          stage_label: string | null
        }
        Relationships: [
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
      deal_forecasting_summary: {
        Row: {
          client_id: string | null
          client_name: string | null
          closing_deadline_days: number | null
          contingency_period_days: number | null
          contract_signed_date: string | null
          days_in_current_stage: number | null
          deal_id: string | null
          deal_name: string | null
          deal_type: string | null
          due_diligence_days: number | null
          estimated_execution_date: string | null
          fee: number | null
          is_behind_schedule: boolean | null
          loi_date: string | null
          loi_signed_date: string | null
          number_of_payments: number | null
          owner_id: string | null
          rent_commencement_days: number | null
          stage_id: string | null
          stage_label: string | null
          weeks_behind: number | null
        }
        Relationships: [
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
      document_handoff_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          created_at: string | null
          days_held: number | null
          deal_id: string | null
          document_type: string | null
          holder: string | null
          id: string | null
          total_turns: number | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          days_held?: never
          deal_id?: string | null
          document_type?: string | null
          holder?: string | null
          id?: string | null
          total_turns?: never
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          created_at?: string | null
          days_held?: never
          deal_id?: string | null
          document_type?: string | null
          holder?: string | null
          id?: string | null
          total_turns?: never
        }
        Relationships: [
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_with_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_handoff_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
      portal_user_analytics: {
        Row: {
          clients: Json | null
          contact_id: string | null
          email: string | null
          first_name: string | null
          last_activity_at: string | null
          last_name: string | null
          portal_access_enabled: boolean | null
          portal_auth_user_id: string | null
          portal_invite_expires_at: string | null
          portal_invite_sent_at: string | null
          portal_invite_status: string | null
          portal_last_login_at: string | null
          portal_status: string | null
          total_logins: number | null
          total_page_views: number | null
        }
        Relationships: []
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "deal_current_stage_info"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "contact_deal_role_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_forecasting_summary"
            referencedColumns: ["deal_id"]
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
      v_contact_tags: {
        Row: {
          contact_company: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string | null
          created_by_id: string | null
          id: string | null
          notes: string | null
          tag_color: string | null
          tag_description: string | null
          tag_id: string | null
          tag_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_hunter_reconnect"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_tag_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_site_selectors_by_client"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "contact_tag_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "contact_tag_type"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dismissed_targets: {
        Row: {
          concept_name: string | null
          dismiss_note: string | null
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          dismissed_by_email: string | null
          first_seen_at: string | null
          id: string | null
          industry_segment: string | null
          last_signal_at: string | null
          linked_contacts_count: number | null
          signal_count: number | null
          signal_strength: string | null
          source: string | null
          target_geography: string[] | null
          website: string | null
        }
        Relationships: []
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
          last_contacted_at: string | null
          last_signal_at: string | null
          latest_signal_summary: string | null
          latest_signal_title: string | null
          latest_signal_url: string | null
          linked_contacts_count: number | null
          news_only: boolean | null
          pending_outreach: number | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          signal_count: number | null
          signal_strength: string | null
          source: string | null
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
          outreach_type: string | null
          signal_strength: string | null
          signal_summary: string | null
          source_url: string | null
          status: string | null
          subject: string | null
          target_id: string | null
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
          signal_strength: string | null
          source_title: string | null
          source_url: string | null
          target_id: string | null
        }
        Relationships: []
      }
      v_prospecting_daily_metrics: {
        Row: {
          activity_date: string | null
          calls: number | null
          contacts_touched: number | null
          email_responses: number | null
          emails: number | null
          linkedin: number | null
          linkedin_responses: number | null
          meetings: number | null
          return_calls: number | null
          sms: number | null
          sms_responses: number | null
          total_connections: number | null
          total_outreach: number | null
          user_id: string | null
          voicemail: number | null
        }
        Relationships: []
      }
      v_prospecting_stale_targets: {
        Row: {
          concept_name: string | null
          created_at: string | null
          days_since_contact: number | null
          effective_last_contact: string | null
          existing_client_id: string | null
          existing_contact_id: string | null
          first_seen_at: string | null
          geo_relevance: string | null
          id: string | null
          industry_segment: string | null
          key_person_name: string | null
          key_person_title: string | null
          last_contacted_at: string | null
          last_signal_at: string | null
          news_only: boolean | null
          normalized_name: string | null
          score_reasoning: string | null
          signal_strength: string | null
          source: string | null
          status: string | null
          target_geography: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          concept_name?: string | null
          created_at?: string | null
          days_since_contact?: never
          effective_last_contact?: never
          existing_client_id?: string | null
          existing_contact_id?: string | null
          first_seen_at?: string | null
          geo_relevance?: string | null
          id?: string | null
          industry_segment?: string | null
          key_person_name?: string | null
          key_person_title?: string | null
          last_contacted_at?: string | null
          last_signal_at?: string | null
          news_only?: boolean | null
          normalized_name?: string | null
          score_reasoning?: string | null
          signal_strength?: string | null
          source?: string | null
          status?: string | null
          target_geography?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          concept_name?: string | null
          created_at?: string | null
          days_since_contact?: never
          effective_last_contact?: never
          existing_client_id?: string | null
          existing_contact_id?: string | null
          first_seen_at?: string | null
          geo_relevance?: string | null
          id?: string | null
          industry_segment?: string | null
          key_person_name?: string | null
          key_person_title?: string | null
          last_contacted_at?: string | null
          last_signal_at?: string | null
          news_only?: boolean | null
          normalized_name?: string | null
          score_reasoning?: string | null
          signal_strength?: string | null
          source?: string | null
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
            referencedRelation: "client_velocity_stats"
            referencedColumns: ["client_id"]
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
            referencedRelation: "portal_user_analytics"
            referencedColumns: ["contact_id"]
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
      v_prospecting_today_time: {
        Row: {
          created_at: string | null
          daily_time_goal_minutes: number | null
          entry_date: string | null
          id: string | null
          minutes: number | null
          notes: string | null
          percent_of_goal: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_prospecting_weekly_metrics: {
        Row: {
          calls_completed: number | null
          emails_sent: number | null
          funnel_active: number | null
          funnel_converted: number | null
          funnel_engaged: number | null
          funnel_meeting_scheduled: number | null
          funnel_new: number | null
          funnel_nurture: number | null
          funnel_researching: number | null
          linkedin_messages: number | null
          meetings_held: number | null
          sms_sent: number | null
          time_minutes: number | null
          total_touches: number | null
          voicemails_left: number | null
          week_end: string | null
          week_start: string | null
        }
        Relationships: []
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
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_portal_invite: {
        Args: { p_auth_user_id: string; p_contact_id: string }
        Returns: Json
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_update_user: {
        Args: {
          p_active?: boolean
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_mobile_phone?: string
          p_name?: string
          p_ovis_role?: string
          p_permissions?: Json
          p_user_id: string
        }
        Returns: Json
      }
      calculate_deal_payment_dates: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
      calculate_payment_estimates: {
        Args: { p_deal_id: string }
        Returns: {
          calculation_notes: string
          estimated_date: string
          payment_id: string
          payment_sequence: number
        }[]
      }
      calculate_prospecting_streak: {
        Args: { p_user_id: string }
        Returns: number
      }
      can_manage_operations: { Args: never; Returns: boolean }
      can_manage_portal: { Args: never; Returns: boolean }
      cleanup_orphaned_auth_identity: {
        Args: { p_email: string }
        Returns: Json
      }
      correct_stage_transition_date: {
        Args: {
          p_corrected_date: string
          p_deal_id: string
          p_stage_label: string
        }
        Returns: undefined
      }
      create_payment_splits_for_payment: {
        Args: { p_payment_id: string; p_user_id?: string }
        Returns: undefined
      }
      create_timeline_critical_dates: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
      debug_payment_estimates: {
        Args: { p_deal_id?: string }
        Returns: {
          check_name: string
          result: string
          status: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      generate_payments_for_deal: {
        Args: { deal_uuid: string }
        Returns: string
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_current_user_role: { Args: never; Returns: string }
      get_dropbox_folder_path: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      get_effective_velocity: {
        Args: { p_client_id: string; p_stage_label: string }
        Returns: number
      }
      get_portal_file_visibility_overrides: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: {
          changed_by_id: string
          dropbox_path: string
          is_visible: boolean
          updated_at: string
        }[]
      }
      get_portal_user_clients: {
        Args: { p_user_id: string }
        Returns: {
          client_id: string
          client_name: string
        }[]
      }
      get_streetlight_segments_in_bbox: {
        Args: {
          p_east: number
          p_north: number
          p_south: number
          p_west: number
        }
        Returns: {
          geom_geojson: Json
          id: number
          road_name: string
          road_type: string
        }[]
      }
      get_user_ovis_role: { Args: never; Returns: string }
      get_user_role:
        | { Args: never; Returns: string }
        | { Args: { user_id: string }; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      has_full_access: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_assistant: { Args: never; Returns: boolean }
      is_broker: { Args: never; Returns: boolean }
      is_client_visible_stage: {
        Args: { p_stage_name: string }
        Returns: boolean
      }
      is_file_visible_in_portal: {
        Args: {
          p_dropbox_path: string
          p_entity_id: string
          p_entity_type: string
        }
        Returns: boolean
      }
      is_internal_user: { Args: never; Returns: boolean }
      is_portal_user: { Args: never; Returns: boolean }
      is_portal_visible_stage: {
        Args: { p_stage_id: string }
        Returns: boolean
      }
      lock_payment: { Args: { payment_uuid: string }; Returns: undefined }
      log_portal_activity: {
        Args: {
          p_client_id?: string
          p_contact_id?: string
          p_event_data?: Json
          p_event_type: string
          p_page_path?: string
          p_session_id?: string
        }
        Returns: string
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      merchants_can_edit_favorite: {
        Args: { fav_id: string }
        Returns: boolean
      }
      merchants_can_view_favorite: {
        Args: { fav_id: string }
        Returns: boolean
      }
      merchants_current_user_id: { Args: never; Returns: string }
      merchants_is_admin: { Args: never; Returns: boolean }
      merchants_is_favorite_owner: {
        Args: { fav_id: string }
        Returns: boolean
      }
      override_payment_amount: {
        Args: { p_new_amount: number; p_payment_id: string }
        Returns: {
          result_agci: number
          result_payment_amount: number
          result_payment_id: string
          result_referral_fee_usd: number
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      portal_user_can_access_site_submit: {
        Args: { p_auth_user_id: string; p_site_submit_id: string }
        Returns: boolean
      }
      portal_user_client_ids: { Args: never; Returns: string[] }
      portal_user_contact_id: { Args: never; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      recalculate_payment_dates_for_deal: {
        Args: { p_deal_id: string }
        Returns: undefined
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
      reset_portal_file_visibility: {
        Args: {
          p_dropbox_path: string
          p_entity_id: string
          p_entity_type: string
        }
        Returns: boolean
      }
      resolve_actor_kind: { Args: { p_auth_user_id: string }; Returns: string }
      set_portal_file_visibility: {
        Args: {
          p_dropbox_path: string
          p_entity_id: string
          p_entity_type: string
          p_is_visible: boolean
          p_site_submit_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      streetlight_record_spend: {
        Args: {
          p_metrics: Database["public"]["Tables"]["streetlight_segment_metrics"]["Row"][]
          p_segments: Database["public"]["Tables"]["streetlight_usage_log_segment"]["Row"][]
          p_usage_log: Database["public"]["Tables"]["streetlight_usage_log"]["Row"]
        }
        Returns: string
      }
      sync_deal_field_to_critical_date: {
        Args: { p_deal_id: string; p_field_name: string; p_new_value: string }
        Returns: undefined
      }
      task_current_user_id: { Args: never; Returns: string }
      unlock_payment: { Args: { payment_uuid: string }; Returns: undefined }
      unlockrows: { Args: { "": string }; Returns: number }
      update_all_payment_estimates: { Args: never; Returns: undefined }
      update_behind_schedule_status: { Args: never; Returns: undefined }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      user_has_portal_client_access: {
        Args: { p_client_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_starbucks_access: { Args: never; Returns: boolean }
      validate_portal_invite_token: { Args: { p_token: string }; Returns: Json }
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
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
