-- Add user_id to entries, backfill existing rows, then enforce NOT NULL.
ALTER TABLE entries ADD COLUMN user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;
UPDATE entries SET user_id = '733d250a-9142-4bdd-83a3-eab8fcca2b9d' WHERE user_id IS NULL;
ALTER TABLE entries ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX idx_entries_user_id ON entries (user_id);

-- Row Level Security — defense in depth for any future access path (e.g. a
-- dashboard talking to Supabase directly via PostgREST) beyond the MCP
-- server's own explicit user_id filtering, which remains the primary
-- enforcement for MCP tool calls since that connection bypasses RLS.
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own entries" ON entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own entries" ON entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own entries" ON entries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own entries" ON entries FOR DELETE USING (auth.uid() = user_id);

-- Tags stay a shared, global vocabulary (not per-user) — any authenticated
-- user can read the full tag list and create new tags.
CREATE POLICY "authenticated users read tags" ON tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated users create tags" ON tags FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "select own entry_tags" ON entry_tags FOR SELECT USING (
  EXISTS (SELECT 1 FROM entries WHERE entries.id = entry_tags.entry_id AND entries.user_id = auth.uid())
);
CREATE POLICY "insert own entry_tags" ON entry_tags FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM entries WHERE entries.id = entry_tags.entry_id AND entries.user_id = auth.uid())
);
CREATE POLICY "delete own entry_tags" ON entry_tags FOR DELETE USING (
  EXISTS (SELECT 1 FROM entries WHERE entries.id = entry_tags.entry_id AND entries.user_id = auth.uid())
);

-- Curated starter tag vocabulary (~80 common journaling tags). Shared across
-- all users; anyone can still add new tags beyond this list.
INSERT INTO tags (name) VALUES
  ('grateful'), ('anxious'), ('happy'), ('sad'), ('stressed'), ('calm'), ('angry'), ('overwhelmed'), ('content'), ('hopeful'),
  ('lonely'), ('excited'), ('tired'), ('motivated'), ('frustrated'), ('peaceful'), ('nostalgic'), ('proud'), ('guilty'), ('relieved'),
  ('confident'), ('joyful'), ('optimistic'), ('inspired'), ('exhausted'), ('worried'), ('irritable'), ('disappointed'), ('insecure'), ('energetic'),
  ('exercise'), ('gym'), ('running'), ('walking'), ('yoga'), ('swimming'), ('meditation'), ('reading'), ('cooking'), ('cleaning'),
  ('gardening'), ('gaming'), ('music'), ('art'), ('writing'), ('shopping'), ('traveling'), ('hiking'), ('journaling'), ('self-care'),
  ('family'), ('friends'), ('date night'), ('party'), ('conflict'), ('alone time'), ('socializing'), ('therapy'), ('medication'), ('doctor appointment'),
  ('work'), ('career'), ('school'), ('finances'), ('health'), ('relationship'), ('sleep'), ('insomnia'), ('sick'), ('headache'),
  ('morning'), ('weekend'), ('holiday'), ('birthday'), ('vacation'), ('milestone'), ('good day'), ('bad day'), ('productive'), ('lazy day'),
  ('breakthrough'), ('setback'), ('gratitude'), ('reflection'), ('goals'), ('achievement')
ON CONFLICT (name) DO NOTHING;
