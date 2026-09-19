import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Supabase browser configuration.
 *
 * VITE_* variables are the preferred deployment contract. The fallback values
 * are the public Supabase project URL and publishable key used by BarberOS.
 * Publishable keys are intentionally safe for browser use and are protected by
 * Supabase RLS and function authorization. Private/server credentials are never
 * accepted here.
 */
const DEFAULT_SUPABASE_URL = 'https://alseiinjzwjdiwtvkdzy.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Cjn-g6cWrIUSYVI5oeK2ZA_Ipk0B5ID';

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim() || DEFAULT_SUPABASE_URL;
const publishable = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
const legacyAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const key = publishable || legacyAnon || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
