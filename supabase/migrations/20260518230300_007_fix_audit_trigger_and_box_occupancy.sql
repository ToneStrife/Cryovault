/*
  # Fix audit trigger field assumptions and box occupancy consistency

  Replaces older audit triggers that may reference table-specific columns such as
  OLD.box_id, then installs a generic JSONB-based audit trigger. Also moves box
  occupancy maintenance into the database so sample placement changes stay
  consistent without a second app-side write.
*/

-- Remove previous audit triggers on app tables, including unversioned triggers
-- whose functions insert into audit_logs or reference the problematic OLD.box_id.
DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT t.tgname, c.relname AS table_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND c.relname = ANY (ARRAY['profiles', 'freezers', 'racks', 'boxes', 'samples', 'settings'])
      AND (
        t.tgname ILIKE '%audit%'
        OR p.proname ILIKE '%audit%'
        OR pg_get_functiondef(p.oid) ILIKE '%audit_logs%'
        OR pg_get_functiondef(p.oid) ILIKE '%OLD.box_id%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_record.tgname, trigger_record.table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity_type_value TEXT;
  entity_id_value UUID;
  action_value TEXT;
  old_values_value JSONB;
  new_values_value JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  entity_type_value := CASE TG_TABLE_NAME
    WHEN 'profiles' THEN 'profile'
    WHEN 'freezers' THEN 'freezer'
    WHEN 'racks' THEN 'rack'
    WHEN 'boxes' THEN 'box'
    WHEN 'samples' THEN 'sample'
    WHEN 'settings' THEN 'settings'
    ELSE NULL
  END;

  IF entity_type_value IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  action_value := CASE TG_OP
    WHEN 'INSERT' THEN 'create'
    WHEN 'UPDATE' THEN 'update'
    WHEN 'DELETE' THEN 'delete'
  END;

  IF TG_OP = 'INSERT' THEN
    entity_id_value := NEW.id;
    old_values_value := NULL;
    new_values_value := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    entity_id_value := NEW.id;
    old_values_value := to_jsonb(OLD);
    new_values_value := to_jsonb(NEW);
  ELSE
    entity_id_value := OLD.id;
    old_values_value := to_jsonb(OLD);
    new_values_value := NULL;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, old_values, new_values)
  VALUES (auth.uid(), entity_type_value, entity_id_value, action_value, old_values_value, new_values_value);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cryovault_audit_profiles ON public.profiles;
CREATE TRIGGER cryovault_audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS cryovault_audit_freezers ON public.freezers;
CREATE TRIGGER cryovault_audit_freezers
  AFTER INSERT OR UPDATE OR DELETE ON public.freezers
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS cryovault_audit_racks ON public.racks;
CREATE TRIGGER cryovault_audit_racks
  AFTER INSERT OR UPDATE OR DELETE ON public.racks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS cryovault_audit_boxes ON public.boxes;
CREATE TRIGGER cryovault_audit_boxes
  AFTER INSERT OR UPDATE OR DELETE ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS cryovault_audit_samples ON public.samples;
CREATE TRIGGER cryovault_audit_samples
  AFTER INSERT OR UPDATE OR DELETE ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS cryovault_audit_settings ON public.settings;
CREATE TRIGGER cryovault_audit_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE OR REPLACE FUNCTION public.recalculate_box_occupancy(target_box_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_box_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.boxes
  SET occupancy = (
    SELECT COUNT(*)::INTEGER
    FROM public.samples
    WHERE box_id = target_box_id
      AND deleted_at IS NULL
  )
  WHERE id = target_box_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_box_occupancy_from_samples()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_box_occupancy(NEW.box_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.box_id IS DISTINCT FROM NEW.box_id
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
      PERFORM public.recalculate_box_occupancy(OLD.box_id);
      PERFORM public.recalculate_box_occupancy(NEW.box_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.recalculate_box_occupancy(OLD.box_id);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS cryovault_sync_box_occupancy ON public.samples;
CREATE TRIGGER cryovault_sync_box_occupancy
  AFTER INSERT OR UPDATE OF box_id, deleted_at OR DELETE ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.sync_box_occupancy_from_samples();

-- Backfill existing counters so the app starts from database truth.
UPDATE public.boxes b
SET occupancy = sample_counts.sample_count
FROM (
  SELECT b_inner.id, COUNT(s.id)::INTEGER AS sample_count
  FROM public.boxes b_inner
  LEFT JOIN public.samples s
    ON s.box_id = b_inner.id
    AND s.deleted_at IS NULL
  GROUP BY b_inner.id
) AS sample_counts
WHERE b.id = sample_counts.id;
