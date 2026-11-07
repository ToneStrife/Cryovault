-- 020: Avisos del linter de Supabase tras la auditoría (2026-11-07).
--
-- - search_path fijo en funciones que no lo tenían.
-- - Funciones huérfanas de una migración antigua (007_audit_triggers, no está en
--   el repo) que ningún trigger usa: se eliminan.
-- - Funciones de trigger y SECURITY DEFINER sin EXECUTE para anon (y para
--   authenticated cuando son solo de trigger). Las auxiliares que usan las
--   políticas (current_user_*, get_my_*, box_in_my_lab, profile_laboratory)
--   deben seguir siendo ejecutables por authenticated.
-- - auth.uid() envuelto en (select ...) en las políticas que lo evaluaban por fila.
-- - Índices para claves foráneas sin cubrir.

-- 1. search_path
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 2. Funciones huérfanas (no referenciadas por ningún trigger ni por el código).
DROP FUNCTION IF EXISTS public.log_sample_audit();
DROP FUNCTION IF EXISTS public.on_sample_change_update_occupancy();
DROP FUNCTION IF EXISTS public.log_audit_row();
DROP FUNCTION IF EXISTS public.map_audit_action(text);
DROP FUNCTION IF EXISTS public.map_audit_entity_type(text);

-- 3. Permisos de ejecución.
DO $$
DECLARE f TEXT;
BEGIN
  -- Solo de trigger: nadie debería llamarlas por RPC.
  FOREACH f IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.log_audit_event()',
    'public.sync_box_occupancy_from_samples()',
    'public.sync_box_occupancy_on_box_resize()',
    'public.set_updated_at()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    END IF;
  END LOOP;

  -- Usadas por políticas o por la app con sesión: fuera solo anon.
  FOREACH f IN ARRAY ARRAY[
    'public.complete_user_onboarding()',
    'public.current_user_role()',
    'public.current_user_laboratory()',
    'public.get_my_lab()',
    'public.get_my_role()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END IF;
  END LOOP;
END $$;

-- 4. auth.uid() evaluado una vez por consulta en vez de por fila.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can read own profile') THEN
    ALTER POLICY "Users can read own profile" ON public.profiles
      USING ((select auth.uid()) = id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    ALTER POLICY "Users can update own profile" ON public.profiles
      USING ((select auth.uid()) = id)
      WITH CHECK (
        (select auth.uid()) = id
        AND role = public.current_user_role()
        AND laboratory = public.current_user_laboratory()
      );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'System can insert audit logs') THEN
    ALTER POLICY "System can insert audit logs" ON public.audit_logs
      WITH CHECK (user_id = (select auth.uid()));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_permissions' AND policyname = 'Users can view own permission overrides') THEN
    ALTER POLICY "Users can view own permission overrides" ON public.user_permissions
      USING (user_id = (select auth.uid()));
  END IF;
END $$;

-- 5. Índices para claves foráneas sin cubrir.
CREATE INDEX IF NOT EXISTS idx_boxes_created_by ON public.boxes (created_by);
CREATE INDEX IF NOT EXISTS idx_boxes_deleted_by ON public.boxes (deleted_by);
CREATE INDEX IF NOT EXISTS idx_freezers_created_by ON public.freezers (created_by);
CREATE INDEX IF NOT EXISTS idx_invites_invited_by ON public.invites (invited_by);
CREATE INDEX IF NOT EXISTS idx_laboratories_created_by ON public.laboratories (created_by);
CREATE INDEX IF NOT EXISTS idx_racks_created_by ON public.racks (created_by);
CREATE INDEX IF NOT EXISTS idx_sample_movements_from_box_id ON public.sample_movements (from_box_id);
CREATE INDEX IF NOT EXISTS idx_sample_movements_to_box_id ON public.sample_movements (to_box_id);
CREATE INDEX IF NOT EXISTS idx_sample_movements_moved_by ON public.sample_movements (moved_by);
