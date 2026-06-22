-- AlterTable
ALTER TABLE "schedules" ADD COLUMN "reminder_message_id" TEXT,
ADD COLUMN "reminder_sent_at" TIMESTAMPTZ,
ADD COLUMN "urgent_message_id" TEXT,
ADD COLUMN "urgent_sent_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "staff_assignments" ADD COLUMN "attendance_confirmed_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "schedules_scheduled_at_idx" ON "schedules"("scheduled_at");
