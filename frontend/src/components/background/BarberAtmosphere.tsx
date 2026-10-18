import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
const MicroSlats = lazy(() => import('./MicroSlats'));
type BarberAtmosphereProps = { variant?: 'ambient' | 'hero' | 'quiet' };
function ShearsArtwork() {
  return <svg className="barber-tool barber-tool--scissors" viewBox="0 0 200 200" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M49 132 22 158" /><path d="M73 132 112 168" />
      <circle cx="35" cy="150" r="18" /><circle cx="86" cy="150" r="18" />
      <g className="barber-tool__blade barber-tool__blade--upper"><path d="M78 107 159 25 Q167 17 177 23 L94 119" /></g>
      <g className="barber-tool__blade barber-tool__blade--lower"><path d="M78 107 158 166 Q170 174 179 163 L92 98" /></g>
      <circle cx="78" cy="107" r="5" fill="currentColor" stroke="none" />
    </g>
  </svg>;
}
function StraightRazorArtwork() {
  return <svg className="barber-tool barber-tool--razor" viewBox="0 0 190 190" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M54 111 120 162 Q127 167 133 160 L140 151 L69 103" /><path d="M120 162 98 174 Q90 177 84 170 L58 133" />
      <g className="barber-tool__razor-blade"><path d="M54 111 22 35 Q17 23 29 21 L70 22 L80 83 L54 111Z" /><path d="M29 21 38 51" strokeOpacity=".55" /></g>
      <circle cx="54" cy="111" r="4" fill="currentColor" stroke="none" />
    </g>
  </svg>;
}
export function BarberAtmosphere({ variant = 'ambient' }: BarberAtmosphereProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (!portalTarget) return null;

  return createPortal(
    <div className={`barber-atmosphere barber-atmosphere--${variant}`} data-testid="barber-atmosphere" aria-hidden="true">
      <div className="barber-atmosphere__slats"><Suspense fallback={null}>
        <MicroSlats preset="swell" color="#8e6e31" glintColor="#dfc27b" backgroundColor="transparent"
          slatWidth={10} slatHeight={25} gap={4} roundness={0.75} speed={variant === "quiet" ? 0 : 0.16}
          interactive={false} paused={variant === "quiet"} cursorStrength={0.25} cursorSize={32}
          swirl={0} trail={0.8} lean={0} intro={variant !== "quiet"} introDuration={1.8} />
      </Suspense></div>
      <div className="barber-atmosphere__tools"><ShearsArtwork /><StraightRazorArtwork /></div>
    </div>,
    portalTarget,
  );
}
