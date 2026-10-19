const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** Accepts a full URL, /b/slug, /barbearia/slug, or a bare slug. */
export function extractShopSlug(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://x.invalid/${raw.replace(/^\/+/, '')}`);
    const match = url.pathname.match(/\/(?:b|barbearia)\/([a-z0-9]+(?:-[a-z0-9]+)*)/i);
    if (match?.[1]) return match[1].toLowerCase();
    const bare = url.pathname.replace(/^\/+|\/+$/g, '');
    return SLUG.test(bare) ? bare.toLowerCase() : null;
  } catch {
    return null;
  }
}

export type LocalBooking = { token: string; shopSlug: string; startsAt: string; serviceName: string };
const BOOKINGS_KEY = 'barberos.myBookings';

export function readLocalBookings(): LocalBooking[] {
  try {
    const value = JSON.parse(localStorage.getItem(BOOKINGS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return value.filter((item): item is LocalBooking => {
      if (!item || typeof item !== 'object') return false;
      const entry = item as Record<string, unknown>;
      return typeof entry.token === 'string' && typeof entry.shopSlug === 'string' && typeof entry.startsAt === 'string' && typeof entry.serviceName === 'string' && Date.parse(entry.startsAt) >= cutoff;
    }).slice(0, 10);
  } catch {
    return [];
  }
}

export function rememberLocalBooking(booking: LocalBooking): void {
  const next = [booking, ...readLocalBookings().filter((item) => item.token !== booking.token)].slice(0, 10);
  localStorage.setItem(BOOKINGS_KEY, JSON.stringify(next));
}
