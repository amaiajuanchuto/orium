-- Trims clearly-redundant entries from the starter tag vocabulary seeded in
-- 20260802040833_add_multiuser_support.sql (e.g. "peaceful" duplicating
-- "calm", "gym"/"walking"/"swimming" duplicating "exercise"). Categorization
-- of the remaining ~75 tags lives in the dashboard, not the schema — see
-- dashboard/src/lib/tagCategories.ts.
--
-- Only removes a candidate if nobody has tagged an entry with it yet:
-- entry_tags.tag_id has ON DELETE CASCADE, so deleting an in-use tag would
-- silently untag real entries. This guards against that regardless of who
-- (any user, on any shared deployment) has actually used one of these.
DELETE FROM tags
WHERE name IN (
  'peaceful', 'joyful', 'worried', 'irritable', 'gym', 'walking', 'swimming',
  'cleaning', 'shopping', 'career', 'goals'
)
AND NOT EXISTS (
  SELECT 1 FROM entry_tags WHERE entry_tags.tag_id = tags.id
);
