import { supabase } from '@/lib/supabase';

type GoogleCalendarStartResponse = {
  ok?: boolean;
  error?: string;
  authorization_url?: string;
};

const messages: Record<string, string> = {
  GOOGLE_CALENDAR_NOT_CONFIGURED: 'A ligação ao Google Calendar ainda não foi configurada pelo BarberOS.',
  GOOGLE_CALENDAR_INVALID_REQUEST: 'Não foi possível iniciar a ligação ao calendário para esta marcação.',
  GOOGLE_CALENDAR_APPOINTMENT_NOT_FOUND: 'Esta marcação já não está disponível para adicionar ao calendário.',
  GOOGLE_CALENDAR_APPOINTMENT_NOT_ACTIVE: 'Só é possível adicionar ao calendário uma marcação futura activa.',
  GOOGLE_CALENDAR_RATE_LIMITED: 'Foram feitas demasiadas tentativas. Aguarde alguns minutos e tente novamente.',
  GOOGLE_CALENDAR_PROVIDER_FAILED: 'O Google Calendar não conseguiu guardar a marcação. Tente novamente.',
};

export async function getGoogleCalendarAuthorizationUrl(token: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<GoogleCalendarStartResponse>('google-calendar', {
    body: { action: 'authorize', token },
  });

  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as GoogleCalendarStartResponse;
        if (payload.error && messages[payload.error]) throw new Error(messages[payload.error]);
      } catch (readError) {
        if (readError instanceof Error && Object.values(messages).includes(readError.message)) throw readError;
      }
    }
    throw new Error('Não foi possível contactar o serviço Google Calendar. Tente novamente.');
  }

  if (!data?.ok || typeof data.authorization_url !== 'string') {
    throw new Error(messages[data?.error ?? ''] ?? 'Não foi possível iniciar a ligação ao Google Calendar.');
  }

  const url = new URL(data.authorization_url);
  if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') {
    throw new Error('O endereço de autorização do Google não é válido.');
  }
  return url.toString();
}
