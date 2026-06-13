import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase client not initialized. Call initSupabase() first.');
  }
  return client;
}

export function initSupabase(url: string, serviceRoleKey: string): SupabaseClient {
  client = createSupabaseClient(url, serviceRoleKey);
  return client;
}

export async function checkSupabaseConnection(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('guilds').select('id').limit(1);
  return !error;
}
