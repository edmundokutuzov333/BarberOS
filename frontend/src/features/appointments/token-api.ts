import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';
import { invokeTokenGateway } from './token-gateway';

export type AppointmentTokenView =
  Database['public']['Functions']['get_appointment_by_token']['Returns'][number];

export type TokenCancelInput =
  Database['public']['Functions']['cancel_appointment_by_token']['Args'];

export type TokenRescheduleInput =
  Database['public']['Functions']['reschedule_appointment_by_token']['Args'];

export type RescheduleSlot =
  Database['public']['Functions']['get_reschedule_slots_by_token']['Returns'][number];

const shopOrderSchema = z.object({
  status: z.enum(['received', 'needs_confirmation', 'accepted', 'preparing', 'ready', 'partially_delivered', 'delivered', 'cancelled', 'failed']),
  requested_for: z.string(),
  item_count: z.number().int().nonnegative(),
  subtotal_minor: z.number().int().nonnegative(),
  items: z.array(z.object({
    product_name: z.string(),
    variant: z.string(),
    qty: z.number().int().positive(),
    unit_price_minor: z.number().int().nonnegative(),
    line_total_minor: z.number().int().nonnegative(),
    options: z.object({
      preferences: z.array(z.string()).default([]),
      fulfilment_mode: z.enum(['consume_here', 'takeaway']),
    }),
    status: z.enum(['requested', 'accepted', 'unavailable', 'preparing', 'ready', 'partially_delivered', 'delivered', 'cancelled', 'failed']),
  }).strict()),
}).strict();

export type ShopOrderTokenView = z.infer<typeof shopOrderSchema>;

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertToken(token: string): void {
  if (!TOKEN_PATTERN.test(token)) throw new Error('APPOINTMENT_NOT_FOUND');
}

export async function getAppointmentByToken(token: string): Promise<AppointmentTokenView | null> {
  assertToken(token);
  const data = await invokeTokenGateway<AppointmentTokenView[]>('appointment.get', { token });
  return data?.[0] ?? null;
}

export async function getShopOrderByToken(token: string): Promise<ShopOrderTokenView | null> {
  assertToken(token);
  const data = await invokeTokenGateway<unknown>('shop_order.get', { token });
  if (data === null || typeof data === 'undefined') return null;
  const parsed = shopOrderSchema.safeParse(data);
  if (!parsed.success) throw new Error('SHOP_ORDER_RESPONSE_INVALID');
  return parsed.data;
}

export async function getRescheduleSlotsByToken(token: string, date: string): Promise<RescheduleSlot[]> {
  assertToken(token);
  const data = await invokeTokenGateway<RescheduleSlot[]>('appointment.reschedule_slots', { token, date });
  return data ?? [];
}

export async function cancelAppointmentByToken(input: TokenCancelInput): Promise<{ cancelled_at: string }> {
  assertToken(input.p_token);
  const data = await invokeTokenGateway<Array<{ cancelled_at: string }>>('appointment.cancel', {
    token: input.p_token,
    reason: input.p_reason,
  });
  const row = data?.[0];
  if (!row) throw new Error('CANCEL_EMPTY_RESPONSE');
  return row;
}

export async function rescheduleAppointmentByToken(input: TokenRescheduleInput): Promise<{ new_starts_at: string; new_ends_at: string }> {
  assertToken(input.p_token);
  const data = await invokeTokenGateway<Array<{ new_starts_at: string; new_ends_at: string }>>('appointment.reschedule', {
    token: input.p_token,
    new_start: input.p_new_start,
  });
  const row = data?.[0];
  if (!row) throw new Error('RESCHEDULE_EMPTY_RESPONSE');
  return row;
}

export { assertToken };

export function useAppointmentByToken(token?: string) {
  return useQuery({
    queryKey: ['appointment-token', token],
    queryFn: () => getAppointmentByToken(token!),
    enabled: Boolean(token),
    staleTime: 15_000,
    retry: false,
  });
}

export function useRescheduleSlotsByToken(token?: string, date?: string, enabled = true) {
  return useQuery({
    queryKey: ['appointment-token', 'slots', token, date],
    queryFn: () => getRescheduleSlotsByToken(token!, date!),
    enabled: Boolean(token && date && enabled),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useTokenCancellation() {
  return useMutation({ mutationFn: cancelAppointmentByToken, retry: false });
}

export function useTokenReschedule() {
  return useMutation({ mutationFn: rescheduleAppointmentByToken, retry: false });
}


export function useShopOrderByToken(token?: string) {
  return useQuery({
    queryKey: ['shop-order-token', token],
    queryFn: () => getShopOrderByToken(token!),
    enabled: Boolean(token) && import.meta.env.VITE_SHOP_PUBLIC_CATALOG_ENABLED === 'true',
    staleTime: 15_000,
    retry: false,
  });
}
