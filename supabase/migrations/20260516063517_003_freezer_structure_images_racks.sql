/*
  # Freezer Structure, Images & Sample Code Flexibility

  ## Summary
  This migration extends the CryoVault schema to support:
  1. Optional image thumbnails on freezers and boxes
  2. Structured internal freezer layout (shelves + racks with slot counts)
  3. Direct shelf placement for boxes (without a rack)
  4. Duplicate sample codes (for aliquots)

  ## Changes

  ### freezers table
  - Add `image_url` TEXT — optional photo URL stored in Supabase Storage

  ### boxes table
  - Add `image_url` TEXT — optional photo URL
  - Add `shelf_number` INTEGER — which shelf (balda) this box sits on; NULL means unassigned

  ### racks table
  - Add `slot_count` INTEGER DEFAULT 5 — how many box positions this rack has

  ### freezers table (structural)
  - Add `shelf_count` INTEGER DEFAULT 3 — number of physical shelves in this freezer

  ### samples table
  - Drop UNIQUE constraint on `sample_code` — aliquots from the same sample share the same code
  - The combination (box_id, position_row, position_column) remains the real locator

  ## Security
  - No new RLS policies needed; all new columns are covered by existing table-level policies
*/

-- Add image_url to freezers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'freezers' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE freezers ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Add shelf_count to freezers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'freezers' AND column_name = 'shelf_count'
  ) THEN
    ALTER TABLE freezers ADD COLUMN shelf_count INTEGER NOT NULL DEFAULT 3;
  END IF;
END $$;

-- Add image_url to boxes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boxes' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE boxes ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Add shelf_number to boxes (NULL = not assigned to a shelf)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'boxes' AND column_name = 'shelf_number'
  ) THEN
    ALTER TABLE boxes ADD COLUMN shelf_number INTEGER;
  END IF;
END $$;

-- Add slot_count to racks (default 5 positions per rack)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'racks' AND column_name = 'slot_count'
  ) THEN
    ALTER TABLE racks ADD COLUMN slot_count INTEGER NOT NULL DEFAULT 5;
  END IF;
END $$;

-- Drop UNIQUE constraint on samples.sample_code to allow aliquots with the same code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'samples'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%sample_code%'
  ) THEN
    ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_sample_code_key;
  END IF;
END $$;
