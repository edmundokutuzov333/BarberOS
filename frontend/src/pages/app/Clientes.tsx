import { useDeferredValue, useEffect, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Search, UserRound, Users, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { useShop } from '@/lib/shop';
import { fmt, formatMT, humanError } from '@/lib/utils';
import { useCustomerMetrics, useCustomers, type CustomerView } from '@/features/customers/api';

const PAGE_SIZE = 50;

const views: { key: CustomerView; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'upcoming', label: 'Com próxima marcação' },
  { key: 'no_show', label: 'Com faltas' },
  { key: 'never_visited', label: 'Sem visita' },
];

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

function CustomerAvatar({ name }: { name: string }) {
  return (
    <span className="h-10 w-10 shrink-0 rounded-2xl bg-accent-soft/15 border border-accent-soft/20 grid place-items-center text-accent-soft font-medium text-sm" aria-hidden>
      {initials(name)}
    </span>
  );
}

export default function Clientes() {
  const { shop } = useShop();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [view, setView] = useState<CustomerView>('all');
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [deferredSearch, view]);

  const metrics = useCustomerMetrics(shop?.id);
  const customers = useCustomers(shop?.id, deferredSearch, view, page, PAGE_SIZE);
  const totalCount = customers.data?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE));

  return (
    <Page
      testId="customers-page"
      title="Clientes"
      subtitle="A ficha operacional de quem já passou pela sua barbearia."
      actions={<span className="t-label text-ink-mid">{shop?.name ?? 'Barbearia'}</span>}
    >
      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5" aria-label="Resumo de clientes">
        <MetricCard icon={<Users size={17} />} label="Clientes" value={metrics.data?.total_customers ?? 0} loading={metrics.isLoading} />
        <MetricCard icon={<CalendarClock size={17} />} label="Com próxima" value={metrics.data?.customers_with_upcoming ?? 0} loading={metrics.isLoading} />
        <MetricCard icon={<CalendarClock size={17} />} label="Visitaram 30 dias" value={metrics.data?.customers_visited_last_30d ?? 0} loading={metrics.isLoading} />
        <MetricCard icon={<UserX size={17} />} label="Com faltas" value={metrics.data?.customers_with_no_shows ?? 0} loading={metrics.isLoading} />
        <MetricCard icon={<UserRound size={17} />} label="Recorrentes" value={metrics.data?.returning_customers ?? 0} loading={metrics.isLoading} />
      </section>

      <Panel className="mb-4" testId="customers-controls">
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">Pesquisar cliente</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-lo" aria-hidden />
            <input
              data-testid="customer-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome, telefone ou email"
              className="field !pl-10 w-full"
              inputMode="search"
              autoComplete="off"
            />
          </label>

          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label="Filtrar clientes">
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

      {metrics.error && <div className="mb-4"><ErrorState message={humanError(metrics.error)} onRetry={() => void metrics.refetch()} /></div>}

      {customers.isLoading && (
        <div className="space-y-3" data-testid="customers-loading">
          <Skeleton className="h-20" lines={2} />
          <Skeleton className="h-20" lines={2} />
          <Skeleton className="h-20" lines={2} />
        </div>
      )}

      {customers.error && !customers.isLoading && (
        <ErrorState message={humanError(customers.error)} onRetry={() => void customers.refetch()} />
      )}

      {!customers.isLoading && !customers.error && !customers.data?.length && (
        <EmptyState
          testId="customers-empty"
          title={search.trim() ? 'Nenhum cliente encontrado' : 'Ainda não há clientes'}
          body={search.trim()
            ? 'Tente outro nome, telefone ou email.'
            : 'Os clientes entram aqui automaticamente quando fazem uma marcação. Pode também usar o fluxo de marcação presencial.'}
        />
      )}

      {!customers.isLoading && !customers.error && Boolean(customers.data?.length) && (
        <>
          <div className="hidden md:block overflow-hidden rounded-3xl border border-white/10 bg-white/[.02]">
            <table className="w-full border-collapse">
              <thead className="bg-white/[.03]">
                <tr className="text-left">
                  <th className="p-4 t-label text-ink-mid font-normal">Cliente</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Última visita</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Próxima</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Visitas</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Total gasto</th>
                </tr>
              </thead>
              <tbody>
                {customers.data!.map((customer) => (
                  <tr
                    key={customer.customer_id}
                    data-testid={'customer-row-' + customer.customer_id}
                    tabIndex={0}
                    onClick={() => navigate('/app/clientes/' + customer.customer_id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate('/app/clientes/' + customer.customer_id);
                      }
                    }}
                    className="border-t border-white/5 cursor-pointer hover:bg-white/[.025] focus-visible:outline-none focus-visible:bg-white/[.04]"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <CustomerAvatar name={customer.name} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-hi truncate">{customer.name}</p>
                          <p className="t-label text-ink-mid truncate mt-0.5">{customer.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-ink-hi">{customer.last_visit_at ? fmt(customer.last_visit_at, 'dd MMM yyyy') : 'Sem visita'}</p>
                      <p className="t-label text-ink-mid mt-0.5">{customer.last_service_name ?? 'Sem serviço concluído'}</p>
                    </td>
                    <td className="p-4">
                      {customer.next_appointment_at
                        ? <><p className="text-sm text-ink-hi">{fmt(customer.next_appointment_at, 'dd MMM, HH:mm')}</p><p className="t-label text-ink-mid mt-0.5">{customer.next_appointment_status === 'pending' ? 'Pendente' : 'Confirmada'}</p></>
                        : <span className="t-label text-ink-mid">Sem marcação</span>}
                    </td>
                    <td className="p-4 text-sm text-ink-hi">{customer.visits_count}</td>
                    <td className="p-4 text-sm text-ink-hi">{formatMT(customer.total_spend_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {customers.data!.map((customer) => (
              <button
                type="button"
                key={customer.customer_id}
                data-testid={'customer-card-' + customer.customer_id}
                onClick={() => navigate('/app/clientes/' + customer.customer_id)}
                className="w-full text-left glass p-4 rounded-3xl border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
              >
                <div className="flex items-start gap-3">
                  <CustomerAvatar name={customer.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-hi truncate">{customer.name}</p>
                    <p className="t-label text-ink-mid mt-0.5">{customer.phone}</p>
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <InfoBlock label="Visitas" value={String(customer.visits_count)} />
                      <InfoBlock label="Última visita" value={customer.last_visit_at ? fmt(customer.last_visit_at, 'dd MMM yyyy') : 'Sem visita'} />
                      <InfoBlock label="Próxima" value={customer.next_appointment_at ? fmt(customer.next_appointment_at, 'dd MMM, HH:mm') : 'Sem marcação'} />
                      <InfoBlock label="Total gasto" value={formatMT(customer.total_spend_cents)} />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="t-label text-ink-mid">
                {page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, Number(totalCount))} de {Number(totalCount)}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="Página anterior">
                  <ChevronLeft size={15} />
                </Button>
                <span className="t-label text-ink-mid min-w-12 text-center">{page + 1}/{totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} aria-label="Página seguinte">
                  <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function MetricCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading: boolean }) {
  return (
    <Panel className="p-4" testId={'customers-metric-' + label.replace(/\s+/g, '-').toLowerCase()}>
      <div className="flex items-center gap-2 text-ink-mid">{icon}<span className="t-label">{label}</span></div>
      {loading ? <div className="h-7 w-16 rounded-lg bg-white/10 animate-pulse mt-2" /> : <p className="text-2xl text-ink-hi mt-2">{value.toLocaleString('pt-PT')}</p>}
    </Panel>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div><p className="t-label text-ink-lo">{label}</p><p className="text-sm text-ink-hi mt-0.5 truncate">{value}</p></div>;
}
