-- Provisioned users: invite stays pending until password is changed on first login.

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

-- Mark invite accepted when user completes first-login password change.
CREATE OR REPLACE FUNCTION public.complete_user_onboarding()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  user_email := auth.jwt() ->> 'email';
  IF user_email IS NULL OR trim(user_email) = '' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.invites
  SET accepted_at = NOW()
  WHERE lower(email) = lower(user_email)
    AND accepted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_user_onboarding() TO authenticated;
