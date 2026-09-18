import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type PaymentProvider = Database['public']['Enums']['payment_provider'];

export type PaymentAccount = Database['public']['Functions']['get_payment_accounts']['Returns'][number];
export type PaymentRow = Database['public']['Functions']['get_payments']['Returns'][number];
export type PaymentMetrics = Database['public']['Functions']['get_payment_metrics']['Returns'][number];

export type ConfigurePaymentProviderInput = {
  shop: string;
  provider: PaymentProvider;
  enabled: boolean;
  account_reference?: string | null;
  public_config: Record<string, string>;
  credentials: Record<string, string>;
};

export type InitiatePaymentInput = {
  token: string;
  provider: PaymentProvider;
  msisdn: string;
  idempotency_key?: string;
};

export type PaymentInitiation = {
  ok: true;
  status: 'pending';
  provider: PaymentProvider;
  amount_cents: number;
  hold_expires_at: string;
  message: string;
};

export type PaymentStatusResponse = {
  ok: true;
  status: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';
  amount_cents: number;
  hold_expires_at: string | null;
  appointment_status?: Database['public']['Enums']['appointment_status'] | null;
  requires_refund?: boolean;
  message?: string;
};

const publicSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '');

function errorFromBody(value: unknown): Error | null {
  if (!value || typeof value !== 'object') return null;
  const message = (value as { error?: unknown }).error;
  return typeof message === 'string' && message ? new Error(message) : null;
}

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        const normalized = errorFromBody(parsed);
        if (normalized) throw normalized;
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== '') throw contextError;
      }
    }
    throw error;
  }
  const normalized = errorFromBody(data);
  if (normalized) throw normalized;
  return data as T;
}

export async function getPaymentAccounts(shop: string): Promise<PaymentAccount[]> {
  const { data, error } = await supabase.rpc('get_payment_accounts', {
    p_shop: shop,
    p_supabase_url: publicSupabaseUrl,
  });
  if (error) throw error;
  return data ?? [];
}

export async function configurePaymentProvider(input: ConfigurePaymentProviderInput) {
  const data = await invokeFunction<{ ok: true; account: unknown }>('payments-configure', input);
  return data.account;
}

export async function initiatePayment(input: InitiatePaymentInput): Promise<PaymentInitiation> {
  return invokeFunction<PaymentInitiation>('payments-initiate', {
    ...input,
    idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
  });
}

export async function getPaymentStatus(token: string): Promise<PaymentStatusResponse> {
  return invokeFunction<PaymentStatusResponse>('payments-status', { token });
}

export async function getPayments(
  shop: string,
  status?: Database['public']['Enums']['payment_state'] | null,
): Promise<PaymentRow[]> {
  const { data, error } = await supabase.rpc('get_payments', {
    p_shop: shop,
    p_status: status ?? null,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getPaymentMetrics(shop: string): Promise<PaymentMetrics> {
  const { data, error } = await supabase.rpc('get_payment_metrics', { p_shop: shop });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('PAYMENT_METRICS_EMPTY_RESPONSE');
  return row;
}

export function usePaymentAccounts(shop?: string) {
  return useQuery({
    queryKey: ['payment-accounts', shop],
    queryFn: () => getPaymentAccounts(shop!),
    enabled: Boolean(shop),
    staleTime: 15_000,
    retry: false,
  });
}

export function useConfigurePaymentProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: configurePaymentProvider,
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['payment-accounts', variables.shop] });
    },
  });
}

export function usePaymentStatus(token?: string, enabled = true) {
  return useQuery({
    queryKey: ['payment-status', token],
    queryFn: () => getPaymentStatus(token!),
    enabled: Boolean(token && enabled),
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.status === 'pending' ? 5_000 : false,
    retry: false,
  });
}

export function usePayments(shop?: string, status?: Database['public']['Enums']['payment_state'] | null) {
  return useQuery({
    queryKey: ['payments', shop, status],
    queryFn: () => getPayments(shop!, status),
    enabled: Boolean(shop),
    staleTime: 10_000,
    retry: false,
  });
}

export function usePaymentMetrics(shop?: string) {
  return useQuery({
    queryKey: ['payment-metrics', shop],
    queryFn: () => getPaymentMetrics(shop!),
    enabled: Boolean(shop),
    staleTime: 10_000,
    retry: false,
  });
}
