import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type WaitlistStatus = Database['public']['Enums']['waitlist_status'];
export type WaitlistView = 'active' | 'waiting' | 'offered' | 'converted' | 'expired' | 'cancelled' | 'all';

export type WaitlistMetrics = {
  waiting_count: number;
  offered_count: number;
  expiring_soon_count: number;
  converted_30d: number;
};

export type WaitlistEntry = {
  waitlist_entry_id: string;
  queue_position: number | null;
  customer_name: string;
  phone: string;
  email: string | null;
  service_name: string;
  haircut_name: string | null;
  barber_name: string | null;
  date_from: string | null;
  date_to: string | null;
  period: string;
  status: WaitlistStatus;
  offer_slot_start: string | null;
  offer_barber_name: string | null;
  offer_expires_at: string | null;
  created_at: string;
  total_count: number;
};

export type WaitlistOffer = {
  status: WaitlistStatus;
  can_claim: boolean;
  customer_name: string;
  service_name: string;
  service_price_cents: number;
  service_duration_min: number;
  haircut_name: string | null;
  barber_name: string | null;
  slot_start: string;
  offer_expires_at: string;
  shop_name: string;
  shop_slug: string;
  shop_phone: string | null;
  shop_whatsapp: string | null;
  timezone: string;
};

export type WaitlistClaim = {
  waitlist_entry_id: string;
  appointment_id: string;
  manage_token: string;
  status: Database['public']['Enums']['appointment_status'];
  starts_at: string;
  ends_at: string;
  barber_id: string;
  deposit_cents: number;
  needs_payment: boolean;
};

export async function getWaitlistMetrics(shopId: string): Promise<WaitlistMetrics> {
  const { data, error } = await supabase.rpc('get_waitlist_metrics', { p_shop: shopId });
  if (error) throw error;
  return data?.[0] ?? { waiting_count: 0, offered_count: 0, expiring_soon_count: 0, converted_30d: 0 };
}

export async function getWaitlist(
  shopId: string,
  status: WaitlistView,
  search = '',
  limit = 50,
  offset = 0,
): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase.rpc('get_waitlist', {
    p_shop: shopId,
    p_status: status,
    p_search: search.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}

export async function joinWaitlist(input: {
  slug: string;
  serviceId: string;
  customerName: string;
  phone: string;
  haircutId?: string | null;
  barberId?: string | null;
  email?: string | null;
  dateFrom: string;
  dateTo: string;
  period: string;
}) {
  const { data, error } = await supabase.rpc('join_waitlist', {
    p_slug: input.slug,
    p_service_id: input.serviceId,
    p_customer_name: input.customerName,
    p_phone: input.phone,
    ...(input.haircutId ? { p_haircut_id: input.haircutId } : {}),
    ...(input.barberId ? { p_barber_id: input.barberId } : {}),
    ...(input.email ? { p_email: input.email } : {}),
    p_date_from: input.dateFrom,
    p_date_to: input.dateTo,
    p_period: input.period,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('WAITLIST_JOIN_EMPTY_RESPONSE');
  return row;
}

export async function getWaitlistOffer(token: string): Promise<WaitlistOffer> {
  const { data, error } = await supabase.rpc('get_waitlist_offer', { p_token: token });
  if (error) throw error;
  const row = data?.[0] as WaitlistOffer | undefined;
  if (!row) throw new Error('WAITLIST_OFFER_NOT_FOUND');
  return row;
}

export async function claimWaitlistOffer(token: string): Promise<WaitlistClaim> {
  const { data, error } = await supabase.rpc('claim_waitlist_offer', { p_token: token });
  if (error) throw error;
  const row = data?.[0] as WaitlistClaim | undefined;
  if (!row) throw new Error('WAITLIST_CLAIM_EMPTY_RESPONSE');
  return row;
}

export async function expireWaitlistOffer(token: string) {
  const { data, error } = await supabase.rpc('expire_waitlist_offer', { p_token: token });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function cancelWaitlist(shopId: string, entryId: string) {
  const { data, error } = await supabase.rpc('cancel_waitlist', {
    p_shop: shopId,
    p_entry: entryId,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('WAITLIST_CANCEL_EMPTY_RESPONSE');
  return row;
}

export function useWaitlistMetrics(shopId?: string) {
  return useQuery({
    queryKey: ['waitlist', 'metrics', shopId],
    queryFn: () => getWaitlistMetrics(shopId!),
    enabled: Boolean(shopId),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useWaitlist(
  shopId?: string,
  status: WaitlistView = 'active',
  search = '',
  page = 0,
  limit = 50,
) {
  return useQuery({
    queryKey: ['waitlist', 'list', shopId, status, search, page, limit],
    queryFn: () => getWaitlist(shopId!, status, search, limit, page * limit),
    enabled: Boolean(shopId),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useWaitlistOffer(token?: string) {
  return useQuery({
    queryKey: ['waitlist', 'offer', token],
    queryFn: () => getWaitlistOffer(token!),
    enabled: Boolean(token),
    staleTime: 5_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useJoinWaitlist() {
  return useMutation({ mutationFn: joinWaitlist, retry: false });
}

export function useClaimWaitlistOffer() {
  return useMutation({ mutationFn: claimWaitlistOffer, retry: false });
}

export function useExpireWaitlistOffer() {
  return useMutation({ mutationFn: expireWaitlistOffer, retry: false });
}

export function useCancelWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, entryId }: { shopId: string; entryId: string }) => cancelWaitlist(shopId, entryId),
    retry: false,
    onSuccess: async (_result, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['waitlist', 'list', input.shopId] }),
        qc.invalidateQueries({ queryKey: ['waitlist', 'metrics', input.shopId] }),
      ]);
    },
  });
}
