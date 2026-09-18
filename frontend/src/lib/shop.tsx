import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { applyTheme } from '@/themes';

export type Role = 'owner' | 'manager' | 'barber';

export interface Shop {
  id: string; slug: string; name: string; description: string | null;
  logo_url: string | null; cover_url: string | null; theme_key: string;
  phone: string | null; whatsapp: string | null; instagram: string | null;
  address: string | null; maps_url: string | null; timezone: string;
  slot_interval_min: number; min_lead_time_min: number; max_advance_days: number;
  cancellation_rule: 'flex_2h' | 'moderate_6h' | 'strict_24h' | 'contact_only';
  deposit_enabled: boolean; deposit_mode: 'percent' | 'fixed'; deposit_value: number; deposit_hold_min: number;
  status: 'trial' | 'active' | 'suspended' | 'cancelled'; plan_id: string | null; onboarding_step: number;
}

interface Membership { role: Role; barbershops: Shop }

interface ShopState {
  shop: Shop | null; role: Role | null; shops: Membership[];
  loading: boolean; setShopId: (id: string) => void; refresh: () => Promise<unknown>;
}

const Ctx = createContext<ShopState>({ shop: null, role: null, shops: [], loading: true, setShopId: () => {}, refresh: async () => {} });
const KEY = 'barberos.shop';

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [shopId, setId] = useState<string | null>(() => localStorage.getItem(KEY));

  const q = useQuery({
    queryKey: ['memberships', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('barbershop_members').select('role, barbershops(*)').eq('user_id', user!.id);
      if (error) throw error;
      return (data as unknown as Membership[]).filter((m) => m.barbershops);
    },
  });

  const shops = q.data ?? [];
  const current = useMemo(() => shops.find((m) => m.barbershops.id === shopId) ?? shops[0] ?? null, [shops, shopId]);

  useEffect(() => { applyTheme(current?.barbershops.theme_key); }, [current?.barbershops.theme_key]);

  const setShopId = (id: string) => { localStorage.setItem(KEY, id); setId(id); };

  return (
    <Ctx.Provider value={{
      shop: current?.barbershops ?? null, role: current?.role ?? null, shops,
      loading: !!user && q.isLoading, setShopId,
      refresh: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useShop = () => useContext(Ctx);
