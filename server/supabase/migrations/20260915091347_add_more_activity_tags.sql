-- Adds a few requested activity tags to the shared vocabulary. "sewing" may
-- already exist (a user's own custom tag) — ON CONFLICT DO NOTHING makes
-- this safe to run regardless.
INSERT INTO tags (name) VALUES
  ('cycling'), ('sewing'), ('knitting')
ON CONFLICT (name) DO NOTHING;
