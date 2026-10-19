import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const publishable = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
const legacyAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const key = publishable || legacyAnon;

if (!url || !key) {
  throw new Error('Configuração Supabase em falta');
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
