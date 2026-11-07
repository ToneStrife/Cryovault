-- 019: Endurecimiento de seguridad e integridad (auditoría 2026-11-07).
--
-- Resuelve:
--   C1  handle_new_user confiaba en raw_user_meta_data (role/laboratory), que
--       cualquier cliente puede enviar en /auth/v1/signup: autoprovisión como super_admin.
--   A1  invites.temporary_password era legible por PostgREST para admins del lab.
--   A2  audit_logs: un admin leía los logs de TODOS los laboratorios.
--   A4  "Users can insert own profile" permitía elegir rol y laboratorio.
--   A3  FKs a auth.users sin ON DELETE impedían borrar usuarios (auth.admin.deleteUser).
--   M2  Una muestra podía apuntar a una caja de otro laboratorio.
--   M4  Storage: sin política UPDATE (las subidas con upsert fallaban).
--   M7  updated_at nunca se actualizaba en BD.
--   Índices que faltaban para las consultas del cliente.
--
-- Además de aplicar esta migración: desactivar "Allow new users to sign up"
-- en Authentication > Providers > Email del dashboard de Supabase.

-- ---------------------------------------------------------------------------
-- 1. handle_new_user: rol y laboratorio SOLO desde la invitación pendiente.
--    Los metadatos del usuario solo se usan para full_name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_invite RECORD;
BEGIN
  SELECT role, laboratory
    INTO pending_invite
  FROM public.invites
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF pending_invite.laboratory IS NULL OR trim(pending_invite.laboratory) = '' THEN
    RAISE EXCEPTION 'User registration requires an invitation with a laboratory';
  END IF;

  IF pending_invite.role NOT IN ('super_admin', 'admin', 'researcher', 'technician', 'read_only') THEN
    RAISE EXCEPTION 'Invalid invited role';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, laboratory, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email),
    pending_invite.laboratory,
    pending_invite.role
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Nadie se inserta su propio perfil (lo hace el trigger con SECURITY DEFINER).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- ---------------------------------------------------------------------------
-- 3. audit_logs limitado al laboratorio del usuario (también para admins).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_laboratory(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT laboratory FROM public.profiles WHERE id = p_user
$$;
REVOKE ALL ON FUNCTION public.profile_laboratory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_laboratory(uuid) TO authenticated;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can read audit logs in their lab"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() <> 'super_admin'
    AND public.profile_laboratory(user_id) = public.current_user_laboratory()
  );

-- ---------------------------------------------------------------------------
-- 4. invites.temporary_password invisible desde el cliente (solo service role).
--    El cliente debe pedir columnas explícitas (ya no vale select('*')).
-- ---------------------------------------------------------------------------
REVOKE SELECT, UPDATE ON public.invites FROM anon, authenticated;
GRANT SELECT (id, email, role, invited_by, laboratory, created_at, accepted_at)
  ON public.invites TO authenticated;
GRANT UPDATE (email, role, laboratory, accepted_at)
  ON public.invites TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. FKs a auth.users pasan a ON DELETE SET NULL para poder borrar usuarios.
--    (profiles.id mantiene CASCADE.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.conrelid IN (
        'public.freezers'::regclass, 'public.racks'::regclass, 'public.boxes'::regclass,
        'public.samples'::regclass, 'public.sample_movements'::regclass,
        'public.audit_logs'::regclass, 'public.invites'::regclass
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', r.tbl, r.attname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.attname
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. (Retirado) Índice único por celda. Varias alícuotas con el mismo código
--    pueden compartir celda de forma legítima, así que la unicidad por posición
--    no se impone en BD. La comprobación sigue en el cliente (assertCellFree).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 7. La caja de una muestra debe ser de mi laboratorio; el rack de una caja,
--    de su mismo congelador. Políticas RESTRICTIVAS (se suman a las existentes).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.box_in_my_lab(p_box uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.boxes b
    JOIN public.freezers f ON f.id = b.freezer_id
    WHERE b.id = p_box
      AND f.laboratory = public.current_user_laboratory()
  )
$$;
REVOKE ALL ON FUNCTION public.box_in_my_lab(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.box_in_my_lab(uuid) TO authenticated;

DROP POLICY IF EXISTS "Sample box must belong to user lab (insert)" ON public.samples;
CREATE POLICY "Sample box must belong to user lab (insert)"
  ON public.samples AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK (box_id IS NULL OR public.box_in_my_lab(box_id));

DROP POLICY IF EXISTS "Sample box must belong to user lab (update)" ON public.samples;
CREATE POLICY "Sample box must belong to user lab (update)"
  ON public.samples AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (box_id IS NULL OR public.box_in_my_lab(box_id));

DROP POLICY IF EXISTS "Box rack must belong to same freezer (insert)" ON public.boxes;
CREATE POLICY "Box rack must belong to same freezer (insert)"
  ON public.boxes AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    rack_id IS NULL
    OR EXISTS (SELECT 1 FROM public.racks r WHERE r.id = rack_id AND r.freezer_id = boxes.freezer_id)
  );

DROP POLICY IF EXISTS "Box rack must belong to same freezer (update)" ON public.boxes;
CREATE POLICY "Box rack must belong to same freezer (update)"
  ON public.boxes AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    rack_id IS NULL
    OR EXISTS (SELECT 1 FROM public.racks r WHERE r.id = rack_id AND r.freezer_id = boxes.freezer_id)
  );

-- ---------------------------------------------------------------------------
-- 8. Storage: permitir UPDATE (upsert) en cryo-images a usuarios autenticados.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users can update cryo images'
  ) THEN
    CREATE POLICY "Authenticated users can update cryo images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'cryo-images')
      WITH CHECK (bucket_id = 'cryo-images');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8b. recalculate_box_occupancy solo la llaman triggers SECURITY DEFINER:
--     sin EXECUTE para anon/authenticated (evita RPC arbitrario sobre cualquier caja).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.recalculate_box_occupancy(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.recalculate_box_occupancy(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. updated_at automático en todas las tablas que lo tienen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Índices para las consultas habituales del cliente.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_racks_freezer_id ON public.racks (freezer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_samples_lab_active ON public.samples (laboratory) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_samples_box_active ON public.samples (box_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_boxes_freezer_active ON public.boxes (freezer_id) WHERE deleted_at IS NULL;
