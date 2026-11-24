import { z } from 'zod';

const positionSchema = z.object({
  ok: z.literal(true),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative(),
  timestamp: z.number().finite().positive(),
}).strict();
export type CurrentPosition = Omit<z.infer<typeof positionSchema>, 'ok'>;
declare global {
  interface Window {
    barberosNative?: { apiVersion: number; getCurrentPosition: () => Promise<unknown> };
  }
}
export function parseSystemPosition(value: unknown): CurrentPosition {
  const position = positionSchema.parse(value);
  if (Math.abs(Date.now() - position.timestamp) > 360000) throw new Error('LOCATION_EXPIRED');
  const { latitude, longitude, accuracy, timestamp } = position;
  return { latitude, longitude, accuracy, timestamp };
}
export async function getCurrentPosition(): Promise<CurrentPosition> {
  const native = typeof window === 'undefined' ? undefined : window.barberosNative;
  if (native?.apiVersion === 1 && typeof native.getCurrentPosition === 'function') {
    return parseSystemPosition(await native.getCurrentPosition());
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error('LOCATION_UNAVAILABLE');
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(position => {
    try { resolve(parseSystemPosition({ ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp })); }
    catch (error) { reject(error); }
  }, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }));
}
