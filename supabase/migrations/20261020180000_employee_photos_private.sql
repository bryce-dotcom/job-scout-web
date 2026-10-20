-- Staff headshots are PRIVATE (Bryce, 2026-10-20, after audit photos). Reads
-- were already limited to the person's own company (20261020120000); this
-- closes the public links. Every screen that shows a headshot asks for a
-- signed URL (lib/storageUrl.jsx SignedImg; the live map signs its markers
-- when it loads). employees.headshot_url keeps its public-URL shape as the
-- file's address.
update storage.buckets set public = false where id = 'employee-photos';
