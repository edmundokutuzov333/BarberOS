export interface Service { id: string; barbershop_id: string; name: string; price_cents: number; duration_min: number; requires_deposit: boolean; is_active: boolean; sort_order: number }
export interface Haircut { id: string; barbershop_id: string; service_id: string | null; name: string; description: string | null; photo_url: string | null; price_cents: number | null; duration_min: number | null; is_active: boolean; sort_order: number }
export interface Barber { id: string; barbershop_id: string; user_id: string | null; display_name: string; photo_url: string | null; bio: string | null; years_experience: number; rating_avg: number; rating_count: number; is_active: boolean; sort_order: number; barber_services?: { service_id: string }[] }
export interface WorkingHour { id: string; barbershop_id: string; barber_id: string | null; weekday: number; opens_at: string; closes_at: string; is_closed: boolean }
export type BlockReason = 'lunch' | 'day_off' | 'holiday' | 'meeting' | 'maintenance' | 'absence' | 'other';
export interface TimeBlock { id: string; barbershop_id: string; barber_id: string | null; starts_at: string; ends_at: string; reason: BlockReason; note: string | null }
export interface Member { id: string; user_id: string; role: 'owner' | 'manager' | 'barber'; full_name: string | null; email: string; created_at: string }

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const BLOCK_REASONS: Record<BlockReason, string> = {
  lunch: 'Almoço', day_off: 'Folga', holiday: 'Feriado', meeting: 'Reunião', maintenance: 'Manutenção', absence: 'Ausência', other: 'Imprevisto',
};
export const CANCEL_RULES = [
  { value: 'flex_2h', label: 'Flexível', body: 'Cancela ou remarca até 2 horas antes.' },
  { value: 'moderate_6h', label: 'Moderada', body: 'Até 6 horas antes.' },
  { value: 'strict_24h', label: 'Rigorosa', body: 'Até 24 horas antes.' },
  { value: 'contact_only', label: 'Só por contacto', body: 'Alterações apenas falando com a barbearia.' },
] as const;
export const ROLE_LABEL = { owner: 'Dono', manager: 'Gerente', barber: 'Barbeiro' } as const;
