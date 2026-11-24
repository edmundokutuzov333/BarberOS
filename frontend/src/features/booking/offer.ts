// Shared projection of the server's explicit offer contract.
// Only a linked style can be booked. Null price/time inherit the base service.
export type OfferService = { id: string; price_cents: number; duration_min: number };
export type OfferStyle = { id: string; service_id: string | null; price_cents: number | null; duration_min: number | null };
export function styleMatchesService(style: OfferStyle, serviceId: string | null | undefined): boolean {
  return Boolean(serviceId && style.service_id === serviceId
    && (style.price_cents === null || (Number.isInteger(style.price_cents) && style.price_cents >= 0))
    && (style.duration_min === null || (Number.isInteger(style.duration_min) && style.duration_min >= 5 && style.duration_min <= 480)));
}
export function effectiveOffer<T extends OfferService>(service: T, style?: OfferStyle | null): T {
  if (!style || !styleMatchesService(style, service.id)) return service;
  return { ...service, price_cents: style.price_cents ?? service.price_cents, duration_min: style.duration_min ?? service.duration_min };
}
export function bookingPath(slug: string, serviceId: string, styleId?: string): string {
  const params = new URLSearchParams({ service: serviceId, step: styleId ? '3' : '2' });
  if (styleId) params.set('haircut', styleId);
  return '/barbearia/' + encodeURIComponent(slug) + '/marcar?' + params.toString();
}
