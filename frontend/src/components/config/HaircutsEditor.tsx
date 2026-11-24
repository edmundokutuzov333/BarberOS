import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Sparkles, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { invalidateBookingCatalog } from '@/features/booking/catalog-cache';
import { useShop } from '@/lib/shop';
import { formatMT, humanError } from '@/lib/utils';
import type { Haircut } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal, Switch, Select, Textarea, ImageUpload } from '@/components/ui/Primitives';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { useServices } from './ServicesEditor';
import { getDefaultHaircutPhoto, isDefaultHaircutPhoto } from '@/lib/default-haircut-photos';
import { HaircutPhoto } from '@/components/HaircutPhoto';
import type { StyleOffer } from '@/features/booking/offer';

type CatalogHaircut = Haircut & { haircut_service_offers: StyleOffer[]; haircut_barber_skills: { barber_id: string }[] };
type ExtraForm = { service_id: string; price: string; duration: string };

const empty = { name: '', description: '', service_id: '', price: '', duration: '', photo_url: null as string | null };

export function useHaircuts(shopId: string) {
  return useQuery({
    queryKey: ['haircuts', shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from('haircuts').select('*,haircut_service_offers(service_id,price_cents,duration_min),haircut_barber_skills(barber_id)').eq('barbershop_id', shopId).order('sort_order').order('name');
      if (error) throw error;
      return data as CatalogHaircut[];
    },
  });
}

export function HaircutsEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const q = useHaircuts(shop!.id);
  const services = useServices(shop!.id);
  const [editing, setEditing] = useState<CatalogHaircut | null | 'new'>(null);
  const [extra, setExtra] = useState<ExtraForm[]>([]);
  const [restricted, setRestricted] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const barbers = useQuery({ queryKey: ['haircut-skill-barbers', shop!.id], queryFn: async () => { const { data, error } = await supabase.from('barbers').select('id,display_name,is_active').eq('barbershop_id', shop!.id).order('display_name'); if (error) throw error; return data; } });
  const [form, setForm] = useState(empty);

  const open = (h: CatalogHaircut | 'new') => {
    setExtra(h === 'new' ? [] : h.haircut_service_offers.map((o) => ({ service_id: o.service_id, price: o.price_cents == null ? '' : String(o.price_cents / 100), duration: o.duration_min == null ? '' : String(o.duration_min) })));
    setRestricted(h !== 'new' && h.skill_restricted);
    setSkills(h === 'new' ? [] : h.haircut_barber_skills.map((k) => k.barber_id));
    setForm(h === 'new' ? empty : { name: h.name, description: h.description ?? '', service_id: h.service_id ?? '', price: h.price_cents != null ? String(h.price_cents / 100) : '', duration: h.duration_min != null ? String(h.duration_min) : '', photo_url: h.photo_url });
    setEditing(h);
  };

  const seed = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.rpc('seed_haircut_catalogue', { p_shop: shop!.id }); if (error) throw error; return data as number; },
    onSuccess: (n) => { invalidateBookingCatalog(qc, shop!.id, shop!.slug); toast.success(n ? `${n} estilos adicionados ao catálogo` : 'O catálogo já tinha todos os estilos'); },
    onError: (e) => toast.error(humanError(e)),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.name.trim().length < 2) throw new Error('INVALID_NAME');
      const price = form.price.trim() ? Math.round(Number(form.price.replace(',', '.')) * 100) : null;
      const duration = form.duration.trim() ? Number(form.duration) : null;
      if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 2147483647)) throw new Error('Preço inválido.');
      if (duration !== null && (!Number.isInteger(duration) || duration < 5 || duration > 480)) throw new Error('Duração entre 5 e 480 minutos.');
      if (!form.service_id && (price !== null || duration !== null)) throw new Error('Associe um serviço para definir preço ou duração; uma referência visual não é reservável.');
      const row = { name: form.name.trim(), description: form.description.trim() || null, service_id: form.service_id || null, price_cents: price, duration_min: duration, photo_url: form.photo_url };
      const offers = extra.map((item) => { const p = item.price.trim() === '' ? null : Math.round(Number(item.price.replace(',', '.')) * 100); const d = item.duration.trim() === '' ? null : Number(item.duration); if (!item.service_id || item.service_id === form.service_id || (p !== null && (!Number.isSafeInteger(p) || p < 0 || p > 2147483647)) || (d !== null && (!Number.isInteger(d) || d < 5 || d > 480))) throw new Error('Verifique os serviços adicionais, preços e durações.'); return { service_id: item.service_id, price_cents: p, duration_min: d }; });
      if (new Set(offers.map((item) => item.service_id)).size !== offers.length) throw new Error('Não repita serviços adicionais.');
      const r = await supabase.rpc('save_haircut_configuration', { p_shop: shop!.id, p_haircut: editing === 'new' ? null : (editing as Haircut).id, p_entry: { ...row, skill_restricted: restricted }, p_offers: offers, p_skill_barbers: skills });
      if (r.error) throw r.error;
    },
    onSuccess: () => { invalidateBookingCatalog(qc, shop!.id, shop!.slug); setEditing(null); toast.success('Corte guardado'); },
    onError: (e) => toast.error(e instanceof Error && !e.message.includes('_') ? e.message : humanError(e)),
  });
  const toggle = useMutation({
    mutationFn: async (h: Haircut) => { const r = await supabase.from('haircuts').update({ is_active: !h.is_active }).eq('id', h.id); if (r.error) throw r.error; },
    onSuccess: () => invalidateBookingCatalog(qc, shop!.id, shop!.slug), onError: (e) => toast.error(humanError(e)),
  });
  const remove = useMutation({
    mutationFn: async (h: Haircut) => { const r = await supabase.from('haircuts').delete().eq('id', h.id); if (r.error) throw r.error; },
    onSuccess: () => { invalidateBookingCatalog(qc, shop!.id, shop!.slug); toast.success('Corte removido'); }, onError: (e) => toast.error(humanError(e)),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: -1 | 1 }) => {
      const list = [...(q.data ?? [])];
      const index = list.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;

      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];

      const { error } = await supabase.rpc('reorder_haircuts', {
        p_shop: shop!.id,
        p_ids: list.map((item) => item.id),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateBookingCatalog(qc, shop!.id, shop!.slug),
    onError: (e) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button data-testid="haircut-seed-btn" variant="secondary" size="sm" pill loading={seed.isPending} onClick={() => seed.mutate()}><Sparkles size={14} />Semear catálogo (22 estilos)</Button>
        <Button data-testid="haircut-add-btn" size="sm" pill onClick={() => open('new')}><Plus size={14} />Novo corte</Button>
      </div>
      <p className="text-xs leading-5 text-ink-mid">As fotografias-padrão são referências visuais reais e incluem diferentes tons de pele e tipos de cabelo. Para mostrar trabalhos da sua barbearia, edite cada corte e carregue uma fotografia própria; o carregamento substitui apenas a imagem desta loja.</p>
      {q.isLoading ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState testId="haircuts-empty" title="O catálogo está vazio." body="Semeia os 22 estilos mais pedidos e depois junta fotos dos teus próprios cortes." action={<Button data-testid="haircuts-empty-seed-btn" size="sm" pill loading={seed.isPending} onClick={() => seed.mutate()}>Semear catálogo</Button>} />
      ) : (
        <div data-testid="haircuts-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {q.data!.map((h, i) => (
            <div key={h.id} data-testid={`haircut-card-${h.id}`} className={`glass glass-3 !rounded-2xl overflow-hidden ${!h.is_active && 'opacity-50'}`} style={{ boxShadow: 'none' }}>
              <div className="aspect-[3/4] bg-[var(--surface-2)] relative">
                <HaircutPhoto name={h.name} photoUrl={h.photo_url} alt={`Exemplo do corte ${h.name}`} className="absolute inset-0 w-full h-full object-cover" />
                {isDefaultHaircutPhoto(h.name, h.photo_url) && getDefaultHaircutPhoto(h.name) && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">Foto padrão</span>}
                <div className="absolute top-2 right-2 grid grid-cols-2 sm:flex gap-1">
                  <button type="button" data-testid={`haircut-move-up-${h.id}`} onClick={() => reorder.mutate({ id: h.id, direction: -1 })} disabled={i === 0 || reorder.isPending} aria-label={`Mover ${h.name} para cima`} title="Mover para cima" className="h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-black/50 backdrop-blur grid place-items-center text-ink-hi hover:text-accent-soft disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp size={13} /></button>
                  <button type="button" data-testid={`haircut-move-down-${h.id}`} onClick={() => reorder.mutate({ id: h.id, direction: 1 })} disabled={i === q.data!.length - 1 || reorder.isPending} aria-label={`Mover ${h.name} para baixo`} title="Mover para baixo" className="h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-black/50 backdrop-blur grid place-items-center text-ink-hi hover:text-accent-soft disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown size={13} /></button>
                  <button type="button" data-testid={`haircut-edit-${h.id}`} onClick={() => open(h)} aria-label="Editar" className="h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-black/50 backdrop-blur grid place-items-center text-ink-hi hover:text-accent-soft"><Pencil size={13} /></button>
                  <button type="button" data-testid={`haircut-delete-${h.id}`} onClick={() => confirm(`Remover "${h.name}"?`) && remove.mutate(h)} aria-label="Remover" className="h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-black/50 backdrop-blur grid place-items-center text-ink-hi hover:text-st-noshow"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal truncate">{h.name}</p>
                  <p className="t-label text-ink-mid truncate">{h.service_id || h.haircut_service_offers.length ? ([h.duration_min && `${h.duration_min} min`, h.price_cents != null && formatMT(h.price_cents)].filter(Boolean).join(' · ') || 'Segue o serviço') : 'Referência visual · associe um serviço'}</p>
                </div>
                <Switch testId={`haircut-toggle-${h.id}`} checked={h.is_active} onCheckedChange={() => toggle.mutate(h)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'Novo corte' : 'Editar corte'} testId="haircut-modal">
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] gap-4">
            <div className="space-y-2">
              <ImageUpload testId="haircut-photo-upload" bucket="haircuts" shopId={shop!.id} ratio={3 / 4} value={form.photo_url} onChange={(u) => setForm({ ...form, photo_url: u })} label="Foto própria 3:4" />
              {isDefaultHaircutPhoto(form.name, form.photo_url) && getDefaultHaircutPhoto(form.name) && <p className="text-[11px] leading-4 text-ink-mid">A fotografia de referência está activa. Carregue uma imagem real de um trabalho da sua barbearia para substituir apenas este corte.</p>}
            </div>
            <div className="space-y-3">
              <Field data-testid="haircut-name-input" label="Nome" name="hc_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Low fade" autoFocus />
              <Select data-testid="haircut-service-select" label="Serviço principal" value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
                <option value="">Sem serviço principal</option>
                {services.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          </div>
          <Textarea data-testid="haircut-description-input" label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Uma frase que ajude o cliente a reconhecer o corte." />
          <p className="t-label text-ink-mid">Preço e duração opcionais substituem os do serviço principal. Deixe em branco para herdar. Serviços adicionais têm os seus próprios valores. Sem qualquer associação, o estilo é apenas visual.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field data-testid="haircut-price-input" label="Preço (MT), opcional" name="hc_price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Segue o serviço" />
            <Field data-testid="haircut-duration-input" label="Duração (min), opcional" name="hc_duration" inputMode="numeric" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="Segue o serviço" />
          </div>
          <fieldset className="space-y-3 border-t border-white/10 pt-3">
            <legend className="t-label text-ink-mid">Outras ofertas comerciais</legend>
            {extra.map((item, index) => <div key={index} className="rounded-xl border border-white/10 p-3 space-y-2"><Select data-testid={'haircut-extra-service-'+index} label="Serviço adicional" value={item.service_id} onChange={(e) => setExtra((rows) => rows.map((r, i) => i === index ? { ...r, service_id: e.target.value } : r))}><option value="">Escolher serviço</option>{services.data?.filter((svc) => svc.id !== form.service_id && (svc.id === item.service_id || !extra.some((r) => r.service_id === svc.id))).map((svc) => <option key={svc.id} value={svc.id}>{svc.name}</option>)}</Select><div className="grid grid-cols-2 gap-2"><Field label="Preço (MT)" name={'extra_price_'+index} value={item.price} placeholder="Herdar" inputMode="decimal" onChange={(e) => setExtra((rows) => rows.map((r,i) => i === index ? { ...r, price:e.target.value } : r))}/><Field label="Duração (min)" name={'extra_duration_'+index} value={item.duration} placeholder="Herdar" inputMode="numeric" onChange={(e) => setExtra((rows) => rows.map((r,i) => i === index ? { ...r, duration:e.target.value } : r))}/></div><Button type="button" variant="ghost" size="sm" onClick={() => setExtra((rows) => rows.filter((_,i) => i !== index))}>Remover oferta</Button></div>)}
            <Button data-testid="haircut-add-offer" type="button" variant="secondary" size="sm" disabled={extra.length >= 50 || !services.data?.some((svc) => svc.id !== form.service_id && !extra.some((r) => r.service_id === svc.id))} onClick={() => setExtra((rows) => [...rows,{service_id:'',price:'',duration:''}])}>Adicionar serviço compatível</Button>
          </fieldset>
          <fieldset className="space-y-3 border-t border-white/10 pt-3">
            <legend className="t-label text-ink-mid">Competências específicas</legend>
            <Switch testId="haircut-restrict-skills" checked={restricted} onCheckedChange={setRestricted} label="Apenas profissionais autorizados para este estilo"/>
            <p className="t-label text-ink-mid">{restricted ? 'Seleccione quem executa este estilo. Sem profissionais seleccionados, não será reservável.' : 'Herda as competências do serviço. Não presume certificação individual.'}</p>
            {restricted && (barbers.isLoading ? <Skeleton className="h-16"/> : barbers.error ? <ErrorState message={humanError(barbers.error)} onRetry={() => barbers.refetch()}/> : <div className="space-y-2">{barbers.data?.map((b) => <label key={b.id} className="flex min-h-11 items-center gap-3 text-sm break-words"><input className="h-5 w-5 shrink-0 accent-[var(--accent-soft)]" type="checkbox" checked={skills.includes(b.id)} onChange={(e) => setSkills((ids) => e.target.checked ? [...ids,b.id] : ids.filter((id) => id !== b.id))}/>{b.display_name}{!b.is_active && ' (inactivo)'}</label>)}</div>)}
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button data-testid="haircut-save-btn" type="submit" loading={save.isPending} disabled={services.isLoading || !!services.error || (restricted && (barbers.isLoading || !!barbers.error))}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
