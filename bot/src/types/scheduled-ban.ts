export interface ScheduledBanRow {
  id: string;
  guild_id: string;
  user_id: string;
  expires_at: string;
  reason: string;
  banned_by_discord_id: string;
  created_at: string;
}
