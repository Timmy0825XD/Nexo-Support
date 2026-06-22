-- CreateTable
CREATE TABLE "schedule_results" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "team1_score" INTEGER NOT NULL,
    "team2_score" INTEGER NOT NULL,
    "winner_side" INTEGER NOT NULL,
    "notes" TEXT,
    "proof_image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "results_message_id" TEXT NOT NULL,
    "result_channel_id" TEXT NOT NULL,
    "declared_by_discord_user_id" TEXT NOT NULL,
    "declared_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "schedule_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_results_schedule_id_key" ON "schedule_results"("schedule_id");

-- CreateIndex
CREATE INDEX "schedule_results_tournament_id_idx" ON "schedule_results"("tournament_id");

-- CreateIndex
CREATE INDEX "schedule_results_match_id_idx" ON "schedule_results"("match_id");

-- AddForeignKey
ALTER TABLE "schedule_results" ADD CONSTRAINT "schedule_results_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_results" ADD CONSTRAINT "schedule_results_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_results" ADD CONSTRAINT "schedule_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
