-- Migration to allow dynamic configuration of sample types, box types, and statuses

-- 1. Add new columns to settings table to store dynamic lists
ALTER TABLE settings 
ADD COLUMN sample_types TEXT[] DEFAULT ARRAY['tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other'],
ADD COLUMN sample_statuses TEXT[] DEFAULT ARRAY['active', 'used', 'discarded', 'archived', 'contaminated'],
ADD COLUMN box_types TEXT[] DEFAULT ARRAY['standard', 'microtube', 'sample_vial', 'other'],
ADD COLUMN box_statuses TEXT[] DEFAULT ARRAY['active', 'full', 'archived', 'retired'],
ADD COLUMN unit_types TEXT[] DEFAULT ARRAY['mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other'],
ADD COLUMN default_sample_status TEXT DEFAULT 'active',
ADD COLUMN default_box_type TEXT DEFAULT 'standard',
ADD COLUMN default_box_status TEXT DEFAULT 'active',
ADD COLUMN default_units TEXT DEFAULT 'mL';

-- 2. Remove constraints from samples table
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_sample_type_check;
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_status_check;
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_units_check;

-- 3. Remove constraints from boxes table
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_box_type_check;
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_status_check;

-- 4. Ensure admins can create settings rows for their laboratory when none exists yet
CREATE POLICY "Only admins can insert settings"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 4. Update existing settings if they exist to include the defaults
UPDATE settings 
SET 
  sample_types = COALESCE(sample_types, ARRAY['tissue', 'blood', 'serum', 'plasma', 'urine', 'csf', 'saliva', 'dna', 'rna', 'protein', 'other']),
  sample_statuses = COALESCE(sample_statuses, ARRAY['active', 'used', 'discarded', 'archived', 'contaminated']),
  box_types = COALESCE(box_types, ARRAY['standard', 'microtube', 'sample_vial', 'other']),
  box_statuses = COALESCE(box_statuses, ARRAY['active', 'full', 'archived', 'retired']),
  unit_types = COALESCE(unit_types, ARRAY['mL', 'µL', 'mg', 'µg', 'ng', 'mol/L', '%', 'other']),
  default_sample_status = COALESCE(default_sample_status, 'active'),
  default_box_type = COALESCE(default_box_type, 'standard'),
  default_box_status = COALESCE(default_box_status, 'active'),
  default_units = COALESCE(default_units, 'mL')
WHERE sample_types IS NULL;
