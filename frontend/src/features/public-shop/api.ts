import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export type PublicShop = {
  name: string; slug: string; description: string | null; logo_url: string | null; cover_url: string | null;
  theme_key: string; phone: string | null; whatsapp: string | null; instagram: string | null;
  address: string | null; maps_url: string | null; lat: number | null; lng: number | null;
  timezone: string; status: 'trial' | 'active'; deposit_enabled: boolean;
  deposit_mode: 'percent' | 'fixed'; deposit_value: number; deposit_hold_min: number;
  slot_interval_min: number; min_lead_time_min: number; max_advance_days: number; cancellation_rule: 'flex_2h' | 'moderate_6h' | 'strict_24h' | 'contact_only';
};
export type PublicService = { id: string; name: string; price_cents: number; duration_min: number; requires_deposit: boolean };
export type PublicHaircut = { id: string; service_id: string | null; name: string; description: string | null; photo_url: string | null; price_cents: number | null; duration_min: number | null };
export type PublicBarber = { id: string; display_name: string; photo_url: string | null; bio: string | null; years_experience: number; rating_avg: number; rating_count: number; service_ids: string[] };
export type PublicWorkingHour = { weekday: number; opens_at: string; closes_at: string; is_closed: boolean };
export type PublicReview = { rating: number; comment: string | null; created_at: string };
export type PublicReviews = { rating_avg: number; rating_count: number; items: PublicReview[] };
export type PublicBarbershopPayload = { shop: PublicShop; services: PublicService[]; haircuts: PublicHaircut[]; barbers: PublicBarber[]; working_hours: PublicWorkingHour[]; reviews: PublicReviews };

const nullableUrl = z.string().nullable();
const publicPayloadSchema = z.object({
  shop: z.object({
    name: z.string().min(1), slug: z.string().min(1), description: z.string().nullable(),
    logo_url: nullableUrl, cover_url: nullableUrl, theme_key: z.string().min(1),
    phone: z.string().nullable(), whatsapp: z.string().nullable(), instagram: z.string().nullable(),
    address: z.string().nullable(), maps_url: nullableUrl, lat: z.number().nullable(), lng: z.number().nullable(),
    timezone: z.string().min(1), status: z.enum(['trial', 'active']), deposit_enabled: z.boolean(),
    deposit_mode: z.enum(['percent', 'fixed']), deposit_value: z.number().int().nonnegative(), deposit_hold_min: z.number().int().positive(),
    slot_interval_min: z.number().int().positive(), min_lead_time_min: z.number().int().nonnegative(), max_advance_days: z.number().int().positive(),
    cancellation_rule: z.enum(['flex_2h', 'moderate_6h', 'strict_24h', 'contact_only']),
  }),
  services: z.array(z.object({ id: z.string().uuid(), name: z.string().min(1), price_cents: z.number().int().nonnegative(), duration_min: z.number().int().positive(), requires_deposit: z.boolean() })),
  haircuts: z.array(z.object({ id: z.string().uuid(), service_id: z.string().uuid().nullable(), name: z.string().min(1), description: z.string().nullable(), photo_url: nullableUrl, price_cents: z.number().int().nonnegative().nullable(), duration_min: z.number().int().positive().nullable() })),
  barbers: z.array(z.object({ id: z.string().uuid(), display_name: z.string().min(1), photo_url: nullableUrl, bio: z.string().nullable(), years_experience: z.number().int().nonnegative(), rating_avg: z.number().nonnegative(), rating_count: z.number().int().nonnegative(), service_ids: z.array(z.string().uuid()) })),
  working_hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), opens_at: z.string(), closes_at: z.string(), is_closed: z.boolean() })),
  reviews: z.object({ rating_avg: z.number().nonnegative(), rating_count: z.number().int().nonnegative(), items: z.array(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().nullable(), created_at: z.string() })) }),
}).strict();

export async function getPublicBarbershop(slug: string): Promise<PublicBarbershopPayload> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) throw new Error('BARBERSHOP_NOT_FOUND');
  const { data, error } = await supabase.rpc('get_public_barbershop', { p_slug: normalized });
  if (error) throw error;
  if (!data) throw new Error('BARBERSHOP_NOT_FOUND');
  const parsed = publicPayloadSchema.safeParse(data);
  if (!parsed.success) throw new Error('PUBLIC_SHOP_INVALID_RESPONSE');
  return parsed.data as PublicBarbershopPayload;
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