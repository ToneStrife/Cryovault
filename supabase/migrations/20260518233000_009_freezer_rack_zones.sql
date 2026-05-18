/*
  # Freezer and rack zone metadata

  Adds named, reorderable zones for freezer shelves and rack internal shelves.
  Drops the legacy unique constraint that allowed only one rack per freezer shelf.
*/

ALTER TABLE racks DROP CONSTRAINT IF EXISTS racks_freezer_id_shelf_number_key;

CREATE TABLE IF NOT EXISTS freezer_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freezer_id UUID NOT NULL REFERENCES freezers(id) ON DELETE CASCADE,
  zone_number INTEGER NOT NULL CHECK (zone_number > 0),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(freezer_id, zone_number)
);

CREATE TABLE IF NOT EXISTS rack_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id UUID NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  zone_number INTEGER NOT NULL CHECK (zone_number > 0),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rack_id, zone_number)
);

CREATE INDEX IF NOT EXISTS idx_freezer_zones_freezer_id ON freezer_zones(freezer_id);
CREATE INDEX IF NOT EXISTS idx_freezer_zones_sort_order ON freezer_zones(freezer_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_rack_zones_rack_id ON rack_zones(rack_id);
CREATE INDEX IF NOT EXISTS idx_rack_zones_sort_order ON rack_zones(rack_id, sort_order);

INSERT INTO freezer_zones (freezer_id, zone_number, name, sort_order)
SELECT f.id, gs.n, 'Zona ' || gs.n, gs.n
FROM freezers f
CROSS JOIN generate_series(1, GREATEST(COALESCE(f.shelf_count, 3), 1)) AS gs(n)
ON CONFLICT (freezer_id, zone_number) DO NOTHING;

INSERT INTO rack_zones (rack_id, zone_number, name, sort_order)
SELECT r.id, gs.n, 'Zona ' || gs.n, gs.n
FROM racks r
CROSS JOIN generate_series(1, GREATEST(COALESCE(r.shelf_count, 1), 1)) AS gs(n)
ON CONFLICT (rack_id, zone_number) DO NOTHING;

ALTER TABLE freezer_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE rack_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read freezer zones in their lab"
  ON freezer_zones FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
  );

CREATE POLICY "Users can manage freezer zones in their lab"
  ON freezer_zones FOR ALL
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  )
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = freezer_id) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  );

CREATE POLICY "Users can read rack zones in their lab"
  ON rack_zones FOR SELECT
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = (SELECT freezer_id FROM racks WHERE id = rack_id)) = public.get_my_lab()
  );

CREATE POLICY "Users can manage rack zones in their lab"
  ON rack_zones FOR ALL
  TO authenticated
  USING (
    (SELECT laboratory FROM freezers WHERE id = (SELECT freezer_id FROM racks WHERE id = rack_id)) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  )
  WITH CHECK (
    (SELECT laboratory FROM freezers WHERE id = (SELECT freezer_id FROM racks WHERE id = rack_id)) = public.get_my_lab()
    AND public.get_my_role() IN ('admin', 'researcher', 'technician')
  );
