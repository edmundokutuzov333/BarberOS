import { useQuery } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type AvailableSlot =
  Database['public']['Functions']['get_available_slots']['Returns'][number];

export type AvailableDay =
  Database['public']['Functions']['get_available_days']['Returns'][number];

export type WeekSlots = Record<string, { start: string; barbers: string[] }[]>;

export async function getAvailableSlotsWeek(slug: string, serviceId: string, barberId: string | null, from: string): Promise<WeekSlots> {
  const { data, error } = await supabase.rpc('get_available_slots_week', { p_slug: slug, p_service_id: serviceId, p_barber_id: barberId, p_from: from });
  if (error) throw error;
  return (data ?? {}) as WeekSlots;
}

export function useAvailableSlotsWeek(params: { slug?: string; serviceId?: string; barberId?: string | null; from?: string }) {
  const { slug, serviceId, barberId = null, from } = params;
  return useQuery({
    queryKey: ['availability', 'week', slug, serviceId, barberId, from],
    queryFn: () => getAvailableSlotsWeek(slug!, serviceId!, barberId, from!),
    enabled: Boolean(slug && serviceId && from),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export async function getAvailableSlots(
  slug: string,
  serviceId: string,
  barberId: string | null,
  date: string,
  haircutId: string | null = null,
  addonIds: string[] = [],
): Promise<AvailableSlot[]> {
  const { data, error } = addonIds.length
    ? await supabase.rpc('get_composed_available_slots', { p_slug: slug, p_service_id: serviceId, p_barber_id: barberId, p_date: date, p_haircut_id: haircutId, p_addon_ids: addonIds })
    : haircutId
    ? await supabase.rpc('get_offer_available_slots', { p_slug: slug, p_service_id: serviceId, p_barber_id: barberId, p_date: date, p_haircut_id: haircutId })
    : await supabase.rpc('get_available_slots', {
    p_slug: slug,
    p_service_id: serviceId,
    p_barber_id: barberId,
    p_date: date,
  });

  if (error) throw error;
  return data ?? [];
}

export async function getAvailableDays(
  slug: string,
  serviceId: string,
  barberId: string | null,
  from: string,
  to: string,
  haircutId: string | null = null,
  addonIds: string[] = [],
): Promise<AvailableDay[]> {
  const { data, error } = addonIds.length
    ? await supabase.rpc('get_composed_available_days', { p_slug: slug, p_service_id: serviceId, p_barber_id: barberId, p_from: from, p_to: to, p_haircut_id: haircutId, p_addon_ids: addonIds })
    : haircutId
    ? await supabase.rpc('get_offer_available_days', { p_slug: slug, p_service_id: serviceId, p_barber_id: barberId, p_from: from, p_to: to, p_haircut_id: haircutId })
    : await supabase.rpc('get_available_days', {
    p_slug: slug,
    p_service_id: serviceId,
    p_barber_id: barberId,
    p_from: from,
    p_to: to,
  });

  if (error) throw error;
  return data ?? [];
}

export function useAvailableSlots(params: {
  slug?: string;
  serviceId?: string;
  barberId?: string | null;
  date?: string;
  haircutId?: string | null;
  addonIds?: string[];
}) {
  const { slug, serviceId, barberId = null, date, haircutId = null, addonIds = [] } = params;

  return useQuery({
    queryKey: ['availability', 'slots', slug, serviceId, barberId, date, haircutId, [...addonIds].sort()],
    queryFn: () => getAvailableSlots(slug!, serviceId!, barberId, date!, haircutId, addonIds),
    enabled: Boolean(slug && serviceId && date),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useAvailableDays(params: {
  slug?: string;
  serviceId?: string;
  barberId?: string | null;
  from?: string;
  to?: string;
  haircutId?: string | null;
  addonIds?: string[];
}) {
  const { slug, serviceId, barberId = null, from, to, haircutId = null, addonIds = [] } = params;

  return useQuery({
    queryKey: ['availability', 'days', slug, serviceId, barberId, from, to, haircutId, [...addonIds].sort()],
    queryFn: () => getAvailableDays(slug!, serviceId!, barberId, from!, to!, haircutId, addonIds),
    enabled: Boolean(slug && serviceId && from && to),
    staleTime: 30_000,
  });
}
