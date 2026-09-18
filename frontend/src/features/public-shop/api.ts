import { useQuery } from '@tanstack/react-query';
import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type PublicShop = {
  name: string; slug: string; description: string | null; logo_url: string | null; cover_url: string | null;
  theme_key: string; phone: string | null; whatsapp: string | null; instagram: string | null;
  address: string | null; maps_url: string | null; lat: number | null; lng: number | null;
  timezone: string; status: 'trial' | 'active'; deposit_enabled: boolean;
};

export type PublicService = { id: string; name: string; price_cents: number; duration_min: number; requires_deposit: boolean };
export type PublicHaircut = { id: string; service_id: string | null; name: string; description: string | null; photo_url: string | null; price_cents: number | null; duration_min: number | null };
export type PublicBarber = { id: string; display_name: string; photo_url: string | null; bio: string | null; years_experience: number; rating_avg: number; rating_count: number; service_ids: string[] };
export type PublicWorkingHour = { weekday: number; opens_at: string; closes_at: string; is_closed: boolean };
export type PublicReview = { rating: number; comment: string | null; created_at: string };
export type PublicReviews = { rating_avg: number; rating_count: number; items: PublicReview[] };
export type PublicBarbershopPayload = { shop: PublicShop; services: PublicService[]; haircuts: PublicHaircut[]; barbers: PublicBarber[]; working_hours: PublicWorkingHour[]; reviews: PublicReviews };

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPayload(value: Json): PublicBarbershopPayload {
  if (!isRecord(value) || !isRecord(value.shop) || !Array.isArray(value.services) || !Array.isArray(value.haircuts) || !Array.isArray(value.barbers) || !Array.isArray(value.working_hours) || !isRecord(value.reviews)) {
    throw new Error('PUBLIC_SHOP_INVALID_RESPONSE');
  }
  return value as unknown as PublicBarbershopPayload;
}

export async function getPublicBarbershop(slug: string): Promise<PublicBarbershopPayload> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) throw new Error('BARBERSHOP_NOT_FOUND');
  const { data, error } = await supabase.rpc('get_public_barbershop', { p_slug: normalized });
  if (error) throw error;
  if (!data) throw new Error('BARBERSHOP_NOT_FOUND');
  return asPayload(data);
}

export function usePublicBarbershop(slug?: string) {
  return useQuery({
    queryKey: ['public-barbershop', slug],
    queryFn: () => getPublicBarbershop(slug!),
    enabled: Boolean(slug),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}