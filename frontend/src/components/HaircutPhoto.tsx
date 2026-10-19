import { useState } from 'react';
import { Scissors } from 'lucide-react';
import { getDefaultHaircutPhoto } from '@/lib/default-haircut-photos';

const LAST_RESORT_PHOTO =
  'https://images.pexels.com/photos/7389079/pexels-photo-7389079.jpeg?auto=compress&cs=tinysrgb&w=1200';

type HaircutPhotoProps = {
  name: string;
  photoUrl?: string | null;
  alt?: string;
  className: string;
};

/**
 * Displays a shop's own photo first, then the catalogue reference. Broken or
 * empty URLs fall through to another real Pexels photo instead of a blank card.
 */
export function HaircutPhoto({ name, photoUrl, alt, className }: HaircutPhotoProps) {
  const defaultUrl = getDefaultHaircutPhoto(name)?.url;
  const candidates = Array.from(
    new Set([photoUrl?.trim(), defaultUrl, LAST_RESORT_PHOTO].filter((url): url is string => Boolean(url))),
  );
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const activeUrl = candidates.find((url) => !failedUrls.includes(url));

  if (!activeUrl) {
    return (
      <div
        role="img"
        aria-label={(alt ?? 'Fotografia de referência para ' + name) + ' indisponível'}
        className={className + ' grid place-items-center bg-[var(--surface-2)] text-ink-mid'}
      >
        <Scissors size={22} aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={activeUrl}
      alt={alt ?? 'Fotografia de referência para ' + name}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrls((current) => (current.includes(activeUrl) ? current : [...current, activeUrl]))}
    />
  );
}
