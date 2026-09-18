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
          barbershop_id: string
          channel: Database["public"]["Enums"]["notif_channel"]
          error: string | null
          id: string
          payload: Json
          recipient: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notif_status"]
          template_key: string
          waitlist_entry_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          barbershop_id: string
          channel: Database["public"]["Enums"]["notif_channel"]
          error?: string | null
          id?: string
          payload?: Json
          recipient: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notif_status"]
          template_key: string
          waitlist_entry_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          barbershop_id?: string
          channel?: Database["public"]["Enums"]["notif_channel"]
          error?: string | null
          id?: string
          payload?: Json
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
      payments: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          barbershop_id: string
          created_at: string
          id: string
          msisdn: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string | null
          raw: Json | null
          status: Database["public"]["Enums"]["payment_state"]
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          barbershop_id: string
          created_at?: string
          id?: string
          msisdn?: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_state"]
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          barbershop_id?: string
          created_at?: string
          id?: string
          msisdn?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_state"]
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
      create_barbershop: {
        Args: {
          p_name: string
          p_phone?: string
          p_slug: string
          p_whatsapp?: string
        }
        Returns: string
      }
      enqueue_appointment_notifications: {
        Args: { p_appt: string }
        Returns: undefined
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
      is_member: {
        Args: {
          p_roles?: Database["public"]["Enums"]["app_role"][]
          p_shop: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
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
      my_barber_id: { Args: { p_shop: string }; Returns: string }
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
      seed_haircut_catalogue: { Args: { p_shop: string }; Returns: number }
      shop_is_public: { Args: { p_shop: string }; Returns: boolean }
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
      notif_status: "queued" | "sent" | "failed" | "skipped"
      payment_provider: "mpesa" | "emola"
      payment_state: "pending" | "paid" | "failed" | "refunded"
      shop_status: "trial" | "active" | "suspended" | "cancelled"
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
      notif_status: ["queued", "sent", "failed", "skipped"],
      payment_provider: ["mpesa", "emola"],
      payment_state: ["pending", "paid", "failed", "refunded"],
      shop_status: ["trial", "active", "suspended", "cancelled"],
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
