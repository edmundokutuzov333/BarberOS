import { configurationPresence } from './configuration.ts';

Deno.test('missing or blank provider configuration cannot report present',()=>{
  for(const value of [undefined,'','   ']) {
    if(Object.values(configurationPresence(()=>value)).some(Boolean)) throw new Error('Missing configuration accepted');
  }
});
Deno.test('provider groups are independent and never return environment values',()=>{
  const values: Record<string,string>={RESEND_API_KEY:'sensitive-key',NOTIFICATION_EMAIL_FROM:'private-sender',RESEND_WEBHOOK_SECRET:'private-signature'};
  const result=configurationPresence(name=>values[name]);
  if(!result.resend_delivery||!result.resend_webhook||result.gmail_oauth||result.google_calendar||result.whatsapp) throw new Error('Incorrect provider grouping');
  if(Object.values(result).some(value=>typeof value!=='boolean')) throw new Error('Environment value exposed');
  const encoded=JSON.stringify(result);
  for(const secret of Object.values(values)) if(encoded.includes(secret)) throw new Error('Secret exposed');
});
