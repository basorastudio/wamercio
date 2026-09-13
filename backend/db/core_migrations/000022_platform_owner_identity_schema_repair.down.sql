-- This is a repair migration. Migration 000021 owns the identity columns, so
-- rolling back this repair must not remove production identity data.
SELECT 1;
