import type { AppointmentTokenView } from '@/features/appointments/token-api';

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function toIcsUtc(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildAppointmentCalendar(appointment: AppointmentTokenView, manageUrl: string): string {
  const location = appointment.shop_address ?? '';
  const description = [
    'Serviço: ' + appointment.service_name,
    appointment.haircut_name ? 'Corte: ' + appointment.haircut_name : null,
    'Barbeiro: ' + appointment.barber_name,
    'Gerir marcação: ' + manageUrl,
  ].filter(Boolean).join('\n');
  const uid = 'barberos-' + appointment.shop_slug + '-' + toIcsUtc(appointment.appointment_starts_at);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BarberOS by Oryon//Appointment//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + icsEscape(uid),
    'DTSTAMP:' + toIcsUtc(new Date().toISOString()),
    'DTSTART:' + toIcsUtc(appointment.appointment_starts_at),
    'DTEND:' + toIcsUtc(appointment.appointment_ends_at),
    'SUMMARY:' + icsEscape(appointment.service_name + ' · ' + appointment.shop_name),
    'DESCRIPTION:' + icsEscape(description),
    location ? 'LOCATION:' + icsEscape(location) : null,
    'URL:' + icsEscape(manageUrl),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => Boolean(line)).join('\r\n');
}

export function downloadAppointmentCalendar(appointment: AppointmentTokenView, manageUrl: string): void {
  const blob = new Blob([buildAppointmentCalendar(appointment, manageUrl)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'barberos-' + appointment.shop_slug + '-marcacao.ics';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const compact = phone.trim().replace(/[\s()-]+/g, '');
  if (compact.startsWith('http://') || compact.startsWith('https://')) {
    const url = new URL(compact);
    url.searchParams.set('text', message);
    return url.toString();
  }
  const normalized = compact.startsWith('+')
    ? compact.slice(1)
    : compact.startsWith('258')
      ? compact
      : '258' + compact.replace(/^0+/, '');
  return 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(message);
}