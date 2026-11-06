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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      administrative_areas: {
        Row: {
          city_corporation_id: string | null
          district_id: string | null
          division_id: string | null
          id: string
          level: string
          municipality_id: string | null
          name_bn: string
          name_en: string
          parent_id: string | null
          union_id: string | null
          upazila_id: string | null
          ward_number: number | null
        }
        Insert: {
          city_corporation_id?: string | null
          district_id?: string | null
          division_id?: string | null
          id: string
          level: string
          municipality_id?: string | null
          name_bn: string
          name_en: string
          parent_id?: string | null
          union_id?: string | null
          upazila_id?: string | null
          ward_number?: number | null
        }
        Update: {
          city_corporation_id?: string | null
          district_id?: string | null
          division_id?: string | null
          id?: string
          level?: string
          municipality_id?: string | null
          name_bn?: string
          name_en?: string
          parent_id?: string | null
          union_id?: string | null
          upazila_id?: string | null
          ward_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "administrative_areas_city_corporation_id_fkey"
            columns: ["city_corporation_id"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_areas_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_areas_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_areas_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_areas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_areas_upazila_id_fkey"
            columns: ["upazila_id"]
            isOneToOne: false
            referencedRelation: "upazilas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          at: string
          case_id: string | null
          details: Json | null
          id: number
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          case_id?: string | null
          details?: Json | null
          id?: number
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          case_id?: string | null
          details?: Json | null
          id?: number
          user_id?: string | null
        }
        Relationships: []
      }
      case_remarks: {
        Row: {
          author: string
          case_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          text: string
        }
        Insert: {
          author?: string
          case_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          text: string
        }
        Update: {
          author?: string
          case_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_remarks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          cause_bn: string | null
          cause_en: string | null
          child_order: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          details: Json
          district_id: string
          dob: string
          dod: string | null
          father_bn: string
          father_en: string
          files: Json
          files_purged: boolean
          gender: string
          id: string
          mother_bn: string
          mother_en: string
          name_bn: string
          name_en: string
          nid: string | null
          parent_mobile: string | null
          police_task: Json | null
          reg_no: string | null
          sms_sent: boolean
          station_id: string
          status: string
          type: string
          union_id: string
          upazila_id: string
          village_id: string
          ward: number
        }
        Insert: {
          cause_bn?: string | null
          cause_en?: string | null
          child_order?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          details?: Json
          district_id?: string
          dob: string
          dod?: string | null
          father_bn: string
          father_en: string
          files?: Json
          files_purged?: boolean
          gender: string
          id?: string
          mother_bn: string
          mother_en: string
          name_bn: string
          name_en: string
          nid: string | null
          parent_mobile?: string | null
          police_task?: Json | null
          reg_no?: string | null
          sms_sent?: boolean
          station_id?: string
          status?: string
          type: string
          union_id: string
          upazila_id: string
          village_id: string
          ward?: number
        }
        Update: {
          cause_bn?: string | null
          cause_en?: string | null
          child_order?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          details?: Json
          district_id?: string
          dob?: string
          dod?: string | null
          father_bn?: string
          father_en?: string
          files?: Json
          files_purged?: boolean
          gender?: string
          id?: string
          mother_bn?: string
          mother_en?: string
          name_bn?: string
          name_en?: string
          nid?: string | null
          parent_mobile?: string | null
          police_task?: Json | null
          reg_no?: string | null
          sms_sent?: boolean
          station_id?: string
          status?: string
          type?: string
          union_id?: string
          upazila_id?: string
          village_id?: string
          ward?: number
        }
        Relationships: [
          {
            foreignKeyName: "cases_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_station_scope_fkey"
            columns: ["upazila_id", "station_id"]
            isOneToOne: false
            referencedRelation: "administrative_stations"
            referencedColumns: ["upazila_id", "station_id"]
          },
        ]
      }
      support_requests: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          upazila_id: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          upazila_id: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          upazila_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_upazila_id_fkey"
            columns: ["upazila_id"]
            isOneToOne: false
            referencedRelation: "upazilas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_registration_requests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          processing_at: string | null
          processing_by: string | null
          role: "worker" | "police"
          reviewed_at: string | null
          reviewed_by: string | null
          status: "pending" | "processing" | "provisioned" | "approved" | "rejected"
          union_name: string
          upazila_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          processing_at?: string | null
          processing_by?: string | null
          role: "worker" | "police"
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: "pending" | "processing" | "provisioned" | "approved" | "rejected"
          union_name: string
          upazila_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          processing_at?: string | null
          processing_by?: string | null
          role?: "worker" | "police"
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: "pending" | "processing" | "provisioned" | "approved" | "rejected"
          union_name?: string
          upazila_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_registration_requests_processing_by_fkey"
            columns: ["processing_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_registration_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_registration_requests_upazila_id_fkey"
            columns: ["upazila_id"]
            isOneToOne: false
            referencedRelation: "upazilas"
            referencedColumns: ["id"]
          },
        ]
      }
      epi_visits: {
        Row: {
          attended_at: string
          child_name_bn: string
          child_name_en: string
          created_at: string
          created_by: string
          id: string
          parent_mobile: string
          registration_case_id: string | null
          union_id: string
          upazila_id: string
          village_id: string
          ward: number
        }
        Insert: {
          attended_at?: string
          child_name_bn: string
          child_name_en: string
          created_at?: string
          created_by?: string
          id?: string
          parent_mobile: string
          registration_case_id?: string | null
          union_id: string
          upazila_id: string
          village_id: string
          ward: number
        }
        Update: {
          attended_at?: string
          child_name_bn?: string
          child_name_en?: string
          created_at?: string
          created_by?: string
          id?: string
          parent_mobile?: string
          registration_case_id?: string | null
          union_id?: string
          upazila_id?: string
          village_id?: string
          ward?: number
        }
        Relationships: [
          {
            foreignKeyName: "epi_visits_registration_case_id_fkey"
            columns: ["registration_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          at: string
          id: number
          identifier: string
          ip: string | null
          method: string
          reason: string | null
          success: boolean
        }
        Insert: {
          at?: string
          id?: number
          identifier: string
          ip?: string | null
          method: string
          reason?: string | null
          success: boolean
        }
        Update: {
          at?: string
          id?: number
          identifier?: string
          ip?: string | null
          method?: string
          reason?: string | null
          success?: boolean
        }
        Relationships: []
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          approval_status: "pending" | "approved" | "rejected"
          created_at: string
          district_id: string | null
          email: string | null
          id: string
          mobile: string | null
          name_bn: string
          name_en: string
          status: "pending" | "active" | "rejected"
          station_id: string | null
          union_id: string | null
          upazila_id: string | null
          ward: number | null
        }
        Insert: {
          active?: boolean
          approval_status?: "pending" | "approved" | "rejected"
          created_at?: string
          district_id?: string | null
          email?: string | null
          id: string
          mobile?: string | null
          name_bn: string
          name_en: string
          status?: "pending" | "active" | "rejected"
          station_id?: string | null
          union_id?: string | null
          upazila_id?: string | null
          ward?: number | null
        }
        Update: {
          active?: boolean
          approval_status?: "pending" | "approved" | "rejected"
          created_at?: string
          district_id?: string | null
          email?: string | null
          id?: string
          mobile?: string | null
          name_bn?: string
          name_en?: string
          status?: "pending" | "active" | "rejected"
          station_id?: string | null
          union_id?: string | null
          upazila_id?: string | null
          ward?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_station_scope_fkey"
            columns: ["upazila_id", "station_id"]
            isOneToOne: false
            referencedRelation: "administrative_stations"
            referencedColumns: ["upazila_id", "station_id"]
          },
          {
            foreignKeyName: "profiles_upazila_id_fkey"
            columns: ["upazila_id"]
            isOneToOne: false
            referencedRelation: "upazilas"
            referencedColumns: ["id"]
          },
        ]
      }
      administrative_stations: {
        Row: {
          district_id: string
          name_bn: string
          name_en: string
          station_id: string
          station_type: string
          upazila_id: string
        }
        Insert: {
          district_id: string
          name_bn: string
          name_en: string
          station_id: string
          station_type: string
          upazila_id: string
        }
        Update: {
          district_id?: string
          name_bn?: string
          name_en?: string
          station_id?: string
          station_type?: string
          upazila_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "administrative_stations_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "administrative_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_stations_upazila_id_fkey"
            columns: ["upazila_id"]
            isOneToOne: false
            referencedRelation: "upazilas"
            referencedColumns: ["id"]
          },
        ]
      }
      upazila_announcements: {
        Row: {
          active: boolean
          notice_bn: string
          notice_en: string
          upazila_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          active?: boolean
          notice_bn?: string
          notice_en?: string
          upazila_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          active?: boolean
          notice_bn?: string
          notice_en?: string
          upazila_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "upazila_announcements_upazila_id_fkey"
            columns: ["upazila_id"]
            isOneToOne: true
            referencedRelation: "upazilas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upazila_announcements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      upazilas: {
        Row: {
          bn: string
          created_at: string
          district_bn: string
          district_en: string
          division_bn: string
          division_en: string
          en: string
          id: string
          unions: Json
        }
        Insert: {
          bn: string
          created_at?: string
          district_bn: string
          district_en: string
          division_bn?: string
          division_en?: string
          en: string
          id: string
          unions?: Json
        }
        Update: {
          bn?: string
          created_at?: string
          district_bn?: string
          district_en?: string
          division_bn?: string
          division_en?: string
          en?: string
          id?: string
          unions?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      registration_targets: {
        Row: {
          birth_target: number
          death_target: number
          id: string
          month_year: string
          status: string
          updated_at: string
          union_id: string
          union_name: string
          upazila_id: string
        }
        Insert: {
          birth_target?: number
          death_target?: number
          id?: string
          month_year: string
          status?: string
          updated_at?: string
          union_id: string
          union_name: string
          upazila_id: string
        }
        Update: {
          birth_target?: number
          death_target?: number
          id?: string
          month_year?: string
          status?: string
          updated_at?: string
          union_id?: string
          union_name?: string
          upazila_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_targets_upazila_id_fkey"
            columns: ["upazila_id"]
            isOneToOne: false
            referencedRelation: "upazilas"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_entry_pages: {
        Row: {
          created_at: string
          entries: Json
          id: string
          owner_id: string
          page_number: number
          page_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entries?: Json
          id?: string
          owner_id: string
          page_number: number
          page_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entries?: Json
          id?: string
          owner_id?: string
          page_number?: number
          page_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_notices: {
        Row: {
          author_id: string
          body: string
          id: string
          kind: string
          published_at: string
          title: string
          union_id: string | null
          upazila_id: string
        }
        Insert: {
          author_id: string
          body: string
          id?: string
          kind?: string
          published_at?: string
          title: string
          union_id?: string | null
          upazila_id: string
        }
        Update: {
          author_id?: string
          body?: string
          id?: string
          kind?: string
          published_at?: string
          title?: string
          union_id?: string | null
          upazila_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      administrative_area_slug: { Args: { value: string }; Returns: string }
      case_history: {
        Args: { p_case_id: string }
        Returns: {
          action: string
          at: string
          client_hint: string | null
          id: number
          role: string | null
          status_from: string | null
          status_to: string | null
          user_id: string | null
        }[]
      }
      current_district: { Args: never; Returns: string }
      current_union: { Args: never; Returns: string }
      current_upazila: { Args: never; Returns: string }
      current_ward: { Args: never; Returns: number }
      monthly_ward_case_counts: {
        Args: never
        Returns: {
          completed_count: number
          pending_count: number
          progress_count: number
          total_count: number
        }[]
      }
      monthly_ward_case_type_counts: {
        Args: never
        Returns: {
          birth_completed_count: number
          birth_pending_count: number
          birth_progress_count: number
          birth_total_count: number
          death_completed_count: number
          death_pending_count: number
          death_progress_count: number
          death_total_count: number
        }[]
      }
      station_monthly_dashboard_metrics: {
        Args: { _month_year: string }
        Returns: {
          birth_completed_count: number
          birth_pending_count: number
          birth_progress_count: number
          birth_target: number
          birth_total_count: number
          death_completed_count: number
          death_pending_count: number
          death_progress_count: number
          death_target: number
          death_total_count: number
          target_present: boolean
        }[]
      }
      save_union_villages: {
        Args: { _union_id: string; _villages: Json }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          id: string
          ip: string
          updated_at: string
          user_agent: string
        }[]
      }
      mfa_ok: { Args: never; Returns: boolean }
      revoke_my_session: { Args: { _session_id: string }; Returns: undefined }
      sync_upazila_administrative_areas: {
        Args: { _upazila_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "worker" | "admin" | "police" | "uno" | "super" | "district" | "super_admin" | "owner"
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
      app_role: ["worker", "admin", "police", "uno", "super", "district", "super_admin", "owner"],
    },
  },
} as const
