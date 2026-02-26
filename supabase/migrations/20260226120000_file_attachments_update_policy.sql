-- Add missing UPDATE policy to file_attachments table
CREATE POLICY "file_attachments_update" ON public.file_attachments
  FOR UPDATE USING (true) WITH CHECK (true);
