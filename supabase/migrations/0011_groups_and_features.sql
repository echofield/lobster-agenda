-- LOBSTER AGENDA - Groups, Lockout, Todos, Stats
-- Migration: 0011_groups_and_features.sql

-- 1. GROUPS TABLE
CREATE TABLE IF NOT EXISTS studio_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- 'LOBSTER STUDIO', 'ROMAN & LÉONARD'
  slug TEXT UNIQUE NOT NULL,    -- 'lobster', 'roman'
  color TEXT NOT NULL,          -- hex color pour UI
  monthly_allocation INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default groups
INSERT INTO studio_groups (name, slug, color, monthly_allocation) VALUES
  ('LOBSTER STUDIO', 'lobster', '#4A7B6A', 15),
  ('ROMAN & LÉONARD', 'roman', '#A38767', 15)
ON CONFLICT (slug) DO NOTHING;

-- 2. EVOLVE MEMBERS TABLE
ALTER TABLE studio_members ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES studio_groups(id);
ALTER TABLE studio_members ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE studio_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE studio_members ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE studio_members ADD COLUMN IF NOT EXISTS google_calendar_token JSONB;

-- Update existing members with group assignments
UPDATE studio_members SET 
  group_id = (SELECT id FROM studio_groups WHERE slug = entity_key),
  display_name = CASE 
    WHEN entity_key = 'roman' THEN 'Roman'
    WHEN entity_key = 'lobster' THEN 'Lobster'
    ELSE entity_key
  END
WHERE group_id IS NULL;

-- 3. LOCKOUT STATUS ON SLOTS
-- lockout = true means session privée (personne d'autre ne peut venir)
-- lockout = false means session ouverte (on peut hang)
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS lockout BOOLEAN DEFAULT false;
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS lockout_reason TEXT;

-- 4. MONEY/PRIORITY FLAG
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false;
ALTER TABLE studio_slots ADD COLUMN IF NOT EXISTS priority_reason TEXT; -- 'money', 'deadline', etc.

-- 5. COLLECTIVE TODOS
CREATE TABLE IF NOT EXISTS studio_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  created_by UUID REFERENCES studio_members(id),
  assigned_to UUID REFERENCES studio_members(id),
  group_id UUID REFERENCES studio_groups(id), -- NULL = tous les groupes
  priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'money'
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 6. SUGGESTIONS / PROPOSITIONS
CREATE TABLE IF NOT EXISTS studio_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'general', -- 'swap', 'event', 'rule_change', 'general'
  created_by UUID REFERENCES studio_members(id),
  status TEXT DEFAULT 'open', -- 'open', 'accepted', 'declined', 'discussed'
  votes_for INT DEFAULT 0,
  votes_against INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Votes table for suggestions
CREATE TABLE IF NOT EXISTS studio_suggestion_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID REFERENCES studio_suggestions(id) ON DELETE CASCADE,
  member_id UUID REFERENCES studio_members(id),
  vote TEXT NOT NULL, -- 'for', 'against'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(suggestion_id, member_id)
);

-- 7. USAGE STATS (cached for performance)
CREATE TABLE IF NOT EXISTS studio_usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES studio_members(id),
  month TEXT NOT NULL,          -- '2026-02'
  total_days INT DEFAULT 0,
  mix_slots INT DEFAULT 0,
  session_slots INT DEFAULT 0,
  night_slots INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, month)
);

-- 8. SWAP REQUESTS EVOLUTION
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE studio_swap_requests ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false;

-- Set default expiry to 72h from creation for existing pending requests
UPDATE studio_swap_requests 
SET expires_at = created_at + INTERVAL '72 hours'
WHERE expires_at IS NULL AND status = 'pending';

-- 9. NOTIFICATIONS QUEUE
CREATE TABLE IF NOT EXISTS studio_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES studio_members(id),
  type TEXT NOT NULL,           -- 'swap_request', 'swap_accepted', 'reminder', 'todo', 'suggestion'
  payload JSONB,
  channel TEXT DEFAULT 'app',   -- 'app', 'whatsapp', 'email'
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_studio_slots_week ON studio_slots(week_key);
CREATE INDEX IF NOT EXISTS idx_studio_slots_assignee ON studio_slots(assignee);
CREATE INDEX IF NOT EXISTS idx_studio_todos_group ON studio_todos(group_id);
CREATE INDEX IF NOT EXISTS idx_studio_usage_month ON studio_usage_stats(month);
CREATE INDEX IF NOT EXISTS idx_studio_notifications_member ON studio_notifications(member_id, read_at);

-- 11. RLS POLICIES (enable row level security)
ALTER TABLE studio_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_suggestion_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_notifications ENABLE ROW LEVEL SECURITY;

-- Everyone can read groups
CREATE POLICY "Anyone can read groups" ON studio_groups FOR SELECT USING (true);

-- Authenticated users can manage todos
CREATE POLICY "Auth users can read todos" ON studio_todos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users can insert todos" ON studio_todos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth users can update todos" ON studio_todos FOR UPDATE USING (auth.role() = 'authenticated');

-- Suggestions readable by all auth users
CREATE POLICY "Auth users can read suggestions" ON studio_suggestions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users can insert suggestions" ON studio_suggestions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Votes
CREATE POLICY "Auth users can vote" ON studio_suggestion_votes FOR ALL USING (auth.role() = 'authenticated');

-- Stats readable by auth users
CREATE POLICY "Auth users can read stats" ON studio_usage_stats FOR SELECT USING (auth.role() = 'authenticated');

-- Notifications - users see their own
CREATE POLICY "Users see own notifications" ON studio_notifications FOR SELECT USING (auth.uid()::text = member_id::text);
CREATE POLICY "Users update own notifications" ON studio_notifications FOR UPDATE USING (auth.uid()::text = member_id::text);

