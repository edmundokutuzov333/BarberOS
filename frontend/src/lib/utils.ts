import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TZDate } from '@date-fns/tz';
import { format, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale';

export const TZ = 'Africa/Maputo';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export function formatMT(cents: number): string {
  const whole = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${cents < 0 ? '-' : ''}${w}${rest ? ',' + rest.toString().padStart(2, '0') : ''} MT`;
}

export const nowTz = () => new TZDate(Date.now(), TZ);
export const tz = (d: string | Date | number) => new TZDate(new Date(d).getTime(), TZ);
export const fmt = (d: string | Date | number, f: string) => format(tz(d), f, { locale: pt });
export const todayRange = () => {
  const n = nowTz();
  return { from: startOfDay(n).toISOString(), to: endOfDay(n).toISOString() };
};
export const monthStart = () => startOfMonth(nowTz()).toISOString();

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const ERRORS: Record<string, string> = {
  SLOT_TAKEN: 'Esse horário foi ocupado. Escolhe outro.',
  SLOT_UNAVAILABLE: 'Esse horário foi ocupado. Escolhe outro.',
  INVALID_DATE: 'Escolhe uma data válida.',
  INVALID_DATE_RANGE: 'O intervalo de datas não é válido.',
  BARBER_NOT_FOUND: 'Esse barbeiro já não está disponível.',
  INVALID_SLOT_INTERVAL: 'O intervalo de marcação configurado é inválido.',
  OVERRIDE_DATE_IN_PAST: 'A excepção tem de ser hoje ou uma data futura.',
  INVALID_OVERRIDE_HOURS: 'O horário especial tem de ter abertura e fecho válidos.',
  CLOSED_OVERRIDE_CANNOT_HAVE_HOURS: 'Um dia fechado não pode ter horas definidas.',
  OVERRIDE_NOT_FOUND: 'Essa excepção já não existe.',
  OVERRIDE_NOTE_TOO_LONG: 'A nota pode ter no máximo 500 caracteres.',
  TENANT_RELATION_MISMATCH: 'A configuração pertence a outra barbearia.'
  POLICY_LOCKED: 'Já passou o prazo para alterar online. Fala com a barbearia.',
  INVALID_PHONE: 'Número inválido. Usa o formato 84 000 0000.',
  BARBERSHOP_NOT_FOUND: 'Esta barbearia não está disponível.',
  SERVICE_NOT_FOUND: 'Esse serviço já não está disponível.',
  INVALID_NAME: 'Escreve um nome com pelo menos 2 letras.',
  INVALID_SLUG: 'O endereço só pode ter letras minúsculas, números e hífens.',
  SLUG_TAKEN: 'Esse endereço já está em uso. Escolhe outro.',
  NOT_AUTHENTICATED: 'A sessão expirou. Entra de novo.',
  'Invalid login credentials': 'Email ou palavra-passe incorrectos.',
  'User already registered': 'Já existe uma conta com este email. Entra em vez de registar.',
  'Email not confirmed': 'Confirma o email antes de entrar. Verifica a caixa de entrada.',
  'Password should be at least': 'A palavra-passe precisa de pelo menos 6 caracteres.',
  'rate limit': 'Demasiadas tentativas. Espera um minuto e tenta de novo.',
  'Failed to fetch': 'Sem ligação. Verifica a internet e tenta de novo.',
};

export function humanError(e: unknown): string {
  const msg = typeof e === 'string' ? e : ((e as { message?: string })?.message ?? '');
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k];
  return 'Algo falhou. Tenta de novo.';
}
