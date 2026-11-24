// Projection of the server's explicit, tenant-scoped commercial offer contract.
export type OfferService = { id: string; price_cents: number; duration_min: number; category?: string; subcategory?: string };
export type StyleOffer = { service_id: string; price_cents: number | null; duration_min: number | null };
export type OfferStyle = { id: string; service_id: string | null; price_cents: number | null; duration_min: number | null; additional_offers?: StyleOffer[]; skill_restricted?: boolean; skill_barber_ids?: string[] };
function variant(style: OfferStyle, serviceId: string | null | undefined): StyleOffer | undefined {
  if (!serviceId) return undefined;
  if (style.service_id === serviceId) return { service_id: serviceId, price_cents: style.price_cents, duration_min: style.duration_min };
  return style.additional_offers?.find((offer) => offer.service_id === serviceId);
}
export function styleMatchesService(style: OfferStyle, serviceId: string | null | undefined): boolean {
  const offer = variant(style, serviceId);
  return Boolean(offer && (offer.price_cents === null || (Number.isInteger(offer.price_cents) && offer.price_cents >= 0))
    && (offer.duration_min === null || (Number.isInteger(offer.duration_min) && offer.duration_min >= 5 && offer.duration_min <= 480)));
}
export function effectiveOffer<T extends OfferService>(service: T, style?: OfferStyle | null): T {
  const offer = style && styleMatchesService(style, service.id) ? variant(style, service.id) : undefined;
  if (!offer) return service;
  return { ...service, price_cents: offer.price_cents ?? service.price_cents, duration_min: offer.duration_min ?? service.duration_min };
}
export function barberCanStyle(barberId: string, style?: OfferStyle | null): boolean {
  return !style?.skill_restricted || Boolean(style.skill_barber_ids?.includes(barberId));
}
export function composeOffer<T extends OfferService & { requires_deposit: boolean }>(base: T, style: OfferStyle | undefined, addons: T[]): T {
  const primary = effectiveOffer(base, style);
  return { ...primary, price_cents: primary.price_cents + addons.reduce((sum, item) => sum + item.price_cents, 0), duration_min: primary.duration_min + addons.reduce((sum, item) => sum + item.duration_min, 0), requires_deposit: primary.requires_deposit || addons.some((item) => item.requires_deposit) };
}
export function compositionFits(offer: OfferService): boolean { return Number.isSafeInteger(offer.price_cents) && offer.price_cents >= 0 && offer.price_cents <= 2147483647 && Number.isInteger(offer.duration_min) && offer.duration_min >= 5 && offer.duration_min <= 480; }
export function groupServices<T extends OfferService>(services: T[]) {
  const groups = new Map<string, { category: string; subcategory: string; services: T[] }>();
  for (const service of services) {
    const category = service.category || 'Outros';
    const subcategory = service.subcategory || 'Geral';
    const key = JSON.stringify([category, subcategory]);
    const group = groups.get(key) ?? { category, subcategory, services: [] };
    group.services.push(service); groups.set(key, group);
  }
  return [...groups.values()];
}
export function bookingPath(slug: string, serviceId: string, styleId?: string, hasAddons = false): string {
  const params = new URLSearchParams({ service: serviceId, step: styleId && !hasAddons ? '3' : '2' });
  if (styleId) params.set('haircut', styleId);
  return '/barbearia/' + encodeURIComponent(slug) + '/marcar?' + params.toString();
}
