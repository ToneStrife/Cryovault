/*
  # Storage RLS Policies for cryo-images bucket

  Allows:
  - Authenticated users to upload images
  - Public (anon) read access since bucket is public
*/

CREATE POLICY "Authenticated users can upload cryo images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cryo-images');

CREATE POLICY "Public can view cryo images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'cryo-images');

CREATE POLICY "Users can delete own cryo images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'cryo-images' AND auth.uid() = owner);
