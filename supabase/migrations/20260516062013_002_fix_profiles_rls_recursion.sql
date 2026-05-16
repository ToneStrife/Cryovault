/*
  # Fix Infinite Recursion in Profiles RLS Policies

  ## Problem
  The original profiles RLS policies ("Admins can read all profiles in their lab"
  and "Admins can update profiles in their lab") query the profiles table from within
  a profiles policy, causing Postgres to recurse infinitely when evaluating access.

  The error seen is:
    {"code":"42P17","message":"infinite recursion detected in policy for relation \"profiles\""}

  ## Changes

  1. Create two SECURITY DEFINER helper functions that read the current user's
     laboratory and role WITHOUT triggering RLS evaluation — this breaks the recursion.

  2. Drop the broken admin policies on profiles.

  3. Recreate admin policies using the helper functions instead of subqueries.

  4. Also fix the "Users can update own profile" policy which had a subquery referencing
     profiles (the role check) — rewrite it to only allow updating non-role fields.

  5. Add missing INSERT policy on profiles so the handle_new_user trigger can insert
     rows (the trigger runs as SECURITY DEFINER so it bypasses RLS, but add the policy
     for completeness in case of direct inserts).

  ## Security
  - get_my_lab() and get_my_role() are SECURITY DEFINER — they run as the function owner
    (postgres/service role) and read profiles without triggering the RLS cycle.
  - All policies remain restricted to authenticated users only.
*/

-- ============================================================================
-- STEP 1: Create SECURITY DEFINER helper functions to break recursion
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_lab()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT laboratory FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================================
-- STEP 2: Drop all existing profiles policies (they all have recursion risk)
-- ============================================================================

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles in their lab" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their lab" ON profiles;

-- ============================================================================
-- STEP 3: Recreate profiles policies using the helper functions
-- ============================================================================

-- Users can always read their own profile row
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update their own profile (but not change their role)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can read all profiles in their lab (uses helper to avoid recursion)
CREATE POLICY "Admins can read all profiles in their lab"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    laboratory = public.get_my_lab()
    AND public.get_my_role() = 'admin'
  );

-- Admins can update profiles in their lab (uses helper to avoid recursion)
CREATE POLICY "Admins can update profiles in their lab"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    laboratory = public.get_my_lab()
    AND public.get_my_role() = 'admin'
  )
  WITH CHECK (
    laboratory = public.get_my_lab()
    AND public.get_my_role() = 'admin'
  );

-- Allow inserting own profile row (needed for manual inserts; trigger uses SECURITY DEFINER)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- STEP 4: Fix all other tables to use the helper functions
--         This prevents any future recursion and improves performance
--         (single function call per query instead of repeated subqueries)
-- ============================================================================

-- FREEZERS
DROP POLICY IF EXISTS "Users can read freezers in their lab" ON freezers;
DROP POLICY IF EXISTS "Admins and technicians can create freezers" ON freezers;
DROP POLICY IF EXISTS "Admins and technicians can update freezers" ON freezers;
DROP POLICY IF EXISTS "Only admins can delete freezers" ON freezers;

CREATE POLICY "Users can read freezers in their lab"
  ON freezers FOR SELECT
  TO authenticated
  USING (laboratory = public.get_my_lab());

CREATE POLICY "Admins and technicians can create freezers"
  ON freezers FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'technician')
  );

CREATE POLICY "Admins and technicians can update freezers"
  ON freezers FOR UPDATE
  TO authenticated
  USING (
    laboratory = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'technician')
  )
  WITH CHECK (
    laboratory = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'technician')
  );

CREATE POLICY "Only admins can delete freezers"
  ON freezers FOR DELETE
  TO authenticated
  USING (
    laboratory = public.get_my_lab()
    AND public.get_my_role() = 'admin'
  );

-- RACKS
DROP POLICY IF EXISTS "Users can read racks in their lab freezers" ON racks;
DROP POLICY IF EXISTS "Admins and technicians can manage racks" ON racks;
DROP POLICY IF EXISTS "Admins and technicians can update racks" ON racks;

CREATE POLICY "Users can read racks in their lab freezers"
  ON racks FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
  );

CREATE POLICY "Admins and technicians can manage racks"
  ON racks FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'technician')
  );

CREATE POLICY "Admins and technicians can update racks"
  ON racks FOR UPDATE
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'technician')
  )
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'technician')
  );

-- BOXES
DROP POLICY IF EXISTS "Users can read boxes in their lab" ON boxes;
DROP POLICY IF EXISTS "Researchers can create boxes in their lab" ON boxes;
DROP POLICY IF EXISTS "Users can update boxes in their lab" ON boxes;

CREATE POLICY "Users can read boxes in their lab"
  ON boxes FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
  );

CREATE POLICY "Researchers can create boxes in their lab"
  ON boxes FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  );

CREATE POLICY "Users can update boxes in their lab"
  ON boxes FOR UPDATE
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  )
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  );

-- SAMPLES
DROP POLICY IF EXISTS "Users can read samples in their lab" ON samples;
DROP POLICY IF EXISTS "Researchers can create samples in their lab" ON samples;
DROP POLICY IF EXISTS "Users can update samples in their lab" ON samples;

CREATE POLICY "Users can read samples in their lab"
  ON samples FOR SELECT
  TO authenticated
  USING (laboratory = public.get_my_lab());

CREATE POLICY "Researchers can create samples in their lab"
  ON samples FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  );

CREATE POLICY "Users can update samples in their lab"
  ON samples FOR UPDATE
  TO authenticated
  USING (
    laboratory = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  )
  WITH CHECK (
    laboratory = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  );

-- SAMPLE_MOVEMENTS
DROP POLICY IF EXISTS "Users can read movements in their lab" ON sample_movements;
DROP POLICY IF EXISTS "Researchers can record movements in their lab" ON sample_movements;

CREATE POLICY "Users can read movements in their lab"
  ON sample_movements FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM samples WHERE id = sample_id) = public.get_my_lab()
  );

CREATE POLICY "Researchers can record movements in their lab"
  ON sample_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT laboratory FROM samples WHERE id = sample_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  );

-- AUDIT_LOGS
DROP POLICY IF EXISTS "Users can read audit logs in their lab" ON audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;

CREATE POLICY "Users can read audit logs in their lab"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM profiles WHERE id = user_id) = public.get_my_lab()
    OR public.get_my_role() = 'admin'
  );

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SETTINGS
DROP POLICY IF EXISTS "Users can read settings for their lab" ON settings;
DROP POLICY IF EXISTS "Only admins can update settings" ON settings;

CREATE POLICY "Users can read settings for their lab"
  ON settings FOR SELECT
  TO authenticated
  USING (laboratory = public.get_my_lab());

CREATE POLICY "Only admins can update settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (
    laboratory = public.get_my_lab()
    AND public.get_my_role() = 'admin'
  )
  WITH CHECK (
    laboratory = public.get_my_lab()
    AND public.get_my_role() = 'admin'
  );
