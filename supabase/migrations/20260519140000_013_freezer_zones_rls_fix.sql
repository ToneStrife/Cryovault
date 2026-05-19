/*
  Align freezer_zones / rack_zones RLS with migration 011 (current_user_laboratory).
  Allow researchers to manage racks. Backfill missing zone rows.
*/

DROP POLICY IF EXISTS "Users can read freezer zones in their lab" ON freezer_zones;
DROP POLICY IF EXISTS "Users can manage freezer zones in their lab" ON freezer_zones;
DROP POLICY IF EXISTS "Users can read rack zones in their lab" ON rack_zones;
DROP POLICY IF EXISTS "Users can manage rack zones in their lab" ON rack_zones;

CREATE POLICY "Users can read freezer zones in their lab"
  ON freezer_zones FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() <> 'super_admin'
    AND (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
  );

CREATE POLICY "Lab users can manage freezer zones"
  ON freezer_zones FOR ALL
  TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
  )
  WITH CHECK (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
  );

CREATE POLICY "Users can read rack zones in their lab"
  ON rack_zones FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() <> 'super_admin'
    AND (SELECT laboratory FROM freezers WHERE id = (SELECT freezer_id FROM racks WHERE id = rack_id))
      = public.current_user_laboratory()
  );

CREATE POLICY "Lab users can manage rack zones"
  ON rack_zones FOR ALL
  TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = (SELECT freezer_id FROM racks WHERE id = rack_id))
      = public.current_user_laboratory()
  )
  WITH CHECK (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = (SELECT freezer_id FROM racks WHERE id = rack_id))
      = public.current_user_laboratory()
  );

-- Backfill zones for freezers that have none (e.g. created after migration 009).
INSERT INTO freezer_zones (freezer_id, zone_number, name, sort_order)
SELECT f.id, gs.n, 'Zona ' || gs.n, gs.n
FROM freezers f
CROSS JOIN generate_series(1, GREATEST(COALESCE(f.shelf_count, 3), 1)) AS gs(n)
WHERE NOT EXISTS (
  SELECT 1 FROM freezer_zones fz WHERE fz.freezer_id = f.id
)
ON CONFLICT (freezer_id, zone_number) DO NOTHING;

INSERT INTO rack_zones (rack_id, zone_number, name, sort_order)
SELECT r.id, gs.n, 'Zona ' || gs.n, gs.n
FROM racks r
CROSS JOIN generate_series(1, GREATEST(COALESCE(r.shelf_count, 1), 1)) AS gs(n)
WHERE NOT EXISTS (
  SELECT 1 FROM rack_zones rz WHERE rz.rack_id = r.id
)
ON CONFLICT (rack_id, zone_number) DO NOTHING;

-- Researchers may create/update racks (was admin+technician only).
DROP POLICY IF EXISTS "Admins and technicians can manage racks" ON racks;
DROP POLICY IF EXISTS "Admins and technicians can update racks" ON racks;

CREATE POLICY "Lab users can insert racks"
  ON racks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
  );

CREATE POLICY "Lab users can update racks"
  ON racks FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
  )
  WITH CHECK (
    public.current_user_role() IN ('admin', 'researcher', 'technician')
    AND (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.current_user_laboratory()
  );
