import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type BookAppointmentInput =
  Database['public']['Functions']['book_appointment']['Args'];

export type BookAppointmentResult = {
  manage_token: string;
  deposit_cents: number;
  needs_payment: boolean;
};

export class BookingRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = 'BookingRequestError';
    this.code = code;
    this.status = status;
  }
}

export function normalizeMozPhone(value: string): string {
  const compact = value.trim().replace(/[\s-]+/g, '');

  if (compact.startsWith('+258')) return compact;
  if (compact.startsWith('258')) return `+${compact}`;
  if (compact.startsWith('8')) return `+258${compact}`;

  return compact;
}

async function readFunctionError(error: unknown): Promise<{ code: string; status: number }> {
  const status = Number((error as { context?: Response })?.context?.status ?? 500);
  const context = (error as { context?: Response })?.context;

  if (context) {
    try {
      const body = await context.clone().json() as { error?: string };
      if (body?.error) return { code: body.error, status };
    } catch {
      // Fall through to the SDK error message.
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  const knownCodes = [
    'SLOT_TAKEN',
    'SLOT_UNAVAILABLE',
    'INVALID_DATE',
    'INVALID_NAME',
    'INVALID_PHONE',
    'INVALID_EMAIL',
    'BARBERSHOP_NOT_FOUND',
    'SERVICE_NOT_FOUND',
    'HAIRCUT_NOT_FOUND',
    'BARBER_NOT_FOUND',
    'INVALID_DEPOSIT_CONFIGURATION',
  ];

  const code = knownCodes.find((candidate) => message.includes(candidate)) ?? 'BOOKING_CREATE_FAILED';
  return { code, status };
}

export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const { data, error } = await supabase.functions.invoke('booking-create', {
    body: {
      ...input,
      p_phone: normalizeMozPhone(input.p_phone),
    },
  });

  if (error) {
    const { code, status } = await readFunctionError(error);
    throw new BookingRequestError(code, status, error.message);
  }

  if (!data?.ok || !data.booking?.manage_token) {
    throw new BookingRequestError(
      data?.error ?? 'BOOKING_EMPTY_RESPONSE',
      Number(data?.status ?? 500),
      data?.message ?? data?.error ?? 'BOOKING_EMPTY_RESPONSE',
    );
  }

  return {
    manage_token: data.booking.manage_token,
    deposit_cents: Number(data.booking.deposit_cents ?? 0),
    needs_payment: Boolean(data.booking.needs_payment),
  };
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
