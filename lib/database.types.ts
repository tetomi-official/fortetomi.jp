export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      connect_accounts: {
        Row: {
          created_at: string
          disabled_reason: string | null
          payouts_enabled: boolean
          requirements_due: string[]
          stripe_account_id: string
          transfers_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disabled_reason?: string | null
          payouts_enabled?: boolean
          requirements_due?: string[]
          stripe_account_id: string
          transfers_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          disabled_reason?: string | null
          payouts_enabled?: boolean
          requirements_due?: string[]
          stripe_account_id?: string
          transfers_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_recovery_requests: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_recovery_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_reverifications: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_reverifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_reminders: {
        Row: {
          kind: string
          reservation_id: string
          sent_at: string
          side: string
        }
        Insert: {
          kind: string
          reservation_id: string
          sent_at?: string
          side: string
        }
        Update: {
          kind?: string
          reservation_id?: string
          sent_at?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_reminders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          author: string | null
          category: string
          condition: string
          created_at: string
          description: string | null
          faculties: string[]
          id: string
          image_urls: string[]
          isbn: string | null
          likes: number
          location: string
          price: number
          publication_year: string | null
          publisher: string | null
          seller_id: string
          status: string
          subject: string
          title: string
          views: number
        }
        Insert: {
          author?: string | null
          category?: string
          condition: string
          created_at?: string
          description?: string | null
          faculties?: string[]
          id?: string
          image_urls?: string[]
          isbn?: string | null
          likes?: number
          location: string
          price: number
          publication_year?: string | null
          publisher?: string | null
          seller_id: string
          status?: string
          subject: string
          title: string
          views?: number
        }
        Update: {
          author?: string | null
          category?: string
          condition?: string
          created_at?: string
          description?: string | null
          faculties?: string[]
          id?: string
          image_urls?: string[]
          isbn?: string | null
          likes?: number
          location?: string
          price?: number
          publication_year?: string | null
          publisher?: string | null
          seller_id?: string
          status?: string
          subject?: string
          title?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          last_read_at: string
          reservation_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          reservation_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          reservation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          reservation_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          reservation_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          reservation_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_customers: {
        Row: {
          created_at: string
          payjp_customer_id: string | null
          provider: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          payjp_customer_id?: string | null
          provider?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          payjp_customer_id?: string | null
          provider?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          enrollment_valid_until: string | null
          enrollment_verified: boolean
          faculty: string | null
          grade: string | null
          id: string
          name: string | null
          rating: number
          rating_count: number
          university: string | null
        }
        Insert: {
          created_at?: string
          enrollment_valid_until?: string | null
          enrollment_verified?: boolean
          faculty?: string | null
          grade?: string | null
          id: string
          name?: string | null
          rating?: number
          rating_count?: number
          university?: string | null
        }
        Update: {
          created_at?: string
          enrollment_valid_until?: string | null
          enrollment_verified?: boolean
          faculty?: string | null
          grade?: string | null
          id?: string
          name?: string | null
          rating?: number
          rating_count?: number
          university?: string | null
        }
        Relationships: []
      }
      profiles_private: {
        Row: {
          gender: string | null
          id: string
          pending_personal_email: string | null
          recovery_email: string | null
          recovery_email_verified: boolean
          recovery_email_verified_at: string | null
          university_email: string | null
        }
        Insert: {
          gender?: string | null
          id: string
          pending_personal_email?: string | null
          recovery_email?: string | null
          recovery_email_verified?: boolean
          recovery_email_verified_at?: string | null
          university_email?: string | null
        }
        Update: {
          gender?: string | null
          id?: string
          pending_personal_email?: string | null
          recovery_email?: string | null
          recovery_email_verified?: boolean
          recovery_email_verified_at?: string | null
          university_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_private_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      recovery_email_verifications: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_email_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          buyer_id: string
          candidate_slots: Json | null
          charge_id: string | null
          created_at: string
          id: string
          listing_id: string
          message: string | null
          paid_at: string | null
          payment_error_code: string | null
          payment_intent_id: string | null
          payment_nonce_hash: string | null
          payment_provider: string | null
          payment_status: string | null
          preferred_date: string
          preferred_location: string
          preferred_time: string
          price: number
          proposed_date: string | null
          proposed_location: string | null
          proposed_time: string | null
          selected_slot: number | null
          seller_id: string
          status: string
        }
        Insert: {
          buyer_id: string
          candidate_slots?: Json | null
          charge_id?: string | null
          created_at?: string
          id?: string
          listing_id: string
          message?: string | null
          paid_at?: string | null
          payment_error_code?: string | null
          payment_intent_id?: string | null
          payment_nonce_hash?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          preferred_date: string
          preferred_location: string
          preferred_time: string
          price: number
          proposed_date?: string | null
          proposed_location?: string | null
          proposed_time?: string | null
          selected_slot?: number | null
          seller_id: string
          status?: string
        }
        Update: {
          buyer_id?: string
          candidate_slots?: Json | null
          charge_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          message?: string | null
          paid_at?: string | null
          payment_error_code?: string | null
          payment_intent_id?: string | null
          payment_nonce_hash?: string | null
          payment_provider?: string | null
          payment_status?: string | null
          preferred_date?: string
          preferred_location?: string
          preferred_time?: string
          price?: number
          proposed_date?: string | null
          proposed_location?: string | null
          proposed_time?: string | null
          selected_slot?: number | null
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_courses: {
        Row: {
          campus: string | null
          course_code: string | null
          course_name: string | null
          created_at: string
          credits: number | null
          day_period: string | null
          faculty: string | null
          grading: string | null
          id: number
          instructor: string | null
          instructor_kana: string | null
          language: string | null
          objectives: string | null
          other_notes: string | null
          raw_items: Json | null
          ref_url: string | null
          references_raw: string | null
          schedule: string | null
          scraped_at: string
          source_url: string | null
          summary: string | null
          term: string | null
          textbooks: Json
          updated_at: string
          year: number | null
          year_level: string | null
        }
        Insert: {
          campus?: string | null
          course_code?: string | null
          course_name?: string | null
          created_at?: string
          credits?: number | null
          day_period?: string | null
          faculty?: string | null
          grading?: string | null
          id: number
          instructor?: string | null
          instructor_kana?: string | null
          language?: string | null
          objectives?: string | null
          other_notes?: string | null
          raw_items?: Json | null
          ref_url?: string | null
          references_raw?: string | null
          schedule?: string | null
          scraped_at?: string
          source_url?: string | null
          summary?: string | null
          term?: string | null
          textbooks?: Json
          updated_at?: string
          year?: number | null
          year_level?: string | null
        }
        Update: {
          campus?: string | null
          course_code?: string | null
          course_name?: string | null
          created_at?: string
          credits?: number | null
          day_period?: string | null
          faculty?: string | null
          grading?: string | null
          id?: number
          instructor?: string | null
          instructor_kana?: string | null
          language?: string | null
          objectives?: string | null
          other_notes?: string | null
          raw_items?: Json | null
          ref_url?: string | null
          references_raw?: string | null
          schedule?: string | null
          scraped_at?: string
          source_url?: string | null
          summary?: string | null
          term?: string | null
          textbooks?: Json
          updated_at?: string
          year?: number | null
          year_level?: string | null
        }
        Relationships: []
      }
      syllabus_textbooks: {
        Row: {
          course_id: number
          created_at: string
          id: number
          isbn_raw: string | null
          isbn13: string
        }
        Insert: {
          course_id: number
          created_at?: string
          id?: number
          isbn_raw?: string | null
          isbn13: string
        }
        Update: {
          course_id?: number
          created_at?: string
          id?: number
          isbn_raw?: string | null
          isbn13?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_textbooks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "syllabus_courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      count_active_listings: { Args: never; Returns: number }
      get_newest_listings: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          id: string
          image_urls: string[]
          price: number
          seller_name: string
          subject: string
          title: string
        }[]
      }
      is_enrollment_active: { Args: { uid: string }; Returns: boolean }
      is_university_email_taken: { Args: { p_email: string }; Returns: boolean }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

