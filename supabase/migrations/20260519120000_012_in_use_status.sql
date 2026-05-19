/*
  # In-use status for samples and boxes + occupancy by grid position

  - Adds `in_use` to configurable sample/box status lists
  - Occupancy counts only samples with an assigned grid position
  - Trigger syncs on position column changes
*/

-- Backfill settings with in_use status
UPDATE settings
SET
  sample_statuses = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(sample_statuses, ARRAY['active', 'used', 'discarded', 'archived', 'contaminated']) || ARRAY['in_use']
      )
    )
  ),
  box_statuses = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(box_statuses, ARRAY['active', 'full', 'archived', 'retired']) || ARRAY['in_use']
      )
    )
  );

ALTER TABLE settings
  ALTER COLUMN sample_statuses SET DEFAULT ARRAY['active', 'in_use', 'used', 'discarded', 'archived', 'contaminated'],
  ALTER COLUMN box_statuses SET DEFAULT ARRAY['active', 'full', 'in_use', 'archived', 'retired'];

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
      AND position_row IS NOT NULL
      AND position_column IS NOT NULL
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
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
      OR OLD.position_row IS DISTINCT FROM NEW.position_row
      OR OLD.position_column IS DISTINCT FROM NEW.position_column THEN
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
  AFTER INSERT OR UPDATE OF box_id, deleted_at, position_row, position_column, position_label OR DELETE
  ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.sync_box_occupancy_from_samples();

-- Recalculate all box occupancies with new rule
UPDATE public.boxes b
SET occupancy = sample_counts.sample_count
FROM (
  SELECT b_inner.id, COUNT(s.id)::INTEGER AS sample_count
  FROM public.boxes b_inner
  LEFT JOIN public.samples s
    ON s.box_id = b_inner.id
    AND s.deleted_at IS NULL
    AND s.position_row IS NOT NULL
    AND s.position_column IS NOT NULL
  GROUP BY b_inner.id
) AS sample_counts
WHERE b.id = sample_counts.id;
