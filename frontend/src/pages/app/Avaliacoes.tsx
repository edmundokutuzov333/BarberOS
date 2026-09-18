import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { useShop } from '@/lib/shop';
import { humanError, fmt } from '@/lib/utils';
import { useReviews, useSetReviewPublication, type ReviewListArgs } from '@/features/reviews/api';

const PAGE_SIZE = 25;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5 text-accent-soft" role="img" aria-label={rating + ' de 5 estrelas'}>
      {[1,2,3,4,5].map((star) => <Star key={star} size={14} fill={star <= rating ? 'currentColor' : 'none'} aria-hidden />)}
    </div>
  );
}

const tabs: { value: NonNullable<ReviewListArgs['p_published']>; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'published', label: 'Publicadas' },
  { value: 'hidden', label: 'Ocultas' },
];

export default function Avaliacoes() {
  const { shop, role } = useShop();
  const [published, setPublished] = useState<NonNullable<ReviewListArgs['p_published']>>('all');
  const [page, setPage] = useState(0);
  const reviews = useReviews(shop?.id, published, page, PAGE_SIZE);
  const toggle = useSetReviewPublication();
  const canModerate = role === 'owner' || role === 'manager';

  useEffect(() => setPage(0), [published]);

  const total = Number(reviews.data?.[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page
      testId="reviews-page"
      title="Avaliações"
      subtitle="Acompanhe o feedback dos clientes e controle o que aparece na página pública."
      actions={<Button variant="secondary" size="sm" onClick={() => void reviews.refetch()}><RefreshCw size={14} />Actualizar</Button>}
    >
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <Panel className="p-4"><p className="t-label text-ink-mid">Avaliações encontradas</p><p className="text-2xl text-ink-hi mt-2">{reviews.isLoading ? '…' : total}</p></Panel>
        <Panel className="p-4"><p className="t-label text-ink-mid">Escopo</p><p className="text-sm text-ink-hi mt-2">{role === 'barber' ? 'As suas avaliações' : 'Toda a barbearia'}</p></Panel>
        <Panel className="p-4"><p className="t-label text-ink-mid">Moderação</p><p className="text-sm text-ink-hi mt-2">{canModerate ? 'Owner / Manager' : 'Só leitura'}</p></Panel>
      </section>

      <Panel className="mb-4">
        <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Filtro de publicação">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.value}
              role="tab"
              aria-selected={published === tab.value}
              onClick={() => setPublished(tab.value)}
              className={published === tab.value
                ? 'px-4 py-2 rounded-full bg-accent-soft text-accent-ink text-sm font-medium whitespace-nowrap'
                : 'px-4 py-2 rounded-full text-ink-mid hover:text-ink-hi hover:bg-white/5 text-sm whitespace-nowrap'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Panel>

      {reviews.isLoading && <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>}
      {reviews.error && !reviews.isLoading && <ErrorState message={humanError(reviews.error)} onRetry={() => void reviews.refetch()} />}
      {!reviews.isLoading && !reviews.error && !reviews.data?.length && (
        <EmptyState
          title={published === 'hidden' ? 'Nenhuma avaliação oculta' : published === 'published' ? 'Nenhuma avaliação publicada' : 'Ainda não existem avaliações'}
          body={published === 'all' ? 'As avaliações passam a aparecer aqui depois de os clientes concluírem o atendimento e deixarem feedback.' : 'Não existem avaliações neste filtro.'}
        />
      )}

      {!reviews.isLoading && !reviews.error && Boolean(reviews.data?.length) && (
        <>
          <div className="space-y-3">
            {reviews.data!.map((row) => (
              <article key={row.review_id} className="glass rounded-3xl border border-white/10 p-5 sm:p-6" data-testid={'review-' + row.review_id}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <Stars rating={row.rating} />
                      <span className="t-label text-ink-hi">{row.customer_name}</span>
                      <span className="t-label text-ink-mid">· {row.barber_name ?? 'Barbeiro removido'}</span>
                    </div>
                    <p className="t-label text-ink-lo mt-2">{fmt(row.appointment_starts_at, 'dd MMM yyyy, HH:mm')} · {row.is_published ? 'Visível publicamente' : 'Oculta'}</p>
                  </div>
                  {canModerate && (
                    <Button
                      variant={row.is_published ? 'secondary' : 'primary'}
                      size="sm"
                      loading={toggle.isPending}
                      onClick={async () => {
                        try {
                          await toggle.mutateAsync({ shopId: shop!.id, reviewId: row.review_id, isPublished: !row.is_published });
                          toast.success(row.is_published ? 'Avaliação ocultada.' : 'Avaliação publicada.');
                        } catch (error) {
                          toast.error(humanError(error));
                        }
                      }}
                    >
                      {row.is_published ? <><EyeOff size={15} />Ocultar</> : <><Eye size={15} />Publicar</>}
                    </Button>
                  )}
                </div>
                {row.comment ? (
                  <p className="t-body text-ink-hi mt-4 whitespace-pre-wrap">{row.comment}</p>
                ) : (
                  <p className="t-body text-ink-lo mt-4">Sem comentário.</p>
                )}
              </article>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="t-label text-ink-mid">{page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, total)} de {total}</p>
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
