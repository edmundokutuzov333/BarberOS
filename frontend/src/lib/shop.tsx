import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from './database.types';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { applyTheme } from '@/themes';

export type Role = Database['public']['Enums']['app_role'];
export type Shop = Database['public']['Tables']['barbershops']['Row'];

interface Membership {
  role: Role;
  barbershops: Shop;
}

interface ShopState {
  shop: Shop | null;
  role: Role | null;
  shops: Membership[];
  loading: boolean;
  error: Error | null;
  setShopId: (id: string) => void;
  refresh: () => Promise<unknown>;
}

const Ctx = createContext<ShopState>({
  shop: null,
  role: null,
  shops: [],
  loading: true,
  error: null,
  setShopId: () => {},
  refresh: async () => {},
});
const KEY = 'barberos.shop';

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [shopId, setId] = useState<string | null>(() => localStorage.getItem(KEY));

  const q = useQuery({
    queryKey: ['memberships', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('barbershop_members')
        .select('role, barbershops(*)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data as unknown as Membership[]).filter((m) => m.barbershops);
    },
  });

  const shops = q.data ?? [];
  const current = useMemo(
    () => shops.find((m) => m.barbershops.id === shopId) ?? shops[0] ?? null,
    [shops, shopId],
  );

  useEffect(() => {
    applyTheme(current?.barbershops.theme_key);
  }, [current?.barbershops.theme_key]);

  const setShopId = (id: string) => {
    localStorage.setItem(KEY, id);
    setId(id);
  };

  return (
    <Ctx.Provider
      value={{
        shop: current?.barbershops ?? null,
        role: current?.role ?? null,
        shops,
        loading: !!user && q.isLoading,
        error: q.error instanceof Error ? q.error : q.error ? new Error(String(q.error)) : null,
        setShopId,
        refresh: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useShop = () => useContext(Ctx);
