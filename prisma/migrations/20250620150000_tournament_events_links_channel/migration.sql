ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "events_links_channel_id" TEXT;

ALTER TABLE "guilds" DROP COLUMN IF EXISTS "events_links_channel_id";
