-- ============================================================
-- LOBSTER AGENDA — SQL DISCOVERY PACK
-- Run these queries in the Supabase SQL Editor (read-only)
-- ============================================================

-- 1. Enum definitions for studio_slots USER-DEFINED columns
SELECT t.typname AS enum_name,
       e.enumlabel AS enum_value,
       e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN ('slot_type', 'assignee', 'validation_status',
                     'studio_slot_type', 'studio_assignee', 'studio_validation_status')
ORDER BY t.typname, e.enumsortorder;

-- 2. Full column list for studio_slots (including any hidden columns)
SELECT column_name, data_type, udt_name, column_default, is_nullable, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'studio_slots'
ORDER BY ordinal_position;

-- 3. Full column list for studio_swap_requests
SELECT column_name, data_type, udt_name, column_default, is_nullable, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'studio_swap_requests'
ORDER BY ordinal_position;

-- 4. All tables in public schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 5. Constraints on studio_slots
SELECT con.conname AS constraint_name,
       con.contype AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'studio_slots';

-- 6. Constraints on studio_swap_requests
SELECT con.conname AS constraint_name,
       con.contype AS constraint_type,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public' AND rel.relname = 'studio_swap_requests';

-- 7. Indexes on studio_slots
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'studio_slots';

-- 8. Indexes on studio_swap_requests
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'studio_swap_requests';

-- 9. RLS policies on studio_slots
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'studio_slots';

-- 10. RLS policies on studio_swap_requests
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'studio_swap_requests';

-- 11. Triggers on studio_slots
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'studio_slots';

-- 12. Check if studio_members exists and its columns
SELECT column_name, data_type, udt_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'studio_members'
ORDER BY ordinal_position;

-- 13. Sample data from studio_slots (first 5 rows)
SELECT * FROM studio_slots LIMIT 5;

-- 14. Count slots per week
SELECT week_key, count(*) FROM studio_slots GROUP BY week_key ORDER BY week_key;
