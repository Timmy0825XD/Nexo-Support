-- Remove duplicate match_rooms (keep the oldest row per match_id).
DELETE FROM match_rooms AS newer
USING match_rooms AS older
WHERE newer.match_id = older.match_id
  AND newer.created_at > older.created_at;

DELETE FROM match_rooms AS newer
USING match_rooms AS older
WHERE newer.match_id = older.match_id
  AND newer.created_at = older.created_at
  AND newer.id > older.id;

CREATE UNIQUE INDEX IF NOT EXISTS "match_rooms_match_id_key" ON "match_rooms" ("match_id");
