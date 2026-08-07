-- Per-user lifestyle profile, shown/edited in the dashboard's Profile view.
-- One row per user (user_id is the primary key, not a separate id column).
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name text,
  age text,
  pronouns text,
  work text,
  work_rhythm text,
  exercise text[] NOT NULL DEFAULT '{}',
  diet text,
  hobbies text[] NOT NULL DEFAULT '{}',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own profile" ON profiles FOR DELETE USING (auth.uid() = user_id);
