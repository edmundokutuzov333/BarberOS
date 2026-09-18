import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { formatMT, humanError } from '@/lib/utils';
import type { Service } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal, Switch } from '@/components/ui/Primitives';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { SortableList } from '@/components/ui/SortableList';

const empty = { name: '', price: '', duration: '30', requires_deposit: false };

export function useServices(shopId: string) {
  return useQuery({
    queryKey: ['services', shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').eq('barbershop_id', shopId).order('sort_order').order('name');
      if (error) throw error;
      return data as Service[];
    },
  });
}

export function ServicesEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const q = useServices(shop!.id);
  const [editing, setEditing] = useState<Service | null | 'new'>(null);
  const [form, setForm] = useState(empty);
  const key = ['services', shop!.id];

  const open = (s: Service | 'new') => {
    setForm(s === 'new' ? empty : { name: s.name, price: String(s.price_cents / 100), duration: String(s.duration_min), requires_deposit: s.requires_deposit });
    setEditing(s);
  };

  const save = useMutation({
    mutationFn: async () => {
      const price = Math.round(parseFloat(form.price.replace(',', '.')) * 100);
      const duration = parseInt(form.duration, 10);
      if (form.name.trim().length < 2) throw new Error('INVALID_NAME');
      if (!Number.isFinite(price) || price < 0) throw new Error('Preço inválido.');
      if (!Number.isFinite(duration) || duration < 5 || duration > 480) throw new Error('Duração entre 5 e 480 minutos.');
      const row = { name: form.name.trim(), price_cents: price, duration_min: duration, requires_deposit: form.requires_deposit };
      const r = editing === 'new'
        ? await supabase.from('services').insert({ ...row, barbershop_id: shop!.id, sort_order: q.data?.length ?? 0 })
        : await supabase.from('services').update(row).eq('id', (editing as Service).id);
      if (r.error) throw r.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setEditing(null); toast.success('Serviço guardado'); },
    onError: (e) => toast.error(e instanceof Error && !e.message.includes('_') ? e.message : humanError(e)),
  });

  const toggle = useMutation({
    mutationFn: async (s: Service) => { const r = await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id); if (r.error) throw r.error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }), onError: (e) => toast.error(humanError(e)),
  });
  const remove = useMutation({
    mutationFn: async (s: Service) => { const r = await supabase.from('services').delete().eq('id', s.id); if (r.error) throw r.error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Serviço removido'); },
    onError: () => toast.error('Não dá para remover: já tem marcações. Desactiva-o em vez disso.'),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button data-testid="service-add-btn" size="sm" pill onClick={() => open('new')}><Plus size={14} />Novo serviço</Button></div>
      {q.isLoading ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState testId="services-empty" title="Cria o primeiro serviço para abrir a agenda." body="Ex.: Corte, Barba, Corte + barba." action={<Button data-testid="services-empty-add-btn" size="sm" pill onClick={() => open('new')}>Criar serviço</Button>} />
      ) : (
        <SortableList items={q.data!} table="services" queryKey={key} testId="services-list" render={(s) => (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-normal truncate ${!s.is_active && 'text-ink-mid line-through'}`}>{s.name}</p>
              <p className="t-label text-ink-mid">{s.duration_min} min · {formatMT(s.price_cents)}{s.requires_deposit && ' · exige sinal'}</p>
            </div>
            <Switch testId={`service-toggle-${s.id}`} checked={s.is_active} onCheckedChange={() => toggle.mutate(s)} />
            <button data-testid={`service-edit-${s.id}`} onClick={() => open(s)} aria-label="Editar" className="p-2 text-ink-lo hover:text-accent-soft transition-colors"><Pencil size={15} /></button>
            <button data-testid={`service-delete-${s.id}`} onClick={() => confirm(`Remover "${s.name}"?`) && remove.mutate(s)} aria-label="Remover" className="p-2 text-ink-lo hover:text-st-noshow transition-colors"><Trash2 size={15} /></button>
          </div>
        )} />
      )}

      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'Novo serviço' : 'Editar serviço'} testId="service-modal">
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <Field data-testid="service-name-input" label="Nome" name="svc_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Corte + barba" autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Field data-testid="service-price-input" label="Preço (MT)" name="svc_price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="500" />
            <Field data-testid="service-duration-input" label="Duração (min)" name="svc_duration" inputMode="numeric" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>
          <Switch testId="service-deposit-switch" checked={form.requires_deposit} onCheckedChange={(v) => setForm({ ...form, requires_deposit: v })} label="Exige sinal (se o sinal estiver activo nas definições)" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button data-testid="service-save-btn" type="submit" loading={save.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
