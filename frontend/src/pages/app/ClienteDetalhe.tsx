import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Mail, MessageCircle, Pencil, Phone, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { StatusChip, type ApptStatus } from '@/components/ui/StatusChip';
import { useShop } from '@/lib/shop';
import { buildWhatsAppLink } from '@/lib/calendar';
import { fmt, formatMT, humanError } from '@/lib/utils';
import { useCustomer, useCustomerAppointments, useUpdateCustomer } from '@/features/customers/api';

const HISTORY_PAGE_SIZE = 25;

function readPreferenceTags(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const tags = (value as { tags?: unknown }).tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean);
}

function buildPreferences(value: unknown, tags: string[]) {
  const base = value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  return { ...base, tags };
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function ClienteDetalhe() {
  const { shop } = useShop();
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const customer = useCustomer(shop?.id, customerId);
  const [historyPage, setHistoryPage] = useState(0);
  const history = useCustomerAppointments(shop?.id, customerId, historyPage, HISTORY_PAGE_SIZE);
  const update = useUpdateCustomer();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    if (!customer.data) return;
    setForm({
      name: customer.data.name,
      phone: customer.data.phone,
      email: customer.data.email ?? '',
      notes: customer.data.notes ?? '',
    });
    setTags(readPreferenceTags(customer.data.preferences));
  }, [customer.data?.customer_id]);

  useEffect(() => setHistoryPage(0), [customerId]);

  const item = customer.data;
  const totalHistory = history.data?.[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(totalHistory) / HISTORY_PAGE_SIZE));

  const hasUnsaved = useMemo(() => {
    if (!item) return false;
    return form.name.trim() !== item.name
      || form.phone.trim() !== item.phone
      || form.email.trim() !== (item.email ?? '')
      || form.notes.trim() !== (item.notes ?? '')
      || JSON.stringify(tags) !== JSON.stringify(readPreferenceTags(item.preferences));
  }, [item, form, tags]);

  if (customer.isLoading) {
    return (
      <Page title="Cliente">
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-48" />
          <Skeleton className="h-80" />
        </div>
      </Page>
    );
  }

  if (customer.error || !item) {
    return (
      <Page title="Cliente">
        <ErrorState message={humanError(customer.error ?? new Error('CUSTOMER_NOT_FOUND'))} onRetry={() => void customer.refetch()} />
      </Page>
    );
  }

  const save = async () => {
    try {
      await update.mutateAsync({
        shopId: shop!.id,
        customerId: item.customer_id,
        name: form.name,
        phone: form.phone,
        email: form.email,
        notes: form.notes,
        preferences: buildPreferences(item.preferences, tags),
      });
      setEditing(false);
      toast.success('Ficha actualizada');
    } catch {
      // Mutation state renders the server error inline.
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm({ name: item.name, phone: item.phone, email: item.email ?? '', notes: item.notes ?? '' });
    setTags(readPreferenceTags(item.preferences));
    setTagDraft('');
  };

  const addTag = () => {
    const value = tagDraft.trim();
    if (!value || tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) return;
    setTags((current) => [...current, value]);
    setTagDraft('');
  };

  return (
    <Page
      testId="customer-detail-page"
      title={item.name}
      subtitle="Ficha operacional do cliente"
      actions={
        <Button variant="secondary" size="sm" onClick={() => navigate('/app/clientes')} aria-label="Voltar aos clientes">
          <ArrowLeft size={15} /> Voltar
        </Button>
      }
    >
      {update.error && <div className="mb-4"><ErrorState message={humanError(update.error)} /></div>}

      <section className="grid xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
        <div className="space-y-4">
          <Panel>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-16 w-16 shrink-0 rounded-3xl bg-accent-soft/15 border border-accent-soft/20 grid place-items-center text-accent-soft text-lg font-semibold" aria-hidden>
                {initials(item.name)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl text-ink-hi font-medium truncate">{item.name}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-ink-mid">
                  <a className="hover:text-ink-hi" href={'tel:' + item.phone}><Phone size={14} className="inline mr-1.5" />{item.phone}</a>
                  {item.email && <a className="hover:text-ink-hi" href={'mailto:' + item.email}><Mail size={14} className="inline mr-1.5" />{item.email}</a>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={buildWhatsAppLink(item.phone, 'Olá ' + item.name + ', falamos da sua marcação na barbearia.')} target="_blank" rel="noreferrer">
                  <Button size="sm"><MessageCircle size={15} /> WhatsApp</Button>
                </a>
                <Button variant="secondary" size="sm" onClick={() => setEditing((value) => !value)}>
                  <Pencil size={15} /> {editing ? 'Fechar edição' : 'Editar ficha'}
                </Button>
              </div>
            </div>
          </Panel>

          {editing && (
            <Panel title="Dados do cliente" aside={<span className="t-label text-ink-mid">Sem conta obrigatória</span>} testId="customer-edit-panel">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nome">
                  <input className="field" value={form.name} maxLength={120} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} data-testid="customer-name-input" />
                </Field>
                <Field label="Telefone">
                  <input className="field" value={form.phone} inputMode="tel" maxLength={20} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} data-testid="customer-phone-input" />
                </Field>
                <Field label="Email">
                  <input className="field" value={form.email} inputMode="email" maxLength={254} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} data-testid="customer-email-input" />
                </Field>
                <Field label="Notas" className="sm:col-span-2">
                  <textarea className="field min-h-28 resize-y" maxLength={2000} value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} data-testid="customer-notes-input" />
                  <p className="t-label text-ink-lo mt-1">{form.notes.length}/2000</p>
                </Field>
              </div>

              <div className="mt-5">
                <p className="t-label text-ink-mid mb-2">Preferências</p>
                <div className="flex flex-wrap gap-2 min-h-10">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/5 border border-white/10 text-sm text-ink-hi">
                      {tag}
                      <button type="button" onClick={() => setTags((current) => current.filter((value) => value !== tag))} aria-label={'Remover preferência ' + tag} className="text-ink-lo hover:text-ink-hi">
                        <Trash2 size={13} />
                      </button>
                    </span>
                  ))}
                  {!tags.length && <span className="t-body text-ink-lo">Ainda sem preferências registadas.</span>}
                </div>
                <div className="flex gap-2 mt-3 max-w-lg">
                  <input
                    className="field"
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } }}
                    placeholder="Ex.: máquina baixa, acabamento clássico"
                    maxLength={80}
                    data-testid="customer-preference-input"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addTag} aria-label="Adicionar preferência"><Plus size={15} /></Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" size="sm" onClick={cancelEdit}>Cancelar</Button>
                <Button size="sm" loading={update.isPending} disabled={!hasUnsaved} onClick={() => void save()} data-testid="customer-save-btn">
                  <Save size={15} /> Guardar alterações
                </Button>
              </div>
            </Panel>
          )}

          <Panel title="Histórico de marcações" aside={<span className="t-label text-ink-mid">{Number(item.total_appointments)} no total</span>} testId="customer-history">
            {history.isLoading && <div className="space-y-2"><Skeleton className="h-16" lines={2} /><Skeleton className="h-16" lines={2} /></div>}
            {history.error && !history.isLoading && <ErrorState message={humanError(history.error)} onRetry={() => void history.refetch()} />}
            {!history.isLoading && !history.error && !history.data?.length && <EmptyState title="Sem histórico" body="As marcações deste cliente vão aparecer aqui." />}
            {!history.isLoading && !history.error && Boolean(history.data?.length) && (
              <>
                <div className="space-y-2">
                  {history.data!.map((appointment) => (
                    <article key={appointment.appointment_id} className="rounded-2xl border border-white/10 bg-white/[.02] p-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="sm:w-36 shrink-0">
                          <p className="text-sm text-ink-hi">{fmt(appointment.starts_at, 'dd MMM yyyy')}</p>
                          <p className="t-label text-ink-mid mt-0.5">{fmt(appointment.starts_at, 'HH:mm')} · {appointment.source === 'manual' ? 'Presencial' : 'Online'}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-ink-hi truncate">{appointment.service_name}</p>
                          <p className="t-label text-ink-mid mt-0.5">{appointment.haircut_name ?? 'Sem corte'} · {appointment.barber_name}</p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-sm text-ink-hi">{formatMT(appointment.price_cents)}</span>
                          <StatusChip status={appointment.status as ApptStatus} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 mt-4">
                    <p className="t-label text-ink-mid">
                      {historyPage * HISTORY_PAGE_SIZE + 1} a {Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, Number(totalHistory))} de {Number(totalHistory)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" disabled={historyPage === 0} onClick={() => setHistoryPage((value) => Math.max(0, value - 1))} aria-label="Histórico anterior"><ChevronLeft size={15} /></Button>
                      <span className="t-label text-ink-mid min-w-12 text-center">{historyPage + 1}/{totalPages}</span>
                      <Button variant="secondary" size="sm" disabled={historyPage >= totalPages - 1} onClick={() => setHistoryPage((value) => Math.min(totalPages - 1, value + 1))} aria-label="Histórico seguinte"><ChevronRight size={15} /></Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Resumo">
            <div className="grid grid-cols-2 xl:grid-cols-1 gap-4">
              <Stat label="Visitas" value={String(item.visits_count)} />
              <Stat label="Faltas" value={String(item.no_show_count)} />
              <Stat label="Concluídas" value={String(item.completed_appointments)} />
              <Stat label="Canceladas" value={String(item.cancelled_appointments)} />
              <Stat label="Total gasto" value={formatMT(item.total_spend_cents)} />
            </div>
          </Panel>

          <Panel title="Último atendimento">
            <p className="text-sm text-ink-hi">{item.last_service_name ?? 'Sem serviço concluído'}</p>
            <p className="t-body text-ink-mid mt-1">{item.last_haircut_name ?? 'Sem corte registado'}{item.last_barber_name ? ' · ' + item.last_barber_name : ''}</p>
            {item.last_visit_at && <p className="t-label text-ink-lo mt-2">{fmt(item.last_visit_at, 'dd MMM yyyy, HH:mm')}</p>}
          </Panel>

          <Panel title="Próxima marcação">
            {item.next_appointment_at ? (
              <>
                <div className="flex items-center gap-2 text-accent-soft"><CalendarDays size={17} /><span className="text-sm font-medium">{fmt(item.next_appointment_at, 'dd MMM yyyy, HH:mm')}</span></div>
                <p className="t-label text-ink-mid mt-1">{item.next_appointment_status === 'pending' ? 'Pendente' : item.next_appointment_status === 'in_progress' ? 'Em atendimento' : 'Confirmada'}</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate('/app/agenda')}>Abrir agenda</Button>
              </>
            ) : (
              <p className="t-body text-ink-lo">Sem marcação futura.</p>
            )}
          </Panel>

          <Panel title="Contacto">
            <div className="space-y-2">
              <a href={'tel:' + item.phone} className="flex items-center gap-2 text-sm text-ink-mid hover:text-ink-hi"><Phone size={15} /> Ligar</a>
              <a href={buildWhatsAppLink(item.phone)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-ink-mid hover:text-ink-hi"><MessageCircle size={15} /> WhatsApp</a>
              {item.email && <a href={'mailto:' + item.email} className="flex items-center gap-2 text-sm text-ink-mid hover:text-ink-hi"><Mail size={15} /> Email</a>}
            </div>
          </Panel>
        </aside>
      </section>
    </Page>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={'block ' + (className ?? '')}><span className="t-label text-ink-mid block mb-1.5">{label}</span>{children}</label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="t-label text-ink-lo">{label}</p><p className="text-lg text-ink-hi mt-0.5">{value}</p></div>;
}
