import { supabase } from '@/lib/supabase';

export type TokenGatewayAction =
  | 'appointment.get'
  | 'appointment.reschedule_slots'
  | 'appointment.cancel'
  | 'appointment.reschedule'
  | 'review.get'
  | 'review.submit';

type TokenGatewayResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

export async function invokeTokenGateway<T>(
  action: TokenGatewayAction,
  input: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('token-gateway', {
    body: { action, ...input },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const response = await context.clone().json() as TokenGatewayResponse<unknown>;
        if (typeof response.error === 'string') throw new Error(response.error);
      } catch (cause) {
        if (cause instanceof Error && cause.message !== '') throw cause;
      }
    }
    throw error;
  }

  const response = data as TokenGatewayResponse<T> | null;
  if (!response?.ok) throw new Error(response?.error ?? 'TOKEN_GATEWAY_UNAVAILABLE');
  return response.data as T;
}
