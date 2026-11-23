type ReadEnvironment = (name: string) => string | undefined;

/** Presence only: no credentials, addresses or provider responses are exposed. */
export function configurationPresence(read: ReadEnvironment) {
  const present = (...names: string[]) => names.every(name => Boolean(read(name)?.trim()));
  return {
    gmail_oauth: present('GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI','GMAIL_TOKEN_ENCRYPTION_KEY','GMAIL_APP_URL'),
    resend_delivery: present('RESEND_API_KEY','NOTIFICATION_EMAIL_FROM'),
    resend_webhook: present('RESEND_WEBHOOK_SECRET'),
    google_calendar: present('GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_STATE_SECRET'),
    whatsapp: present('WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATES_JSON'),
  };
}
