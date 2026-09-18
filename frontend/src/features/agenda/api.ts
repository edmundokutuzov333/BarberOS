import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type AgendaAppointment =
  Database['public']['Functions']['get_agenda_appointments']['Returns'][number];
export type AgendaSchedule =
  Database['public']['Functions']['get_agenda_schedule']['Returns'][number];
export type AppointmentAction =
  Database['public']['Functions']['transition_appointment']['Args']['p_action'];
export type TransitionResult =
  Database['public']['Functions']['transition_appointment']['Returns'][number];
export type OperatorRescheduleResult =
  Database['public']['Functions']['reschedule_appointment_by_operator']['Returns'][number];

export async function getAgendaAppointments(
  shopId: string,
  from: string,
  to: string,
): Promise<AgendaAppointment[]> {
  const { data, error } = await supabase.rpc('get_agenda_appointments', {
    p_shop: shopId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getAgendaSchedule(
  shopId: string,
  from: string,
  to: string,
): Promise<AgendaSchedule[]> {
  const { data, error } = await supabase.rpc('get_agenda_schedule', {
    p_shop: shopId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data ?? [];
}

export function useAgendaAppointments(
  shopId?: string,
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ['agenda', 'appointments', shopId, from, to],
    queryFn: () => getAgendaAppointments(shopId!, from!, to!),
    enabled: Boolean(shopId && from && to),
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useAgendaSchedule(
  shopId?: string,
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ['agenda', 'schedule', shopId, from, to],
    queryFn: () => getAgendaSchedule(shopId!, from!, to!),
    enabled: Boolean(shopId && from && to),
    staleTime: 30_000,
    retry: false,
  });
}

export async function transitionAppointment(
  shopId: string,
  appointmentId: string,
  action: AppointmentAction,
  reason?: string | null,
): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc('transition_appointment', {
    p_shop: shopId,
    p_appointment: appointmentId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error('APPOINTMENT_ACTION_EMPTY_RESPONSE');
  return result;
}

export function useAppointmentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      shopId: string;
      appointmentId: string;
      action: AppointmentAction;
      reason?: string | null;
    }) => transitionAppointment(input.shopId, input.appointmentId, input.action, input.reason),
    retry: false,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agenda'] });
    },
  });
}

export async function rescheduleAppointmentByOperator(
  shopId: string,
  appointmentId: string,
  newStart: string,
): Promise<OperatorRescheduleResult> {
  const { data, error } = await supabase.rpc('reschedule_appointment_by_operator', {
    p_shop: shopId,
    p_appointment: appointmentId,
    p_new_start: newStart,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error('RESCHEDULE_EMPTY_RESPONSE');
  return result;
}

export function useOperatorReschedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { shopId: string; appointmentId: string; newStart: string }) =>
      rescheduleAppointmentByOperator(input.shopId, input.appointmentId, input.newStart),
    retry: false,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agenda'] });
      await qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}
