import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Instagram, MapPin, MessageCircle, Phone, Scissors, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { buildWhatsAppLink } from '@/lib/calendar';
import { formatMT, humanError } from '@/lib/utils';
import { applyTheme } from '@/themes';
import { usePublicBarbershop, type PublicBarber, type PublicHaircut, type PublicService, type PublicWorkingHour } from '@/features/public-shop/api';

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function timeLabel(value: string): string {
  return value.slice(0, 5);
}

function socialInstagram(value: string): string {
  const clean = value.trim();
  if (clean.toLowerCase().startsWith('http://') || clean.toLowerCase().startsWith('https://')) return clean;
  return 'https://instagram.com/' + clean.replace(/^@/, '');
}

function formatReviewDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function ServiceCard({ service }: { service: PublicService }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5 h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="t-card text-ink-hi">{service.name}</h3>
          <p className="t-label text-ink-mid mt-1">{service.duration_min} min</p>
        </div>
        <p className="t-card text-accent-soft whitespace-nowrap">{formatMT(service.price_cents)}</p>
      </div>
      {service.requires_deposit && <p className="t-label text-ink-mid mt-4">Sinal aplicável neste serviço.</p>}
    </article>
  );
}

function BarberCard({ barber }: { barber: PublicBarber }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5 h-full">
      <div className="flex items-center gap-4">
        {barber.photo_url ? (
          <img src={barber.photo_url} alt={barber.display_name} className="h-16 w-16 rounded-2xl object-cover" width="64" height="64" loading="lazy" decoding="async" />
        ) : (
          <div aria-hidden className="h-16 w-16 rounded-2xl bg-accent-soft/15 border border-accent-soft/15 grid place-items-center text-accent-soft text-xl">{barber.display_name.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="min-w-0">
          <h3 className="t-card text-ink-hi truncate">{barber.display_name}</h3>
          <p className="t-label text-ink-mid mt-1">{barber.years_experience} {barber.years_experience === 1 ? 'ano' : 'anos'} de experiência</p>
        </div>
      </div>
      {barber.bio && <p className="t-body text-ink-mid mt-4">{barber.bio}</p>}
      <div className="flex items-center gap-2 mt-4">
        <Star size={15} className="text-accent-soft" fill="currentColor" aria-hidden />
        <span className="t-body text-ink-hi">{barber.rating_count ? barber.rating_avg.toFixed(1) : 'Sem avaliações'}</span>
        {barber.rating_count > 0 && <span className="t-label text-ink-mid">({barber.rating_count})</span>}
      </div>
    </article>
  );
}

function Hours({ rows }: { rows: PublicWorkingHour[] }) {
  const ordered = [...rows].sort((a, b) => a.weekday - b.weekday);
  return (
    <div className="space-y-2">
      {ordered.map((row) => (
        <div key={row.weekday} className="flex items-center justify-between gap-4 rounded-2xl bg-white/5 border border-white/5 px-4 py-3">
          <span className="t-body text-ink-hi">{WEEKDAYS[row.weekday] ?? 'Dia'}</span>
          <span className={"t-body " + (row.is_closed ? 'text-ink-mid' : 'text-ink-hi')}>{row.is_closed ? 'Fechado' : timeLabel(row.opens_at) + '–' + timeLabel(row.closes_at)}</span>
        </div>
      ))}
    </div>
  );
}

export default function PublicBarbershop() {
  const { slug } = useParams<{ slug: string }>();
  const query = usePublicBarbershop(slug);
  const data = query.data;

  useEffect(() => {
    if (!data?.shop.theme_key) return;
    const previousTheme = document.documentElement.getAttribute('data-theme');
    applyTheme(data.shop.theme_key);
    return () => applyTheme(previousTheme);
  }, [data?.shop.theme_key]);

  useEffect(() => {
    if (!data) return;
    document.title = data.shop.name + ' · BarberOS';
    const description = data.shop.description || 'Conheça os serviços, cortes, equipa e horário desta barbearia.';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
  }, [data]);

  if (query.isLoading) {
    return (
      <div className="min-h-screen px-5 pb-16 sm:px-8">
        <div className="max-w-6xl mx-auto pt-6"><Skeleton className="h-80" lines={4} /></div>
        <main className="max-w-6xl mx-auto mt-6 grid lg:grid-cols-[1.4fr_.6fr] gap-6">
          <Skeleton className="h-[30rem]" lines={7} />
          <div className="space-y-6"><Skeleton className="h-64" lines={5} /><Skeleton className="h-64" lines={5} /></div>
        </main>
      </div>
    );
  }

  if (query.error || !data) {
    return (
      <div className="min-h-screen px-5 py-10 sm:px-8 grid place-items-center">
        <div className="w-full max-w-lg">
          <ErrorState message={humanError(query.error ?? new Error('BARBERSHOP_NOT_FOUND'))} onRetry={() => query.refetch()} />
          <div className="text-center mt-5"><Link to="/"><Button variant="secondary" size="sm" pill>Voltar ao BarberOS</Button></Link></div>
        </div>
      </div>
    );
  }

  const { shop, services, haircuts, barbers, working_hours, reviews } = data;
  const hasWhatsApp = Boolean(shop.whatsapp);
  const hasPhone = Boolean(shop.phone);
  const hasInstagram = Boolean(shop.instagram);
  const bookableServiceCount = services.filter((service) => barbers.some((barber) => barber.service_ids.includes(service.id))).length;
  const bookingReady = bookableServiceCount > 0;

  return (
    <div className="min-h-screen">
      <header className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between gap-4">
        <Link to="/" aria-label="BarberOS"><span className="t-card text-ink-hi">BarberOS <span className="font-light text-ink-mid">by Oryon</span></span></Link>
        <div className="flex items-center gap-4">
          <a href="#contacto" className="hidden sm:block t-label text-ink-mid hover:text-ink-hi transition-colors">Contactos</a>
          {bookingReady ? (
            <Link to={`/barbearia/${shop.slug}/marcar`}>
              <Button size="sm">Marcar agora</Button>
            </Link>
          ) : (
            <Button size="sm" disabled>Marcação indisponível</Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="relative min-h-[22rem] sm:min-h-[30rem]">
            {shop.cover_url ? (
              <img src={shop.cover_url} alt={shop.name} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" decoding="async" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(var(--accent-rgb),.3),transparent_45%),linear-gradient(135deg,var(--surface-2),var(--canvas-void))]" aria-hidden />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
              <div className="flex flex-col sm:flex-row sm:items-end gap-5">
                {shop.logo_url ? (
                  <img src={shop.logo_url} alt="Logótipo da barbearia" className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl object-cover border border-white/15 bg-black/30" width="96" height="96" decoding="async" />
                ) : (
                  <div aria-hidden className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl border border-white/15 bg-black/30 backdrop-blur-xl grid place-items-center text-3xl font-medium text-ink-hi">{shop.name.slice(0, 1).toUpperCase()}</div>
                )}
                <div className="min-w-0">
                  <h1 className="text-3xl sm:text-5xl font-medium tracking-[-0.02em] text-white">{shop.name}</h1>
                  {shop.description && <p className="t-body text-white/75 mt-2 max-w-2xl">{shop.description}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
                    {reviews.rating_count > 0 && <span className="inline-flex items-center gap-1.5 t-label text-white"><Star size={14} fill="currentColor" /> {reviews.rating_avg.toFixed(1)} · {reviews.rating_count} {reviews.rating_count === 1 ? 'avaliação' : 'avaliações'}</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid lg:grid-cols-[1.5fr_.5fr] gap-6 items-start">
          <div className="space-y-6">
            <div className="perf-deferred">
            <Panel title="Serviços" aside={<span className="t-label text-ink-mid">{services.length}</span>}>
              {services.length ? (
                <div className="grid sm:grid-cols-2 gap-3">{services.map((service) => <ServiceCard key={service.id} service={service} />)}</div>
              ) : <EmptyState title="Ainda sem serviços publicados" body="A barbearia ainda não disponibilizou serviços para marcação online." />}
            </Panel>
            </div>

            <div className="perf-deferred">
            <Panel title="Cortes" aside={<span className="t-label text-ink-mid">{haircuts.length}</span>}>
              {haircuts.length ? (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {haircuts.map((cut: PublicHaircut) => (
                    <article key={cut.id} className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
                      {cut.photo_url ? <img src={cut.photo_url} alt={cut.name} className="w-full aspect-[4/3] object-cover" loading="lazy" decoding="async" /> : null}
                      <div className="p-4">
                        <h3 className="t-card text-ink-hi">{cut.name}</h3>
                        {cut.description && <p className="t-body text-ink-mid mt-1.5">{cut.description}</p>}
                        {(cut.price_cents != null || cut.duration_min != null) && <p className="t-label text-accent-soft mt-3">{cut.price_cents != null ? formatMT(cut.price_cents) : ''}{cut.price_cents != null && cut.duration_min != null ? ' · ' : ''}{cut.duration_min != null ? cut.duration_min + ' min' : ''}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <EmptyState title="Ainda sem cortes publicados" body="Os cortes configurados pela barbearia aparecerão aqui." />}
            </Panel>
            </div>

            <div className="perf-deferred">
            <Panel title="A equipa" aside={<span className="t-label text-ink-mid">{barbers.length}</span>}>
              {barbers.length ? (
                <div className="grid sm:grid-cols-2 gap-3">{barbers.map((barber) => <BarberCard key={barber.id} barber={barber} />)}</div>
              ) : <EmptyState title="Ainda sem barbeiros publicados" body="A equipa desta barbearia ainda não está disponível publicamente." />}
            </Panel>
            </div>

            <div className="perf-deferred">
            <Panel title="Avaliações">
              {reviews.items.length ? (
                <div className="space-y-3">
                  {reviews.items.map((review, index) => (
                    <article key={review.created_at + '-' + index} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                      <div className="flex items-center gap-2 text-accent-soft" role="img" aria-label={review.rating + ' estrelas'}>
                        {Array.from({ length: 5 }).map((_, starIndex) => <Star key={starIndex} size={14} fill={starIndex < review.rating ? 'currentColor' : 'none'} aria-hidden />)}
                        <span className="t-label text-ink-mid ml-1">{formatReviewDate(review.created_at, shop.timezone)}</span>
                      </div>
                      {review.comment && <p className="t-body text-ink-hi mt-3">{review.comment}</p>}
                    </article>
                  ))}
                </div>
              ) : <EmptyState title="Ainda sem avaliações" body="As avaliações publicadas pelos clientes aparecerão aqui." />}
            </Panel>
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6">
            <Panel title="Horário">
              {working_hours.length ? <Hours rows={working_hours} /> : <EmptyState title="Horário não publicado" />}
              <p className="t-label text-ink-mid mt-4">Horário local: {shop.timezone}</p>
            </Panel>

            <Panel title="Contacto" testId="public-shop-contact">
              <div id="contacto" className="space-y-2">
                {shop.address && <div className="flex gap-3 rounded-2xl bg-white/5 p-4"><MapPin size={17} className="text-accent-soft mt-0.5" /><div><p className="t-label text-ink-mid">Morada</p><p className="t-body text-ink-hi mt-1">{shop.address}</p></div></div>}
                {hasWhatsApp && <a href={buildWhatsAppLink(shop.whatsapp!, 'Olá, gostaria de fazer uma marcação na ' + shop.name + '.')} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 select-none w-full h-11 px-5 text-sm rounded-2xl border transition-colors duration-150" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'transparent' }}><MessageCircle size={16} />Marcar pelo WhatsApp</a>}
                {hasPhone && <a href={'tel:' + shop.phone} className="inline-flex items-center justify-center gap-2 select-none w-full h-11 px-5 text-sm rounded-2xl border transition-colors duration-150" style={{ background: 'var(--surface-2)', color: 'var(--text-hi)' , borderColor: 'rgba(255,255,255,.1)' }}><Phone size={16} />Ligar para a barbearia</a>}
                {shop.maps_url && <a href={shop.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 select-none w-full h-11 px-5 text-sm rounded-2xl border transition-colors duration-150" style={{ background: 'var(--surface-2)', color: 'var(--text-hi)', borderColor: 'rgba(255,255,255,.1)' }}><MapPin size={16} />Abrir no mapa</a>}
                {hasInstagram && <a href={socialInstagram(shop.instagram!)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 w-full h-11 px-5 text-sm rounded-2xl text-ink-mid hover:text-ink-hi hover:bg-white/5 transition-colors duration-150"><Instagram size={16} />Instagram</a>}
              </div>
            </Panel>

            <div className="rounded-3xl border border-accent-soft/20 bg-accent-soft/10 p-5">
              <div className="flex items-start gap-3">
                <Scissors size={18} className="text-accent-soft mt-0.5" />
                <div>
                  <p className="t-card text-ink-hi">Marcação sem conta</p>
                  <p className="t-body text-ink-mid mt-1">{bookingReady ? 'Escolha serviço, corte, barbeiro, data e hora sem criar uma conta. A disponibilidade é calculada em tempo real.' : 'Esta barbearia ainda não tem um serviço associado a um barbeiro activo para marcação online.'}</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </main>

      <footer className="border-t border-white/5 px-5 sm:px-8 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="t-label text-ink-mid">{shop.name} · BarberOS by Oryon</span>
          <Link to="/" className="t-label text-accent-soft hover:text-ink-hi transition-colors">Conhecer o BarberOS</Link>
        </div>
      </footer>
    </div>
  );
}