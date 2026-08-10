-- Enforce one entry per user per day. Keep the most recently created row
-- for each (user_id, date) pair and drop the rest before adding the
-- constraint — entry_tags cascades on delete.
DELETE FROM entries a USING entries b
WHERE a.user_id = b.user_id
  AND a.date = b.date
  AND a.id < b.id;

ALTER TABLE entries ADD CONSTRAINT entries_user_id_date_key UNIQUE (user_id, date);
