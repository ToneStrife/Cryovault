-- 021: Operaciones multi-paso en una sola transacción (auditoría 2026-11-07).
--
-- Hasta ahora el cliente encadenaba varias consultas (actualizar caja, luego
-- cada muestra, luego el movimiento); un fallo a mitad dejaba estado mixto, y la
-- comprobación «celda libre» se hacía con una lectura separada de la escritura
-- (dos usuarios podían ocupar la misma celda a la vez).
--
-- Todas las funciones son SECURITY INVOKER: el RLS sigue aplicándose al usuario
-- que llama. Cada escritura comprueba que afectó a una fila; si el RLS la
-- bloquea, la función falla con un mensaje claro en lugar de no hacer nada.
--
-- NOTA: no se impone unicidad por celda en BD (varias alícuotas pueden
-- compartir celda a propósito). La comprobación de celda libre sigue siendo la
-- misma que hacía el cliente, pero ahora dentro de la transacción y con la caja
-- bloqueada, así que dos colocaciones simultáneas en la misma caja se serializan.

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.position_label(p_row integer, p_col integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT chr(64 + p_row) || p_col::text
$$;

CREATE OR REPLACE FUNCTION public.assert_cell_free(
  p_box uuid,
  p_row integer,
  p_col integer,
  p_exclude uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  occupant uuid;
BEGIN
  -- Bloquea la fila de la caja: dos colocaciones simultáneas en la misma caja
  -- se ejecutan una detrás de otra y la segunda ve la celda ya ocupada.
  PERFORM 1 FROM public.boxes WHERE id = p_box AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada o sin permiso';
  END IF;

  SELECT id INTO occupant
  FROM public.samples
  WHERE box_id = p_box
    AND position_row = p_row
    AND position_column = p_col
    AND deleted_at IS NULL
    AND (p_exclude IS NULL OR id <> p_exclude)
  LIMIT 1;

  IF occupant IS NOT NULL THEN
    RAISE EXCEPTION 'Celda ocupada';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_sample_movement(
  p_sample_id uuid,
  p_from_box uuid,
  p_to_box uuid,
  p_from_position text,
  p_to_position text,
  p_notes text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.sample_movements
    (sample_id, from_box_id, to_box_id, from_position, to_position, moved_by, notes)
  VALUES
    (p_sample_id, p_from_box, p_to_box, p_from_position, p_to_position, auth.uid(), p_notes)
$$;

-- ---------------------------------------------------------------------------
-- Sacar muestras (una o varias). Devuelve un resumen para los avisos de la UI.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_samples(p_sample_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  n integer;
  checked_out integer := 0;
  skipped integer := 0;
  max_thaw_hits integer := 0;
  last_new_thaws integer := 0;
  last_max_thaws integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  FOR s IN
    SELECT id, status, thaw_count, max_thaws, box_id, position_label
    FROM public.samples
    WHERE id = ANY (p_sample_ids) AND deleted_at IS NULL
    FOR UPDATE
  LOOP
    IF s.status = 'in_use' THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    UPDATE public.samples
    SET status = 'in_use',
        thaw_count = thaw_count + 1,
        position_row = NULL,
        position_column = NULL,
        position_label = NULL
    WHERE id = s.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
      RAISE EXCEPTION 'Sin permiso para modificar la muestra';
    END IF;

    PERFORM public.log_sample_movement(s.id, s.box_id, s.box_id, s.position_label, NULL, 'checkout_sample');

    checked_out := checked_out + 1;
    last_new_thaws := s.thaw_count + 1;
    last_max_thaws := s.max_thaws;
    IF s.thaw_count + 1 >= s.max_thaws THEN
      max_thaw_hits := max_thaw_hits + 1;
    END IF;
  END LOOP;

  IF checked_out = 0 THEN
    IF skipped > 0 THEN
      RAISE EXCEPTION 'Ninguna muestra seleccionada puede sacarse (ya están en uso).';
    END IF;
    RAISE EXCEPTION 'No se encontró ninguna muestra';
  END IF;

  RETURN jsonb_build_object(
    'checked_out', checked_out,
    'skipped', skipped,
    'max_thaw_hits', max_thaw_hits,
    'new_thaws', last_new_thaws,
    'max_thaws', last_max_thaws
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Sacar y devolver una caja entera.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_box(p_box_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  n integer;
  sample_count integer := 0;
  warned_new integer := NULL;
  warned_max integer := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  UPDATE public.boxes SET status = 'in_use' WHERE id = p_box_id AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Caja no encontrada o sin permiso';
  END IF;

  FOR s IN
    SELECT id, thaw_count, max_thaws
    FROM public.samples
    WHERE box_id = p_box_id AND deleted_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.samples
    SET status = 'in_use', thaw_count = thaw_count + 1
    WHERE id = s.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
      RAISE EXCEPTION 'Sin permiso para modificar la muestra';
    END IF;
    sample_count := sample_count + 1;
    IF s.thaw_count + 1 >= s.max_thaws THEN
      warned_new := s.thaw_count + 1;
      warned_max := s.max_thaws;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sample_count', sample_count,
    'warned', CASE WHEN warned_new IS NULL THEN NULL
                   ELSE jsonb_build_object('new_thaws', warned_new, 'max_thaws', warned_max) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.return_box(p_box_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  UPDATE public.samples
  SET status = 'active'
  WHERE box_id = p_box_id AND status = 'in_use' AND deleted_at IS NULL;

  UPDATE public.boxes SET status = 'active' WHERE id = p_box_id AND deleted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Caja no encontrada o sin permiso';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Devolver, colocar, transferir, mover y quitar una muestra.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_sample(p_sample_id uuid, p_row integer, p_col integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  n integer;
  label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT id, box_id INTO s FROM public.samples WHERE id = p_sample_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Muestra no encontrada';
  END IF;
  IF s.box_id IS NULL THEN
    RAISE EXCEPTION 'La muestra no está asociada a una caja';
  END IF;

  PERFORM public.assert_cell_free(s.box_id, p_row, p_col, s.id);
  label := public.position_label(p_row, p_col);

  UPDATE public.samples
  SET status = 'active', position_row = p_row, position_column = p_col, position_label = label
  WHERE id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Sin permiso para modificar la muestra';
  END IF;

  PERFORM public.log_sample_movement(s.id, s.box_id, s.box_id, NULL, label, 'return_sample');
END;
$$;

CREATE OR REPLACE FUNCTION public.place_sample(
  p_sample_id uuid,
  p_box_id uuid,
  p_row integer,
  p_col integer,
  p_reason text DEFAULT 'place_sample'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  n integer;
  label text;
  notes text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_reason NOT IN ('place_sample', 'transfer') THEN
    RAISE EXCEPTION 'Motivo no válido';
  END IF;

  SELECT id, box_id, position_label INTO s
  FROM public.samples WHERE id = p_sample_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Muestra no encontrada';
  END IF;

  PERFORM public.assert_cell_free(p_box_id, p_row, p_col, s.id);
  label := public.position_label(p_row, p_col);

  UPDATE public.samples
  SET box_id = p_box_id, position_row = p_row, position_column = p_col, position_label = label, status = 'active'
  WHERE id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Sin permiso para modificar la muestra';
  END IF;

  notes := CASE
    WHEN p_reason = 'place_sample' THEN 'place_sample'
    WHEN s.box_id = p_box_id THEN 'move_position'
    ELSE 'transfer_box'
  END;
  PERFORM public.log_sample_movement(s.id, s.box_id, p_box_id, s.position_label, label, notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.move_sample(p_sample_id uuid, p_row integer, p_col integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  n integer;
  label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT id, box_id, status, position_row, position_column, position_label INTO s
  FROM public.samples WHERE id = p_sample_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Muestra no encontrada';
  END IF;
  IF s.status <> 'active' THEN
    RAISE EXCEPTION 'Solo se pueden mover muestras activas';
  END IF;
  IF s.box_id IS NULL THEN
    RAISE EXCEPTION 'La muestra no está en una caja';
  END IF;
  IF s.position_row = p_row AND s.position_column = p_col THEN
    RETURN;
  END IF;

  PERFORM public.assert_cell_free(s.box_id, p_row, p_col, s.id);
  label := public.position_label(p_row, p_col);

  UPDATE public.samples
  SET position_row = p_row, position_column = p_col, position_label = label
  WHERE id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Sin permiso para modificar la muestra';
  END IF;

  PERFORM public.log_sample_movement(s.id, s.box_id, s.box_id, s.position_label, label, 'move_position');
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_sample_from_box(p_sample_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT id, box_id, status, position_label INTO s
  FROM public.samples WHERE id = p_sample_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Muestra no encontrada';
  END IF;

  UPDATE public.samples
  SET box_id = NULL, position_row = NULL, position_column = NULL, position_label = NULL,
      status = CASE WHEN status = 'in_use' THEN 'active' ELSE status END
  WHERE id = s.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Sin permiso para modificar la muestra';
  END IF;

  PERFORM public.log_sample_movement(s.id, s.box_id, NULL, s.position_label, NULL, 'remove_from_box');
END;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de un usuario: se sustituyen todos sus overrides de una vez.
-- p_overrides: [{"action": "delete_samples", "granted": false}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_user_permissions(
  p_user_id uuid,
  p_laboratory text,
  p_overrides jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF jsonb_typeof(p_overrides) <> 'array' THEN
    RAISE EXCEPTION 'Formato de permisos no válido';
  END IF;

  DELETE FROM public.user_permissions
  WHERE user_id = p_user_id AND laboratory = p_laboratory;

  INSERT INTO public.user_permissions (user_id, laboratory, action, granted)
  SELECT p_user_id, p_laboratory, elem->>'action', COALESCE((elem->>'granted')::boolean, false)
  FROM jsonb_array_elements(p_overrides) AS elem
  WHERE elem->>'action' IS NOT NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución: solo usuarios con sesión.
-- ---------------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.position_label(integer, integer)',
    'public.assert_cell_free(uuid, integer, integer, uuid)',
    'public.log_sample_movement(uuid, uuid, uuid, text, text, text)',
    'public.checkout_samples(uuid[])',
    'public.checkout_box(uuid)',
    'public.return_box(uuid)',
    'public.return_sample(uuid, integer, integer)',
    'public.place_sample(uuid, uuid, integer, integer, text)',
    'public.move_sample(uuid, integer, integer)',
    'public.remove_sample_from_box(uuid)',
    'public.save_user_permissions(uuid, text, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
