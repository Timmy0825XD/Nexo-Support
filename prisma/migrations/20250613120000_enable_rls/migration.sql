-- Enable RLS on all tables. No permissive policies = deny-all for anon/authenticated.
-- The bot uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS server-side.

ALTER TABLE "guilds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tournaments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "match_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bracket_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;
