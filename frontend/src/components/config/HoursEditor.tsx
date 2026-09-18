import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { TZDate } from '@date-fns/tz';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import type { Json } from '@/lib/database.types';
import { humanError, fmt, TZ } from '@/lib/utils';
import { WEEKDAYS, BLOCK_REASONS, type WorkingHour, type TimeBlock, type BlockReason } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal, Switch, Select } from '@/components/ui/Primitives';
import { Skeleton, EmptyState, ErrorState, Panel } from '@/components/ui/States';
import { useBarbers } from './BarbersEditor';

type Row = { weekday: number; opens_at: string; closes_at: string; is_closed: boolean };
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const t5 = (t: string) => t.slice(0, 5);

export function HoursEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const barbers = useBarbers(shop!.id);
  const [barberId, setBarberId] = useState<string>('');
  const key = ['working_hours', shop!.id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => { const { data, error } = await supabase.from('working_hours').select('*').eq('barbershop_id', shop!.id); if (error) throw error; return data as WorkingHour[]; },
  });
  const [rows, setRows] = useState<Row[]>([]);
  const scoped = q.data?.filter((h) => (barberId ? h.barber_id === barberId : h.barber_id === null)) ?? [];
  const hasOverride = barberId ? scoped.length > 0 : true;

  useEffect(() => {
    const base = q.data?.filter((h) => h.barber_id === null) ?? [];
    const src = scoped.length ? scoped : base;
    setRows(ORDER.map((d) => { const h = src.find((x) => x.weekday === d); return h ? { weekday: d, opens_at: t5(h.opens_at), closes_at: t5(h.closes_at), is_closed: h.is_closed } : { weekday: d, opens_at: '09:00', closes_at: '19:00', is_closed: d === 0 }; }));
  }, [q.data, barberId]);

  const save = useMutation({
    mutationFn: async () => {
      for (const r of rows) {
        if (!r.is_closed && r.closes_at <= r.opens_at) {
          throw new Error(`${WEEKDAYS[r.weekday]}: a hora de fecho tem de ser depois da abertura.`);
        }
      }

      const params = barberId
        ? { p_shop: shop!.id, p_rows: rows as unknown as Json, p_barber_id: barberId }
        : { p_shop: shop!.id, p_rows: rows as unknown as Json };

      const { error } = await supabase.rpc('replace_working_hours', params);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Horário guardado'); },
    onError: (e) => toast.error(e instanceof Error && e.message.includes(':') ? e.message : humanError(e)),
  });
  const clearOverride = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('replace_working_hours', {
        p_shop: shop!.id,
        p_rows: [] as Json,
        p_barber_id: barberId,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Este barbeiro volta a seguir o horário da barbearia'); },
    onError: (e) => toast.error(humanError(e)),
  });
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (q.isLoading) return <Skeleton className="h-64" lines={7} />;
  if (q.error) return <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select data-testid="hours-scope-select" label="Horário de" value={barberId} onChange={(e) => setBarberId(e.target.value)} className="min-w-[220px]">
          <option value="">Barbearia (base)</option>
          {barbers.data?.map((b) => <option key={b.id} value={b.id}>{b.display_name}</option>)}
        </Select>
        {barberId && hasOverride && <Button data-testid="hours-clear-override-btn" variant="ghost" size="sm" onClick={() => clearOverride.mutate()}>Seguir horário da barbearia</Button>}
      </div>
      {barberId && !hasOverride && <p className="t-body text-ink-mid">Este barbeiro segue o horário da barbearia. Ao guardares, crias um horário próprio.</p>}
      <div data-testid="hours-grid" className="glass p-2 sm:p-3 divide-y divide-white/5">
        {rows.map((r, i) => (
          <div key={r.weekday} data-testid={`hours-row-${r.weekday}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[120px_1fr_1fr_auto] items-center gap-3 px-3 py-2.5">
            <span className="text-sm font-normal">{WEEKDAYS[r.weekday]}</span>
            <div className="sm:contents contents">
              <input data-testid={`hours-open-${r.weekday}`} type="time" step={900} className="field !py-2 disabled:opacity-40 col-start-1 sm:col-start-auto" disabled={r.is_closed} value={r.opens_at} onChange={(e) => set(i, { opens_at: e.target.value })} aria-label={`Abre ${WEEKDAYS[r.weekday]}`} />
              <input data-testid={`hours-close-${r.weekday}`} type="time" step={900} className="field !py-2 disabled:opacity-40" disabled={r.is_closed} value={r.closes_at} onChange={(e) => set(i, { closes_at: e.target.value })} aria-label={`Fecha ${WEEKDAYS[r.weekday]}`} />
            </div>
            <Switch testId={`hours-open-switch-${r.weekday}`} checked={!r.is_closed} onCheckedChange={(v) => set(i, { is_closed: !v })} label={r.is_closed ? 'Fechado' : 'Aberto'} />
          </div>
        ))}
      </div>
      <div className="flex justify-end"><Button data-testid="hours-save-btn" loading={save.isPending} onClick={() => save.mutate()}>Guardar horário</Button></div>
    </div>
  );
}

const parseLocal = (s: string) => { const [d, t] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new TZDate(y, m - 1, dd, h, mi, TZ).toISOString(); };
const emptyBlock = { barber_id: '', start: '', end: '', reason: 'lunch' as BlockReason, note: '' };

export function BlocksEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const barbers = useBarbers(shop!.id);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyBlock);
  const key = ['time_blocks', shop!.id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => { const { data, error } = await supabase.from('time_blocks').select('*').eq('barbershop_id', shop!.id).gte('ends_at', new Date().toISOString()).order('starts_at'); if (error) throw error; return data as TimeBlock[]; },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.start || !form.end) throw new Error('Indica início e fim.');
      const starts_at = parseLocal(form.start), ends_at = parseLocal(form.end);
      if (ends_at <= starts_at) throw new Error('O fim tem de ser depois do início.');
      const r = await supabase.from('time_blocks').insert({ barbershop_id: shop!.id, barber_id: form.barber_id || null, starts_at, ends_at, reason: form.reason, note: form.note.trim() || null });
      if (r.error) throw r.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setOpen(false); setForm(emptyBlock); toast.success('Bloqueio criado'); },
    onError: (e) => toast.error(e instanceof Error && !e.message.includes('_') && e.message.length < 60 ? e.message : humanError(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.from('time_blocks').delete().eq('id', id); if (r.error) throw r.error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }), onError: (e) => toast.error(humanError(e)),
  });
  const barberName = (id: string | null) => (id ? barbers.data?.find((b) => b.id === id)?.display_name ?? 'Barbeiro' : 'Toda a barbearia');

  return (
    <Panel title="Bloqueios" testId="blocks-panel" aside={<Button data-testid="block-add-btn" size="sm" pill onClick={() => setOpen(true)}><Plus size={14} />Novo bloqueio</Button>}>
      {q.isLoading ? <Skeleton className="h-24" lines={2} /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState testId="blocks-empty" title="Sem bloqueios futuros." body="Almoços, folgas e feriados aparecem aqui e fecham a agenda nesse período." />
      ) : (
        <ul className="divide-y divide-white/5">
          {q.data!.map((b) => (
            <li key={b.id} data-testid={`block-row-${b.id}`} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-normal">{BLOCK_REASONS[b.reason]} · <span className="text-ink-mid">{barberName(b.barber_id)}</span></p>
                <p className="t-label text-ink-mid">{fmt(b.starts_at, "EEE d MMM, HH:mm")} – {fmt(b.ends_at, fmt(b.starts_at, 'yyyy-MM-dd') === fmt(b.ends_at, 'yyyy-MM-dd') ? 'HH:mm' : "EEE d MMM, HH:mm")}{b.note && ` · ${b.note}`}</p>
              </div>
              <button type="button" data-testid={`block-delete-${b.id}`} onClick={() => remove.mutate(b.id)} aria-label="Remover bloqueio" className="p-2 text-ink-lo hover:text-st-noshow transition-colors"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onOpenChange={setOpen} title="Novo bloqueio" testId="block-modal">
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <Select data-testid="block-reason-select" label="Motivo" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as BlockReason })}>
              {Object.entries(BLOCK_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select data-testid="block-barber-select" label="Quem" value={form.barber_id} onChange={(e) => setForm({ ...form, barber_id: e.target.value })}>
              <option value="">Toda a barbearia</option>
              {barbers.data?.map((b) => <option key={b.id} value={b.id}>{b.display_name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field data-testid="block-start-input" label="Início" name="blk_start" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <Field data-testid="block-end-input" label="Fim" name="blk_end" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
          <Field data-testid="block-note-input" label="Nota, opcional" name="blk_note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ex.: consulta médica" />
          <p className="t-label text-ink-mid">Horas em Africa/Maputo.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button data-testid="block-save-btn" type="submit" loading={save.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </Panel>
  );
}
