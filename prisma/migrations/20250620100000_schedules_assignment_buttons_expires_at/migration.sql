ALTER TABLE "schedules"
ADD COLUMN IF NOT EXISTS "assignment_buttons_expires_at" TIMESTAMPTZ;
