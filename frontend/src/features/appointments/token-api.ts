import { useMutation, useQuery } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { invokeTokenGateway } from './token-gateway';

export type AppointmentTokenView =
  Database['public']['Functions']['get_appointment_by_token']['Returns'][number];

export type TokenCancelInput =
  Database['public']['Functions']['cancel_appointment_by_token']['Args'];

export type TokenRescheduleInput =
  Database['public']['Functions']['reschedule_appointment_by_token']['Args'];

export type RescheduleSlot =
  Database['public']['Functions']['get_reschedule_slots_by_token']['Returns'][number];

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertToken(token: string): void {
  if (!TOKEN_PATTERN.test(token)) throw new Error('APPOINTMENT_NOT_FOUND');
}

export async function getAppointmentByToken(token: string): Promise<AppointmentTokenView | null> {
  assertToken(token);
  try {
    const data = await invokeTokenGateway<AppointmentTokenView[]>('appointment.get', { token });
    return data?.[0] ?? null;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'TOKEN_GATEWAY_NOT_DEPLOYED') throw error;
    const { data, error: rpcError } = await supabase.rpc('get_appointment_by_token', { p_token: token });
    if (rpcError) throw rpcError;
    return data?.[0] ?? null;
  }
}

export async function getRescheduleSlotsByToken(token: string, date: string): Promise<RescheduleSlot[]> {
  assertToken(token);
  try {
    const data = await invokeTokenGateway<RescheduleSlot[]>('appointment.reschedule_slots', { token, date });
    return data ?? [];
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'TOKEN_GATEWAY_NOT_DEPLOYED') throw error;
    const { data, error: rpcError } = await supabase.rpc('get_reschedule_slots_by_token', { p_token: token, p_date: date });
    if (rpcError) throw rpcError;
    return data ?? [];
  }
}

export async function cancelAppointmentByToken(input: TokenCancelInput): Promise<{ cancelled_at: string }> {
  assertToken(input.p_token);
  let data: Array<{ cancelled_at: string }>;
  try {
    data = await invokeTokenGateway<Array<{ cancelled_at: string }>>('appointment.cancel', {
      token: input.p_token,
      reason: input.p_reason,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'TOKEN_GATEWAY_NOT_DEPLOYED') throw error;
    const { data: legacyData, error: rpcError } = await supabase.rpc('cancel_appointment_by_token', input);
    if (rpcError) throw rpcError;
    data = legacyData ?? [];
  }
  const row = data?.[0];
  if (!row) throw new Error('CANCEL_EMPTY_RESPONSE');
  return row;
}

export async function rescheduleAppointmentByToken(input: TokenRescheduleInput): Promise<{ new_starts_at: string; new_ends_at: string }> {
  assertToken(input.p_token);
  let data: Array<{ new_starts_at: string; new_ends_at: string }>;
  try {
    data = await invokeTokenGateway<Array<{ new_starts_at: string; new_ends_at: string }>>('appointment.reschedule', {
      token: input.p_token,
      new_start: input.p_new_start,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'TOKEN_GATEWAY_NOT_DEPLOYED') throw error;
    const { data: legacyData, error: rpcError } = await supabase.rpc('reschedule_appointment_by_token', input);
    if (rpcError) throw rpcError;
    data = legacyData ?? [];
  }
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
