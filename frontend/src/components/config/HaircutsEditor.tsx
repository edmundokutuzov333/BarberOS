import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { formatMT, humanError } from '@/lib/utils';
import type { Haircut } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal, Switch, Select, Textarea, ImageUpload } from '@/components/ui/Primitives';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { useServices } from './ServicesEditor';

const empty = { name: '', description: '', service_id: '', price: '', duration: '', photo_url: null as string | null };

export function useHaircuts(shopId: string) {
  return useQuery({
    queryKey: ['haircuts', shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from('haircuts').select('*').eq('barbershop_id', shopId).order('sort_order').order('name');
      if (error) throw error;
      return data as Haircut[];
    },
  });
}

export function HaircutsEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const q = useHaircuts(shop!.id);
  const services = useServices(shop!.id);
  const [editing, setEditing] = useState<Haircut | null | 'new'>(null);
  const [form, setForm] = useState(empty);
  const key = ['haircuts', shop!.id];

  const open = (h: Haircut | 'new') => {
    setForm(h === 'new' ? empty : { name: h.name, description: h.description ?? '', service_id: h.service_id ?? '', price: h.price_cents != null ? String(h.price_cents / 100) : '', duration: h.duration_min != null ? String(h.duration_min) : '', photo_url: h.photo_url });
    setEditing(h);
  };

  const seed = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.rpc('seed_haircut_catalogue', { p_shop: shop!.id }); if (error) throw error; return data as number; },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: key }); toast.success(n ? `${n} estilos adicionados ao catálogo` : 'O catálogo já tinha todos os estilos'); },
    onError: (e) => toast.error(humanError(e)),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 2) throw new Error('INVALID_NAME');
      const price = form.price ? Math.round(parseFloat(form.price.replace(',', '.')) * 100) : null;
      const duration = form.duration ? parseInt(form.duration, 10) : null;
      const row = { name: form.name.trim(), description: form.description.trim() || null, service_id: form.service_id || null, price_cents: price, duration_min: duration, photo_url: form.photo_url };
      const r = editing === 'new'
        ? await supabase.from('haircuts').insert({ ...row, barbershop_id: shop!.id, sort_order: q.data?.length ?? 0 })
        : await supabase.from('haircuts').update(row).eq('id', (editing as Haircut).id);
      if (r.error) throw r.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setEditing(null); toast.success('Corte guardado'); },
    onError: (e) => toast.error(humanError(e)),
  });
  const toggle = useMutation({
    mutationFn: async (h: Haircut) => { const r = await supabase.from('haircuts').update({ is_active: !h.is_active }).eq('id', h.id); if (r.error) throw r.error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }), onError: (e) => toast.error(humanError(e)),
  });
  const remove = useMutation({
    mutationFn: async (h: Haircut) => { const r = await supabase.from('haircuts').delete().eq('id', h.id); if (r.error) throw r.error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Corte removido'); }, onError: (e) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button data-testid="haircut-seed-btn" variant="secondary" size="sm" pill loading={seed.isPending} onClick={() => seed.mutate()}><Sparkles size={14} />Semear catálogo (22 estilos)</Button>
        <Button data-testid="haircut-add-btn" size="sm" pill onClick={() => open('new')}><Plus size={14} />Novo corte</Button>
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState testId="haircuts-empty" title="O catálogo está vazio." body="Semeia os 22 estilos mais pedidos e depois junta fotos dos teus próprios cortes." action={<Button data-testid="haircuts-empty-seed-btn" size="sm" pill loading={seed.isPending} onClick={() => seed.mutate()}>Semear catálogo</Button>} />
      ) : (
        <div data-testid="haircuts-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {q.data!.map((h) => (
            <div key={h.id} data-testid={`haircut-card-${h.id}`} className={`glass glass-3 !rounded-2xl overflow-hidden ${!h.is_active && 'opacity-50'}`} style={{ boxShadow: 'none' }}>
              <div className="aspect-[3/4] bg-[var(--surface-2)] relative">
                {h.photo_url ? <img src={h.photo_url} alt={h.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  : <div className="absolute inset-0 grid place-items-center text-ink-lo text-3xl font-medium">{h.name.slice(0, 1)}</div>}
                <div className="absolute top-2 right-2 flex gap-1">
                  <button data-testid={`haircut-edit-${h.id}`} onClick={() => open(h)} aria-label="Editar" className="h-8 w-8 rounded-full bg-black/50 backdrop-blur grid place-items-center text-ink-hi hover:text-accent-soft"><Pencil size={13} /></button>
                  <button data-testid={`haircut-delete-${h.id}`} onClick={() => confirm(`Remover "${h.name}"?`) && remove.mutate(h)} aria-label="Remover" className="h-8 w-8 rounded-full bg-black/50 backdrop-blur grid place-items-center text-ink-hi hover:text-st-noshow"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal truncate">{h.name}</p>
                  <p className="t-label text-ink-mid truncate">{[h.duration_min && `${h.duration_min} min`, h.price_cents != null && formatMT(h.price_cents)].filter(Boolean).join(' · ') || 'Segue o serviço'}</p>
                </div>
                <Switch testId={`haircut-toggle-${h.id}`} checked={h.is_active} onCheckedChange={() => toggle.mutate(h)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'Novo corte' : 'Editar corte'} testId="haircut-modal">
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid grid-cols-[120px_1fr] gap-4">
            <ImageUpload testId="haircut-photo-upload" bucket="haircuts" shopId={shop!.id} ratio={3 / 4} value={form.photo_url} onChange={(u) => setForm({ ...form, photo_url: u })} label="Foto 3:4" />
            <div className="space-y-3">
              <Field data-testid="haircut-name-input" label="Nome" name="hc_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Low fade" autoFocus />
              <Select data-testid="haircut-service-select" label="Serviço associado" value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
                <option value="">Sem serviço fixo</option>
                {services.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          </div>
          <Textarea data-testid="haircut-description-input" label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Uma frase que ajude o cliente a reconhecer o corte." />
          <div className="grid grid-cols-2 gap-3">
            <Field data-testid="haircut-price-input" label="Preço (MT), opcional" name="hc_price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Segue o serviço" />
            <Field data-testid="haircut-duration-input" label="Duração (min), opcional" name="hc_duration" inputMode="numeric" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="Segue o serviço" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button data-testid="haircut-save-btn" type="submit" loading={save.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
