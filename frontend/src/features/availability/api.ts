import { useQuery } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type AvailableSlot =
  Database['public']['Functions']['get_available_slots']['Returns'][number];

export type AvailableDay =
  Database['public']['Functions']['get_available_days']['Returns'][number];

export async function getAvailableSlots(
  slug: string,
  serviceId: string,
  barberId: string | null,
  date: string,
): Promise<AvailableSlot[]> {
  const { data, error } = await supabase.rpc('get_available_slots', {
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
): Promise<AvailableDay[]> {
  const { data, error } = await supabase.rpc('get_available_days', {
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
}) {
  const { slug, serviceId, barberId = null, date } = params;

  return useQuery({
    queryKey: ['availability', 'slots', slug, serviceId, barberId, date],
    queryFn: () => getAvailableSlots(slug!, serviceId!, barberId, date!),
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
}) {
  const { slug, serviceId, barberId = null, from, to } = params;

  return useQuery({
    queryKey: ['availability', 'days', slug, serviceId, barberId, from, to],
    queryFn: () => getAvailableDays(slug!, serviceId!, barberId, from!, to!),
    enabled: Boolean(slug && serviceId && from && to),
    staleTime: 30_000,
  });
}
