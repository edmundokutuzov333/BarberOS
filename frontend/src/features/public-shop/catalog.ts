import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const publicVariantSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  attributes: z.record(z.string(), z.unknown()),
  unit_label: z.string().min(1),
  price_minor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  available: z.boolean(),
}).strict();

const publicProductSchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid().nullable(),
  brand: z.string().nullable(),
  name: z.string().min(1),
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  image_alt: z.string().nullable(),
  product_kind: z.enum(['consume_here', 'takeaway', 'both']),
  sort_order: z.number().int(),
  order_options: z.array(z.string().min(1).max(80)).max(10),
  variants: z.array(publicVariantSchema),
}).strict();

const publicCatalogSchema = z.object({
  enabled: z.boolean(),
  categories: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().nullable(),
    sort_order: z.number().int(),
  }).strict()),
  products: z.array(publicProductSchema),
}).strict();

export type PublicShopVariant = z.infer<typeof publicVariantSchema>;
export type PublicShopProduct = z.infer<typeof publicProductSchema>;
export type PublicShopCatalog = z.infer<typeof publicCatalogSchema>;

export async function getPublicShopCatalog(slug?: string): Promise<PublicShopCatalog> {
  const normalized = slug?.trim().toLowerCase() ?? '';
  if (!normalized) throw new Error('BARBERSHOP_NOT_FOUND');

  const { data, error } = await supabase.rpc('get_public_shop_catalog', { p_slug: normalized });
  if (error) throw error;

  const parsed = publicCatalogSchema.safeParse(data);
  if (!parsed.success) throw new Error('PUBLIC_SHOP_CATALOG_INVALID_RESPONSE');
  if (!parsed.data.enabled && (parsed.data.categories.length > 0 || parsed.data.products.length > 0)) {
    throw new Error('PUBLIC_SHOP_CATALOG_DISABLED_WITH_DATA');
  }
  return parsed.data;
}

export function usePublicShopCatalog(slug?: string) {
  return useQuery({
    queryKey: ['public-shop-catalog', slug],
    queryFn: () => getPublicShopCatalog(slug),
    enabled: Boolean(slug),
    staleTime: 15_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
