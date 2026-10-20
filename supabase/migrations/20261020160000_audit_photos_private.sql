-- audit-photos is PRIVATE (Bryce, 2026-10-20: "make the audit photos fully
-- private too").
--
-- Until now the bucket was public: anyone holding a link — and the paths are
-- guessable, audits/<id>/photo_N.jpg — could open a customer's site photos
-- and signatures. 20261020120000 already closed listing and scoped reads to
-- the reader's own company; this closes the public links themselves.
--
-- Every reader now asks for a signed URL: signed-in screens through
-- src/lib/storageUrl.jsx (SignedImg / signedUrlFor), JobDetail's gallery and
-- the documentGenerator signature fallback sign directly, and Lenard's public
-- pages get signed links from lenard-projects (service role). The stored
-- values (quote_lines.photos, job_lines.photos, audit_areas.photos) keep
-- their public-URL shape — that is the file's address, not a working link.

update storage.buckets set public = false where id = 'audit-photos';
