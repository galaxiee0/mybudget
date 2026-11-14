import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// "supabase" est fourni par le script chargé dans index.html (CDN).
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
