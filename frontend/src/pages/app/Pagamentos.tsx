import React from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, ExternalLink, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Panel, EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Chip } from '@/components/ui/Primitives';
import { Button } from '@/components/ui/Button';
import { humanError, formatMT, fmt } from '@/lib/utils';
import { useShop } from '@/lib/shop';
import { usePaymentAccounts, usePaymentMetrics, usePayments, type PaymentRow } from '@/features/payments/api';

const STATUS = [
  { value: null, label: 'Todos' },
  { value: 'pending' as const, label: 'Pendentes' },
  { value: 'paid' as const, label: 'Pagos' },
  { value: 'failed' as const, label: 'Falhados' },
  { value: 'refunded' as const, label: 'Reembolsados' },
];

function providerLabel(provider: PaymentRow['provider']): string {
  return provider === 'mpesa' ? 'M-Pesa' : 'e-Mola';
}

function statusLabel(status: PaymentRow['status']): string {
  return {
    pending: 'Pendente',
    paid: 'Pago',
    failed: 'Falhado',
    refunded: 'Reembolsado',
  }[status];
}

function maskedPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 4 ? '•••• ' + digits.slice(-4) : '••••';
}

export default function Pagamentos() {
  const { shop, role } = useShop();
  const canConfigure = role === 'owner';
  const [status, setStatus] = React.useState<PaymentRow['status'] | null>(null);
  const accounts = usePaymentAccounts(shop?.id);
  const metrics = usePaymentMetrics(shop?.id);
  const payments = usePayments(shop?.id, status);

  const configured = (accounts.data ?? []).filter((a) => a.configured && a.enabled).length;

  return (
    <Page
      testId="pagamentos-page"
      title="Pagamentos"
      subtitle="Sinais, estados de pagamento e configuração dos providers da sua barbearia."
      actions={
        {canConfigure && (
          <Link to="/app/definicoes/pagamentos">
            <Button variant="secondary" size="sm"><CreditCard size={15} />Configurar pagamentos</Button>
          </Link>
        )}
      }
    >
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          label="Pendentes"
          value={metrics.isLoading ? null : String(metrics.data?.pending_count ?? 0)}
          detail={metrics.isLoading ? null : formatMT(Number(metrics.data?.pending_amount_cents ?? 0))}
        />
        <MetricCard
          label="Pagos"
          value={metrics.isLoading ? null : String(metrics.data?.paid_count ?? 0)}
          detail={metrics.isLoading ? null : formatMT(Number(metrics.data?.paid_amount_cents ?? 0))}
        />
        <MetricCard
          label="Falhados"
          value={metrics.isLoading ? null : String(metrics.data?.failed_count ?? 0)}
          detail="necessitam nova tentativa"
        />
        <MetricCard
          label="Reembolso"
          value={metrics.isLoading ? null : String(metrics.data?.refund_required_count ?? 0)}
          detail="pagamentos para reconciliar"
          attention={Number(metrics.data?.refund_required_count ?? 0) > 0}
        />
      </div>

      <Panel className="mt-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="t-card text-ink-hi">Métodos de pagamento</p>
            <p className="t-body text-ink-mid mt-1">
              {configured} provider{configured === 1 ? '' : 's'} activo{configured === 1 ? '' : 's'} e pronto{configured === 1 ? '' : 's'} para receber sinais.
            </p>
          </div>
          {canConfigure && (
            <Link to="/app/definicoes/pagamentos" className="shrink-0">
              <Button variant="ghost" size="sm"><ShieldCheck size={15} />Gerir credenciais</Button>
            </Link>
          )}
        </div>

        {accounts.isLoading ? (
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            <Skeleton className="h-20" lines={2} /><Skeleton className="h-20" lines={2} />
          </div>
        ) : accounts.error ? (
          <div className="mt-5"><ErrorState message={humanError(accounts.error)} onRetry={() => accounts.refetch()} /></div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            {(['mpesa', 'emola'] as const).map((provider) => {
              const a = accounts.data?.find((item) => item.provider === provider);
              return (
                <div key={provider} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-white/5 grid place-items-center text-accent-soft"><WalletCards size={17} /></div>
                      <div>
                        <p className="t-card text-ink-hi">{provider === 'mpesa' ? 'M-Pesa' : 'e-Mola'}</p>
                        <p className="t-label text-ink-mid mt-0.5">{a?.configured ? 'Credenciais configuradas' : 'Não configurado'}</p>
                      </div>
                    </div>
                    <span className={'t-label ' + (a?.enabled && a?.configured ? 'text-st-confirmed' : 'text-ink-mid')}>
                      {a?.enabled && a?.configured ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className="mt-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="t-card text-ink-hi">Movimentos recentes</p>
            <p className="t-body text-ink-mid mt-1">O pagamento é confirmado pelo provider antes de alterar a marcação.</p>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {STATUS.map((item) => (
              <Chip
                key={item.label}
                active={status === item.value}
                onClick={() => setStatus(item.value)}
                testId={'payment-filter-' + (item.value ?? 'all')}
              >
                {item.label}
              </Chip>
            ))}
            <Button size="sm" variant="ghost" aria-label="Actualizar pagamentos" onClick={() => { void payments.refetch(); void metrics.refetch(); }}>
              <RefreshCw size={15} />
            </Button>
          </div>
        </div>

        <div className="mt-5">
          {payments.isLoading ? (
            <div className="space-y-2" data-testid="payments-loading">
              {[1,2,3,4].map((i) => <Skeleton key={i} className="h-20" lines={2} />)}
            </div>
          ) : payments.error ? (
            <ErrorState message={humanError(payments.error)} onRetry={() => payments.refetch()} />
          ) : (payments.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Ainda não há pagamentos"
              body={status ? 'Não existem pagamentos com este estado.' : 'Os pagamentos feitos através do link de marcação aparecem aqui.'}
            />
          ) : (
            <div className="space-y-2" data-testid="payments-list">
              {payments.data?.map((payment) => <PaymentRowView key={payment.id} payment={payment} />)}
            </div>
          )}
        </div>
      </Panel>

      <p className="t-label text-ink-mid text-center mt-5">
        As credenciais dos providers ficam no Vault do Supabase. Esta área mostra apenas estado operacional.
      </p>
    </Page>
  );
}

function MetricCard({ label, value, detail, attention }: { label: string; value: string | null; detail: string | null; attention?: boolean }) {
  return (
    <div className="glass p-4" data-testid={'payment-metric-' + label.toLowerCase()}>
      <p className="t-label text-ink-mid">{label}</p>
      {value === null ? <Skeleton className="h-7 w-20 mt-2" lines={0} /> : <p className={'text-2xl font-semibold mt-1 ' + (attention ? 'text-st-noshow' : 'text-ink-hi')}>{value}</p>}
      {detail !== null && <p className="t-label text-ink-mid mt-1">{detail}</p>}
    </div>
  );
}

function PaymentRowView({ payment }: { payment: PaymentRow }) {
  const colour = payment.status === 'paid'
    ? 'text-st-confirmed'
    : payment.status === 'failed'
      ? 'text-st-noshow'
      : payment.status === 'refunded'
        ? 'text-st-cancelled'
        : 'text-accent-soft';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4" data-testid="payment-row">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="t-card text-ink-hi">{formatMT(payment.amount_cents)}</span>
            <span className={'t-label ' + colour}>{statusLabel(payment.status)}</span>
            {payment.requires_refund && <span className="t-label text-st-noshow">Requer reembolso</span>}
          </div>
          <p className="t-body text-ink-mid mt-1">
            {providerLabel(payment.provider)} · {maskedPhone(payment.msisdn)} · {fmt(payment.created_at, 'dd/MM/yyyy HH:mm')}
          </p>
          {payment.failure_reason && <p className="t-label text-st-noshow mt-1 line-clamp-2">{payment.failure_reason}</p>}
        </div>
        {payment.appointment_id && (
          <span className="t-label text-ink-mid shrink-0 inline-flex items-center gap-1">
            <ExternalLink size={13} /> Marcação ligada
          </span>
        )}
      </div>
    </div>
  );
}
