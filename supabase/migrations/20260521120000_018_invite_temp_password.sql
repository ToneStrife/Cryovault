-- Store provisional password server-side (readable only via Edge Function service role).

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS temporary_password text DEFAULT NULL;

-- Clear stored password when onboarding completes.
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
  SET
    accepted_at = NOW(),
    temporary_password = NULL
  WHERE lower(email) = lower(user_email)
    AND accepted_at IS NULL;
END;
$$;
