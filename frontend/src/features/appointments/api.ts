import { useQuery } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type AppointmentListStatus = Database['public']['Enums']['appointment_status'];

export type AppointmentListRow = {
  appointment_id: string;
  barber_id: string;
  barber_name: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  service_id: string;
  service_name: string;
  haircut_id: string | null;
  haircut_name: string | null;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  price_cents: number;
  status: AppointmentListStatus;
  deposit_status: Database['public']['Enums']['deposit_state'];
  deposit_cents: number;
  hold_expires_at: string | null;
  source: Database['public']['Enums']['booking_source'];
  total_count: number;
};

export async function getAppointments(
  shopId: string,
  from: string,
  to: string,
  status: AppointmentListStatus | null,
  search: string,
  limit = 50,
  offset = 0,
): Promise<AppointmentListRow[]> {
  const { data, error } = await supabase.rpc('get_appointments' as never, {
    p_shop: shopId,
    p_from: from,
    p_to: to,
    p_status: status,
    p_search: search.trim() || null,
    p_limit: limit,
    p_offset: offset,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as AppointmentListRow[];
}

export function useAppointments(
  shopId?: string,
  from?: string,
  to?: string,
  status: AppointmentListStatus | null = null,
  search = '',
  page = 0,
  limit = 50,
) {
  return useQuery({
    queryKey: ['appointments', shopId, from, to, status, search, page, limit],
    queryFn: () => getAppointments(shopId!, from!, to!, status, search, limit, page * limit),
    enabled: Boolean(shopId && from && to),
    staleTime: 10_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
