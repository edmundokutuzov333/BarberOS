import { useState } from 'react';
import { Building2, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { fmt, formatMT, humanError } from '@/lib/utils';
import { useAdminShops, type ShopStatus } from '@/features/admin/api';
import { AdminStatus, Pager, SearchToolbar } from '@/features/admin/AdminComponents';

const PAGE_SIZE = 25;

export default function AdminBarbearias() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState<ShopStatus | null>(null);
  const [offset, setOffset] = useState(0);
  const q = useAdminShops({ search: applied, status, limit: PAGE_SIZE, offset });
  const total = Number(q.data?.[0]?.total_count ?? 0);

  const applySearch = () => {
    setOffset(0);
    setApplied(search.trim());
  };

  return (
    <Page
      testId="admin-barbershops-page"
      title="Barbearias"
      subtitle={total + ' barbearia' + (total === 1 ? '' : 's') + ' na plataforma'}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
        >
          <RefreshCw size={14} className={q.isFetching ? 'animate-spin' : ''} />
          Actualizar
        </Button>
      }
    >
      <SearchToolbar>
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-lo" />
          <input
            className="field pl-9 w-full"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applySearch();
            }}
            placeholder="Nome ou slug da barbearia"
            aria-label="Pesquisar barbearias"
          />
        </div>
        <select
          className="field lg:w-48"
          value={status ?? ''}
          onChange={(event) => {
            setStatus((event.target.value || null) as ShopStatus | null);
            setOffset(0);
          }}
          aria-label="Filtrar barbearias por estado"
        >
          <option value="">Todos os estados</option>
          <option value="trial">Em teste</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspensas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        <Button size="sm" onClick={applySearch}>
          <Search size={14} />
          Pesquisar
        </Button>
      </SearchToolbar>

      {q.isLoading ? (
        <Skeleton className="h-72" lines={7} />
      ) : q.error ? (
        <ErrorState message={humanError(q.error)} onRetry={() => void q.refetch()} />
      ) : q.data?.length === 0 ? (
        <EmptyState
          title={applied || status ? 'Nenhuma barbearia encontrada.' : 'Ainda não há barbearias registadas.'}
          body={applied || status ? 'Altere os filtros e volte a pesquisar.' : undefined}
        />
      ) : (
        <Panel className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-white/10 t-label text-ink-lo text-left">
                  <th className="px-5 py-3 font-light">Barbearia</th>
                  <th className="px-5 py-3 font-light">Estado</th>
                  <th className="px-5 py-3 font-light">Plano</th>
                  <th className="px-5 py-3 font-light text-right">Membros</th>
                  <th className="px-5 py-3 font-light text-right">Clientes</th>
                  <th className="px-5 py-3 font-light text-right">Marcações</th>
                  <th className="px-5 py-3 font-light">Criada</th>
                  <th className="px-5 py-3 font-light text-right">Gestão</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.map((shop) => (
                  <tr
                    key={shop.id}
                    data-testid={`admin-shop-row-${shop.slug}`}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.025] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <Link
                        to={'/admin/barbearias/' + shop.id}
                        className="group inline-flex items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                        aria-label={'Gerir ' + shop.name}
                      >
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft/10 text-accent-soft">
                          <Building2 size={16} />
                        </span>
                        <span>
                          <span className="block font-medium text-ink-hi group-hover:text-accent-soft">{shop.name}</span>
                          <span className="block t-label text-ink-lo mt-0.5">/barbearia/{shop.slug}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatus kind="shop" value={shop.status} />
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-ink-hi">{shop.plan_name ?? 'Sem plano'}</p>
                      <p className="t-label text-ink-lo mt-0.5">
                        {shop.plan_price_cents == null ? 'Preço indisponível' : formatMT(shop.plan_price_cents)}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-ink-mid">{Number(shop.member_count)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-ink-mid">{Number(shop.customer_count)}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-ink-mid">{Number(shop.appointment_count)}</td>
                    <td className="px-5 py-4 text-ink-mid whitespace-nowrap">{fmt(shop.created_at, 'd MMM yyyy')}</td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={'/admin/barbearias/' + shop.id}
                        className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-ink-hi hover:border-accent-soft/40 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                      >
                        Gerir
                        <ExternalLink size={13} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {!q.isLoading && !q.error && (
        <Pager
          offset={offset}
          pageSize={PAGE_SIZE}
          total={total}
          onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          onNext={() => setOffset(offset + PAGE_SIZE)}
        />
      )}
    </Page>
  );
}
