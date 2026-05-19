/*
  Fix box occupancy: count distinct in-grid cells only.
  Recalculate when box dimensions change.
  Allow lab users to delete racks.
*/

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

  UPDATE public.boxes b
  SET occupancy = COALESCE((
    SELECT COUNT(*)::INTEGER
    FROM (
      SELECT DISTINCT s.position_row, s.position_column
      FROM public.samples s
      WHERE s.box_id = b.id
        AND s.deleted_at IS NULL
        AND s.position_row IS NOT NULL
        AND s.position_column IS NOT NULL
        AND s.position_row BETWEEN 1 AND b.rows
        AND s.position_column BETWEEN 1 AND b.columns
    ) placed
  ), 0)
  WHERE b.id = target_box_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_box_occupancy_on_box_resize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.rows IS DISTINCT FROM NEW.rows OR OLD.columns IS DISTINCT FROM NEW.columns THEN
    PERFORM public.recalculate_box_occupancy(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cryovault_recalc_occupancy_on_box_resize ON public.boxes;
CREATE TRIGGER cryovault_recalc_occupancy_on_box_resize
  AFTER UPDATE OF rows, columns ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION public.sync_box_occupancy_on_box_resize();

-- Recalculate all boxes with corrected rule
UPDATE public.boxes b
SET occupancy = COALESCE((
  SELECT COUNT(*)::INTEGER
  FROM (
    SELECT DISTINCT s.position_row, s.position_column
    FROM public.samples s
    WHERE s.box_id = b.id
      AND s.deleted_at IS NULL
      AND s.position_row IS NOT NULL
      AND s.position_column IS NOT NULL
      AND s.position_row BETWEEN 1 AND b.rows
      AND s.position_column BETWEEN 1 AND b.columns
  ) placed
), 0);

DROP POLICY IF EXISTS "Lab users can delete racks" ON racks;
CREATE POLICY "Lab users can delete racks"
  ON racks FOR DELETE
  TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
  );
