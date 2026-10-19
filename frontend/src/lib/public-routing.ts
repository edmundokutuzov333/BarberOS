const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin', 'api', 'staging', 'dev']);

function configuredRootDomain(): string | null {
  const value = String(import.meta.env.VITE_BARBEROS_ROOT_DOMAIN ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return value || null;
}

/** Returns the tenant slug when the current host is a configured shop subdomain. */
export function getShopSlugFromHost(hostname = window.location.hostname): string | null {
  const root = configuredRootDomain();
  if (!root || hostname === root || !hostname.endsWith(`.${root}`)) return null;
  const subdomain = hostname.slice(0, -(root.length + 1)).split('.').pop() ?? '';
  return SLUG.test(subdomain) && !RESERVED_SUBDOMAINS.has(subdomain) ? subdomain : null;
}

/**
 * Subdomains are canonical when the deployment provides a root domain. The
 * path URL remains a safe fallback for localhost, preview deployments and
 * environments where DNS has not been configured yet.
 */
export function getShopPublicUrl(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  const root = configuredRootDomain();
  if (root && typeof window !== 'undefined') return `${window.location.protocol}//${normalized}.${root}`;
  return `${window.location.origin}/barbearia/${normalized}`;
}

export function getShopPublicPath(slug: string): string {
  return `/barbearia/${slug.trim().toLowerCase()}`;
}

export function getDirectionsUrl({ lat, lng, address }: { lat: number | null; lng: number | null; address: string | null }): string | null {
  const destination = lat != null && lng != null ? `${lat},${lng}` : address?.trim();
  if (!destination) return null;
  const encoded = encodeURIComponent(destination);
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  return isApple ? `https://maps.apple.com/?daddr=${encoded}` : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

export function distanceInKm(from: { latitude: number; longitude: number }, to: { lat: number | null; lng: number | null }): number | null {
  if (to.lat == null || to.lng == null) return null;
  const earthRadiusKm = 6371;
  const dLat = ((to.lat - from.latitude) * Math.PI) / 180;
  const dLng = ((to.lng - from.longitude) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((from.latitude * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(value: number | null): string | null {
  if (value == null) return null;
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${value.toFixed(value < 10 ? 1 : 0)} km`;
}
