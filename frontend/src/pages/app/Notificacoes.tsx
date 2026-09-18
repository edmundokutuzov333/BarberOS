import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, Mail, MessageCircle, RefreshCw, ServerCog, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Panel, Skeleton } from "@/components/ui/States";
import { useShop } from "@/lib/shop";
import { fmt, humanError } from "@/lib/utils";
import {
  useNotificationMetrics,
  useNotifications,
  useRetryNotification,
  type NotificationChannel,
  type NotificationStatus,
  type NotificationView,
} from "@/features/notifications/api";

const PAGE_SIZE = 50;

const views: { key: NotificationView; label: string }[] = [
  { key: "active", label: "Pendentes" },
  { key: "queued", label: "Na fila" },
  { key: "processing", label: "A enviar" },
  { key: "sent", label: "Enviadas" },
  { key: "failed", label: "Falhadas" },
  { key: "skipped", label: "Ignoradas" },
  { key: "all", label: "Todas" },
];

const channels: { key: NotificationChannel; label: string }[] = [
  { key: "all", label: "Todos os canais" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
];

const statusLabel: Record<NotificationStatus, string> = {
  queued: "Na fila",
  processing: "A enviar",
  sent: "Enviada",
  failed: "Falhada",
  skipped: "Ignorada",
};

const templateLabel: Record<string, string> = {
  appointment_pending: "Marcação recebida",
  appointment_confirmed: "Marcação confirmada",
  appointment_cancelled: "Marcação cancelada",
  appointment_rescheduled: "Marcação remarcada",
  reminder_24h: "Lembrete 24h",
  reminder_1h: "Lembrete 1h",
  waitlist_offer: "Oferta da lista de espera",
  review_request: "Pedido de avaliação",
};

function statusClass(status: NotificationStatus): string {
  if (status === "sent") return "text-st-done bg-st-done/10 border-st-done/20";
  if (status === "failed") return "text-st-noshow bg-st-noshow/10 border-st-noshow/20";
  if (status === "processing") return "text-accent-soft bg-accent-soft/10 border-accent-soft/20";
  if (status === "skipped") return "text-ink-mid bg-white/5 border-white/10";
  return "text-ink-hi bg-white/5 border-white/10";
}

function channelIcon(channel: NotificationChannel) {
  return channel === "email"
    ? <Mail size={16} aria-hidden />
    : <MessageCircle size={16} aria-hidden />;
}

export default function Notificacoes() {
  const { shop } = useShop();
  const [view, setView] = useState<NotificationView>("active");
  const [channel, setChannel] = useState<NotificationChannel>("all");
  const [page, setPage] = useState(0);
  const metrics = useNotificationMetrics(shop?.id);
  const rows = useNotifications(shop?.id, view, channel, page, PAGE_SIZE);
  const retry = useRetryNotification();

  useEffect(() => setPage(0), [view, channel]);

  const total = rows.data?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  return (
    <Page
      testId="notifications-page"
      title="Notificações"
      subtitle="Acompanhe confirmações, lembretes, ofertas e pedidos de avaliação sem expor dados de entrega à interface."
      actions={
        <div className="flex items-center gap-2">
          <span className="t-label text-ink-mid">{shop?.name ?? "Barbearia"}</span>
          <Button variant="secondary" size="sm" onClick={() => { void metrics.refetch(); void rows.refetch(); }}>
            <RefreshCw size={14} /> Actualizar
          </Button>
        </div>
      }
    >
      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5" aria-label="Resumo das notificações">
        <Metric icon={<Clock3 size={17} />} label="Na fila" value={metrics.data?.queued_count ?? 0} loading={metrics.isLoading} />
        <Metric icon={<ServerCog size={17} />} label="A enviar" value={metrics.data?.processing_count ?? 0} loading={metrics.isLoading} />
        <Metric icon={<TriangleAlert size={17} />} label="Falhadas" value={metrics.data?.failed_count ?? 0} loading={metrics.isLoading} />
        <Metric icon={<CheckCircle2 size={17} />} label="Enviadas hoje" value={metrics.data?.sent_today_count ?? 0} loading={metrics.isLoading} />
        <Metric icon={<BellRing size={17} />} label="Entrega · 7 dias" value={(metrics.data?.delivery_rate_7d ?? 0).toLocaleString("pt-PT") + "%"} loading={metrics.isLoading} />
      </section>

      <Panel className="mb-4" testId="notifications-controls">
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label="Estado das notificações">
            {views.map((item) => (
              <button
                type="button"
                key={item.key}
                role="tab"
                aria-selected={view === item.key}
                onClick={() => setView(item.key)}
                className={view === item.key
                  ? "px-3.5 py-2 rounded-full bg-accent-soft text-accent-ink text-sm font-medium whitespace-nowrap"
                  : "px-3.5 py-2 rounded-full text-ink-mid hover:text-ink-hi hover:bg-white/5 text-sm whitespace-nowrap"}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2" aria-label="Canal">
            {channels.map((item) => (
              <button
                type="button"
                key={item.key}
                aria-pressed={channel === item.key}
                onClick={() => setChannel(item.key)}
                className={channel === item.key
                  ? "px-3 py-2 rounded-2xl bg-white/10 text-ink-hi text-sm"
                  : "px-3 py-2 rounded-2xl text-ink-mid hover:text-ink-hi hover:bg-white/5 text-sm"}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {rows.isLoading && (
        <div className="space-y-3" data-testid="notifications-loading">
          <Skeleton className="h-24" lines={3} />
          <Skeleton className="h-24" lines={3} />
          <Skeleton className="h-24" lines={3} />
        </div>
      )}

      {rows.error && !rows.isLoading && (
        <ErrorState message={humanError(rows.error)} onRetry={() => void rows.refetch()} />
      )}

      {!rows.isLoading && !rows.error && !rows.data?.length && (
        <EmptyState
          testId="notifications-empty"
          title={view === "active" ? "Não existem notificações pendentes" : "Nenhum registo encontrado"}
          body={view === "active"
            ? "As novas marcações entram automaticamente nesta fila. O dispatcher trata a entrega quando o job é executado."
            : "Experimenta outro estado ou canal."}
        />
      )}

      {!rows.isLoading && !rows.error && Boolean(rows.data?.length) && (
        <>
          <div className="hidden md:block overflow-hidden rounded-3xl border border-white/10 bg-white/[.02]">
            <table className="w-full border-collapse">
              <thead className="bg-white/[.03]">
                <tr className="text-left">
                  <th className="p-4 t-label text-ink-mid font-normal">Evento</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Canal</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Destino</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Estado</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Agendado</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Tentativas</th>
                  <th className="p-4 t-label text-ink-mid font-normal">Acção</th>
                </tr>
              </thead>
              <tbody>
                {rows.data!.map((row) => (
                  <tr key={row.notification_id} data-testid={"notification-row-" + row.notification_id} className="border-t border-white/5">
                    <td className="p-4">
                      <p className="text-sm text-ink-hi font-medium">{templateLabel[row.template_key] ?? row.template_key}</p>
                      <p className="t-label text-ink-mid mt-0.5">{row.template_key}</p>
                    </td>
                    <td className="p-4 text-ink-mid">{channelIcon(row.channel)}</td>
                    <td className="p-4 text-sm text-ink-mid">{row.recipient_masked}</td>
                    <td className="p-4">
                      <span className={"inline-flex rounded-full px-2.5 py-1 t-label border " + statusClass(row.status)}>{statusLabel[row.status]}</span>
                      {row.last_error && <p className="t-label text-st-noshow mt-1 max-w-48 truncate" title={row.last_error}>{row.last_error}</p>}
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-ink-hi">{fmt(row.scheduled_for, "dd MMM yyyy, HH:mm")}</p>
                      {row.sent_at && <p className="t-label text-ink-mid mt-0.5">Enviada {fmt(row.sent_at, "dd MMM, HH:mm")}</p>}
                      {row.next_attempt_at && <p className="t-label text-accent-soft mt-0.5">Nova tentativa {fmt(row.next_attempt_at, "dd MMM, HH:mm")}</p>}
                    </td>
                    <td className="p-4 t-label text-ink-mid">{row.attempts}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-1">
                        {row.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await retry.mutateAsync({ shopId: shop!.id, notificationId: row.notification_id });
                              } catch (error) {
                                toast.error(humanError(error));
                              }
                            }}
                            disabled={retry.isPending}
                          >
                            <RefreshCw size={15} /> Tentar novamente
                          </Button>
                        )}
                        {row.fallback_url
                          ? <a href={row.fallback_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-accent-soft hover:text-ink-hi hover:bg-white/5">
                              <ExternalLink size={15} /> Abrir WhatsApp
                            </a>
                          : !row.status && <span className="t-label text-ink-lo">Sem acção</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5">
            {rows.data!.map((row) => (
              <article key={row.notification_id} data-testid={"notification-card-" + row.notification_id} className="glass p-4 rounded-3xl border border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-ink-hi font-medium truncate">{templateLabel[row.template_key] ?? row.template_key}</p>
                    <p className="t-label text-ink-mid mt-0.5">{row.template_key} · {row.recipient_masked}</p>
                  </div>
                  <span className={"shrink-0 inline-flex rounded-full px-2.5 py-1 t-label border " + statusClass(row.status)}>{statusLabel[row.status]}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <Info label="Canal" value={row.channel === "email" ? "Email" : "WhatsApp"} />
                  <Info label="Tentativas" value={String(row.attempts)} />
                  <Info label="Agendado" value={fmt(row.scheduled_for, "dd MMM, HH:mm")} />
                  <Info label="Estado" value={statusLabel[row.status]} />
                </div>
                {row.last_error && <p className="t-label text-st-noshow mt-4">{row.last_error}</p>}
                {row.next_attempt_at && <p className="t-label text-accent-soft mt-2">Nova tentativa: {fmt(row.next_attempt_at, "dd MMM, HH:mm")}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {row.status === "failed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await retry.mutateAsync({ shopId: shop!.id, notificationId: row.notification_id });
                        } catch (error) {
                          window.alert(humanError(error));
                        }
                      }}
                      disabled={retry.isPending}
                    >
                      <RefreshCw size={15} /> Tentar novamente
                    </Button>
                  )}
                  {row.fallback_url && (
                    <a href={row.fallback_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-accent-soft">
                      <ExternalLink size={15} /> Abrir WhatsApp pré-preenchido
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="t-label text-ink-mid">{page * PAGE_SIZE + 1} a {Math.min((page + 1) * PAGE_SIZE, Number(total))} de {Number(total)}</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} aria-label="Página anterior"><ChevronLeft size={15} /></Button>
                <span className="t-label text-ink-mid min-w-12 text-center">{page + 1}/{totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} aria-label="Página seguinte"><ChevronRight size={15} /></Button>
              </div>
            </div>
          )}
        </>
      )}

      <Panel className="mt-5" title="Como funciona">
        <div className="grid md:grid-cols-3 gap-4">
          <InfoBlock icon={<ServerCog size={18} />} title="Fila protegida" body="A interface lê através de RPCs tenant-scoped. A fila e as transições ficam no PostgreSQL." />
          <InfoBlock icon={<RefreshCw size={18} />} title="Retry automático" body="Falhas transitórias voltam à fila com backoff. Trabalhos presos em processamento são recuperados." />
          <InfoBlock icon={<MessageCircle size={18} />} title="Fallback humano" body="Quando existe telefone, fica disponível uma mensagem WhatsApp pré-preenchida para a equipa." />
        </div>
      </Panel>
    </Page>
  );
}

function Metric({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number | string; loading: boolean }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-ink-mid">{icon}<span className="t-label">{label}</span></div>
      {loading ? <div className="h-7 w-16 rounded-lg bg-white/10 animate-pulse mt-2" /> : <p className="text-2xl text-ink-hi mt-2">{value}</p>}
    </Panel>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="t-label text-ink-lo">{label}</p><p className="text-sm text-ink-hi mt-0.5 truncate">{value}</p></div>;
}

function InfoBlock({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
      <div className="flex items-center gap-2 text-accent-soft">{icon}<span className="text-sm text-ink-hi font-medium">{title}</span></div>
      <p className="t-body text-ink-mid mt-2">{body}</p>
    </div>
  );
}
