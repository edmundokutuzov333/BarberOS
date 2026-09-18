import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type BookAppointmentInput =
  Database['public']['Functions']['book_appointment']['Args'];

export type BookAppointmentResult =
  Database['public']['Functions']['book_appointment']['Returns'][number];

export function normalizeMozPhone(value: string): string {
  const compact = value.trim().replace(/[\s-]+/g, '');

  if (compact.startsWith('+258')) return compact;
  if (compact.startsWith('258')) return `+${compact}`;
  if (compact.startsWith('8')) return `+258${compact}`;

  return compact;
}

export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const { data, error } = await supabase.rpc('book_appointment', {
    ...input,
    p_phone: normalizeMozPhone(input.p_phone),
  });

  if (error) throw error;

  const result = data?.[0];
  if (!result) throw new Error('BOOKING_EMPTY_RESPONSE');

  return result;
}

export function useBookAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookAppointment,
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}
