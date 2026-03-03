-- ============================================================
-- LOBSTER AGENDA V1 — Entity-based Fairness System
-- Migration: 0012_lobster_fairness_v1.sql
--
-- SAFETY: All changes are ADDITIVE ONLY.
-- - No DROP, no RENAME, no ALTER TYPE on existing columns
-- - Existing studio_slots / studio_swap_requests remain intact
-- - New tables use lobster_ prefix to avoid collisions
-- - Existing UI can continue using week_key + assignee (enum)
-- ============================================================

-- ============================================================
-- 1. ENTITIES TABLE
-- Two entities: R.L and LOBSTER
-- ============================================================
CREATE TABLE IF NOT EXISTS lobster_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,               -- 'R.L', 'LOBSTER'
  slug TEXT UNIQUE NOT NULL,        -- 'rl', 'lobster'
  display_name TEXT NOT NULL,       -- 'Roman & Léonard', 'Lobster Studio'
  color TEXT NOT NULL DEFAULT '#888',
  target_share NUMERIC(4,2) DEFAULT 0.50,  -- 50% each
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO lobster_entities (name, slug, display_name, color, target_share) VALUES
  ('R.L', 'rl', 'Roman & Léonard', '#A38767', 0.50),
  ('LOBSTER', 'lobster', 'Lobster Studio', '#4A7B6A', 0.50)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 2. PERSONS TABLE
-- Individual people mapped to entities
-- ============================================================
CREATE TABLE IF NOT EXISTS lobster_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,               -- 'Roman', 'Leonard', 'Martial', etc.
  slug TEXT UNIQUE NOT NULL,        -- 'roman', 'leonard', 'martial', 'alexandre', 'hedi'
  entity_id UUID NOT NULL REFERENCES lobster_entities(id),
  color TEXT,                       -- personal color (optional)
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO lobster_persons (name, slug, entity_id, color) VALUES
  ('Roman',    'roman',     (SELECT id FROM lobster_entities WHERE slug = 'rl'),      '#A38767'),
  ('Léonard',  'leonard',   (SELECT id FROM lobster_entities WHERE slug = 'rl'),      '#C4A882'),
  ('Martial',  'martial',   (SELECT id FROM lobster_entities WHERE slug = 'lobster'), '#4A7B6A'),
  ('Alexandre','alexandre', (SELECT id FROM lobster_entities WHERE slug = 'lobster'), '#5C9B82'),
  ('Hedi',     'hedi',      (SELECT id FROM lobster_entities WHERE slug = 'lobster'), '#3A6B5A')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 3. EXTEND studio_slots WITH NEW COLUMNS (backwards-compatible)
-- Old columns remain: assignee (enum), week_key, day_of_week, etc.
-- New columns: slot_date, assigned_person_id, assigned_entity_id, status, notes
-- ============================================================

-- Date-aware: the actual calendar date of this slot
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS slot_date DATE;

-- Person-level assignment (nullable = unassigned)
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS assigned_person_id UUID REFERENCES lobster_persons(id);

-- Entity-level assignment (derived from person, stored for integrity + queries)
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS assigned_entity_id UUID REFERENCES lobster_entities(id);

-- Richer status lifecycle
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'tentative'
  CHECK (status IN ('tentative', 'confirmed', 'locked', 'cancelled'));

-- Source tracking
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
  CHECK (source IN ('manual', 'auto', 'import', 'seed'));

-- Optional label override (keeps slot_type enum as primary, this is for display)
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS label TEXT;

-- Notes
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS notes TEXT;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_studio_slots_date ON studio_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_studio_slots_person ON studio_slots(assigned_person_id);
CREATE INDEX IF NOT EXISTS idx_studio_slots_entity ON studio_slots(assigned_entity_id);
CREATE INDEX IF NOT EXISTS idx_studio_slots_status ON studio_slots(status);
CREATE INDEX IF NOT EXISTS idx_studio_slots_date_range ON studio_slots(slot_date, start_time, end_time);

-- ============================================================
-- 4. BACKFILL: Populate slot_date from week_key + day_of_week
-- This is safe because it only fills NULLs
-- ============================================================
-- NOTE: Run this AFTER migration. The function handles ISO week → date conversion.
CREATE OR REPLACE FUNCTION lobster_backfill_slot_dates()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  week_year INT;
  week_num INT;
  jan4 DATE;
  jan4_dow INT;
  week1_monday DATE;
  target_date DATE;
BEGIN
  FOR r IN SELECT id, week_key, day_of_week FROM studio_slots WHERE slot_date IS NULL
  LOOP
    -- Parse "2026-W10" → year=2026, week=10
    week_year := CAST(SUBSTRING(r.week_key FROM 1 FOR 4) AS INT);
    week_num := CAST(SUBSTRING(r.week_key FROM 7 FOR 2) AS INT);

    -- Jan 4 is always in ISO week 1
    jan4 := make_date(week_year, 1, 4);
    jan4_dow := EXTRACT(ISODOW FROM jan4)::INT; -- 1=Mon..7=Sun

    -- Monday of week 1
    week1_monday := jan4 - (jan4_dow - 1);

    -- Target date: week1_monday + (week_num-1)*7 + day_of_week
    -- day_of_week: 0=Mon, 6=Sun
    target_date := week1_monday + ((week_num - 1) * 7) + r.day_of_week;

    UPDATE studio_slots SET slot_date = target_date WHERE id = r.id;
  END LOOP;
END;
$$;

-- Execute backfill MANUALLY in SQL editor when ready (not during migration to avoid row locks)
-- SELECT lobster_backfill_slot_dates();

-- ============================================================
-- 5. BACKFILL: Map legacy assignee enum to entity
-- 'roman' → R.L entity, 'lobster' → LOBSTER entity
-- ============================================================
UPDATE studio_slots
SET assigned_entity_id = (SELECT id FROM lobster_entities WHERE slug = 'rl')
WHERE assignee = 'roman' AND assigned_entity_id IS NULL;

UPDATE studio_slots
SET assigned_entity_id = (SELECT id FROM lobster_entities WHERE slug = 'lobster')
WHERE assignee = 'lobster' AND assigned_entity_id IS NULL;

-- ============================================================
-- 6. FAIRNESS CONFIG TABLE
-- Multipliers and safeguard thresholds
-- ============================================================
CREATE TABLE IF NOT EXISTS lobster_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scoring multipliers
INSERT INTO lobster_config (key, value, description) VALUES
  ('scoring_multipliers', '{
    "base_points_per_hour": 1.0,
    "mix_morning_multiplier": 1.3,
    "session_multiplier": 1.1,
    "night_multiplier": 1.0,
    "weekend_multiplier": 1.4,
    "hot_day_multiplier": 1.2
  }'::jsonb, 'Fairness scoring multipliers for different slot types and contexts'),

  ('hot_days', '{
    "days": ["friday_evening", "saturday", "sunday"],
    "custom_dates": []
  }'::jsonb, 'Days considered "hot" (high demand) for scoring purposes'),

  ('safeguards', '{
    "max_consecutive_nights_per_person": 2,
    "max_consecutive_nights_per_entity": 3,
    "min_rest_hours_night_to_morning": 8,
    "max_daily_hours_per_person": 12,
    "slot_min_duration_minutes": 30,
    "slot_max_duration_minutes": 720,
    "single_room": true
  }'::jsonb, 'Safeguard rules and constraints'),

  ('period_type', '{"type": "calendar_month", "rolling_days": 30}'::jsonb,
   'Fairness period: calendar_month or rolling_30day'),

  ('slot_presets', '{
    "mix": {"start": "10:00", "end": "16:00", "label": "MIX"},
    "session": {"start": "16:00", "end": "22:00", "label": "SESSION"},
    "night": {"start": "20:00", "end": "02:00", "label": "NIGHT"}
  }'::jsonb, 'Default slot presets (templates, not constraints)')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 7. FAIRNESS LEDGER
-- One entry per slot assignment, computed on write
-- ============================================================
CREATE TABLE IF NOT EXISTS lobster_fairness_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES studio_slots(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES lobster_entities(id),
  person_id UUID REFERENCES lobster_persons(id),
  period_key TEXT NOT NULL,         -- '2026-03' or rolling window key
  slot_date DATE NOT NULL,
  minutes INT NOT NULL DEFAULT 0,
  points_base NUMERIC(8,2) DEFAULT 0,
  points_prime NUMERIC(8,2) DEFAULT 0,
  points_weekend NUMERIC(8,2) DEFAULT 0,
  points_night NUMERIC(8,2) DEFAULT 0,
  points_hot NUMERIC(8,2) DEFAULT 0,
  points_total NUMERIC(8,2) DEFAULT 0,
  breakdown JSONB,                  -- detailed scoring explanation
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(slot_id)                   -- one ledger entry per slot
);

CREATE INDEX IF NOT EXISTS idx_fairness_ledger_entity ON lobster_fairness_ledger(entity_id, period_key);
CREATE INDEX IF NOT EXISTS idx_fairness_ledger_person ON lobster_fairness_ledger(person_id, period_key);
CREATE INDEX IF NOT EXISTS idx_fairness_ledger_period ON lobster_fairness_ledger(period_key);

-- ============================================================
-- 8. FAIRNESS PERIOD SUMMARY (materialized / cached)
-- Aggregated per entity per period
-- ============================================================
CREATE TABLE IF NOT EXISTS lobster_fairness_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES lobster_entities(id),
  period_key TEXT NOT NULL,         -- '2026-03'
  total_minutes INT DEFAULT 0,
  total_points NUMERIC(10,2) DEFAULT 0,
  prime_points NUMERIC(10,2) DEFAULT 0,
  weekend_points NUMERIC(10,2) DEFAULT 0,
  night_points NUMERIC(10,2) DEFAULT 0,
  hot_points NUMERIC(10,2) DEFAULT 0,
  slot_count INT DEFAULT 0,
  target_share NUMERIC(4,2) DEFAULT 0.50,
  actual_share NUMERIC(4,2) DEFAULT 0,
  fairness_delta NUMERIC(10,2) DEFAULT 0,  -- deviation from target
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_id, period_key)
);

-- ============================================================
-- 9. ENHANCED SWAP REQUESTS
-- Add person-level fields + offer/counter mechanism
-- ============================================================
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS requester_person_id UUID REFERENCES lobster_persons(id);
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS target_person_id UUID REFERENCES lobster_persons(id);
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS target_slot_id UUID REFERENCES studio_slots(id);
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS proposed_start_time TIME;
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS proposed_end_time TIME;
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS proposed_date DATE;
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS fairness_impact JSONB;
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false;

-- ============================================================
-- 10. LEGACY COMPATIBILITY VIEW
-- Provides old shape for existing UI while new columns exist
-- ============================================================
CREATE OR REPLACE VIEW lobster_slots_legacy AS
SELECT
  s.id,
  s.week_key,
  s.day_of_week,
  s.slot_type,
  s.start_time,
  s.end_time,
  s.assignee,
  s.validation_status,
  s.validation_reasons,
  s.lockout,
  s.is_priority,
  s.created_at,
  s.updated_at,
  -- New enrichments
  s.slot_date,
  s.assigned_person_id,
  s.assigned_entity_id,
  s.status,
  s.label,
  s.notes,
  p.name AS person_name,
  p.slug AS person_slug,
  e.name AS entity_name,
  e.slug AS entity_slug,
  e.color AS entity_color
FROM studio_slots s
LEFT JOIN lobster_persons p ON s.assigned_person_id = p.id
LEFT JOIN lobster_entities e ON s.assigned_entity_id = e.id;

-- ============================================================
-- 11. RLS POLICIES FOR NEW TABLES
-- ============================================================
ALTER TABLE lobster_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobster_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobster_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobster_fairness_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobster_fairness_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read entities" ON lobster_entities FOR SELECT USING (true);
CREATE POLICY "Anyone can read persons" ON lobster_persons FOR SELECT USING (true);
CREATE POLICY "Anyone can read config" ON lobster_config FOR SELECT USING (true);
CREATE POLICY "Auth users manage config" ON lobster_config FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users read fairness" ON lobster_fairness_ledger FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service can manage fairness" ON lobster_fairness_ledger FOR ALL USING (true);
CREATE POLICY "Auth users read summary" ON lobster_fairness_summary FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Service can manage summary" ON lobster_fairness_summary FOR ALL USING (true);
