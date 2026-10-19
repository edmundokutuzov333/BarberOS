import { useEffect, useRef, useState } from 'react';
import { extractShopSlug } from '@/lib/shop-link';

type Scanner = { start: () => Promise<void>; stop: () => void; destroy: () => void };

export default function QrScanDialog({ onSlug, onClose }: { onSlug: (slug: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let scanner: Scanner | null = null;
    let alive = true;
    void (async () => {
      try {
        const { default: QrScanner } = await import('qr-scanner');
        if (!alive || !video.current) return;
        scanner = new QrScanner(video.current, (result) => {
          const slug = extractShopSlug(result.data);
          if (slug) { scanner?.stop(); onSlug(slug); }
        }, { preferredCamera: 'environment', highlightScanRegion: true, returnDetailedScanResult: true });
        await scanner.start();
      } catch {
        setError('Não foi possível abrir a câmara. Cola o link da barbearia.');
      }
    })();
    return () => { alive = false; scanner?.stop(); scanner?.destroy(); };
  }, [onSlug]);

  return <div role="dialog" aria-modal="true" aria-label="Ler QR da barbearia" className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
    <div className="w-full max-w-sm space-y-3 rounded-3xl glass p-4">
      {error ? <p role="alert" className="p-4 text-sm">{error}</p> : <video ref={video} className="aspect-square w-full rounded-2xl object-cover" muted playsInline />}
      <button type="button" className="min-h-11 w-full rounded-full border border-white/20 px-4" onClick={onClose}>Fechar</button>
    </div>
  </div>;
}
