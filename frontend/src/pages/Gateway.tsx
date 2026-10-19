import { lazy, Suspense, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Scissors, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Page } from '@/components/layout/Page';
import { Brand } from '@/components/ui/Brand';
import { extractShopSlug, readLocalBookings, type LocalBooking } from '@/lib/shop-link';

const QrScanDialog = lazy(() => import('@/features/gateway/QrScanDialog'));
type Audience = 'client' | 'shop' | null;
const AUDIENCE_KEY = 'barberos.audience';

function MyBookings() {
  const [bookings] = useState<LocalBooking[]>(readLocalBookings);
  if (!bookings.length) return null;
  return <section className="space-y-2 border-t border-white/10 pt-4" aria-label="As minhas marcações neste dispositivo">
    <h2 className="text-sm font-medium">As minhas marcações neste dispositivo</h2>
    {bookings.map((booking) => <Link key={booking.token} to={`/marcacao/${booking.token}`} className="block rounded-2xl border border-white/10 p-3 text-sm hover:border-white/30"><span className="block">{booking.serviceName}</span><span className="text-white/60">{new Date(booking.startsAt).toLocaleString('pt-MZ')}</span></Link>)}
  </section>;
}

export default function Gateway() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [audience, setAudience] = useState<Audience>(() => { const value = localStorage.getItem(AUDIENCE_KEY); return value === 'client' || value === 'shop' ? value : null; });
  const [code, setCode] = useState('');
  const [scan, setScan] = useState(false);
  const [error, setError] = useState('');
  const go = useCallback((slug: string) => navigate(`/barbearia/${slug}`), [navigate]);
  const choose = (value: Exclude<Audience, null>) => { localStorage.setItem(AUDIENCE_KEY, value); setAudience(value); };

  return <Page testId="gateway-page" className="barber-shell min-h-screen px-5 py-8">
    <header className="mx-auto max-w-3xl"><Brand size="md" /></header>
    <main className="mx-auto mt-10 max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-4"><div><p className="landing-section-kicker">BARBEROS</p><h1 className="text-3xl font-semibold">{t('gatewayTitle')}</h1></div><select aria-label="Idioma" value={i18n.language} onChange={(event) => { void i18n.changeLanguage(event.target.value); }} className="rounded-xl bg-black/30 px-2 py-2 text-xs"><option value="pt-MZ">PT-MZ</option><option value="pt-PT">PT-PT</option><option value="pt-BR">PT-BR</option><option value="en">EN</option><option value="es">ES</option></select></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" data-testid="gateway-client" onClick={() => choose('client')} aria-pressed={audience === 'client'} className="glass min-h-32 rounded-3xl p-6 text-left"><User aria-hidden className="mb-3" /><strong className="block">{t('client')}</strong><span className="text-sm opacity-80">{t('clientHint')}</span></button>
        <button type="button" data-testid="gateway-shop" onClick={() => choose('shop')} aria-pressed={audience === 'shop'} className="glass min-h-32 rounded-3xl p-6 text-left"><Scissors aria-hidden className="mb-3" /><strong className="block">{t('shop')}</strong><span className="text-sm opacity-80">{t('shopHint')}</span></button>
      </div>
      {audience === 'client' && <section className="glass space-y-3 rounded-3xl p-5" aria-label="Encontrar a minha barbearia">
        <label htmlFor="shop-code" className="text-sm">{t('shopLink')}</label>
        <div className="flex gap-2"><input id="shop-code" value={code} onChange={(event) => { setCode(event.target.value); setError(''); }} inputMode="url" autoCapitalize="none" className="min-h-11 min-w-0 flex-1 rounded-xl px-3 text-base text-black" placeholder="ex.: oryon" /><button type="button" className="min-h-11 rounded-full border border-white/20 px-5" onClick={() => { const slug = extractShopSlug(code); slug ? go(slug) : setError(t('invalidLink')); }}>{t('open')}</button></div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}<button type="button" className="min-h-11 w-full rounded-full border border-white/20" onClick={() => setScan(true)}>{t('scan')}</button><MyBookings />
      </section>}
      {audience === 'shop' && <section className="glass flex flex-wrap gap-3 rounded-3xl p-5"><Link to="/entrar" className="min-h-11 rounded-full border border-white/20 px-5 py-3">{t('login')}</Link><Link to="/registar" className="min-h-11 rounded-full bg-white px-5 py-3 text-black">{t('register')}</Link></section>}
      {audience && <button type="button" className="text-sm text-white/60 underline" onClick={() => { localStorage.removeItem(AUDIENCE_KEY); setAudience(null); }}>{t('change')}</button>}
    </main>
    {scan && <Suspense fallback={null}><QrScanDialog onSlug={(slug) => { setScan(false); go(slug); }} onClose={() => setScan(false)} /></Suspense>}
  </Page>;
}
