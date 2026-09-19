import { useDeferredValue, useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { useAdminShops, type AdminShop, type ShopStatus } from '@/features/admin/api';
import { fmt, humanError } from '@/lib/utils';

const PAGE_SIZE = 25;

const FILTERS: { value: ShopStatus | null; label: string }[] = [
  { value: null, label: 'Todas' },
  { value: 'trial', label: 'Teste' },
  { value: 'active', label: 'Activas' },
  { value: 'suspended', label: 'Suspensas' },
  { value: 'cancelled', label: 'Canceladas' },
];

const STATUS_PT: Record<ShopStatus, string> = {
  trial: 'Teste',
  active: 'Activa',
  suspended: 'Suspensa',
  cancelled: 'Cancelada',
};

export default function AdminBarbearias() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<ShopStatus | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [deferredSearch, status]);

  const q = useAdminShops({
    search: deferredSearch,
    status,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const total = Number(q.data?.[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page
      testId="admin-barbershops-page"
      title="Barbearias"
      subtitle={q.data ? total + (total === 1 ? ' barbearia na plataforma' : ' barbearias na plataforma') : undefined}
    >
      <Panel className="mb-4" testId="admin-barbershops-controls">
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">Pesquisar barbearias</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-lo" aria-hidden />
            <input
              data-testid="admin-barbershops-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome ou endereço público"
              className="field !pl-10 w-full"
              inputMode="search"
              autoComplete="off"
            />
          </label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Filtrar barbearias por estado">
            {FILTERS.map((filter) => (
              <Chip
                key={filter.label}
                active={status === filter.value}
                onClick={() => setStatus(filter.value)}
                testId={'admin-barbershops-filter-' + (filter.value ?? 'all')}
              >
                {filter.label}
              </Chip>
            ))}
          </div>
        </div>
      </Panel>

      {q.isLoading ? (
        <div className="space-y-3" data-testid="admin-barbershops-loading">
          <Skeleton className="h-20" lines={3} />
          <Skeleton className="h-20" lines={3} />
          <Skeleton className="h-20" lines={3} />
          <Skeleton className="h-20" lines={3} />
        </div>
      ) : q.error ? (
        <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          testId="admin-barbershops-empty"
          title={search.trim() || status ? 'Nenhuma barbearia encontrada' : 'Ainda não há barbearias registadas'}
          body={search.trim() || status ? 'Altere a pesquisa ou o filtro para continuar.' : 'As novas barbearias aparecem aqui depois do registo.'}
        />
      ) : (
        <>
          <div className="hidden md:block overflow-hidden rounded-3xl border border-white/10 bg-white/[.02]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left t-label text-ink-mid border-b border-white/10">
                  <th className="px-5 py-3 font-light">Barbearia</th>
                  <th className="px-5 py-3 font-light">Estado</th>
                  <th className="px-5 py-3 font-light">Plano</th>
                  <th className="px-5 py-3 font-light text-right">Membros</th>
                  <th className="px-5 py-3 font-light text-right">Barbeiros</th>
                  <th className="px-5 py-3 font-light text-right">Marcações</th>
                  <th className="px-5 py-3 font-light">Criada</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((shop) => <DesktopRow key={shop.id} shop={shop} />)}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5" data-testid="admin-barbershops-mobile">
            {q.data.map((shop) => (
              <article key={shop.id} className="glass rounded-3xl border border-white/10 p-4" data-testid={'admin-shop-card-' + shop.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-card text-ink-hi truncate">{shop.name}</p>
                    <p className="t-label text-ink-mid truncate mt-1">/barbearia/{shop.slug}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 t-label">{STATUS_PT[shop.status]}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Stat label="Plano" value={shop.plan_name || 'Sem plano'} />
                  <Stat label="Membros" value={String(shop.member_count)} />
                  <Stat label="Barbeiros" value={String(shop.barber_count)} />
                  <Stat label="Marcações" value={String(shop.appointment_count)} />
                </div>
                <p className="t-label text-ink-mid mt-4">Criada {fmt(shop.created_at, 'd MMM yyyy')}</p>
              </article>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 mt-4">
            <p className="t-label text-ink-mid">{page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, total)} de {total}</p>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" pill disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="Página anterior">
                <ChevronLeft size={15} />
              </Button>
              <span className="t-label text-ink-mid min-w-12 text-center">{page + 1}/{totalPages}</span>
              <Button variant="secondary" size="sm" pill disabled={page >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} aria-label="Página seguinte">
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

function DesktopRow({ shop }: { shop: AdminShop }) {
  return (
    <tr data-testid={'admin-shop-row-' + shop.slug} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-4">
        <p className="font-normal text-ink-hi">{shop.name}</p>
        <p className="t-label text-ink-mid mt-0.5">/barbearia/{shop.slug}</p>
      </td>
      <td className="px-5 py-4">
        <span className="rounded-full border border-white/10 px-2.5 py-1 t-label">{STATUS_PT[shop.status]}</span>
      </td>
      <td className="px-5 py-4 text-ink-mid">{shop.plan_name || 'Sem plano'}</td>
      <td className="px-5 py-4 text-right tabular-nums">{shop.member_count}</td>
      <td className="px-5 py-4 text-right tabular-nums">{shop.barber_count}</td>
      <td className="px-5 py-4 text-right tabular-nums">{shop.appointment_count}</td>
      <td className="px-5 py-4 text-ink-mid">{fmt(shop.created_at, 'd MMM yyyy')}</td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="t-label text-ink-lo">{label}</p>
      <p className="text-sm text-ink-hi mt-0.5">{value}</p>
    </div>
  );
}
