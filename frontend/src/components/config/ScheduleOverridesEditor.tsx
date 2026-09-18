import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { BLOCK_REASONS, type BlockReason, type ScheduleOverride } from '@/lib/types';
import { humanError, nowTz } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal, Select, Switch, Textarea } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { useBarbers } from './BarbersEditor';

const today = () => {
  const d = nowTz();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-PT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T12:00:00`));

const emptyForm = {
  date: today(),
  barberId: '',
  mode: 'closed' as 'closed' | 'open',
  opensAt: '09:00',
  closesAt: '18:00',
  reason: 'day_off' as BlockReason,
  note: '',
};

export function ScheduleOverridesEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const barbers = useBarbers(shop!.id);
  const [editing, setEditing] = useState<ScheduleOverride | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const key = ['schedule_overrides', shop!.id];

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_overrides')
        .select('*')
        .eq('barbershop_id', shop!.id)
        .gte('override_date', today())
        .order('override_date')
        .order('barber_id');

      if (error) throw error;
      return data as ScheduleOverride[];
    },
  });

  const barberNames = useMemo(
    () => new Map((barbers.data ?? []).map((b) => [b.id, b.display_name])),
    [barbers.data],
  );

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, date: today() });
    setOpen(true);
  };

  const openEdit = (row: ScheduleOverride) => {
    setEditing(row);
    setForm({
      date: row.override_date,
      barberId: row.barber_id ?? '',
      mode: row.is_closed ? 'closed' : 'open',
      opensAt: row.opens_at?.slice(0, 5) ?? '09:00',
      closesAt: row.closes_at?.slice(0, 5) ?? '18:00',
      reason: row.reason,
      note: row.note ?? '',
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.date) throw new Error('INVALID_OVERRIDE_DATE');
      if (form.mode === 'open' && form.closesAt <= form.opensAt) {
        throw new Error('INVALID_OVERRIDE_HOURS');
      }

      const { error } = await supabase.rpc('save_schedule_override', {
        p_shop: shop!.id,
        p_override_date: form.date,
        p_barber_id: form.barberId || null,
        p_is_closed: form.mode === 'closed',
        p_opens_at: form.mode === 'open' ? form.opensAt : null,
        p_closes_at: form.mode === 'open' ? form.closesAt : null,
        p_reason: form.reason,
        p_note: form.note.trim() || null,
        p_id: editing?.id ?? null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setOpen(false);
      setEditing(null);
      toast.success('Excepção de horário guardada');
    },
    onError: (e) => toast.error(humanError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_schedule_override', {
        p_shop: shop!.id,
        p_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success('Excepção removida');
    },
    onError: (e) => toast.error(humanError(e)),
  });

  return (
    <Panel
      title="Dias especiais"
      testId="schedule-overrides-panel"
      aside={
        <Button size="sm" pill data-testid="schedule-override-add-btn" onClick={openNew}>
          <Plus size={14} />
          Nova excepção
        </Button>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-36" lines={4} />
      ) : q.error ? (
        <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} />
      ) : q.data!.length === 0 ? (
        <EmptyState
          testId="schedule-overrides-empty"
          title="Sem alterações de calendário."
          body="Feriados, folgas e dias com horário especial podem ser definidos aqui sem alterar o horário semanal."
          action={<Button size="sm" pill onClick={openNew}>Adicionar excepção</Button>}
        />
      ) : (
        <ul className="divide-y divide-white/5">
          {q.data!.map((row) => (
            <li key={row.id} data-testid={`schedule-override-row-${row.id}`} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-normal">
                  {formatDate(row.override_date)} · {row.is_closed ? 'Fechado' : `${row.opens_at?.slice(0, 5)}–${row.closes_at?.slice(0, 5)}`}
                </p>
                <p className="t-label text-ink-mid truncate">
                  {row.barber_id ? barberNames.get(row.barber_id) ?? 'Barbeiro' : 'Toda a barbearia'}
                  {' · '}
                  {BLOCK_REASONS[row.reason]}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
              </div>
              <button
                data-testid={`schedule-override-edit-${row.id}`}
                onClick={() => openEdit(row)}
                aria-label={`Editar excepção de ${formatDate(row.override_date)}`}
                className="p-2 text-ink-lo hover:text-accent-soft transition-colors"
              >
                <Pencil size={15} />
              </button>
              <button
                data-testid={`schedule-override-delete-${row.id}`}
                onClick={() => remove.mutate(row.id)}
                aria-label={`Remover excepção de ${formatDate(row.override_date)}`}
                className="p-2 text-ink-lo hover:text-st-noshow transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Editar dia especial' : 'Novo dia especial'}
        testId="schedule-override-modal"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field
            data-testid="schedule-override-date"
            label="Data"
            name="override_date"
            type="date"
            min={today()}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />

          <Select
            data-testid="schedule-override-barber"
            label="Aplicar a"
            value={form.barberId}
            onChange={(e) => setForm({ ...form, barberId: e.target.value })}
          >
            <option value="">Toda a barbearia</option>
            {barbers.data?.map((b) => (
              <option key={b.id} value={b.id}>{b.display_name}</option>
            ))}
          </Select>

          <Switch
            testId="schedule-override-open"
            checked={form.mode === 'open'}
            onCheckedChange={(checked) =>
              setForm({ ...form, mode: checked ? 'open' : 'closed' })
            }
            label={form.mode === 'open' ? 'Abrir com horário especial' : 'Fechar neste dia'}
          />

          {form.mode === 'open' && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                data-testid="schedule-override-open-time"
                label="Abre às"
                name="override_opens_at"
                type="time"
                value={form.opensAt}
                onChange={(e) => setForm({ ...form, opensAt: e.target.value })}
              />
              <Field
                data-testid="schedule-override-close-time"
                label="Fecha às"
                name="override_closes_at"
                type="time"
                value={form.closesAt}
                onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
              />
            </div>
          )}

          <Select
            data-testid="schedule-override-reason"
            label="Motivo"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value as BlockReason })}
          >
            {Object.entries(BLOCK_REASONS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>

          <Textarea
            data-testid="schedule-override-note"
            label="Nota, opcional"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Ex.: horário reduzido por feriado"
          />

          <p className="t-label text-ink-mid">
            Esta excepção tem precedência sobre o horário semanal na data escolhida. Horas em {shop!.timezone}.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button data-testid="schedule-override-save-btn" type="submit" loading={save.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </Panel>
  );
}
