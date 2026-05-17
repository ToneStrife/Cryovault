/*
  # User Permissions Override Table

  1. New Tables
    - `user_permissions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK → profiles, cascade delete)
      - `action` (text) - permission key e.g. 'manage_users'
      - `granted` (boolean) - true = explicitly granted, false = explicitly revoked
      - `laboratory` (text) - lab scope
      - `created_at` (timestamptz)
      - UNIQUE(user_id, action) - one override row per user per action

  2. Security
    - Enable RLS
    - Admins can read/insert/update/delete all permission overrides in their lab
    - Users can only read their own permission overrides

  3. Notes
    - This table stores ONLY overrides from the role default
    - If no row exists for a user+action, the role default applies
    - Admins can grant or revoke any permission for any user in their lab
*/

CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  laboratory TEXT NOT NULL DEFAULT 'default_lab',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, action)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_laboratory ON user_permissions(laboratory);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can view all permission overrides in their lab
CREATE POLICY "Admins can view permission overrides in their lab"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Users can view their own permission overrides
CREATE POLICY "Users can view own permission overrides"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can insert permission overrides in their lab
CREATE POLICY "Admins can insert permission overrides"
  ON user_permissions FOR INSERT
  TO authenticated
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admins can update permission overrides in their lab
CREATE POLICY "Admins can update permission overrides"
  ON user_permissions FOR UPDATE
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admins can delete permission overrides in their lab
CREATE POLICY "Admins can delete permission overrides"
  ON user_permissions FOR DELETE
  TO authenticated
  USING (
    laboratory = (SELECT laboratory FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
