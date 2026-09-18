import type { Database } from './database.types';

export type Service = Database['public']['Tables']['services']['Row'];
export type Haircut = Database['public']['Tables']['haircuts']['Row'];
export type Barber = Database['public']['Tables']['barbers']['Row'] & {
  barber_services?: Array<Pick<Database['public']['Tables']['barber_services']['Row'], 'service_id'>>;
};
export type WorkingHour = Database['public']['Tables']['working_hours']['Row'];
export type BlockReason = Database['public']['Enums']['block_reason'];
export type TimeBlock = Database['public']['Tables']['time_blocks']['Row'];
export type ScheduleOverride = Database['public']['Tables']['schedule_overrides']['Row'];
export type Member = Database['public']['Tables']['barbershop_members']['Row'] & {
  full_name: string | null;
  email: string;
};

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const BLOCK_REASONS: Record<BlockReason, string> = {
  lunch: 'Almoço',
  day_off: 'Folga',
  holiday: 'Feriado',
  meeting: 'Reunião',
  maintenance: 'Manutenção',
  absence: 'Ausência',
  other: 'Imprevisto',
};

export const CANCEL_RULES = [
  { value: 'flex_2h', label: 'Flexível', body: 'Cancela ou remarca até 2 horas antes.' },
  { value: 'moderate_6h', label: 'Moderada', body: 'Até 6 horas antes.' },
  { value: 'strict_24h', label: 'Rigorosa', body: 'Até 24 horas antes.' },
  { value: 'contact_only', label: 'Só por contacto', body: 'Alterações apenas falando com a barbearia.' },
] as const;

export const ROLE_LABEL = {
  owner: 'Dono',
  manager: 'Gerente',
  barber: 'Barbeiro',
} as const;
