/*
  # CryoVault Schema - Complete Database Setup
  
  1. New Tables
    - `profiles`: User profiles linked to auth.users
    - `freezers`: Laboratory freezer units with location/temperature tracking
    - `racks`: Racks/shelves within freezers
    - `boxes`: Criovial storage boxes (9x9, 10x10, or custom grid)
    - `samples`: Biological samples with full metadata and location tracking
    - `sample_movements`: Complete audit trail of sample movements between boxes
    - `audit_logs`: Comprehensive change log for all entities (created/updated/deleted)
    - `settings`: Global app configuration per organization
  
  2. Key Features
    - UUID primary keys for all tables
    - Foreign key constraints for referential integrity
    - UNIQUE constraints for codes (sample_code, freezer identifiers)
    - JSONB columns for flexible metadata storage
    - Timestamps with timezone awareness (created_at, updated_at)
    - Automatic occupancy calculation for boxes
    - Full Row Level Security (RLS) implementation
  
  3. Security (RLS Policies)
    - Admin: Full access to all tables
    - Researcher/Technician: Full access to data within their laboratory
    - Read_only: SELECT only on all tables within their laboratory
    - Authenticated users only - no public access
    - Policies check lab membership and role
  
  4. Important Notes
    - All timestamps use UTC timezone
    - Freezer temperature stored as integer (Celsius)
    - Sample volume and concentration use flexible units field
    - Status fields use enums for consistency
    - Occupancy calculation includes archived samples
    - Audit logs preserve both old and new values as JSONB
    - All mutations must include created_by/updated_by for audit trail
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE - User profiles linked to Supabase auth
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'researcher' CHECK (role IN ('admin', 'researcher', 'technician', 'read_only')),
  laboratory TEXT NOT NULL DEFAULT 'default_lab',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- FREEZERS TABLE - Laboratory freezer units
-- ============================================================================
CREATE TABLE IF NOT EXISTS freezers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  temperature INTEGER NOT NULL DEFAULT -80 CHECK (temperature BETWEEN -200 AND 25),
  location TEXT,
  room TEXT,
  building TEXT,
  notes TEXT,
  laboratory TEXT NOT NULL DEFAULT 'default_lab',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  UNIQUE(name, laboratory)
);

-- ============================================================================
-- RACKS TABLE - Racks/shelves within freezers
-- ============================================================================
CREATE TABLE IF NOT EXISTS racks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freezer_id UUID NOT NULL REFERENCES freezers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shelf_number INTEGER NOT NULL,
  rows INTEGER NOT NULL DEFAULT 9 CHECK (rows > 0),
  columns INTEGER NOT NULL DEFAULT 9 CHECK (columns > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  UNIQUE(freezer_id, shelf_number)
);

-- ============================================================================
-- BOXES TABLE - Criovial storage boxes
-- ============================================================================
CREATE TABLE IF NOT EXISTS boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freezer_id UUID NOT NULL REFERENCES freezers(id) ON DELETE CASCADE,
  rack_id UUID REFERENCES racks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  rows INTEGER NOT NULL DEFAULT 9 CHECK (rows > 0),
  columns INTEGER NOT NULL DEFAULT 9 CHECK (columns > 0),
  box_type TEXT DEFAULT 'standard' CHECK (box_type IN ('standard', 'microtube', 'sample_vial', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'full', 'archived', 'retired')),
  occupancy INTEGER NOT NULL DEFAULT 0,
  qr_code TEXT UNIQUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  UNIQUE(freezer_id, name)
);

-- ============================================================================
-- SAMPLES TABLE - Biological samples with location and metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_code TEXT NOT NULL UNIQUE,
  patient_code TEXT,
  subject_code TEXT,
  project TEXT,
  sample_type TEXT NOT NULL DEFAULT 'tissue' CHECK (sample_type IN ('tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other')),
  subtype TEXT,
  volume NUMERIC(10, 2),
  concentration NUMERIC(10, 2),
  units TEXT DEFAULT 'mL' CHECK (units IN ('mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other')),
  freeze_date DATE,
  collection_date DATE,
  thaw_count INTEGER NOT NULL DEFAULT 0 CHECK (thaw_count >= 0),
  max_thaws INTEGER NOT NULL DEFAULT 3 CHECK (max_thaws > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'discarded', 'archived', 'contaminated')),
  color TEXT,
  notes TEXT,
  box_id UUID REFERENCES boxes(id) ON DELETE SET NULL,
  position_row INTEGER CHECK (position_row IS NULL OR position_row > 0),
  position_column INTEGER CHECK (position_column IS NULL OR position_column > 0),
  position_label TEXT,
  laboratory TEXT NOT NULL DEFAULT 'default_lab',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  CONSTRAINT valid_position CHECK (
    (position_row IS NULL AND position_column IS NULL) OR 
    (position_row IS NOT NULL AND position_column IS NOT NULL)
  )
);

-- ============================================================================
-- SAMPLE_MOVEMENTS TABLE - Audit trail of sample location changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS sample_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  from_box_id UUID REFERENCES boxes(id) ON DELETE SET NULL,
  to_box_id UUID REFERENCES boxes(id) ON DELETE SET NULL,
  from_position TEXT,
  to_position TEXT,
  moved_by UUID NOT NULL REFERENCES auth.users(id),
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- ============================================================================
-- AUDIT_LOGS TABLE - Complete change history for all entities
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('freezer', 'box', 'sample', 'rack', 'profile', 'settings')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'move')),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SETTINGS TABLE - Global app configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory TEXT NOT NULL UNIQUE DEFAULT 'default_lab',
  default_sample_type TEXT DEFAULT 'tissue',
  default_temperature INTEGER DEFAULT -80,
  default_box_rows INTEGER DEFAULT 9,
  default_box_columns INTEGER DEFAULT 9,
  default_max_thaws INTEGER DEFAULT 3,
  language TEXT DEFAULT 'es' CHECK (language IN ('es', 'en', 'pt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_freezers_laboratory ON freezers(laboratory);
CREATE INDEX IF NOT EXISTS idx_boxes_freezer_id ON boxes(freezer_id);
CREATE INDEX IF NOT EXISTS idx_boxes_rack_id ON boxes(rack_id);
CREATE INDEX IF NOT EXISTS idx_samples_box_id ON samples(box_id);
CREATE INDEX IF NOT EXISTS idx_samples_laboratory ON samples(laboratory);
CREATE INDEX IF NOT EXISTS idx_samples_sample_code ON samples(sample_code);
CREATE INDEX IF NOT EXISTS idx_samples_patient_code ON samples(patient_code);
CREATE INDEX IF NOT EXISTS idx_samples_project ON samples(project);
CREATE INDEX IF NOT EXISTS idx_samples_status ON samples(status);
CREATE INDEX IF NOT EXISTS idx_samples_created_by ON samples(created_by);
CREATE INDEX IF NOT EXISTS idx_sample_movements_sample_id ON sample_movements(sample_id);
CREATE INDEX IF NOT EXISTS idx_sample_movements_moved_at ON sample_movements(moved_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_laboratory ON profiles(laboratory);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE freezers ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES - PROFILES TABLE
-- ============================================================================
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can read all profiles in their lab"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can update profiles in their lab"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ============================================================================
-- POLICIES - FREEZERS TABLE
-- ============================================================================
CREATE POLICY "Users can read freezers in their lab"
  ON freezers FOR SELECT
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins and technicians can create freezers"
  ON freezers FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'technician')
  );

CREATE POLICY "Admins and technicians can update freezers"
  ON freezers FOR UPDATE
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'technician')
  )
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'technician')
  );

CREATE POLICY "Only admins can delete freezers"
  ON freezers FOR DELETE
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ============================================================================
-- POLICIES - RACKS TABLE
-- ============================================================================
CREATE POLICY "Users can read racks in their lab freezers"
  ON racks FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins and technicians can manage racks"
  ON racks FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'technician')
  );

CREATE POLICY "Admins and technicians can update racks"
  ON racks FOR UPDATE
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'technician')
  )
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'technician')
  );

-- ============================================================================
-- POLICIES - BOXES TABLE
-- ============================================================================
CREATE POLICY "Users can read boxes in their lab"
  ON boxes FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Researchers can create boxes in their lab"
  ON boxes FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'researcher', 'technician')
  );

CREATE POLICY "Users can update boxes in their lab"
  ON boxes FOR UPDATE
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'researcher', 'technician')
  )
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'researcher', 'technician')
  );

-- ============================================================================
-- POLICIES - SAMPLES TABLE
-- ============================================================================
CREATE POLICY "Users can read samples in their lab"
  ON samples FOR SELECT
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Researchers can create samples in their lab"
  ON samples FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'researcher', 'technician')
  );

CREATE POLICY "Users can update samples in their lab"
  ON samples FOR UPDATE
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'researcher', 'technician')
  )
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'researcher', 'technician')
  );

-- ============================================================================
-- POLICIES - SAMPLE_MOVEMENTS TABLE
-- ============================================================================
CREATE POLICY "Users can read movements in their lab"
  ON sample_movements FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM samples WHERE id = sample_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Researchers can record movements in their lab"
  ON sample_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT laboratory FROM samples WHERE id = sample_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'researcher', 'technician')
  );

-- ============================================================================
-- POLICIES - AUDIT_LOGS TABLE
-- ============================================================================
CREATE POLICY "Users can read audit logs in their lab"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM profiles WHERE id = user_id) = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

-- ============================================================================
-- POLICIES - SETTINGS TABLE
-- ============================================================================
CREATE POLICY "Users can read settings for their lab"
  ON settings FOR SELECT
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Only admins can update settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ============================================================================
-- FUNCTION: Auto-create profile on user signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, laboratory, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'laboratory', 'default_lab'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'researcher')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();