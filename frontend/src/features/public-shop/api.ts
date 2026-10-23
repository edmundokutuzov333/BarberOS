import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

declare global {
  interface Window {
    __barberosPublicShopPrefetch?: {
      slug: string;
      promise: Promise<unknown | null>;
    };
  }
}

export type PublicShop = {
  name: string; slug: string; description: string | null; logo_url: string | null; cover_url: string | null;
  theme_key: string; phone: string | null; whatsapp: string | null; instagram: string | null;
  address: string | null; maps_url: string | null; lat: number | null; lng: number | null;
  timezone: string; status: 'trial' | 'active'; deposit_enabled: boolean;
  deposit_mode: 'percent' | 'fixed'; deposit_value: number; deposit_hold_min: number;
  slot_interval_min: number; min_lead_time_min: number; max_advance_days: number; cancellation_rule: 'flex_2h' | 'moderate_6h' | 'strict_24h' | 'contact_only';
};
export type PublicService = { id: string; name: string; price_cents: number; duration_min: number; requires_deposit: boolean; photo_url: string | null };
export type PublicHaircut = { id: string; service_id: string | null; name: string; description: string | null; photo_url: string | null; price_cents: number | null; duration_min: number | null };
export type PublicBarber = { id: string; display_name: string; photo_url: string | null; bio: string | null; years_experience: number; rating_avg: number; rating_count: number; service_ids: string[] };
export type PublicWorkingHour = { weekday: number; opens_at: string; closes_at: string; is_closed: boolean };
export type PublicReview = { rating: number; comment: string | null; created_at: string };
export type PublicReviews = { rating_avg: number; rating_count: number; items: PublicReview[] };
export type PublicBarbershopPayload = { shop: PublicShop; services: PublicService[]; haircuts: PublicHaircut[]; barbers: PublicBarber[]; working_hours: PublicWorkingHour[]; reviews: PublicReviews };

export type PublicDirectoryShop = Pick<PublicShop, 'name' | 'slug' | 'description' | 'logo_url' | 'cover_url' | 'address' | 'maps_url' | 'lat' | 'lng' | 'status'> & {
  id: string;
  service_count: number;
  rating_avg: number;
  rating_count: number;
};

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
  services: z.array(z.object({ id: z.string().uuid(), name: z.string().min(1), price_cents: z.number().int().nonnegative(), duration_min: z.number().int().positive(), requires_deposit: z.boolean(), photo_url: nullableUrl.default(null) })),
  haircuts: z.array(z.object({ id: z.string().uuid(), service_id: z.string().uuid().nullable(), name: z.string().min(1), description: z.string().nullable(), photo_url: nullableUrl, price_cents: z.number().int().nonnegative().nullable(), duration_min: z.number().int().positive().nullable() })),
  barbers: z.array(z.object({ id: z.string().uuid(), display_name: z.string().min(1), photo_url: nullableUrl, bio: z.string().nullable(), years_experience: z.number().int().nonnegative(), rating_avg: z.number().nonnegative(), rating_count: z.number().int().nonnegative(), service_ids: z.array(z.string().uuid()) })),
  working_hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), opens_at: z.string(), closes_at: z.string(), is_closed: z.boolean() })),
  reviews: z.object({ rating_avg: z.number().nonnegative(), rating_count: z.number().int().nonnegative(), items: z.array(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().nullable(), created_at: z.string() })) }),
}).strict();

export async function getPublicBarbershop(slug: string): Promise<PublicBarbershopPayload> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) throw new Error('BARBERSHOP_NOT_FOUND');
  let data: unknown = null;
  if (typeof window !== 'undefined' && window.__barberosPublicShopPrefetch?.slug === normalized) {
    data = await window.__barberosPublicShopPrefetch.promise;
  }
  if (data == null) {
    const result = await supabase.rpc('get_public_barbershop', { p_slug: normalized });
    if (result.error) throw result.error;
    data = result.data;
  }
  if (!data) throw new Error('BARBERSHOP_NOT_FOUND');
  const parsed = publicPayloadSchema.safeParse(data);
  if (!parsed.success) throw new Error('PUBLIC_SHOP_INVALID_RESPONSE');
  return parsed.data as PublicBarbershopPayload;
}

/**
 * Directory data is intentionally limited to public, non-sensitive fields.
 * Services and reviews are queried independently so this remains compatible
 * with the existing RLS boundary and does not expose private shop metadata.
 */
export async function getPublicBarbershops(): Promise<PublicDirectoryShop[]> {
  const [shopsResult, servicesResult, reviewsResult] = await Promise.all([
    supabase
      .from('barbershops')
      .select('id, name, slug, description, logo_url, cover_url, address, maps_url, lat, lng, status')
      .in('status', ['active', 'trial'])
      .order('name'),
    supabase.from('services').select('barbershop_id').eq('is_active', true),
    supabase.from('reviews').select('barbershop_id, rating').eq('is_published', true),
  ]);

  if (shopsResult.error) throw shopsResult.error;
  if (servicesResult.error) throw servicesResult.error;
  if (reviewsResult.error) throw reviewsResult.error;

  const serviceCounts = new Map<string, number>();
  for (const service of servicesResult.data ?? []) {
    serviceCounts.set(service.barbershop_id, (serviceCounts.get(service.barbershop_id) ?? 0) + 1);
  }
  const reviewStats = new Map<string, { total: number; count: number }>();
  for (const review of reviewsResult.data ?? []) {
    const current = reviewStats.get(review.barbershop_id) ?? { total: 0, count: 0 };
    current.total += review.rating;
    current.count += 1;
    reviewStats.set(review.barbershop_id, current);
  }

  return (shopsResult.data ?? []).map((shop) => {
    const reviews = reviewStats.get(shop.id) ?? { total: 0, count: 0 };
    return {
      ...shop,
      status: shop.status as PublicDirectoryShop['status'],
      service_count: serviceCounts.get(shop.id) ?? 0,
      rating_avg: reviews.count ? reviews.total / reviews.count : 0,
      rating_count: reviews.count,
    };
  });
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

export function usePublicBarbershops() {
  return useQuery({
    queryKey: ['public-barbershops'],
    queryFn: getPublicBarbershops,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
