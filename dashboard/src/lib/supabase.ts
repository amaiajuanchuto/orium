import { createClient } from "@supabase/supabase-js";

// Same publishable values used by public/login.html and
// public/oauth-consent.html — a Supabase publishable key is safe to ship
// in client code, not a secret (see Supabase's docs on anon/publishable
// keys), so this is hardcoded rather than injected via a build-time env
// var that wouldn't be available on Render's build machine anyway.
const SUPABASE_URL = "https://imxmcavkzpbbqbhcefkj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8aMCvghGGRHIwMogWkHAzA_yl1yFI9N";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
