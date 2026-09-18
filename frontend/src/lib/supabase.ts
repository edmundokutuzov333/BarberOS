import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const legacyAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const key = publishable || legacyAnon;

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórios');
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
