import { useState } from 'react';
import { Scissors } from 'lucide-react';

const DEFAULT_SUPABASE_URL = 'https://alseiinjzwjdiwtvkdzy.supabase.co';
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');

export function barberAssetUrl(asset: string): string {
  return SUPABASE_URL + '/functions/v1/barber-assets?asset=' + encodeURIComponent(asset);
}

export const BARBERSHOP_FALLBACK_PHOTOS = [
  barberAssetUrl('shop-magoanine'),
  barberAssetUrl('shop-oryon'),
  barberAssetUrl('shop-matola'),
];

export const BARBER_FALLBACK_PHOTOS = [
  barberAssetUrl('barber-magoanine-1'),
  barberAssetUrl('barber-matola-1'),
  barberAssetUrl('barber-oryon-1'),
  barberAssetUrl('barber-magoanine-2'),
];

export const SERVICE_FALLBACK_PHOTOS = [
  barberAssetUrl('service-corte-classico'),
  barberAssetUrl('service-degrade'),
  barberAssetUrl('service-corte-barba'),
  barberAssetUrl('service-barba-completa'),
  barberAssetUrl('service-corte-infantil'),
];

type PhotoWithFallbackProps = {
  src?: string | null;
  fallbackSources?: string[];
  alt: string;
  className: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'sync' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
  width?: number | string;
  height?: number | string;
  placeholderClassName?: string;
};

/** Tries the saved photo and then approved photographic references. Never use a logo as a cover. */
export function PhotoWithFallback({
  src,
  fallbackSources = [],
  alt,
  className,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  width,
  height,
  placeholderClassName = '',
}: PhotoWithFallbackProps) {
  const candidates = Array.from(
    new Set([src?.trim(), ...fallbackSources].filter((value): value is string => Boolean(value))),
  );
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const activeSource = candidates.find((candidate) => !failedSources.includes(candidate));

  if (!activeSource) {
    return (
      <div
        role="img"
        aria-label={alt + ' indisponível'}
        className={className + ' grid place-items-center bg-[var(--surface-2)] text-ink-mid ' + placeholderClassName}
      >
        <Scissors size={22} aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      key={activeSource}
      src={activeSource}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      width={width}
      height={height}
      onError={() => setFailedSources((current) => current.includes(activeSource) ? current : [...current, activeSource])}
    />
  );
}
