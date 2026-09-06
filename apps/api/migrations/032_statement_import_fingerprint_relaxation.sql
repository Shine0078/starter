-- 031 originally experimented with a per-import fingerprint uniqueness index.
-- Keep this forward migration for databases that applied that version before
-- the duplicate-legitimate-transaction case was covered.
DROP INDEX IF EXISTS statement_import_rows_fingerprint_key;
