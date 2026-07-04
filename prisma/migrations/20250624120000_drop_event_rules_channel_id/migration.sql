-- Drop unused staff config column (never read at runtime)
ALTER TABLE "guilds" DROP COLUMN IF EXISTS "event_rules_channel_id";
