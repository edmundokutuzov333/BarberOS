import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabase } from './supabase';

export type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setSession(data.session);
      if (!data.session) {
        setProfile(null);
        setLoading(false);
      }
    }).catch(() => {
      if (!alive) return;
      setSession(null);
      setProfile(null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!alive) return;
      setSession(s);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('id, full_name, phone, avatar_url, is_platform_admin, created_at')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setProfile(error ? null : data ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setProfile(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
