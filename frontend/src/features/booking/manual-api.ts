import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { normalizeMozPhone } from '@/features/booking/api';

export type ManualService = Pick<
  Database['public']['Tables']['services']['Row'],
  'id' | 'name' | 'price_cents' | 'duration_min' | 'requires_deposit'
>;

export type ManualHaircut = Pick<
  Database['public']['Tables']['haircuts']['Row'],
  'id' | 'name' | 'service_id'
>;

export type ManualBarber = Pick<
  Database['public']['Tables']['barbers']['Row'],
  'id' | 'display_name' | 'user_id'
> & {
  barber_services: { service_id: string }[];
};

export type ManualBookingResult =
  Database['public']['Functions']['book_appointment_manual']['Returns'][number];

export async function getManualBookingCatalog(shopId: string) {
  const [services, haircuts, barbers] = await Promise.all([
    supabase
      .from('services')
      .select('id,name,price_cents,duration_min,requires_deposit')
      .eq('barbershop_id', shopId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('haircuts')
      .select('id,name,service_id')
      .eq('barbershop_id', shopId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('barbers')
      .select('id,display_name,user_id,barber_services(service_id)')
      .eq('barbershop_id', shopId)
      .eq('is_active', true)
      .order('sort_order')
      .order('display_name'),
  ]);

  for (const result of [services, haircuts, barbers]) {
    if (result.error) throw result.error;
  }

  return {
    services: (services.data ?? []) as ManualService[],
    haircuts: (haircuts.data ?? []) as unknown as ManualHaircut[],
    barbers: (barbers.data ?? []) as unknown as ManualBarber[],
  };
}

export function useManualBookingCatalog(shopId?: string) {
  return useQuery({
    queryKey: ['manual-booking', 'catalog', shopId],
    queryFn: () => getManualBookingCatalog(shopId!),
    enabled: Boolean(shopId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export async function bookManualAppointment(input: {
  shopId: string;
  serviceId: string;
  haircutId: string | null;
  barberId: string | null;
  start: string;
  name: string;
  phone: string;
  email?: string | null;
  internalNote?: string | null;
}): Promise<ManualBookingResult> {
  const { data, error } = await supabase.rpc('book_appointment_manual', {
    p_shop: input.shopId,
    p_service_id: input.serviceId,
    p_haircut_id: input.haircutId,
    p_barber_id: input.barberId,
    p_start: input.start,
    p_name: input.name,
    p_phone: normalizeMozPhone(input.phone),
    p_email: input.email ?? null,
    p_internal_note: input.internalNote ?? null,
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) throw new Error('MANUAL_BOOKING_EMPTY_RESPONSE');
  return result;
}

export function useBookManualAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookManualAppointment,
    retry: false,
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agenda', 'appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['availability'] }),
        queryClient.invalidateQueries({ queryKey: ['manual-booking', 'catalog'] }),
      ]);
      return result;
    },
  });
}
