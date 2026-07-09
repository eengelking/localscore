-- Distinguish deliberately-saved vulnerabilities from rows that exist only
-- as NVD lookup cache (docs/SPEC02.md §7.1). Pre-existing rows predate this
-- distinction and cannot be reliably reclassified, so they are all marked
-- saved = 1 — users see what they saw before and can delete strays.
ALTER TABLE vulnerabilities ADD COLUMN saved INTEGER NOT NULL DEFAULT 0;
UPDATE vulnerabilities SET saved = 1;
ALTER TABLE vulnerabilities ADD COLUMN description TEXT NOT NULL DEFAULT '';
