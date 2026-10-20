import { useState } from 'react';
import { Scissors } from 'lucide-react';

export const BARBERSHOP_FALLBACK_PHOTOS = [
  'https://images.pexels.com/photos/11513688/pexels-photo-11513688.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/27520668/pexels-photo-27520668.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/11703458/pexels-photo-11703458.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'https://images.pexels.com/photos/7518728/pexels-photo-7518728.jpeg?auto=compress&dpr=1&h=750&w=1260',
];

export const BARBER_FALLBACK_PHOTOS = [
  'https://images.pexels.com/photos/7389079/pexels-photo-7389079.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/17086220/pexels-photo-17086220.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/35157692/pexels-photo-35157692.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6487911/pexels-photo-6487911.jpeg?auto=compress&cs=tinysrgb&w=1200',
];

type PhotoWithFallbackProps = {
  src?: string | null;
  fallbackSources?: string[];
  alt: string;
  className: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'sync' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
  width?: number;
  height?: number;
  placeholderClassName?: string;
};

/**
 * Tries the saved photo, then trusted photographic fallbacks. A failed remote
 * URL must never leave an empty image box on a public barbershop page.
 */
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
