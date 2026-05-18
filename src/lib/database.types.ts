/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Intentionally loose — avoids "never" inference when Supabase resolves Insert/Update types
// with strict generics. All runtime safety is handled by RLS and application logic.
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string;
          role: string;
          laboratory: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      laboratories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      freezers: {
        Row: {
          id: string;
          name: string;
          temperature: number;
          location: string | null;
          room: string | null;
          building: string | null;
          notes: string | null;
          laboratory: string;
          created_at: string;
          updated_at: string;
          created_by: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      racks: {
        Row: {
          id: string;
          freezer_id: string;
          name: string;
          description: string | null;
          shelf_number: number;
          rows: number;
          columns: number;
          slot_count: number;
          shelf_count: number;
          slots_per_shelf: number;
          image_url: string | null;
          created_at: string;
          created_by: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      freezer_zones: {
        Row: {
          id: string;
          freezer_id: string;
          zone_number: number;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      rack_zones: {
        Row: {
          id: string;
          rack_id: string;
          zone_number: number;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      boxes: {
        Row: {
          id: string;
          freezer_id: string;
          rack_id: string | null;
          rack_shelf_number: number | null;
          name: string;
          description: string | null;
          rows: number;
          columns: number;
          box_type: string;
          status: string;
          occupancy: number;
          qr_code: string | null;
          archived: boolean;
          created_at: string;
          updated_at: string;
          created_by: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      samples: {
        Row: {
          id: string;
          sample_code: string;
          patient_code: string | null;
          subject_code: string | null;
          project: string | null;
          sample_type: string;
          subtype: string | null;
          volume: number | null;
          concentration: number | null;
          units: string;
          freeze_date: string | null;
          collection_date: string | null;
          thaw_count: number;
          max_thaws: number;
          status: string;
          color: string | null;
          notes: string | null;
          box_id: string | null;
          position_row: number | null;
          position_column: number | null;
          position_label: string | null;
          laboratory: string;
          created_at: string;
          updated_at: string;
          created_by: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      sample_movements: {
        Row: {
          id: string;
          sample_id: string;
          from_box_id: string | null;
          to_box_id: string | null;
          from_position: string | null;
          to_position: string | null;
          moved_by: string;
          moved_at: string;
          notes: string | null;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          old_values: Json | null;
          new_values: Json | null;
          created_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
      settings: {
        Row: {
          id: string;
          laboratory: string;
          default_sample_type: string;
          default_sample_status: string;
          default_temperature: number;
          default_box_rows: number;
          default_box_columns: number;
          default_box_type: string;
          default_box_status: string;
          default_max_thaws: number;
          default_units: string;
          sample_types: string[] | null;
          sample_statuses: string[] | null;
          box_types: string[] | null;
          box_statuses: string[] | null;
          unit_types: string[] | null;
          language: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, any>;
        Update: Record<string, any>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      handle_new_user: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
