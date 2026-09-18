import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type ReviewByToken = Database['public']['Functions']['get_review_by_token']['Returns'][number];
export type ReviewRow = Database['public']['Functions']['get_reviews']['Returns'][number];
export type ReviewListArgs = Database['public']['Functions']['get_reviews']['Args'];

export async function getReviewByToken(token: string): Promise<ReviewByToken | null> {
  const { data, error } = await supabase.rpc('get_review_by_token', { p_token: token });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function submitReviewByToken(input: Database['public']['Functions']['submit_review_by_token']['Args']) {
  const { data, error } = await supabase.rpc('submit_review_by_token', input);
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('REVIEW_EMPTY_RESPONSE');
  return row;
}

export async function getReviews(args: ReviewListArgs): Promise<ReviewRow[]> {
  const { data, error } = await supabase.rpc('get_reviews', args);
  if (error) throw error;
  return data ?? [];
}

export async function setReviewPublication(shopId: string, reviewId: string, isPublished: boolean) {
  const { data, error } = await supabase.rpc('set_review_publication', {
    p_shop: shopId,
    p_review: reviewId,
    p_is_published: isPublished,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('REVIEW_EMPTY_RESPONSE');
  return row;
}

export function useReviewByToken(token?: string) {
  return useQuery({
    queryKey: ['review-token', token],
    queryFn: () => getReviewByToken(token!),
    enabled: Boolean(token),
    staleTime: 15_000,
    retry: false,
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: submitReviewByToken,
    onSuccess: (_row, variables) => {
      qc.invalidateQueries({ queryKey: ['review-token', variables.p_token] });
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['public-barbershop'] });
    },
    retry: false,
  });
}

export function useReviews(
  shopId?: string,
  published: ReviewListArgs['p_published'] = 'all',
  page = 0,
  limit = 50,
) {
  return useQuery({
    queryKey: ['reviews', shopId, published, page, limit],
    queryFn: () => getReviews({
      p_shop: shopId!,
      p_barber_id: null,
      p_rating: null,
      p_published: published,
      p_limit: limit,
      p_offset: page * limit,
    }),
    enabled: Boolean(shopId),
    staleTime: 15_000,
    retry: false,
  });
}

export function useSetReviewPublication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, reviewId, isPublished }: { shopId: string; reviewId: string; isPublished: boolean }) =>
      setReviewPublication(shopId, reviewId, isPublished),
    onSuccess: (_row, variables) => {
      qc.invalidateQueries({ queryKey: ['reviews', variables.shopId] });
      qc.invalidateQueries({ queryKey: ['public-barbershop'] });
    },
    retry: false,
  });
}
