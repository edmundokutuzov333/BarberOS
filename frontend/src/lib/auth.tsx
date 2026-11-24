import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';
import { supabase } from './supabase';

export type Profile = Database['public']['Tables']['profiles']['Row'];
const profileSchema: z.ZodType<Profile> = z.object({
  id: z.string().uuid(), full_name: z.string().nullable(), phone: z.string().nullable(),
  avatar_url: z.string().nullable(), created_at: z.string().datetime({ offset: true }),
  is_platform_admin: z.boolean(), password_change_required: z.boolean(),
});
const ACCOUNT_TIMEOUT_MS = 10_000;

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  signOut: () => Promise<boolean>;
}

const Ctx = createContext<AuthState>({
  session: null, user: null, profile: null, loading: true, error: null,
  retry: () => {}, signOut: async () => false,
});

type SessionState = { session: Session | null; loading: boolean; error: Error | null; epoch: number; revision: number };

async function readProfile(userId: string, signal: AbortSignal): Promise<Profile> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(cancel, ACCOUNT_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.from('profiles')
      .select('id, full_name, phone, avatar_url, is_platform_admin, created_at, password_change_required')
      .eq('id', userId).abortSignal(controller.signal).maybeSingle();
    if (error) throw new Error('ACCOUNT_STATE_UNAVAILABLE');
    const parsed = profileSchema.safeParse(data);
    if (!parsed.success || parsed.data.id !== userId) throw new Error('ACCOUNT_STATE_UNAVAILABLE');
    return parsed.data;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, error: null, epoch: 0, revision: 0 });
  const qc = useQueryClient();
  const [reload, setReload] = useState(0);
  // This sequence also invalidates a late getSession result after a newer event.
  const sequence = useRef(0);
  useEffect(() => {
    let alive = true;
    const receive = (session: Session | null) => {
      if (!alive) return;
      sequence.current++;
      setState(previous => ({
        session, loading: false, error: null,
        epoch: previous.epoch + (previous.session?.user.id !== session?.user.id ? 1 : 0),
        revision: previous.revision + 1,
      }));
    };
    // Never await SDK operations in this callback: Auth holds its session lock.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => receive(session));
    const attempt = ++sequence.current;
    const timer = setTimeout(() => {
      if (!alive || sequence.current !== attempt) return;
      sequence.current++;
      setState(previous => ({ ...previous, loading: false, error: new Error('ACCOUNT_STATE_UNAVAILABLE') }));
    }, ACCOUNT_TIMEOUT_MS);
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || sequence.current !== attempt) return;
      if (error) throw error;
      receive(data.session);
    }).catch(() => {
      if (alive && sequence.current === attempt) {
        sequence.current++;
        setState(previous => ({ ...previous, loading: false, error: new Error('ACCOUNT_STATE_UNAVAILABLE') }));
      }
    }).finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); sub.subscription.unsubscribe(); };
  }, [reload]);

  const userId = state.session?.user.id;
  const profileQuery = useQuery({
    queryKey: ['account-profile', userId, state.epoch],
    enabled: !!userId && !state.loading && !state.error,
    queryFn: ({ signal }) => readProfile(userId!, signal),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
  // SDK SIGNED_IN can fire on window visibility even for the same account.
  // Recheck outside the Auth callback/lock, retaining the live form while the
  // same account is verified. Only account changes get a new cache boundary.
  useEffect(() => {
    if (userId && !state.loading && !state.error) {
      void qc.invalidateQueries({ queryKey: ['account-profile', userId, state.epoch], exact: true }, { cancelRefetch: false });
    }
  }, [qc, userId, state.epoch, state.revision, state.loading, state.error]);
  const error = state.error ?? (userId && profileQuery.isError ? new Error('ACCOUNT_STATE_UNAVAILABLE') : null);
  const profile = !error && !state.loading && userId ? profileQuery.data ?? null : null;
  const loading = state.loading || (!!userId && !error && profileQuery.isPending);
  const retry = useCallback(() => {
    setState(previous => ({ ...previous, loading: true, error: null }));
    setReload(value => value + 1);
  }, []);
  const signOut = async () => {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      return true;
    } catch {
      setState(previous => ({ ...previous, loading: false, error: new Error('SESSION_END_FAILED') }));
      return false;
    }
  };

  return <Ctx.Provider value={{ session: state.session, user: state.session?.user ?? null, profile, loading, error, retry, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
