/* CryoVault - Type definitions for all database entities */

export type UserRole = 'admin' | 'researcher' | 'technician' | 'read_only';
export type SampleType = 'tissue' | 'blood' | 'serum' | 'plasma' | 'urine' | 'csf' | 'saliva' | 'dna' | 'rna' | 'protein' | 'other';
export type SampleStatus = 'active' | 'used' | 'discarded' | 'archived' | 'contaminated';
export type BoxType = 'standard' | 'microtube' | 'sample_vial' | 'other';
export type BoxStatus = 'active' | 'full' | 'archived' | 'retired';
export type UnitType = 'mL' | 'µL' | 'mg' | 'µg' | 'ng' | 'mol/L' | '%' | 'other';
export type AuditAction = 'create' | 'update' | 'delete' | 'move';
export type AuditEntityType = 'freezer' | 'box' | 'sample' | 'rack' | 'profile' | 'settings';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  laboratory: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Freezer {
  id: string;
  name: string;
  temperature: number;
  location: string | null;
  room: string | null;
  building: string | null;
  notes: string | null;
  laboratory: string;
  image_url: string | null;
  shelf_count: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Rack {
  id: string;
  freezer_id: string;
  name: string;
  shelf_number: number;
  rows: number;
  columns: number;
  slot_count: number;
  created_at: string;
  created_by: string;
}

export interface Box {
  id: string;
  freezer_id: string;
  rack_id: string | null;
  shelf_number: number | null;
  name: string;
  description: string | null;
  rows: number;
  columns: number;
  box_type: BoxType;
  status: BoxStatus;
  occupancy: number;
  qr_code: string | null;
  archived: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Sample {
  id: string;
  sample_code: string;
  patient_code: string | null;
  subject_code: string | null;
  project: string | null;
  sample_type: SampleType;
  subtype: string | null;
  volume: number | null;
  concentration: number | null;
  units: UnitType;
  freeze_date: string | null;
  collection_date: string | null;
  thaw_count: number;
  max_thaws: number;
  status: SampleStatus;
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
}

export interface SampleMovement {
  id: string;
  sample_id: string;
  from_box_id: string | null;
  to_box_id: string | null;
  from_position: string | null;
  to_position: string | null;
  moved_by: string;
  moved_at: string;
  notes: string | null;
}

export interface AuditLog {
  id: string;
  user_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  created_at: string;
}

export interface Settings {
  id: string;
  laboratory: string;
  default_sample_type: SampleType;
  default_temperature: number;
  default_box_rows: number;
  default_box_columns: number;
  default_max_thaws: number;
  language: 'es' | 'en' | 'pt';
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  user: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface BoxGridCell {
  row: number;
  column: number;
  label: string;
  sample?: Sample;
  isEmpty: boolean;
  status: 'empty' | 'active' | 'used' | 'discarded';
}

export interface SearchFilters {
  sample_type?: SampleType[];
  status?: SampleStatus[];
  project?: string;
  freezer_id?: string;
  box_id?: string;
  thaw_count_min?: number;
  thaw_count_max?: number;
  date_from?: string;
  date_to?: string;
}
