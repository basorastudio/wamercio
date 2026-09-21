-- Data semantics correction. Restoring zero-purchase customer links would recreate
-- the 2.8.4 bug, so rollback intentionally preserves corrected contact classification.
SELECT 1;
