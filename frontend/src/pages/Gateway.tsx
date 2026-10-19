import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, LocateFixed, MapPin, Scissors, Search, Star, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Page } from '@/components/layout/Page';
import { Brand } from '@/components/ui/Brand';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { usePublicBarbershops, type PublicDirectoryShop } from '@/features/public-shop/api';
import { distanceInKm, formatDistance, getDirectionsUrl, getShopPublicUrl } from '@/lib/public-routing';
import { readLocalBookings, type LocalBooking } from '@/lib/shop-link';

const QrScanDialog = lazy(() => import('@/features/gateway/QrScanDialog'));
type Audience = 'client' | 'shop' | null;
const AUDIENCE_KEY = 'barberos.audience';

function MyBookings() {
  const [bookings] = useState<LocalBooking[]>(readLocalBookings);
  if (!bookings.length) return null;
  return <section className="space-y-2 border-t border-white/10 pt-5" aria-label="As minhas marcações neste dispositivo">
    <h2 className="text-sm font-medium">As minhas marcações neste dispositivo</h2>
    {bookings.map((booking) => <Link key={booking.token} to={`/marcacao/${booking.token}`} className="block rounded-2xl border border-white/10 p-3 text-sm hover:border-white/30"><span className="block">{booking.serviceName}</span><span className="text-white/60">{new Date(booking.startsAt).toLocaleString('pt-MZ')}</span></Link>)}
  </section>;
}

function ShopCard({ shop, distance }: { shop: PublicDirectoryShop; distance: number | null }) {
  const publicUrl = getShopPublicUrl(shop.slug);
  const directionsUrl = getDirectionsUrl(shop);
  return <article className="gateway-shop-card">
    <div className="gateway-shop-card-media">{shop.cover_url || shop.logo_url ? <img src={shop.cover_url || shop.logo_url || ''} alt="" loading="lazy" decoding="async" /> : <Scissors size={24} aria-hidden />}</div>
    <div className="gateway-shop-card-body">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="t-card truncate">{shop.name}</h3><p className="t-label text-ink-mid mt-1 flex items-center gap-1.5"><MapPin size={13} aria-hidden />{shop.address || 'Localização a configurar'}</p></div>{distance != null && <span className="gateway-distance" title="Distância aproximada em linha recta" aria-label={`Distância aproximada em linha recta: ${formatDistance(distance)}`}>{formatDistance(distance)}</span>}</div>
      {shop.description && <p className="t-body text-ink-mid mt-3 line-clamp-2">{shop.description}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4"><span className="t-label text-ink-mid">{shop.service_count} {shop.service_count === 1 ? 'serviço' : 'serviços'}</span>{shop.rating_count > 0 && <span className="t-label text-ink-mid inline-flex items-center gap-1"><Star size={13} className="text-accent-soft" fill="currentColor" /> {shop.rating_avg.toFixed(1)} ({shop.rating_count})</span>}</div>
      <div className="gateway-shop-actions"><a href={publicUrl} className="gateway-shop-primary">Ver barbearia <ArrowUpRight size={15} /></a>{directionsUrl && <a href={directionsUrl} target="_blank" rel="noreferrer" className="gateway-shop-secondary" aria-label={`Abrir rota para ${shop.name}`}><MapPin size={15} /> Rota</a>}</div>
    </div>
  </article>;
}

function ShopDirectory({ onScan }: { onScan: () => void }) {
  const query = usePublicBarbershops();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle');
  const findNearby = () => {
    if (!navigator.geolocation) { setLocationState('denied'); return; }
    setLocationState('loading');
    navigator.geolocation.getCurrentPosition((position) => { setLocation(position.coords); setLocationState('ready'); }, () => setLocationState('denied'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  };
  const shops = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt');
    return (query.data ?? []).filter((shop) => !term || `${shop.name} ${shop.address ?? ''} ${shop.description ?? ''}`.toLocaleLowerCase('pt').includes(term)).map((shop) => ({ shop, distance: location ? distanceInKm(location, shop) : null })).sort((a, b) => location && (a.distance != null || b.distance != null) ? (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY) : a.shop.name.localeCompare(b.shop.name, 'pt'));
  }, [location, query.data, search]);
  return <section className="gateway-directory glass" aria-label="Barbearias disponíveis">
    <div className="gateway-directory-header"><div><p className="landing-section-kicker">ESCOLHE O TEU DESTINO</p><h2 className="gateway-section-title">Barbearias disponíveis</h2><p className="t-body text-ink-mid mt-2">Entra na página da tua barbearia e marca o teu horário em poucos passos.</p></div><button type="button" className="gateway-qr-link" onClick={onScan}><Scissors size={15} /> Tenho um QR Code</button></div>
    <div className="gateway-directory-tools"><label className="gateway-search"><Search size={17} aria-hidden /><span className="sr-only">Pesquisar barbearia</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por nome, cidade ou bairro" /></label><button type="button" className="gateway-location-button" onClick={findNearby} disabled={locationState === 'loading'}><LocateFixed size={16} />{locationState === 'loading' ? 'A procurar…' : 'Encontrar perto de mim'}</button></div>
    {locationState === 'ready' && <p className="gateway-location-note" role="status">Ordenadas pela distância aproximada em linha recta. Usa «Rota» para veres o percurso por estrada.</p>}{locationState === 'denied' && <p className="gateway-location-note" role="status">Não foi possível aceder à localização. Podes pesquisar ou escolher manualmente.</p>}
    {query.isLoading && <div className="gateway-shop-grid" aria-busy="true"><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div>}
    {query.error && <ErrorState message="Não foi possível carregar as barbearias. Tenta novamente." onRetry={() => void query.refetch()} />}
    {!query.isLoading && !query.error && !shops.length && <div className="gateway-empty"><Scissors size={22} /><h3>{search ? 'Nenhuma barbearia encontrada' : 'Ainda não há barbearias publicadas'}</h3><p>{search ? 'Experimenta outro nome, cidade ou bairro.' : 'As barbearias disponíveis aparecerão aqui.'}</p></div>}
    {!!shops.length && <div className="gateway-shop-grid">{shops.map(({ shop, distance }) => <ShopCard key={shop.id} shop={shop} distance={distance} />)}</div>}
  </section>;
}

export default function Gateway() {
  const { t } = useTranslation();
  const [audience, setAudience] = useState<Audience>(() => { const value = localStorage.getItem(AUDIENCE_KEY); return value === 'client' || value === 'shop' ? value : null; });
  const [scan, setScan] = useState(false);
  const choose = (value: Exclude<Audience, null>) => { localStorage.setItem(AUDIENCE_KEY, value); setAudience(value); };
  return <Page testId="gateway-page" className="barber-shell gateway-page min-h-screen px-5 pb-12 sm:px-8">
    <header className="gateway-header max-w-6xl mx-auto"><Brand size="md" /><select aria-label="Idioma" value={i18n.language} onChange={(event) => { void i18n.changeLanguage(event.target.value); }} className="rounded-xl bg-black/30 px-2 py-2 text-xs"><option value="pt-MZ">PT-MZ</option><option value="pt-PT">PT-PT</option><option value="pt-BR">PT-BR</option><option value="en">EN</option><option value="es">ES</option></select></header>
    <main className="gateway-main max-w-6xl mx-auto"><div className="gateway-intro"><p className="landing-section-kicker">BARBEROS · A TUA PRÓXIMA MARCAÇÃO</p><h1 className="gateway-title">{t('gatewayTitle')}</h1><p className="gateway-lead">Entra directamente na tua barbearia através do link ou escolhe uma perto de ti.</p></div>
      <div className="gateway-audience-grid"><button type="button" data-testid="gateway-client" onClick={() => choose('client')} aria-pressed={audience === 'client'} className={`gateway-audience-card ${audience === 'client' ? 'is-selected' : ''}`}><span className="gateway-audience-icon"><User aria-hidden /></span><span><strong>{t('client')}</strong><small>{t('clientHint')}</small></span><ArrowUpRight size={18} aria-hidden /></button><button type="button" data-testid="gateway-shop" onClick={() => choose('shop')} aria-pressed={audience === 'shop'} className={`gateway-audience-card ${audience === 'shop' ? 'is-selected' : ''}`}><span className="gateway-audience-icon"><Scissors aria-hidden /></span><span><strong>{t('shop')}</strong><small>{t('shopHint')}</small></span><ArrowUpRight size={18} aria-hidden /></button></div>
      {audience === 'client' && <><ShopDirectory onScan={() => setScan(true)} /><MyBookings /></>}
      {audience === 'shop' && <section className="gateway-shop-access glass"><div><p className="landing-section-kicker">GESTÃO</p><h2 className="gateway-section-title">A tua operação começa aqui.</h2><p className="t-body text-ink-mid mt-2">Entra no painel ou regista a tua barbearia para receberes um link próprio e um QR Code.</p></div><div className="flex flex-wrap gap-3"><Link to="/entrar" className="gateway-access-secondary">{t('login')}</Link><Link to="/registar" className="gateway-access-primary">Registar a minha barbearia <ArrowUpRight size={15} /></Link></div></section>}
      {audience && <button type="button" className="gateway-change" onClick={() => { localStorage.removeItem(AUDIENCE_KEY); setAudience(null); }}>{t('change')}</button>}
    </main>
    {scan && <Suspense fallback={null}><QrScanDialog onSlug={(slug) => { setScan(false); window.location.assign(getShopPublicUrl(slug)); }} onClose={() => setScan(false)} /></Suspense>}
  </Page>;
}
