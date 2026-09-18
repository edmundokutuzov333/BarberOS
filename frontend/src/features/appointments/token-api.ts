import { useMutation, useQuery } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type AppointmentTokenView =
  Database['public']['Functions']['get_appointment_by_token']['Returns'][number];

export type TokenCancelInput =
  Database['public']['Functions']['cancel_appointment_by_token']['Args'];

export type TokenRescheduleInput =
  Database['public']['Functions']['reschedule_appointment_by_token']['Args'];

export type RescheduleSlot =
  Database['public']['Functions']['get_reschedule_slots_by_token']['Returns'][number];

export async function getAppointmentByToken(token: string): Promise<AppointmentTokenView | null> {
  const { data, error } = await supabase.rpc('get_appointment_by_token', { p_token: token });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getRescheduleSlotsByToken(token: string, date: string): Promise<RescheduleSlot[]> {
  const { data, error } = await supabase.rpc('get_reschedule_slots_by_token', { p_token: token, p_date: date });
  if (error) throw error;
  return data ?? [];
}

export async function cancelAppointmentByToken(input: TokenCancelInput): Promise<{ cancelled_at: string }> {
  const { data, error } = await supabase.rpc('cancel_appointment_by_token', input);
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('CANCEL_EMPTY_RESPONSE');
  return row;
}

export async function rescheduleAppointmentByToken(input: TokenRescheduleInput): Promise<{ new_starts_at: string; new_ends_at: string }> {
  const { data, error } = await supabase.rpc('reschedule_appointment_by_token', input);
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('RESCHEDULE_EMPTY_RESPONSE');
  return row;
}

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