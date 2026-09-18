import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { Brand } from '@/components/ui/Brand';
import { humanError } from '@/lib/utils';
import { useReviewByToken, useSubmitReview } from '@/features/reviews/api';

function dateTimeLabel(value: string | null, timezone: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function RatingStars({ value, onChange, disabled = false }: {
  value: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
}) {
  const interactive = Boolean(onChange);
  return (
    <div
      className="flex items-center gap-1.5"
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={value ? value + ' de 5 estrelas' : 'Sem avaliação'}
    >
      {[1,2,3,4,5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled || !interactive}
          role={interactive ? 'radio' : undefined}
          aria-checked={interactive ? value === star : undefined}
          aria-label={star + ' ' + (star === 1 ? 'estrela' : 'estrelas')}
          tabIndex={interactive ? 0 : -1}
          onClick={() => onChange?.(star)}
          className={interactive
            ? 'rounded-xl p-2 text-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:pointer-events-none'
            : 'p-0.5 text-accent-soft'}
        >
          <Star size={interactive ? 30 : 16} fill={star <= value ? 'currentColor' : 'none'} aria-hidden />
        </button>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-5 py-8 sm:px-8">
      <header className="max-w-3xl mx-auto h-16 flex items-center">
        <Link to="/" aria-label="Início"><Brand /></Link>
      </header>
      <main className="max-w-2xl mx-auto pt-10 pb-16">{children}</main>
    </div>
  );
}

export default function ReviewSubmit() {
  const { token } = useParams<{ token: string }>();
  const query = useReviewByToken(token);
  const mutation = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const data = query.data;
  const manageHref = token ? '/marcacao/' + token : '/';
  const canSend = Boolean(data?.can_submit && rating >= 1 && rating <= 5 && !mutation.isPending);

  const availableLabel = useMemo(
    () => data ? dateTimeLabel(data.available_at, data.timezone) : '',
    [data?.available_at, data?.timezone],
  );

  const submitReview = async () => {
    if (!token || !canSend) return;
    await mutation.mutateAsync({
      p_token: token,
      p_rating: rating,
      p_comment: comment.trim() || null,
    });
  };

  if (query.isLoading) {
    return (
      <Shell>
        <div className="space-y-4"><Skeleton className="h-56" /><Skeleton className="h-80" /></div>
      </Shell>
    );
  }

  if (query.error || !data) {
    return <Shell><ErrorState message={humanError(query.error ?? new Error('APPOINTMENT_NOT_FOUND'))} onRetry={() => void query.refetch()} /></Shell>;
  }

  if (data.has_review) {
    return (
      <Shell>
        <Panel className="p-7 sm:p-10">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-st-done mt-1 shrink-0" />
            <div>
              <p className="t-label text-accent-soft">AVALIAÇÃO REGISTADA</p>
              <h1 className="t-title text-ink-hi mt-2">Obrigado pelo seu feedback.</h1>
              <p className="t-body text-ink-mid mt-2">{data.customer_name}, a sua avaliação da visita à {data.shop_name} já está registada.</p>
            </div>
          </div>
          <div className="mt-7 rounded-3xl border border-white/10 bg-white/5 p-5">
            <RatingStars value={data.rating ?? 0} />
            {data.comment && <p className="t-body text-ink-hi mt-4">{data.comment}</p>}
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <Link to={manageHref} className="flex-1"><Button full variant="secondary"><ChevronLeft size={16} />Ver marcação</Button></Link>
            <Link to={'/barbearia/' + data.shop_slug} className="flex-1"><Button full>Ver barbearia</Button></Link>
          </div>
        </Panel>
      </Shell>
    );
  }

  if (data.appointment_status !== 'completed') {
    return (
      <Shell>
        <Panel className="p-7 sm:p-10">
          <p className="t-label text-accent-soft">AVALIAÇÃO</p>
          <h1 className="t-title text-ink-hi mt-2">A avaliação ficará disponível depois da visita.</h1>
          <p className="t-body text-ink-mid mt-2">A marcação ainda não foi concluída. O pedido de avaliação será disponibilizado após o atendimento.</p>
          <Link to={manageHref} className="inline-block mt-6"><Button variant="secondary"><ChevronLeft size={16} />Ver marcação</Button></Link>
        </Panel>
      </Shell>
    );
  }

  if (!data.can_submit) {
    return (
      <Shell>
        <Panel className="p-7 sm:p-10">
          <p className="t-label text-accent-soft">AVALIAÇÃO</p>
          <h1 className="t-title text-ink-hi mt-2">Ainda não está disponível.</h1>
          <p className="t-body text-ink-mid mt-2">A avaliação abre uma hora depois de a visita ser concluída.</p>
          {availableLabel && <p className="t-label text-ink-mid mt-4">Disponível a partir de {availableLabel}.</p>}
          <Link to={manageHref} className="inline-block mt-6"><Button variant="secondary"><ChevronLeft size={16} />Ver marcação</Button></Link>
        </Panel>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6">
        <p className="t-label text-accent-soft">BARBEROS BY ORYON</p>
        <h1 className="t-title text-ink-hi mt-2">Como correu a sua visita?</h1>
        <p className="t-body text-ink-mid mt-1">A sua opinião ajuda a {data.shop_name} a melhorar a experiência.</p>
      </div>

      <Panel className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          {data.barber_photo_url ? (
            <img src={data.barber_photo_url} alt={data.barber_name} className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-accent-soft/15 border border-accent-soft/15 grid place-items-center text-xl text-accent-soft" aria-hidden>
              {data.barber_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="t-card text-ink-hi">{data.barber_name}</p>
            <p className="t-body text-ink-mid mt-1">{data.service_name}{data.haircut_name ? ' · ' + data.haircut_name : ''}</p>
            <p className="t-label text-ink-lo mt-1">{data.appointment_completed_at ? dateTimeLabel(data.appointment_completed_at, data.timezone) : ''}</p>
          </div>
        </div>

        <div className="mt-8">
          <span className="t-label text-ink-mid block mb-2">A sua avaliação</span>
          <RatingStars value={rating} onChange={setRating} disabled={mutation.isPending} />
          <p className="t-label text-ink-lo mt-2" aria-live="polite">
            {rating === 0 ? 'Seleccione de 1 a 5 estrelas.' : rating + ' de 5 estrelas'}
          </p>
        </div>

        <div className="mt-6">
          <label htmlFor="review-comment" className="t-label text-ink-mid block mb-2">Comentário (opcional)</label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={5}
            className="field resize-none"
            placeholder="Conte-nos como foi a sua experiência."
            disabled={mutation.isPending}
          />
          <div className="flex justify-end mt-1"><span className="t-label text-ink-lo">{comment.length}/2000</span></div>
        </div>

        {mutation.isError && (
          <div className="mt-5 rounded-2xl border border-st-noshow/25 bg-st-noshow/10 p-4" role="alert">
            <p className="t-body text-ink-hi">{humanError(mutation.error)}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-2">
          <Button full size="lg" disabled={!canSend} loading={mutation.isPending} onClick={() => void submitReview()}>
            Enviar avaliação
          </Button>
          <Link to={manageHref} className="flex-1"><Button full size="lg" variant="ghost" disabled={mutation.isPending}>Cancelar</Button></Link>
        </div>
        <p className="t-label text-ink-lo mt-4">Não precisa de criar conta.</p>
      </Panel>
    </Shell>
  );
}
