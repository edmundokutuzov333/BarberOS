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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          barber_id: string
          barbershop_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deposit_cents: number
          deposit_status: Database["public"]["Enums"]["deposit_state"]
          duration_min: number
          ends_at: string
          haircut_id: string | null
          hold_expires_at: string | null
          id: string
          internal_note: string | null
          manage_token: string
          no_show_at: string | null
          price_cents: number
          service_id: string
          source: Database["public"]["Enums"]["booking_source"]
          started_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          barber_id: string
          barbershop_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deposit_cents?: number
          deposit_status?: Database["public"]["Enums"]["deposit_state"]
          duration_min: number
          ends_at: string
          haircut_id?: string | null
          hold_expires_at?: string | null
          id?: string
          internal_note?: string | null
          manage_token?: string
          no_show_at?: string | null
          price_cents: number
          service_id: string
          source?: Database["public"]["Enums"]["booking_source"]
          started_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          barber_id?: string
          barbershop_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deposit_cents?: number
          deposit_status?: Database["public"]["Enums"]["deposit_state"]
          duration_min?: number
          ends_at?: string
          haircut_id?: string | null
          hold_expires_at?: string | null
          id?: string
          internal_note?: string | null
          manage_token?: string
          no_show_at?: string | null
          price_cents?: number
          service_id?: string
          source?: Database["public"]["Enums"]["booking_source"]
          started_at?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_haircut_id_fkey"
            columns: ["haircut_id"]
            isOneToOne: false
            referencedRelation: "haircuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          barbershop_id: string | null
          created_at: string
          diff: Json | null
          entity: string | null
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          barbershop_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          barbershop_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      barber_services: {
        Row: {
          barber_id: string
          service_id: string
        }
        Insert: {
          barber_id: string
          service_id: string
        }
        Update: {
          barber_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_services_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      barbers: {
        Row: {
          barbershop_id: string
          bio: string | null
          display_name: string
          id: string
          is_active: boolean
          photo_url: string | null
          rating_avg: number
          rating_count: number
          sort_order: number
          user_id: string | null
          years_experience: number
        }
        Insert: {
          barbershop_id: string
          bio?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          photo_url?: string | null
          rating_avg?: number
          rating_count?: number
          sort_order?: number
          user_id?: string | null
          years_experience?: number
        }
        Update: {
          barbershop_id?: string
          bio?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          photo_url?: string | null
          rating_avg?: number
          rating_count?: number
          sort_order?: number
          user_id?: string | null
          years_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "barbers_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      barbershop_members: {
        Row: {
          barbershop_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbershop_members_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      barbershops: {
        Row: {
          address: string | null
          cancellation_rule: Database["public"]["Enums"]["cancellation_rule"]
          cover_url: string | null
          created_at: string
          deposit_enabled: boolean
          deposit_hold_min: number
          deposit_mode: Database["public"]["Enums"]["deposit_mode"]
          deposit_value: number
          description: string | null
          id: string
          instagram: string | null
          lat: number | null
          lng: number | null
          logo_url: string | null
          maps_url: string | null
          max_advance_days: number
          min_lead_time_min: number
          name: string
          onboarding_step: number
          phone: string | null
          plan_id: string | null
          slot_interval_min: number
          slug: string
          status: Database["public"]["Enums"]["shop_status"]
          theme_key: string
          timezone: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          cancellation_rule?: Database["public"]["Enums"]["cancellation_rule"]
          cover_url?: string | null
          created_at?: string
          deposit_enabled?: boolean
          deposit_hold_min?: number
          deposit_mode?: Database["public"]["Enums"]["deposit_mode"]
          deposit_value?: number
          description?: string | null
          id?: string
          instagram?: string | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          maps_url?: string | null
          max_advance_days?: number
          min_lead_time_min?: number
          name: string
          onboarding_step?: number
          phone?: string | null
          plan_id?: string | null
          slot_interval_min?: number
          slug: string
          status?: Database["public"]["Enums"]["shop_status"]
          theme_key?: string
          timezone?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          cancellation_rule?: Database["public"]["Enums"]["cancellation_rule"]
          cover_url?: string | null
          created_at?: string
          deposit_enabled?: boolean
          deposit_hold_min?: number
          deposit_mode?: Database["public"]["Enums"]["deposit_mode"]
          deposit_value?: number
          description?: string | null
          id?: string
          instagram?: string | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          maps_url?: string | null
          max_advance_days?: number
          min_lead_time_min?: number
          name?: string
          onboarding_step?: number
          phone?: string | null
          plan_id?: string | null
          slot_interval_min?: number
          slug?: string
          status?: Database["public"]["Enums"]["shop_status"]
          theme_key?: string
          timezone?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbershops_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          barbershop_id: string
          created_at: string
          email: string | null
          id: string
          last_visit_at: string | null
          name: string
          no_show_count: number
          notes: string | null
          phone: string
          preferences: Json
          visits_count: number
        }
        Insert: {
          barbershop_id: string
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name: string
          no_show_count?: number
          notes?: string | null
          phone: string
          preferences?: Json
          visits_count?: number
        }
        Update: {
          barbershop_id?: string
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name?: string
          no_show_count?: number
          notes?: string | null
          phone?: string
          preferences?: Json
          visits_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      haircuts: {
        Row: {
          barbershop_id: string
          description: string | null
          duration_min: number | null
          id: string
          is_active: boolean
          name: string
          photo_url: string | null
          price_cents: number | null
          service_id: string | null
          sort_order: number
        }
        Insert: {
          barbershop_id: string
          description?: string | null
          duration_min?: number | null
          id?: string
          is_active?: boolean
          name: string
          photo_url?: string | null
          price_cents?: number | null
          service_id?: string | null
          sort_order?: number
        }
        Update: {
          barbershop_id?: string
          description?: string | null
          duration_min?: number | null
          id?: string
          is_active?: boolean
          name?: string
          photo_url?: string | null
          price_cents?: number | null
          service_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "haircuts_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haircuts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string | null
          attempts: number
          barbershop_id: string
          channel: Database["public"]["Enums"]["notif_channel"]
          error: string | null
          fallback_url: string | null
          id: string
          last_attempt_at: string | null
          next_attempt_at: string | null
          payload: Json
          provider_message_id: string | null
          recipient: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notif_status"]
          template_key: string
          waitlist_entry_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          attempts?: number
          barbershop_id: string
          channel: Database["public"]["Enums"]["notif_channel"]
          error?: string | null
          fallback_url?: string | null
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notif_status"]
          template_key: string
          waitlist_entry_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          attempts?: number
          barbershop_id?: string
          channel?: Database["public"]["Enums"]["notif_channel"]
          error?: string | null
          fallback_url?: string | null
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notif_status"]
          template_key?: string
          waitlist_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          account_reference: string | null
          barbershop_id: string
          created_at: string
          credential_secret_id: string | null
          enabled: boolean
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          public_config: Json
          updated_at: string
          webhook_secret_id: string | null
        }
        Insert: {
          account_reference?: string | null
          barbershop_id: string
          created_at?: string
          credential_secret_id?: string | null
          enabled?: boolean
          id?: string
          provider: Database["public"]["Enums"]["payment_provider"]
          public_config?: Json
          updated_at?: string
          webhook_secret_id?: string | null
        }
        Update: {
          account_reference?: string | null
          barbershop_id?: string
          created_at?: string
          credential_secret_id?: string | null
          enabled?: boolean
          id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          public_config?: Json
          updated_at?: string
          webhook_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          barbershop_id: string
          created_at: string
          failed_at: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          last_reconciled_at: string | null
          msisdn: string | null
          paid_at: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_account_id: string | null
          provider_ref: string | null
          provider_transaction_id: string | null
          raw: Json | null
          requires_refund: boolean
          status: Database["public"]["Enums"]["payment_state"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          barbershop_id: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          last_reconciled_at?: string | null
          msisdn?: string | null
          paid_at?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_account_id?: string | null
          provider_ref?: string | null
          provider_transaction_id?: string | null
          raw?: Json | null
          requires_refund?: boolean
          status?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          barbershop_id?: string
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          last_reconciled_at?: string | null
          msisdn?: string | null
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_account_id?: string | null
          provider_ref?: string | null
          provider_transaction_id?: string | null
          raw?: Json | null
          requires_refund?: boolean
          status?: Database["public"]["Enums"]["payment_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          features: Json
          id: string
          is_active: boolean
          max_barbers: number
          name: string
          price_cents: number
        }
        Insert: {
          code: string
          features?: Json
          id?: string
          is_active?: boolean
          max_barbers?: number
          name: string
          price_cents?: number
        }
        Update: {
          code?: string
          features?: Json
          id?: string
          is_active?: boolean
          max_barbers?: number
          name?: string
          price_cents?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          phone?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          appointment_id: string
          barber_id: string | null
          barbershop_id: string
          comment: string | null
          created_at: string
          id: string
          is_published: boolean
          rating: number
        }
        Insert: {
          appointment_id: string
          barber_id?: string | null
          barbershop_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          rating: number
        }
        Update: {
          appointment_id?: string
          barber_id?: string | null
          barbershop_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_overrides: {
        Row: {
          barber_id: string | null
          barbershop_id: string
          closes_at: string | null
          created_at: string
          id: string
          is_closed: boolean
          note: string | null
          opens_at: string | null
          override_date: string
          reason: Database["public"]["Enums"]["block_reason"]
        }
        Insert: {
          barber_id?: string | null
          barbershop_id: string
          closes_at?: string | null
          created_at?: string
          id?: string
          is_closed?: boolean
          note?: string | null
          opens_at?: string | null
          override_date: string
          reason?: Database["public"]["Enums"]["block_reason"]
        }
        Update: {
          barber_id?: string | null
          barbershop_id?: string
          closes_at?: string | null
          created_at?: string
          id?: string
          is_closed?: boolean
          note?: string | null
          opens_at?: string | null
          override_date?: string
          reason?: Database["public"]["Enums"]["block_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "schedule_overrides_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_overrides_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          barbershop_id: string
          duration_min: number
          id: string
          is_active: boolean
          name: string
          price_cents: number
          requires_deposit: boolean
          sort_order: number
        }
        Insert: {
          barbershop_id: string
          duration_min: number
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          requires_deposit?: boolean
          sort_order?: number
        }
        Update: {
          barbershop_id?: string
          duration_min?: number
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          requires_deposit?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          barbershop_id: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          barbershop_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          barbershop_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          barber_id: string | null
          barbershop_id: string
          ends_at: string
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["block_reason"]
          starts_at: string
        }
        Insert: {
          barber_id?: string | null
          barbershop_id: string
          ends_at: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["block_reason"]
          starts_at: string
        }
        Update: {
          barber_id?: string | null
          barbershop_id?: string
          ends_at?: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["block_reason"]
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          barber_id: string | null
          barbershop_id: string
          created_at: string
          customer_name: string
          date_from: string | null
          date_to: string | null
          email: string | null
          haircut_id: string | null
          id: string
          offer_barber_id: string | null
          offer_expires_at: string | null
          offer_slot_start: string | null
          offer_token: string | null
          period: string
          phone: string
          service_id: string
          status: Database["public"]["Enums"]["waitlist_status"]
        }
        Insert: {
          barber_id?: string | null
          barbershop_id: string
          created_at?: string
          customer_name: string
          date_from?: string | null
          date_to?: string | null
          email?: string | null
          haircut_id?: string | null
          id?: string
          offer_barber_id?: string | null
          offer_expires_at?: string | null
          offer_slot_start?: string | null
          offer_token?: string | null
          period?: string
          phone: string
          service_id: string
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Update: {
          barber_id?: string | null
          barbershop_id?: string
          created_at?: string
          customer_name?: string
          date_from?: string | null
          date_to?: string | null
          email?: string | null
          haircut_id?: string | null
          id?: string
          offer_barber_id?: string | null
          offer_expires_at?: string | null
          offer_slot_start?: string | null
          offer_token?: string | null
          period?: string
          phone?: string
          service_id?: string
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_haircut_id_fkey"
            columns: ["haircut_id"]
            isOneToOne: false
            referencedRelation: "haircuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          barber_id: string | null
          barbershop_id: string
          closes_at: string
          id: string
          is_closed: boolean
          opens_at: string
          weekday: number
        }
        Insert: {
          barber_id?: string | null
          barbershop_id: string
          closes_at: string
          id?: string
          is_closed?: boolean
          opens_at: string
          weekday: number
        }
        Update: {
          barber_id?: string | null
          barbershop_id?: string
          closes_at?: string
          id?: string
          is_closed?: boolean
          opens_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_hours_barbershop_id_fkey"
            columns: ["barbershop_id"]
            isOneToOne: false
            referencedRelation: "barbershops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_member_by_email: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_shop: string
        }
        Returns: string
      }
      admin_assign_barbershop_plan: {
        Args: { p_plan: string; p_shop: string }
        Returns: {
          plan_code: string
          plan_id: string
          plan_name: string
          shop_id: string
        }[]
      }
      admin_create_support_ticket: {
        Args: {
          p_description: string
          p_priority?: Database["public"]["Enums"]["support_ticket_priority"]
          p_shop: string
          p_subject: string
        }
        Returns: {
          created_at: string
          id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
        }[]
      }
      admin_get_activity: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_id: string
          barbershop_id: string
          created_at: string
          diff: Json
          entity: string
          entity_id: string
          id: string
          shop_name: string
        }[]
      }
      admin_get_barbershop: { Args: { p_shop: string }; Returns: Json }
      admin_get_metrics: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_get_overview: { Args: never; Returns: Json }
      admin_list_barbershops: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: Database["public"]["Enums"]["shop_status"]
        }
        Returns: {
          appointment_count: number
          barber_count: number
          created_at: string
          customer_count: number
          id: string
          member_count: number
          name: string
          plan_code: string
          plan_id: string
          plan_name: string
          plan_price_cents: number
          slug: string
          status: Database["public"]["Enums"]["shop_status"]
          total_count: number
        }[]
      }
      admin_list_payments: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_provider?: Database["public"]["Enums"]["payment_provider"]
          p_search?: string
          p_status?: Database["public"]["Enums"]["payment_state"]
        }
        Returns: {
          amount_cents: number
          appointment_id: string
          created_at: string
          failed_at: string
          id: string
          paid_at: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string
          provider_transaction_id: string
          requires_refund: boolean
          shop_id: string
          shop_name: string
          status: Database["public"]["Enums"]["payment_state"]
          total_count: number
        }[]
      }
      admin_list_plans: {
        Args: never
        Returns: {
          assigned_shops: number
          code: string
          features: Json
          id: string
          is_active: boolean
          max_barbers: number
          name: string
          price_cents: number
        }[]
      }
      admin_list_support_tickets: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_priority?: Database["public"]["Enums"]["support_ticket_priority"]
          p_search?: string
          p_status?: Database["public"]["Enums"]["support_ticket_status"]
        }
        Returns: {
          assigned_to: string
          assigned_to_name: string
          barbershop_id: string
          created_at: string
          created_by: string
          created_by_name: string
          description: string
          id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at: string
          shop_name: string
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          total_count: number
          updated_at: string
        }[]
      }
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_confirmed: boolean
          is_platform_admin: boolean
          last_sign_in_at: string
          phone: string
          shop_count: number
          shop_roles: Json
          total_count: number
        }[]
      }
      admin_set_barbershop_status: {
        Args: {
          p_shop: string
          p_status: Database["public"]["Enums"]["shop_status"]
        }
        Returns: {
          id: string
          status: Database["public"]["Enums"]["shop_status"]
        }[]
      }
      admin_update_plan: {
        Args: {
          p_features: Json
          p_is_active: boolean
          p_max_barbers: number
          p_name: string
          p_plan: string
          p_price_cents: number
        }
        Returns: {
          code: string
          features: Json
          id: string
          is_active: boolean
          max_barbers: number
          name: string
          price_cents: number
        }[]
      }
      admin_update_support_ticket: {
        Args: {
          p_assigned_to?: string
          p_clear_assignee?: boolean
          p_priority?: Database["public"]["Enums"]["support_ticket_priority"]
          p_status?: Database["public"]["Enums"]["support_ticket_status"]
          p_ticket: string
        }
        Returns: {
          assigned_to: string
          id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          status: Database["public"]["Enums"]["support_ticket_status"]
          updated_at: string
        }[]
      }
      book_appointment: {
        Args: {
          p_barber_id: string
          p_email?: string
          p_haircut_id: string
          p_name: string
          p_phone: string
          p_service_id: string
          p_slug: string
          p_start: string
        }
        Returns: {
          appointment_id: string
          deposit_cents: number
          manage_token: string
          needs_payment: boolean
        }[]
      }
      book_appointment_manual: {
        Args: {
          p_barber_id: string
          p_email?: string
          p_haircut_id: string
          p_internal_note?: string
          p_name: string
          p_phone: string
          p_service_id: string
          p_shop: string
          p_start: string
        }
        Returns: {
          appointment_id: string
          barber_id: string
          deposit_cents: number
          ends_at: string
          manage_token: string
          needs_payment: boolean
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      cancel_appointment_by_token: {
        Args: { p_reason?: string; p_token: string }
        Returns: {
          cancelled_at: string
        }[]
      }
      cancel_waitlist: {
        Args: { p_entry: string; p_shop: string }
        Returns: {
          status: Database["public"]["Enums"]["waitlist_status"]
          waitlist_entry_id: string
        }[]
      }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
          appointment_id: string
          attempts: number
          barber_name: string
          barbershop_id: string
          channel: Database["public"]["Enums"]["notif_channel"]
          customer_email: string
          customer_name: string
          customer_phone: string
          duration_min: number
          ends_at: string
          haircut_name: string
          id: string
          manage_token: string
          offer_expires_at: string
          offer_token: string
          payload: Json
          price_cents: number
          recipient: string
          scheduled_for: string
          service_name: string
          shop_name: string
          shop_phone: string
          shop_slug: string
          shop_whatsapp: string
          starts_at: string
          template_key: string
          timezone: string
          waitlist_entry_id: string
        }[]
      }
      claim_payment_reconciliation: {
        Args: { p_min_interval?: string; p_payment: string }
        Returns: boolean
      }
      claim_waitlist_offer: {
        Args: { p_token: string }
        Returns: {
          appointment_id: string
          barber_id: string
          deposit_cents: number
          ends_at: string
          manage_token: string
          needs_payment: boolean
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          waitlist_entry_id: string
        }[]
      }
      create_barbershop: {
        Args: {
          p_name: string
          p_phone?: string
          p_slug: string
          p_whatsapp?: string
        }
        Returns: string
      }
      delete_schedule_override: {
        Args: { p_id: string; p_shop: string }
        Returns: boolean
      }
      enqueue_appointment_notifications: {
        Args: { p_appt: string }
        Returns: undefined
      }
      expire_waitlist_offer: {
        Args: { p_token: string }
        Returns: {
          next_offer_token: string
          status: Database["public"]["Enums"]["waitlist_status"]
          waitlist_entry_id: string
        }[]
      }
      finalize_payment_event: {
        Args: {
          p_payment: string
          p_provider_message: string
          p_provider_status: string
          p_provider_transaction_id: string
          p_raw?: Json
          p_state: Database["public"]["Enums"]["payment_state"]
        }
        Returns: {
          appointment_status: Database["public"]["Enums"]["appointment_status"]
          late_success: boolean
          payment_id: string
          payment_status: Database["public"]["Enums"]["payment_state"]
          requires_refund: boolean
        }[]
      }
      find_payment_by_provider_ref: {
        Args: {
          p_account: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_provider_ref: string
        }
        Returns: {
          amount_cents: number
          appointment_id: string
          barbershop_id: string
          msisdn: string
          payment_id: string
          provider_ref: string
          status: Database["public"]["Enums"]["payment_state"]
        }[]
      }
      get_agenda_appointments: {
        Args: { p_from: string; p_shop: string; p_to: string }
        Returns: {
          appointment_id: string
          barber_id: string
          barber_name: string
          barber_photo_url: string
          customer_email: string
          customer_name: string
          customer_phone: string
          deposit_cents: number
          deposit_status: Database["public"]["Enums"]["deposit_state"]
          duration_min: number
          ends_at: string
          haircut_id: string
          haircut_name: string
          hold_expires_at: string
          manage_token: string
          price_cents: number
          service_id: string
          service_name: string
          source: Database["public"]["Enums"]["booking_source"]
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      get_agenda_schedule: {
        Args: { p_from: string; p_shop: string; p_to: string }
        Returns: {
          barber_id: string
          barber_name: string
          closes_at: string
          is_closed: boolean
          opens_at: string
          schedule_date: string
        }[]
      }
      get_appointment_by_token: {
        Args: { p_token: string }
        Returns: {
          action_deadline: string
          appointment_ends_at: string
          appointment_starts_at: string
          appointment_status: Database["public"]["Enums"]["appointment_status"]
          barber_name: string
          barber_photo_url: string
          can_cancel: boolean
          can_reschedule: boolean
          cancellation_rule: Database["public"]["Enums"]["cancellation_rule"]
          customer_name: string
          deposit_cents: number
          deposit_status: Database["public"]["Enums"]["deposit_state"]
          haircut_name: string
          hold_expires_at: string
          latest_payment_failure_code: string
          latest_payment_failure_reason: string
          latest_payment_requires_refund: boolean
          latest_payment_status: Database["public"]["Enums"]["payment_state"]
          payment_methods: Database["public"]["Enums"]["payment_provider"][]
          service_duration_min: number
          service_name: string
          service_price_cents: number
          shop_address: string
          shop_maps_url: string
          shop_name: string
          shop_phone: string
          shop_slug: string
          shop_whatsapp: string
          timezone: string
        }[]
      }
      get_available_days: {
        Args: {
          p_barber_id?: string
          p_from?: string
          p_service_id: string
          p_slug: string
          p_to?: string
        }
        Returns: {
          day: string
          is_open: boolean
          slots_count: number
        }[]
      }
      get_available_slots: {
        Args: {
          p_barber_id?: string
          p_date?: string
          p_service_id: string
          p_slug: string
        }
        Returns: {
          barber_ids: string[]
          slot_start: string
        }[]
      }
      get_customer: {
        Args: { p_customer: string; p_shop: string }
        Returns: {
          cancelled_appointments: number
          completed_appointments: number
          customer_id: string
          email: string
          last_barber_name: string
          last_haircut_name: string
          last_service_name: string
          last_visit_at: string
          name: string
          next_appointment_at: string
          next_appointment_status: Database["public"]["Enums"]["appointment_status"]
          no_show_count: number
          notes: string
          phone: string
          preferences: Json
          total_appointments: number
          total_spend_cents: number
          visits_count: number
        }[]
      }
      get_customer_appointments: {
        Args: {
          p_customer: string
          p_limit?: number
          p_offset?: number
          p_shop: string
        }
        Returns: {
          appointment_id: string
          barber_name: string
          deposit_cents: number
          deposit_status: Database["public"]["Enums"]["deposit_state"]
          ends_at: string
          haircut_name: string
          price_cents: number
          service_name: string
          source: Database["public"]["Enums"]["booking_source"]
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          total_count: number
        }[]
      }
      get_customer_metrics: {
        Args: { p_shop: string }
        Returns: {
          customers_visited_last_30d: number
          customers_with_no_shows: number
          customers_with_upcoming: number
          returning_customers: number
          total_customers: number
        }[]
      }
      get_customers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_shop: string
          p_view?: string
        }
        Returns: {
          customer_id: string
          email: string
          last_haircut_name: string
          last_service_name: string
          last_visit_at: string
          name: string
          next_appointment_at: string
          next_appointment_status: Database["public"]["Enums"]["appointment_status"]
          no_show_count: number
          notes: string
          phone: string
          preferences: Json
          total_count: number
          total_spend_cents: number
          visits_count: number
        }[]
      }
      get_dashboard_snapshot: { Args: { p_shop: string }; Returns: Json }
      get_notification_automation_status: {
        Args: { p_shop: string }
        Returns: {
          dispatcher_active: boolean
          dispatcher_last_run_at: string
          dispatcher_last_run_message: string
          dispatcher_last_run_status: string
        }[]
      }
      get_notification_metrics: {
        Args: { p_shop: string }
        Returns: {
          delivery_rate_7d: number
          failed_count: number
          processing_count: number
          queued_count: number
          sent_7d_count: number
          sent_today_count: number
        }[]
      }
      get_notifications: {
        Args: {
          p_channel?: string
          p_limit?: number
          p_offset?: number
          p_shop: string
          p_status?: string
        }
        Returns: {
          attempts: number
          channel: Database["public"]["Enums"]["notif_channel"]
          fallback_url: string
          last_error: string
          next_attempt_at: string
          notification_id: string
          recipient_masked: string
          scheduled_for: string
          sent_at: string
          status: Database["public"]["Enums"]["notif_status"]
          template_key: string
          total_count: number
        }[]
      }
      get_payment_accounts: {
        Args: { p_shop: string; p_supabase_url?: string }
        Returns: {
          account_reference: string
          configured: boolean
          enabled: boolean
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          public_config: Json
          updated_at: string
          webhook_url: string
        }[]
      }
      get_payment_metrics: {
        Args: { p_shop: string }
        Returns: {
          failed_count: number
          paid_amount_cents: number
          paid_count: number
          pending_amount_cents: number
          pending_count: number
          refund_count: number
          refund_required_count: number
        }[]
      }
      get_payment_runtime_config: {
        Args: { p_payment: string }
        Returns: {
          amount_cents: number
          appointment_id: string
          barbershop_id: string
          credentials: Json
          msisdn: string
          payment_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_account_id: string
          provider_ref: string
          public_config: Json
          requires_refund: boolean
          status: Database["public"]["Enums"]["payment_state"]
        }[]
      }
      get_payment_runtime_for_token: {
        Args: { p_token: string }
        Returns: {
          amount_cents: number
          appointment_id: string
          appointment_status: Database["public"]["Enums"]["appointment_status"]
          barbershop_id: string
          credentials: Json
          hold_expires_at: string
          msisdn: string
          payment_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_account_id: string
          provider_ref: string
          public_config: Json
          requires_refund: boolean
          status: Database["public"]["Enums"]["payment_state"]
        }[]
      }
      get_payment_status_by_token: {
        Args: { p_token: string }
        Returns: {
          hold_expires_at: string
          payment_amount_cents: number
          payment_failure_code: string
          payment_failure_reason: string
          payment_provider: Database["public"]["Enums"]["payment_provider"]
          payment_requires_refund: boolean
          payment_status: Database["public"]["Enums"]["payment_state"]
          payment_updated_at: string
        }[]
      }
      get_payment_webhook_context: {
        Args: { p_account: string; p_token: string }
        Returns: {
          barbershop_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          valid: boolean
        }[]
      }
      get_payments: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_shop: string
          p_status?: Database["public"]["Enums"]["payment_state"]
        }
        Returns: {
          amount_cents: number
          appointment_id: string
          created_at: string
          failure_code: string
          failure_reason: string
          id: string
          msisdn: string
          paid_at: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string
          provider_transaction_id: string
          requires_refund: boolean
          status: Database["public"]["Enums"]["payment_state"]
          updated_at: string
        }[]
      }
      get_public_barbershop: { Args: { p_slug: string }; Returns: Json }
      get_public_payment_methods: {
        Args: { p_slug: string }
        Returns: {
          payment_providers: Database["public"]["Enums"]["payment_provider"][]
        }[]
      }
      get_report_barbers: {
        Args: {
          p_barber_id?: string
          p_from: string
          p_shop: string
          p_to: string
        }
        Returns: {
          appointment_count: number
          barber_id: string
          barber_name: string
          booked_minutes: number
          cancelled_count: number
          capacity_minutes: number
          completed_count: number
          estimated_revenue_cents: number
          no_show_count: number
          occupancy_percent: number
          rating_avg: number
          rating_count: number
        }[]
      }
      get_report_daily: {
        Args: {
          p_barber_id?: string
          p_from: string
          p_shop: string
          p_to: string
        }
        Returns: {
          appointment_count: number
          booked_minutes: number
          cancelled_count: number
          capacity_minutes: number
          completed_count: number
          confirmed_count: number
          estimated_revenue_cents: number
          in_progress_count: number
          no_show_count: number
          occupancy_percent: number
          paid_deposit_cents: number
          pending_count: number
          report_date: string
        }[]
      }
      get_report_haircuts: {
        Args: {
          p_barber_id?: string
          p_from: string
          p_shop: string
          p_to: string
        }
        Returns: {
          appointment_count: number
          booked_minutes: number
          cancelled_count: number
          completed_count: number
          estimated_revenue_cents: number
          haircut_id: string
          haircut_name: string
          no_show_count: number
        }[]
      }
      get_report_services: {
        Args: {
          p_barber_id?: string
          p_from: string
          p_shop: string
          p_to: string
        }
        Returns: {
          appointment_count: number
          average_completed_ticket_cents: number
          booked_minutes: number
          cancelled_count: number
          completed_count: number
          estimated_revenue_cents: number
          no_show_count: number
          paid_deposit_cents: number
          service_id: string
          service_name: string
        }[]
      }
      get_report_summary: {
        Args: {
          p_barber_id?: string
          p_from: string
          p_shop: string
          p_to: string
        }
        Returns: {
          appointment_count: number
          average_completed_ticket_cents: number
          booked_minutes: number
          cancelled_count: number
          capacity_minutes: number
          completed_count: number
          confirmed_count: number
          estimated_revenue_cents: number
          from_date: string
          in_progress_count: number
          new_customers_count: number
          no_show_count: number
          occupancy_percent: number
          paid_deposit_cents: number
          pending_count: number
          refunded_deposit_cents: number
          to_date: string
        }[]
      }
      get_reschedule_slots_by_token: {
        Args: { p_date: string; p_token: string }
        Returns: {
          slot_start: string
        }[]
      }
      get_review_by_token: {
        Args: { p_token: string }
        Returns: {
          appointment_completed_at: string
          appointment_status: Database["public"]["Enums"]["appointment_status"]
          available_at: string
          barber_name: string
          barber_photo_url: string
          can_submit: boolean
          comment: string
          customer_name: string
          haircut_name: string
          has_review: boolean
          rating: number
          review_created_at: string
          review_is_published: boolean
          service_name: string
          shop_name: string
          shop_slug: string
          timezone: string
        }[]
      }
      get_reviews: {
        Args: {
          p_barber_id?: string
          p_limit?: number
          p_offset?: number
          p_published?: string
          p_rating?: number
          p_shop: string
        }
        Returns: {
          appointment_id: string
          appointment_starts_at: string
          barber_id: string
          barber_name: string
          comment: string
          created_at: string
          customer_name: string
          is_published: boolean
          rating: number
          review_id: string
          total_count: number
        }[]
      }
      get_waitlist: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_shop: string
          p_status?: string
        }
        Returns: {
          barber_name: string
          created_at: string
          customer_name: string
          date_from: string
          date_to: string
          email: string
          haircut_name: string
          offer_barber_name: string
          offer_expires_at: string
          offer_slot_start: string
          period: string
          phone: string
          queue_position: number
          service_name: string
          status: Database["public"]["Enums"]["waitlist_status"]
          total_count: number
          waitlist_entry_id: string
        }[]
      }
      get_waitlist_metrics: {
        Args: { p_shop: string }
        Returns: {
          converted_30d: number
          expiring_soon_count: number
          offered_count: number
          waiting_count: number
        }[]
      }
      get_waitlist_offer: {
        Args: { p_token: string }
        Returns: {
          barber_name: string
          can_claim: boolean
          customer_name: string
          haircut_name: string
          offer_expires_at: string
          service_duration_min: number
          service_name: string
          service_price_cents: number
          shop_name: string
          shop_phone: string
          shop_slug: string
          shop_whatsapp: string
          slot_start: string
          status: Database["public"]["Enums"]["waitlist_status"]
          timezone: string
        }[]
      }
      init_payment_from_token: {
        Args: {
          p_idempotency_key: string
          p_msisdn: string
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_token: string
        }
        Returns: {
          amount_cents: number
          hold_expires_at: string
          msisdn: string
          payment_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string
          reused: boolean
        }[]
      }
      is_member: {
        Args: {
          p_roles?: Database["public"]["Enums"]["app_role"][]
          p_shop: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      join_waitlist: {
        Args: {
          p_barber_id?: string
          p_customer_name: string
          p_date_from?: string
          p_date_to?: string
          p_email?: string
          p_haircut_id?: string
          p_period?: string
          p_phone: string
          p_service_id: string
          p_slug: string
        }
        Returns: {
          queued_at: string
          status: Database["public"]["Enums"]["waitlist_status"]
        }[]
      }
      list_members: {
        Args: { p_shop: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      list_payment_reconciliation_batch: {
        Args: { p_limit?: number }
        Returns: {
          barbershop_id: string
          payment_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_account_id: string
          provider_ref: string
        }[]
      }
      mark_notification_failure: {
        Args: {
          p_error: string
          p_fallback_url?: string
          p_id: string
          p_retryable?: boolean
        }
        Returns: {
          attempts: number
          retry_at: string
          status: Database["public"]["Enums"]["notif_status"]
        }[]
      }
      mark_notification_sent: {
        Args: { p_id: string; p_meta?: Json; p_provider_message_id?: string }
        Returns: Database["public"]["Enums"]["notif_status"]
      }
      mark_payment_provider_started: {
        Args: {
          p_payment: string
          p_provider_message: string
          p_provider_status: string
          p_provider_transaction_id: string
          p_raw?: Json
        }
        Returns: {
          payment_id: string
          provider_ref: string
          status: Database["public"]["Enums"]["payment_state"]
        }[]
      }
      my_barber_id: { Args: { p_shop: string }; Returns: string }
      offer_next_waitlist: {
        Args: { p_barber_id: string; p_shop: string; p_slot_start: string }
        Returns: {
          barber_id: string
          customer_name: string
          email: string
          haircut_id: string
          offer_expires_at: string
          offer_token: string
          phone: string
          service_id: string
          slot_start: string
          waitlist_entry_id: string
        }[]
      }
      recover_stuck_notifications: {
        Args: { p_after?: string }
        Returns: number
      }
      remove_barbershop_member: {
        Args: { p_member: string; p_shop: string }
        Returns: undefined
      }
      reorder_barbers: {
        Args: { p_ids: string[]; p_shop: string }
        Returns: undefined
      }
      reorder_haircuts: {
        Args: { p_ids: string[]; p_shop: string }
        Returns: undefined
      }
      reorder_services: {
        Args: { p_ids: string[]; p_shop: string }
        Returns: undefined
      }
      replace_working_hours: {
        Args: { p_barber_id?: string; p_rows: Json; p_shop: string }
        Returns: undefined
      }
      reschedule_appointment_by_operator: {
        Args: {
          p_appointment: string
          p_new_barber_id?: string
          p_new_start: string
          p_shop: string
        }
        Returns: {
          appointment_id: string
          new_ends_at: string
          new_starts_at: string
        }[]
      }
      reschedule_appointment_by_token: {
        Args: { p_new_start: string; p_token: string }
        Returns: {
          new_ends_at: string
          new_starts_at: string
        }[]
      }
      retry_notification: {
        Args: { p_notification: string; p_shop: string }
        Returns: {
          attempts: number
          notification_id: string
          status: Database["public"]["Enums"]["notif_status"]
        }[]
      }
      save_barber: {
        Args: {
          p_barber_id: string
          p_bio: string
          p_display_name: string
          p_photo_url: string
          p_service_ids: string[]
          p_shop: string
          p_user_id: string
          p_years_experience: number
        }
        Returns: string
      }
      save_schedule_override: {
        Args: {
          p_barber_id?: string
          p_closes_at?: string
          p_id?: string
          p_is_closed?: boolean
          p_note?: string
          p_opens_at?: string
          p_override_date: string
          p_reason?: Database["public"]["Enums"]["block_reason"]
          p_shop: string
        }
        Returns: string
      }
      scheduler_secret_valid: {
        Args: { p_candidate: string }
        Returns: boolean
      }
      seed_haircut_catalogue: { Args: { p_shop: string }; Returns: number }
      set_payment_provider_account: {
        Args: {
          p_account_reference: string
          p_actor: string
          p_credentials: Json
          p_enabled: boolean
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_public_config: Json
          p_shop: string
        }
        Returns: {
          configured: boolean
          enabled: boolean
          id: string
          provider: Database["public"]["Enums"]["payment_provider"]
        }[]
      }
      set_review_publication: {
        Args: { p_is_published: boolean; p_review: string; p_shop: string }
        Returns: {
          is_published: boolean
          rating_avg: number
          rating_count: number
          review_id: string
        }[]
      }
      shop_is_public: { Args: { p_shop: string }; Returns: boolean }
      submit_review_by_token: {
        Args: { p_comment?: string; p_rating: number; p_token: string }
        Returns: {
          comment: string
          created_at: string
          rating: number
          review_id: string
        }[]
      }
      transition_appointment: {
        Args: {
          p_action: string
          p_appointment: string
          p_reason?: string
          p_shop: string
        }
        Returns: {
          appointment_id: string
          cancelled_at: string
          completed_at: string
          confirmed_at: string
          no_show_at: string
          previous_status: Database["public"]["Enums"]["appointment_status"]
          started_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }[]
      }
      update_customer: {
        Args: {
          p_customer: string
          p_email?: string
          p_name: string
          p_notes?: string
          p_phone: string
          p_preferences?: Json
          p_shop: string
        }
        Returns: {
          customer_id: string
          email: string
          last_visit_at: string
          name: string
          no_show_count: number
          notes: string
          phone: string
          preferences: Json
          visits_count: number
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "barber"
      appointment_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      block_reason:
        | "lunch"
        | "day_off"
        | "holiday"
        | "meeting"
        | "maintenance"
        | "absence"
        | "other"
      booking_source: "online" | "manual" | "waitlist"
      cancellation_rule:
        | "flex_2h"
        | "moderate_6h"
        | "strict_24h"
        | "contact_only"
      deposit_mode: "percent" | "fixed"
      deposit_state:
        | "not_required"
        | "awaiting"
        | "paid"
        | "failed"
        | "refunded"
      notif_channel: "whatsapp" | "email"
      notif_status: "queued" | "sent" | "failed" | "skipped" | "processing"
      payment_provider: "mpesa" | "emola"
      payment_state: "pending" | "paid" | "failed" | "refunded"
      shop_status: "trial" | "active" | "suspended" | "cancelled"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status: "open" | "in_progress" | "resolved" | "closed"
      waitlist_status:
        | "waiting"
        | "offered"
        | "converted"
        | "expired"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["owner", "manager", "barber"],
      appointment_status: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      block_reason: [
        "lunch",
        "day_off",
        "holiday",
        "meeting",
        "maintenance",
        "absence",
        "other",
      ],
      booking_source: ["online", "manual", "waitlist"],
      cancellation_rule: [
        "flex_2h",
        "moderate_6h",
        "strict_24h",
        "contact_only",
      ],
      deposit_mode: ["percent", "fixed"],
      deposit_state: ["not_required", "awaiting", "paid", "failed", "refunded"],
      notif_channel: ["whatsapp", "email"],
      notif_status: ["queued", "sent", "failed", "skipped", "processing"],
      payment_provider: ["mpesa", "emola"],
      payment_state: ["pending", "paid", "failed", "refunded"],
      shop_status: ["trial", "active", "suspended", "cancelled"],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: ["open", "in_progress", "resolved", "closed"],
      waitlist_status: [
        "waiting",
        "offered",
        "converted",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
