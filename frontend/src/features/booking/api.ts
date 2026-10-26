import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type ShopOrderItemInput = {
  variant_id: string;
  qty: number;
  options: string[];
  fulfilment_mode: 'consume_here' | 'takeaway';
};

export type ShopOrderSummary = {
  status: Database['public']['Enums']['shop_order_status'];
  item_count: number;
  subtotal_minor: number;
};

export type BookAppointmentInput =
  Database['public']['Functions']['book_appointment']['Args'] & {
    idempotency_key?: string;
    p_shop_items?: ShopOrderItemInput[];
  };

export type BookAppointmentResult = {
  manage_token: string;
  deposit_cents: number;
  needs_payment: boolean;
  shop_order?: ShopOrderSummary;
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

async function readFunctionError(error: unknown): Promise<{ code: string; status: number; message?: string }> {
  const status = Number((error as { context?: Response })?.context?.status ?? 500);
  const context = (error as { context?: Response })?.context;

  if (context) {
    try {
      const body = await context.clone().json() as { error?: string; message?: string };
      if (body?.error) return {
        code: body.error,
        status,
        ...(typeof body.message === "string" ? { message: body.message } : {}),
      };
    } catch {
      // Fall through to the SDK error message.
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/failed to send a request to the edge function|failed to fetch|networkerror|load failed|cors/i.test(message)) {
    return { code: 'BOOKING_NETWORK_UNAVAILABLE', status: 0 };
  }

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
    'RATE_LIMITED',
    'RATE_LIMIT_UNAVAILABLE',
    'BOOKING_REQUEST_INVALID',
    'BOOKING_CREATE_FAILED',
    'IDEMPOTENCY_IN_PROGRESS',
    'IDEMPOTENCY_STORE_UNAVAILABLE',
    'IDEMPOTENCY_KEY_REUSED',
    'SHOP_NOT_ENABLED',
    'SHOP_ITEM_UNAVAILABLE',
    'SHOP_STOCK_UNAVAILABLE',
    'INVALID_SHOP_ORDER_ITEMS',
    'INVALID_SHOP_ORDER_QUANTITY',
    'INVALID_SHOP_ORDER_OPTIONS',
    'INVALID_SHOP_FULFILMENT_MODE',
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
      idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
      p_phone: normalizeMozPhone(input.p_phone),
      p_shop_items: input.p_shop_items ?? [],
    },
  });

  if (error) {
    const { code, status, message } = await readFunctionError(error);
    throw new BookingRequestError(code, status, message);
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
    ...(data.booking.shop_order ? { shop_order: data.booking.shop_order as ShopOrderSummary } : {}),
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
