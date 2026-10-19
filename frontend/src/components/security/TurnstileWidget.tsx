import { useEffect, useRef, useState } from 'react';

type TurnstileOptions = {
  sitekey: string;
  theme?: 'light' | 'dark' | 'auto';
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = 'barberos-cloudflare-turnstile';
let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve();
      else reject(new Error('TURNSTILE_UNAVAILABLE'));
    };
    script.onerror = () => reject(new Error('TURNSTILE_SCRIPT_FAILED'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    document.getElementById(SCRIPT_ID)?.remove();
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export function TurnstileWidget({
  siteKey,
  onTokenChange,
}: {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let active = true;
    let widgetId: string | null = null;
    setLoadError(false);

    void loadTurnstile()
      .then(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container || !window.turnstile) throw new Error('TURNSTILE_UNAVAILABLE');

        widgetId = window.turnstile.render(container, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token) => {
            if (!active) return;
            setLoadError(false);
            onTokenChangeRef.current(token);
          },
          'expired-callback': () => {
            if (!active) return;
            onTokenChangeRef.current(null);
          },
          'error-callback': () => {
            if (!active) return;
            setLoadError(true);
            onTokenChangeRef.current(null);
          },
        });
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        onTokenChangeRef.current(null);
      });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, retryCount]);

  if (!siteKey.trim()) return null;

  return (
    <div className="space-y-2">
      <div ref={containerRef} aria-label="Verificação de segurança" />
      {loadError ? (
        <div role="alert" className="space-y-2">
          <p className="t-label text-st-noshow">
            Não foi possível concluir a verificação de segurança.
          </p>
          <button
            type="button"
            className="t-label text-accent-soft underline underline-offset-4"
            onClick={() => setRetryCount((value) => value + 1)}
          >
            Tentar carregar novamente
          </button>
        </div>
      ) : (
        <p className="t-label text-ink-mid">Verificação de segurança protegida por Cloudflare.</p>
      )}
    </div>
  );
}
