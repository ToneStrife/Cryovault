// Generado desde el proyecto Supabase yyfthcebyqylhjkrzsph el 2026-11-07.
// Regenerar con: npx supabase gen types typescript --linked > src/lib/database.types.ts

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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      boxes: {
        Row: {
          archived: boolean
          box_type: string | null
          columns: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          freezer_id: string
          id: string
          image_url: string | null
          name: string
          occupancy: number
          qr_code: string | null
          rack_id: string | null
          rack_shelf_number: number | null
          rows: number
          shelf_number: number | null
          status: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          box_type?: string | null
          columns?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          freezer_id: string
          id?: string
          image_url?: string | null
          name: string
          occupancy?: number
          qr_code?: string | null
          rack_id?: string | null
          rack_shelf_number?: number | null
          rows?: number
          shelf_number?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          box_type?: string | null
          columns?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          freezer_id?: string
          id?: string
          image_url?: string | null
          name?: string
          occupancy?: number
          qr_code?: string | null
          rack_id?: string | null
          rack_shelf_number?: number | null
          rows?: number
          shelf_number?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boxes_freezer_id_fkey"
            columns: ["freezer_id"]
            isOneToOne: false
            referencedRelation: "freezers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boxes_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "racks"
            referencedColumns: ["id"]
          },
        ]
      }
      freezer_zones: {
        Row: {
          created_at: string
          freezer_id: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          zone_number: number
        }
        Insert: {
          created_at?: string
          freezer_id: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          zone_number: number
        }
        Update: {
          created_at?: string
          freezer_id?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          zone_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "freezer_zones_freezer_id_fkey"
            columns: ["freezer_id"]
            isOneToOne: false
            referencedRelation: "freezers"
            referencedColumns: ["id"]
          },
        ]
      }
      freezers: {
        Row: {
          building: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          laboratory: string
          location: string | null
          name: string
          notes: string | null
          room: string | null
          shelf_count: number
          temperature: number
          updated_at: string
        }
        Insert: {
          building?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          laboratory?: string
          location?: string | null
          name: string
          notes?: string | null
          room?: string | null
          shelf_count?: number
          temperature?: number
          updated_at?: string
        }
        Update: {
          building?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          laboratory?: string
          location?: string | null
          name?: string
          notes?: string | null
          room?: string | null
          shelf_count?: number
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          id: string
          invited_by: string | null
          laboratory: string
          role: string
          temporary_password: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_by?: string | null
          laboratory?: string
          role?: string
          temporary_password?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          laboratory?: string
          role?: string
          temporary_password?: string | null
        }
        Relationships: []
      }
      laboratories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          laboratory: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          laboratory?: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          laboratory?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      rack_zones: {
        Row: {
          created_at: string
          id: string
          name: string
          rack_id: string
          sort_order: number
          updated_at: string
          zone_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rack_id: string
          sort_order?: number
          updated_at?: string
          zone_number: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rack_id?: string
          sort_order?: number
          updated_at?: string
          zone_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "rack_zones_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "racks"
            referencedColumns: ["id"]
          },
        ]
      }
      racks: {
        Row: {
          columns: number
          created_at: string
          created_by: string | null
          description: string | null
          freezer_id: string
          id: string
          image_url: string | null
          name: string
          rows: number
          shelf_count: number
          shelf_number: number
          slot_count: number
          slots_per_shelf: number
        }
        Insert: {
          columns?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          freezer_id: string
          id?: string
          image_url?: string | null
          name: string
          rows?: number
          shelf_count?: number
          shelf_number: number
          slot_count?: number
          slots_per_shelf?: number
        }
        Update: {
          columns?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          freezer_id?: string
          id?: string
          image_url?: string | null
          name?: string
          rows?: number
          shelf_count?: number
          shelf_number?: number
          slot_count?: number
          slots_per_shelf?: number
        }
        Relationships: [
          {
            foreignKeyName: "racks_freezer_id_fkey"
            columns: ["freezer_id"]
            isOneToOne: false
            referencedRelation: "freezers"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_movements: {
        Row: {
          from_box_id: string | null
          from_position: string | null
          id: string
          moved_at: string
          moved_by: string | null
          notes: string | null
          sample_id: string
          to_box_id: string | null
          to_position: string | null
        }
        Insert: {
          from_box_id?: string | null
          from_position?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          sample_id: string
          to_box_id?: string | null
          to_position?: string | null
        }
        Update: {
          from_box_id?: string | null
          from_position?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          sample_id?: string
          to_box_id?: string | null
          to_position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_movements_from_box_id_fkey"
            columns: ["from_box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_movements_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_movements_to_box_id_fkey"
            columns: ["to_box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          box_id: string | null
          collection_date: string | null
          color: string | null
          concentration: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          freeze_date: string | null
          id: string
          laboratory: string
          max_thaws: number
          notes: string | null
          patient_code: string | null
          position_column: number | null
          position_label: string | null
          position_row: number | null
          project: string | null
          sample_code: string
          sample_type: string
          status: string
          subject_code: string | null
          subtype: string | null
          thaw_count: number
          units: string | null
          updated_at: string
          volume: number | null
        }
        Insert: {
          box_id?: string | null
          collection_date?: string | null
          color?: string | null
          concentration?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          freeze_date?: string | null
          id?: string
          laboratory?: string
          max_thaws?: number
          notes?: string | null
          patient_code?: string | null
          position_column?: number | null
          position_label?: string | null
          position_row?: number | null
          project?: string | null
          sample_code: string
          sample_type?: string
          status?: string
          subject_code?: string | null
          subtype?: string | null
          thaw_count?: number
          units?: string | null
          updated_at?: string
          volume?: number | null
        }
        Update: {
          box_id?: string | null
          collection_date?: string | null
          color?: string | null
          concentration?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          freeze_date?: string | null
          id?: string
          laboratory?: string
          max_thaws?: number
          notes?: string | null
          patient_code?: string | null
          position_column?: number | null
          position_label?: string | null
          position_row?: number | null
          project?: string | null
          sample_code?: string
          sample_type?: string
          status?: string
          subject_code?: string | null
          subtype?: string | null
          thaw_count?: number
          units?: string | null
          updated_at?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          box_statuses: string[] | null
          box_types: string[] | null
          created_at: string
          default_box_columns: number | null
          default_box_rows: number | null
          default_box_status: string | null
          default_box_type: string | null
          default_max_thaws: number | null
          default_sample_status: string | null
          default_sample_type: string | null
          default_temperature: number | null
          default_units: string | null
          id: string
          laboratory: string
          language: string | null
          sample_statuses: string[] | null
          sample_types: string[] | null
          unit_types: string[] | null
          updated_at: string
        }
        Insert: {
          box_statuses?: string[] | null
          box_types?: string[] | null
          created_at?: string
          default_box_columns?: number | null
          default_box_rows?: number | null
          default_box_status?: string | null
          default_box_type?: string | null
          default_max_thaws?: number | null
          default_sample_status?: string | null
          default_sample_type?: string | null
          default_temperature?: number | null
          default_units?: string | null
          id?: string
          laboratory?: string
          language?: string | null
          sample_statuses?: string[] | null
          sample_types?: string[] | null
          unit_types?: string[] | null
          updated_at?: string
        }
        Update: {
          box_statuses?: string[] | null
          box_types?: string[] | null
          created_at?: string
          default_box_columns?: number | null
          default_box_rows?: number | null
          default_box_status?: string | null
          default_box_type?: string | null
          default_max_thaws?: number | null
          default_sample_status?: string | null
          default_sample_type?: string | null
          default_temperature?: number | null
          default_units?: string | null
          id?: string
          laboratory?: string
          language?: string | null
          sample_statuses?: string[] | null
          sample_types?: string[] | null
          unit_types?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          action: string
          created_at: string
          granted: boolean
          id: string
          laboratory: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          granted?: boolean
          id?: string
          laboratory?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          granted?: boolean
          id?: string
          laboratory?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      box_in_my_lab: { Args: { p_box: string }; Returns: boolean }
      complete_user_onboarding: { Args: never; Returns: undefined }
      current_user_laboratory: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      get_my_lab: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      profile_laboratory: { Args: { p_user: string }; Returns: string }
      recalculate_box_occupancy: {
        Args: { target_box_id: string }
        Returns: undefined
      }
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
  public: {
    Enums: {},
  },
} as const
