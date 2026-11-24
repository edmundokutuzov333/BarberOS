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
import { ImageUpload, Modal, Switch } from '@/components/ui/Primitives';
import { PhotoWithFallback, SERVICE_FALLBACK_PHOTOS } from '@/components/PhotoWithFallback';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { SortableList } from '@/components/ui/SortableList';

type CatalogService = Service & { addons: { addon_service_id: string }[] };
const empty = { category: 'Outros', subcategory: 'Geral', name: '', price: '', duration: '30', requires_deposit: false, photo_url: null as string | null };

export function useServices(shopId: string) {
  return useQuery({
    queryKey: ['services', shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*,addons:service_addons!service_addons_service_id_barbershop_id_fkey(addon_service_id)').eq('barbershop_id', shopId).order('sort_order').order('name');
      if (error) throw error;
      return data as CatalogService[];
    },
  });
}

export function ServicesEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const q = useServices(shop!.id);
  const [editing, setEditing] = useState<CatalogService | null | 'new'>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [form, setForm] = useState(empty);
  const key = ['services', shop!.id];

  const open = (s: CatalogService | 'new') => {
    setAddonIds(s === 'new' ? [] : s.addons.map((item) => item.addon_service_id));
    setForm(s === 'new' ? empty : { category: s.category, subcategory: s.subcategory, name: s.name, price: String(s.price_cents / 100), duration: String(s.duration_min), requires_deposit: s.requires_deposit, photo_url: s.photo_url ?? null });
    setEditing(s);
  };

  const save = useMutation({
    mutationFn: async () => {
      const price = Math.round(parseFloat(form.price.replace(',', '.')) * 100);
      const duration = parseInt(form.duration, 10);
      if (form.name.trim().length < 2) throw new Error('INVALID_NAME');
      if (!Number.isFinite(price) || price < 0) throw new Error('Preço inválido.');
      if (!Number.isFinite(duration) || duration < 5 || duration > 480) throw new Error('Duração entre 5 e 480 minutos.');
      if (!form.category.trim() || !form.subcategory.trim() || form.category.trim().length > 80 || form.subcategory.trim().length > 80) throw new Error('Indique categoria e subcategoria válidas.');
      const row = { category: form.category.trim(), subcategory: form.subcategory.trim(), name: form.name.trim(), price_cents: price, duration_min: duration, requires_deposit: form.requires_deposit, photo_url: form.photo_url };
      const r = await supabase.rpc('save_service_configuration', { p_shop: shop!.id, p_service: editing === 'new' ? null : (editing as Service).id, p_entry: row, p_addon_ids: addonIds });
      if (r.error) throw r.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['public-barbershop'] }); qc.invalidateQueries({ queryKey: ['manual-booking', 'catalog'] }); qc.invalidateQueries({ queryKey: ['availability'] }); setEditing(null); toast.success('Serviço guardado'); },
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
        <SortableList items={q.data!} shopId={shop!.id} rpcName="reorder_services" queryKey={key} testId="services-list" render={(s) => (
          <div className="flex items-center gap-3">
            <PhotoWithFallback src={s.photo_url} fallbackSources={SERVICE_FALLBACK_PHOTOS} alt={`Fotografia de ${s.name}`} className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-normal truncate ${!s.is_active && 'text-ink-mid line-through'}`}>{s.name}</p>
              <p className="t-label text-ink-mid">{s.category} · {s.subcategory} · {s.duration_min} min · {formatMT(s.price_cents)}{s.requires_deposit && ' · exige sinal'}</p>
            </div>
            <Switch testId={`service-toggle-${s.id}`} checked={s.is_active} onCheckedChange={() => toggle.mutate(s)} />
            <button type="button" data-testid={`service-edit-${s.id}`} onClick={() => open(s)} aria-label="Editar" className="p-2 text-ink-lo hover:text-accent-soft transition-colors"><Pencil size={15} /></button>
            <button type="button" data-testid={`service-delete-${s.id}`} onClick={() => confirm(`Remover "${s.name}"?`) && remove.mutate(s)} aria-label="Remover" className="p-2 text-ink-lo hover:text-st-noshow transition-colors"><Trash2 size={15} /></button>
          </div>
        )} />
      )}

      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'Novo serviço' : 'Editar serviço'} testId="service-modal">
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <Field data-testid="service-name-input" label="Nome" name="svc_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Corte + barba" autoFocus />
          <div className="grid grid-cols-2 gap-3"><Field label="Categoria" name="svc_category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}/><Field label="Subcategoria" name="svc_subcategory" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })}/></div>
          <ImageUpload testId="service-photo-upload" bucket="shop-photos" shopId={shop!.id} ratio={16 / 9} value={form.photo_url} onChange={(url) => setForm({ ...form, photo_url: url })} label="Fotografia do serviço" />
          <div className="grid grid-cols-2 gap-3">
            <Field data-testid="service-price-input" label="Preço (MT)" name="svc_price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="500" />
            <Field data-testid="service-duration-input" label="Duração (min)" name="svc_duration" inputMode="numeric" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </div>
          <Switch testId="service-deposit-switch" checked={form.requires_deposit} onCheckedChange={(v) => setForm({ ...form, requires_deposit: v })} label="Exige sinal (se o sinal estiver activo nas definições)" />
          <fieldset className="space-y-2 border-t border-white/10 pt-3"><legend className="t-label text-ink-mid">Complementos compatíveis</legend><p className="t-label text-ink-mid">O cliente pode juntar estes serviços na mesma visita. O preço e a duração são os do serviço complementar. O profissional tem de estar habilitado para todos.</p>{q.data?.filter((item) => editing === 'new' || item.id !== editing?.id).map((item) => <label key={item.id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={addonIds.includes(item.id)} onChange={(e) => setAddonIds((ids) => e.target.checked ? [...ids,item.id] : ids.filter((id) => id !== item.id))}/>{item.name} · {formatMT(item.price_cents)} · {item.duration_min} min{!item.is_active && ' (inactivo)'}</label>)}</fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button data-testid="service-save-btn" type="submit" loading={save.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
