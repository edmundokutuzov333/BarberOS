import { useDeferredValue, useEffect, useState, type ReactNode } from 'react';
import { BellRing, CalendarClock, ChevronLeft, ChevronRight, Clock3, Hourglass, Search, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { useShop } from '@/lib/shop';
import { fmt, formatMT, humanError } from '@/lib/utils';
import {
  useCancelWaitlist,
  useWaitlist,
  useWaitlistMetrics,
  type WaitlistStatus,
  type WaitlistView,
} from '@/features/waitlist/api';

const PAGE_SIZE = 50;

const views: { key: WaitlistView; label: string }[] = [
  { key: 'active', label: 'Activa' },
  { key: 'waiting', label: 'A aguardar' },
  { key: 'offered', label: 'Oferta enviada' },
  { key: 'converted', label: 'Convertida' },
  { key: 'expired', label: 'Expirada' },
  { key: 'cancelled', label: 'Cancelada' },
  { key: 'all', label: 'Todas' },
];

const statusLabel: Record<WaitlistStatus, string> = {
  waiting: 'A aguardar',
  offered: 'Oferta enviada',
  converted: 'Convertida',
  expired: 'Expirada',
  cancelled: 'Cancelada',
};

function statusClass(status: WaitlistStatus): string {
  if (status === 'offered') return 'text-accent-soft bg-accent-soft/10 border-accent-soft/20';
  if (status === 'converted') return 'text-st-done bg-st-done/10 border-st-done/20';
  if (status === 'expired') return 'text-st-noshow bg-st-noshow/10 border-st-noshow/20';
  if (status === 'cancelled') return 'text-ink-mid bg-white/5 border-white/10';
  return 'text-ink-hi bg-white/5 border-white/10';
}

function periodLabel(period: string): string {
  if (period === 'morning') return 'Manhã';
  if (period === 'afternoon') return 'Tarde';
  if (period === 'evening') return 'Noite';
  return 'Qualquer hora';
}

function dateRange(from: string | null, to: string | null): string {
  if (!from && !to) return 'Sem limite de data';
  if (from === to || !to) return from ? fmt(from, 'dd MMM yyyy') : 'Sem data inicial';
  return fmt(from!, 'dd MMM') + ' → ' + fmt(to, 'dd MMM yyyy');
}

function remainingLabel(value: string | null): string {
  if (!value) return '';
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'Expirada';
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return 'Expira em ' + minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
}

export default function ListaEspera() {
  const { shop } = useShop();
  const [view, setView] = useState<WaitlistView>('active');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(0);
  const metrics = useWaitlistMetrics(shop?.id);
  const entries = useWaitlist(shop?.id, view, deferredSearch, page, PAGE_SIZE);
  const cancel = useCancelWaitlist();

  useEffect(() => setPage(0), [deferredSearch, view]);

  const totalCount = entries.data?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE));

  const cancelEntry = async (entryId: string, customerName: string) => {
    if (!window.confirm('Cancelar a entrada de ' + customerName + ' da lista de espera?')) return;
    try {
      await cancel.mutateAsync({ shopId: shop!.id, entryId });
      toast.success('Entrada removida da lista.');
    } catch (error) {
      toast.error(humanError(error));
    }
  };

  return (
    <Page
      testId="waitlist-page"
      title="Lista de espera"
      subtitle="Quando a agenda enche, a fila transforma vagas libertadas em oportunidades reais."
      actions={<span className="t-label text-ink-mid">{shop?.name ?? 'Barbearia'}</span>}
    >
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5" aria-label="Resumo da lista de espera">
        <MetricCard icon={<Hourglass size={17} />} label="A aguardar" value={metrics.data?.waiting_count ?? 0} loading={metrics.isLoading} />
        <MetricCard icon={<BellRing size={17} />} label="Ofertas activas" value={metrics.data?.offered_count ?? 0} loading={metrics.isLoading} />
        <MetricCard icon={<Clock3 size={17} />} label="Expiram em 5 min" value={metrics.data?.expiring_soon_count ?? 0} loading={metrics.isLoading} />
        <MetricCard icon={<UserCheck size={17} />} label="Convertidas · 30 dias" value={metrics.data?.converted_30d ?? 0} loading={metrics.isLoading} />
      </section>

      <Panel className="mb-4" testId="waitlist-controls">
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">Pesquisar lista de espera</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-lo" aria-hidden />
            <input
              data-testid="waitlist-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome, telefone ou email"
              className="field !pl-10 w-full"
              inputMode="search"
              autoComplete="off"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label="Estado da lista de espera">
            {views.map((item) => (
              <button
                type="button"
                key={item.key}
                role="tab"
                aria-selected={view === item.key}
                onClick={() => setView(item.key)}
                className={view === item.key
                  ? 'px-3.5 py-2 rounded-full bg-accent-soft text-accent-ink text-sm font-medium whitespace-nowrap'
                  : 'px-3.5 py-2 rounded-full text-ink-mid hover:text-ink-hi hover:bg-white/5 text-sm whitespace-nowrap'}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {entries.isLoading && (
        <div className="space-y-3" data-testid="waitlist-loading">
          <Skeleton className="h-28" lines={3} />
          <Skeleton className="h-28" lines={3} />
          <Skeleton className="h-28" lines={3} />
        </div>
      )}

      {entries.error && !entries.isLoading && (
        <ErrorState message={humanError(entries.error)} onRetry={() => void entries.refetch()} />
      )}

      {!entries.isLoading && !entries.error && !entries.data?.length && (
        <EmptyState
          testId="waitlist-empty"
          title={search.trim() ? 'Nenhum pedido encontrado' : 'A lista de espera está vazia'}
          body={search.trim()
            ? 'Experimenta outro nome, telefone ou email.'
            : 'Quando não houver disponibilidade na marcação pública, o cliente pode entrar aqui e esperar por uma vaga.'}
        />
      )}

      {!entries.isLoading && !entries.error && Boolean(entries.data?.length) && (
        <>
          <div className="hidden md:block overflow-hidden rounded-3xl border border-white/10 bg-white/[.02]">
            <table className="w-full border-collapse">
              <thead className="bg-white/[.03]">
                <tr className="text-left">
                  <th className="p-4 t-label text-ink-mid font-normal">Cliente</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Pedido</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Janela</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Estado</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Vaga</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Acção</th>
                </tr>
              </thead>
              <tbody>
                {entries.data!.map((entry) => (
                  <tr key={entry.waitlist_entry_id} data-testid={'waitlist-row-' + entry.waitlist_entry_id} className="border-t border-white/5">
                    <td className="p-4">
                      <p className="text-sm text-ink-hi font-medium">{entry.customer_name}</p>
                      <p className="t-label text-ink-mid mt-0.5">{entry.phone}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-ink-hi">{entry.service_name}</p>
                      <p className="t-label text-ink-mid mt-0.5">{entry.haircut_name ?? 'Sem corte específico'} · {entry.barber_name ?? 'Qualquer barbeiro'}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-ink-hi">{dateRange(entry.date_from, entry.date_to)}</p>
                      <p className="t-label text-ink-mid mt-0.5">{periodLabel(entry.period)}{entry.queue_position ? ' · #' + entry.queue_position : ''}</p>
                    </td>
                    <td className="p-4">
                      <span className={'inline-flex rounded-full px-2.5 py-1 t-label border ' + statusClass(entry.status)}>{statusLabel[entry.status]}</span>
                    </td>
                    <td className="p-4">
                      {entry.offer_slot_start ? (
                        <>
                          <p className="text-sm text-ink-hi">{fmt(entry.offer_slot_start, 'dd MMM, HH:mm')}</p>
                          <p className="t-label text-ink-mid mt-0.5">{entry.offer_barber_name ?? 'Barbeiro'}</p>
                          {entry.status === 'offered' && <p className="t-label text-accent-soft mt-1">{remainingLabel(entry.offer_expires_at)}</p>}
                        </>
                      ) : <span className="t-label text-ink-mid">Sem vaga atribuída</span>}
                    </td>
                    <td className="p-4">
                      {entry.status === 'waiting' || entry.status === 'offered'
                        ? <Button variant="ghost" size="sm" onClick={() => void cancelEntry(entry.waitlist_entry_id, entry.customer_name)} disabled={cancel.isPending}><UserX size={15} /> Cancelar</Button>
                        : <span className="t-label text-ink-lo">Sem acção</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {entries.data!.map((entry) => (
              <article key={entry.waitlist_entry_id} data-testid={'waitlist-card-' + entry.waitlist_entry_id} className="glass p-4 rounded-3xl border border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-hi font-medium truncate">{entry.customer_name}</p>
                    <p className="t-label text-ink-mid mt-0.5">{entry.phone}</p>
                  </div>
                  <span className={'shrink-0 inline-flex rounded-full px-2.5 py-1 t-label border ' + statusClass(entry.status)}>{statusLabel[entry.status]}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Info label="Serviço" value={entry.service_name} />
                  <Info label="Barbeiro" value={entry.barber_name ?? 'Qualquer'} />
                  <Info label="Janela" value={dateRange(entry.date_from, entry.date_to)} />
                  <Info label="Período" value={(periodLabel(entry.period)) + (entry.queue_position ? ' · #' + entry.queue_position : '')} />
                </div>
                {entry.offer_slot_start && (
                  <div className="mt-4 rounded-2xl bg-accent-soft/10 border border-accent-soft/20 p-3">
                    <p className="t-label text-accent-soft">Vaga oferecida</p>
                    <p className="text-sm text-ink-hi mt-1">{fmt(entry.offer_slot_start, 'dd MMM yyyy, HH:mm')}</p>
                    <p className="t-label text-ink-mid mt-0.5">{entry.offer_barber_name ?? 'Barbeiro'}{entry.status === 'offered' && entry.offer_expires_at ? ' · ' + remainingLabel(entry.offer_expires_at) : ''}</p>
                  </div>
                )}
                {(entry.status === 'waiting' || entry.status === 'offered') && (
                  <Button variant="ghost" size="sm" className="mt-3" onClick={() => void cancelEntry(entry.waitlist_entry_id, entry.customer_name)} disabled={cancel.isPending}>
                    <UserX size={15} /> Cancelar entrada
                  </Button>
                )}
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="t-label text-ink-mid">{page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, Number(totalCount))} de {Number(totalCount)}</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="Página anterior"><ChevronLeft size={15} /></Button>
                <span className="t-label text-ink-mid min-w-12 text-center">{page + 1}/{totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} aria-label="Página seguinte"><ChevronRight size={15} /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function MetricCard({ icon, label, value, loading }: { icon: ReactNode; label: string; value: number; loading: boolean }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-ink-mid">{icon}<span className="t-label">{label}</span></div>
      {loading ? <div className="h-7 w-16 rounded-lg bg-white/10 animate-pulse mt-2" /> : <p className="text-2xl text-ink-hi mt-2">{value.toLocaleString('pt-PT')}</p>}
    </Panel>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="t-label text-ink-lo">{label}</p><p className="text-sm text-ink-hi mt-0.5 truncate">{value}</p></div>;
}
