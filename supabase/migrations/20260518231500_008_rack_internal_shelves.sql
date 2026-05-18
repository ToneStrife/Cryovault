/*
  # Rack internal shelves

  Extends freezer rack placement so a freezer shelf can contain optional racks,
  and each rack can optionally expose its own numbered shelves.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'racks' AND column_name = 'description'
  ) THEN
    ALTER TABLE racks ADD COLUMN description TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'racks' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE racks ADD COLUMN image_url TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'racks' AND column_name = 'shelf_count'
  ) THEN
    ALTER TABLE racks ADD COLUMN shelf_count INTEGER NOT NULL DEFAULT 1 CHECK (shelf_count > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'racks' AND column_name = 'slots_per_shelf'
  ) THEN
    ALTER TABLE racks ADD COLUMN slots_per_shelf INTEGER NOT NULL DEFAULT 5 CHECK (slots_per_shelf > 0);
  END IF;
END $$;

UPDATE racks
SET slots_per_shelf = COALESCE(NULLIF(slot_count, 0), NULLIF(columns, 0), slots_per_shelf, 5)
WHERE slots_per_shelf IS NULL OR slots_per_shelf = 5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boxes' AND column_name = 'rack_shelf_number'
  ) THEN
    ALTER TABLE boxes ADD COLUMN rack_shelf_number INTEGER CHECK (rack_shelf_number IS NULL OR rack_shelf_number > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_boxes_rack_shelf_number ON boxes(rack_id, rack_shelf_number);
