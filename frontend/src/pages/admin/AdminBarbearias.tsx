import { useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Primitives';
import { useAdminShops, type ShopStatus } from '@/features/admin/api';
import { fmt, humanError } from '@/lib/utils';

const PAGE_SIZE = 25;
const STATUS_PT: Record<string, string> = {
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
  const q = useAdminShops({ search: deferredSearch, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE });

  useEffect(() => setPage(0), [deferredSearch, status]);

  const total = Number(q.data?.[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page
      testId="admin-barbershops-page"
      title="Barbearias"
      subtitle={q.data ? `${total} na plataforma` : undefined}
    >
      <div className="glass rounded-3xl p-4 mb-4">
        <div className="grid sm:grid-cols-[1fr_180px] gap-3">
          <label className="relative block">
            <span className="sr-only">Pesquisar barbearias</span>
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
            <input
              data-testid="admin-shops-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar por nome ou slug"
              className="field !pl-10 w-full"
              inputMode="search"
              autoComplete="off"
            />
          </label>
          <Select
            data-testid="admin-shops-status"
            label="Estado"
            value={status ?? ''}
            onChange={(event) => setStatus((event.target.value || null) as ShopStatus | null)}
          >
            <option value="">Todos</option>
            <option value="trial">Teste</option>
            <option value="active">Activa</option>
            <option value="suspended">Suspensa</option>
            <option value="cancelled">Cancelada</option>
          </Select>
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64" lines={6} />
      ) : q.error ? (
        <ErrorState message={humanError(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          title={search.trim() || status ? 'Nenhuma barbearia encontrada' : 'Ainda não há barbearias registadas.'}
          body={search.trim() || status ? 'Ajuste a pesquisa ou o filtro de estado.' : undefined}
        />
      ) : (
        <>
          <div className="glass overflow-hidden" style={{ boxShadow: 'none' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left t-label text-ink-mid border-b border-white/10">
                    <th className="px-5 py-3 font-light">Barbearia</th>
                    <th className="px-5 py-3 font-light">Estado</th>
                    <th className="px-5 py-3 font-light">Plano</th>
                    <th className="px-5 py-3 font-light text-right">Membros</th>
                    <th className="px-5 py-3 font-light text-right">Marcações</th>
                    <th className="px-5 py-3 font-light">Criada</th>
                    <th className="px-5 py-3 font-light text-right">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((s) => (
                    <tr key={s.id} data-testid={`admin-shop-row-${s.slug}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-normal">{s.name}</p>
                        <p className="t-label text-ink-mid">/barbearia/{s.slug}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full border border-white/10 px-2.5 py-0.5 t-label">{STATUS_PT[s.status] ?? s.status}</span>
                      </td>
                      <td className="px-5 py-3 text-ink-mid">{s.plan_name ?? 'Sem plano'}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{s.members_count}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{s.appointments_count}</td>
                      <td className="px-5 py-3 text-ink-mid">{fmt(s.created_at, 'd MMM yyyy')}</td>
                      <td className="px-5 py-3 text-right">
                        <Link to={`/admin/barbearias/${s.id}`} aria-label={`Abrir ${s.name}`}>
                          <Button variant="ghost" size="sm">Abrir</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="t-label text-ink-mid">
                {page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, total)} de {total}
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
