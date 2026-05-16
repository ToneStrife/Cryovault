/*
  # Soft delete for samples + invite tracking

  1. Changes to samples table
     - Add `deleted_at` (timestamptz, nullable) — soft delete marker
     - Add `deleted_by` (uuid, nullable) — who deleted it

  2. New table: invites
     - Tracks pending email invitations sent by admins
     - `id`, `email`, `role`, `invited_by`, `created_at`, `accepted_at`

  3. Security
     - Update samples RLS to exclude deleted rows by default (via a view approach, kept in app layer)
     - Enable RLS on invites
     - Only admins can insert/view invites
*/

-- Add soft delete columns to samples
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'samples' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE samples ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'samples' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE samples ADD COLUMN deleted_by uuid DEFAULT NULL;
  END IF;
END $$;

-- Create invites table
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'researcher',
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  laboratory text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz DEFAULT NULL
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view invites"
  ON invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert invites"
  ON invites FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update invites"
  ON invites FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete invites"
  ON invites FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS samples_deleted_at_idx ON samples(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invites_email_idx ON invites(email);
