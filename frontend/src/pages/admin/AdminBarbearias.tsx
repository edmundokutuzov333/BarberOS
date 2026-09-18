import { useQuery } from '@tanstack/react-query';
import { Page } from '@/components/layout/Page';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { supabase } from '@/lib/supabase';
import { fmt, humanError } from '@/lib/utils';

interface ShopRow { id: string; name: string; slug: string; status: string; created_at: string; plans: { name: string } | null; barbershop_members: { count: number }[]; appointments: { count: number }[] }

const STATUS_PT: Record<string, string> = { trial: 'Teste', active: 'Activa', suspended: 'Suspensa', cancelled: 'Cancelada' };

export default function AdminBarbearias() {
  const q = useQuery({
    queryKey: ['admin', 'barbershops'],
    queryFn: async () => {
      const { data, error } = await supabase.from('barbershops').select('id,name,slug,status,created_at,plans(name),barbershop_members(count),appointments(count)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as ShopRow[];
    },
  });

  return (
    <Page testId="admin-barbershops-page" title="Barbearias" subtitle={q.data ? `${q.data.length} na plataforma` : undefined}>
      {q.isLoading ? <Skeleton className="h-64" lines={5} /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState title="Ainda não há barbearias registadas." />
      ) : (
        <div className="glass overflow-hidden" style={{ boxShadow: 'none' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left t-label text-ink-mid border-b border-white/10">
                <th className="px-5 py-3 font-light">Barbearia</th><th className="px-5 py-3 font-light">Estado</th><th className="px-5 py-3 font-light">Plano</th>
                <th className="px-5 py-3 font-light text-right">Membros</th><th className="px-5 py-3 font-light text-right">Marcações</th><th className="px-5 py-3 font-light">Criada</th>
              </tr>
            </thead>
            <tbody>
              {q.data!.map((s) => (
                <tr key={s.id} data-testid={`admin-shop-row-${s.slug}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3"><p className="font-normal">{s.name}</p><p className="t-label text-ink-mid">/barbearia/{s.slug}</p></td>
                  <td className="px-5 py-3"><span className="rounded-full border border-white/10 px-2.5 py-0.5 t-label">{STATUS_PT[s.status] ?? s.status}</span></td>
                  <td className="px-5 py-3 text-ink-mid">{s.plans?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.barbershop_members?.[0]?.count ?? 0}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.appointments?.[0]?.count ?? 0}</td>
                  <td className="px-5 py-3 text-ink-mid">{fmt(s.created_at, 'd MMM yyyy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
