/*
  Soft delete for boxes (mirrors samples pattern).
  Archive/delete is done via UPDATE, not physical DELETE.
*/

ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS boxes_deleted_at_idx ON public.boxes(deleted_at) WHERE deleted_at IS NULL;

-- Align box UPDATE policy with current_user_* helpers (migration 011 kept SELECT only).
DROP POLICY IF EXISTS "Users can update boxes in their lab" ON public.boxes;

CREATE POLICY "Users can update boxes in their lab"
  ON public.boxes FOR UPDATE
  TO authenticated
  USING (
    (SELECT laboratory FROM public.freezers WHERE id = freezer_id) = public.current_user_laboratory()
    AND public.current_user_role() IN ('admin', 'researcher', 'technician')
  )
  WITH CHECK (
    (SELECT laboratory FROM public.freezers WHERE id = freezer_id) = public.current_user_laboratory()
    AND public.current_user_role() IN ('admin', 'researcher', 'technician')
  );
