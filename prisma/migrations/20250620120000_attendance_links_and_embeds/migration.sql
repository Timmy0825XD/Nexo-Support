-- Attendance: JSON recording links, creator tracking, embed message IDs
ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "recording_links" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "created_by_discord_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "ticket_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "attendance_channel_message_id" TEXT;

-- Migrate legacy single link column when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'recording_link'
  ) THEN
    UPDATE "attendance"
    SET "recording_links" = jsonb_build_array("recording_link")
    WHERE "recording_link" IS NOT NULL AND "recording_link" <> '';

    ALTER TABLE "attendance" DROP COLUMN "recording_link";
  END IF;
END $$;
