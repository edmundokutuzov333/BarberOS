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
      let response: TokenGatewayResponse<unknown> | null = null;
      try {
        response = await context.clone().json() as TokenGatewayResponse<unknown>;
      } catch {
        // A missing Edge Function may return plain text rather than JSON.
      }
      if (typeof response?.error === 'string') throw new Error(response.error);
      if (context.status === 404) throw new Error('TOKEN_GATEWAY_NOT_DEPLOYED');
    }
    throw error;
  }

  const response = data as TokenGatewayResponse<T> | null;
  if (!response?.ok) throw new Error(response?.error ?? 'TOKEN_GATEWAY_UNAVAILABLE');
  return response.data as T;
}
