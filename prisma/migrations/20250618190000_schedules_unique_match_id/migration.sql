-- One active schedule per match
CREATE UNIQUE INDEX IF NOT EXISTS "schedules_match_id_key" ON "schedules"("match_id");
