CREATE TABLE IF NOT EXISTS "scheduled_bans" (
  "id" TEXT NOT NULL,
  "guild_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "reason" TEXT NOT NULL,
  "banned_by_discord_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "scheduled_bans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_bans_guild_id_user_id_key"
  ON "scheduled_bans"("guild_id", "user_id");

CREATE INDEX IF NOT EXISTS "scheduled_bans_expires_at_idx"
  ON "scheduled_bans"("expires_at");
