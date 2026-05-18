-- Add laboratory management and a super_admin role for cross-lab user administration.

-- 1. Allow the new role.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'researcher', 'technician', 'read_only'));

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_laboratory()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT laboratory FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  pending_invite RECORD;
  profile_laboratory TEXT;
  profile_role TEXT;
BEGIN
  SELECT role, laboratory
    INTO pending_invite
  FROM public.invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  profile_laboratory := COALESCE(
    NEW.raw_user_meta_data->>'laboratory',
    pending_invite.laboratory
  );
  profile_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    pending_invite.role
  );

  IF profile_laboratory IS NULL OR trim(profile_laboratory) = '' THEN
    RAISE EXCEPTION 'User registration requires an invitation with a laboratory';
  END IF;

  IF profile_role NOT IN ('super_admin', 'admin', 'researcher', 'technician', 'read_only') THEN
    RAISE EXCEPTION 'Invalid invited role';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, laboratory, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    profile_laboratory,
    profile_role
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Laboratories catalog. The slug is the stable value stored in existing laboratory columns.
CREATE TABLE IF NOT EXISTS laboratories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE laboratories ENABLE ROW LEVEL SECURITY;

-- 3. Backfill current laboratory values from existing lab-scoped data.
INSERT INTO laboratories (name, slug)
SELECT lab, lab
FROM (
  SELECT laboratory AS lab FROM profiles
  UNION
  SELECT laboratory AS lab FROM freezers
  UNION
  SELECT laboratory AS lab FROM samples
  UNION
  SELECT laboratory AS lab FROM settings
  UNION
  SELECT laboratory AS lab FROM invites
) labs
WHERE lab IS NOT NULL AND trim(lab) <> ''
ON CONFLICT (slug) DO NOTHING;

-- 4. Replace profile policies that allowed lab admins to assign any role in their lab.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles in their lab" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their lab" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.current_user_role()
    AND laboratory = public.current_user_laboratory()
  );

CREATE POLICY "Admins can read profiles in their lab"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND role <> 'super_admin'
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY "Super admins can read lab admin profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'super_admin'
    AND role IN ('admin', 'super_admin')
  );

CREATE POLICY "Admins can update non-super profiles in their lab"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND role <> 'super_admin'
    AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    laboratory = public.current_user_laboratory()
    AND role <> 'super_admin'
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY "Super admins can update lab admin profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'super_admin'
    AND role = 'admin'
  )
  WITH CHECK (
    public.current_user_role() = 'super_admin'
    AND role = 'admin'
  );

-- 5. Laboratory catalog policies.
DROP POLICY IF EXISTS "Users can read own laboratory" ON laboratories;
DROP POLICY IF EXISTS "Super admins can read laboratories" ON laboratories;
DROP POLICY IF EXISTS "Super admins can create laboratories" ON laboratories;
DROP POLICY IF EXISTS "Super admins can update laboratories" ON laboratories;

CREATE POLICY "Users can read own laboratory"
  ON laboratories FOR SELECT
  TO authenticated
  USING (slug = public.current_user_laboratory());

CREATE POLICY "Super admins can read laboratories"
  ON laboratories FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'super_admin');

CREATE POLICY "Super admins can create laboratories"
  ON laboratories FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin');

CREATE POLICY "Super admins can update laboratories"
  ON laboratories FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');

-- 6. Lab-scoped invites. Super admins can manage all; lab admins only their lab.
DROP POLICY IF EXISTS "Admins can view invites" ON invites;
DROP POLICY IF EXISTS "Admins can insert invites" ON invites;
DROP POLICY IF EXISTS "Admins can update invites" ON invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON invites;

CREATE POLICY "Admins can view invites in their lab"
  ON invites FOR SELECT
  TO authenticated
  USING (
    (
      public.current_user_role() = 'super_admin'
      AND role = 'admin'
    )
    OR (
      laboratory = public.current_user_laboratory()
      AND public.current_user_role() = 'admin'
    )
  );

CREATE POLICY "Admins can insert invites in their lab"
  ON invites FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.current_user_role() = 'super_admin'
      AND role = 'admin'
    )
    OR (
      laboratory = public.current_user_laboratory()
      AND role <> 'super_admin'
      AND public.current_user_role() = 'admin'
    )
  );

CREATE POLICY "Admins can update invites in their lab"
  ON invites FOR UPDATE
  TO authenticated
  USING (
    (
      public.current_user_role() = 'super_admin'
      AND role = 'admin'
    )
    OR (
      laboratory = public.current_user_laboratory()
      AND public.current_user_role() = 'admin'
    )
  )
  WITH CHECK (
    (
      public.current_user_role() = 'super_admin'
      AND role = 'admin'
    )
    OR (
      laboratory = public.current_user_laboratory()
      AND role <> 'super_admin'
      AND public.current_user_role() = 'admin'
    )
  );

CREATE POLICY "Admins can delete invites in their lab"
  ON invites FOR DELETE
  TO authenticated
  USING (
    (
      public.current_user_role() = 'super_admin'
      AND role = 'admin'
    )
    OR (
      laboratory = public.current_user_laboratory()
      AND public.current_user_role() = 'admin'
    )
  );

-- 7. Permission overrides remain lab-scoped for lab admins only.
DROP POLICY IF EXISTS "Admins can view permission overrides in their lab" ON user_permissions;
DROP POLICY IF EXISTS "Admins can insert permission overrides" ON user_permissions;
DROP POLICY IF EXISTS "Admins can update permission overrides" ON user_permissions;
DROP POLICY IF EXISTS "Admins can delete permission overrides" ON user_permissions;

CREATE POLICY "Admins can view permission overrides in their lab"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY "Admins can insert permission overrides"
  ON user_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY "Admins can update permission overrides"
  ON user_permissions FOR UPDATE
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY "Admins can delete permission overrides"
  ON user_permissions FOR DELETE
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  );

-- 8. Keep settings lab-scoped for lab admins.
DROP POLICY IF EXISTS "Only admins can update settings" ON settings;
DROP POLICY IF EXISTS "Only admins can insert settings" ON settings;

CREATE POLICY "Only lab admins can update settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  )
  WITH CHECK (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  );

CREATE POLICY "Only lab admins can insert settings"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() = 'admin'
  );

-- 9. Super admins are organizational admins only; keep scientific data scoped to lab users.
DROP POLICY IF EXISTS "Users can read freezers in their lab" ON freezers;
DROP POLICY IF EXISTS "Users can read racks in their lab freezers" ON racks;
DROP POLICY IF EXISTS "Users can read boxes in their lab" ON boxes;
DROP POLICY IF EXISTS "Users can read samples in their lab" ON samples;
DROP POLICY IF EXISTS "Users can read movements in their lab" ON sample_movements;
DROP POLICY IF EXISTS "Users can read audit logs in their lab" ON audit_logs;
DROP POLICY IF EXISTS "Users can read settings for their lab" ON settings;

CREATE POLICY "Users can read freezers in their lab"
  ON freezers FOR SELECT
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() <> 'super_admin'
  );

CREATE POLICY "Users can read racks in their lab freezers"
  ON racks FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
    AND public.current_user_role() <> 'super_admin'
  );

CREATE POLICY "Users can read boxes in their lab"
  ON boxes FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
    AND public.current_user_role() <> 'super_admin'
  );

CREATE POLICY "Users can read samples in their lab"
  ON samples FOR SELECT
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() <> 'super_admin'
  );

CREATE POLICY "Users can read movements in their lab"
  ON sample_movements FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM samples WHERE id = sample_id) = public.current_user_laboratory()
    AND public.current_user_role() <> 'super_admin'
  );

CREATE POLICY "Users can read audit logs in their lab"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR (
      (SELECT laboratory FROM profiles WHERE id = user_id) = public.current_user_laboratory()
      AND public.current_user_role() <> 'super_admin'
    )
  );

CREATE POLICY "Users can read settings for their lab"
  ON settings FOR SELECT
  TO authenticated
  USING (
    laboratory = public.current_user_laboratory()
    AND public.current_user_role() <> 'super_admin'
  );
