import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { humanError } from '@/lib/utils';
import type { Barber, Member } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal, Switch, Select, Textarea, ImageUpload, Chip } from '@/components/ui/Primitives';
import { Skeleton, EmptyState, ErrorState } from '@/components/ui/States';
import { SortableList } from '@/components/ui/SortableList';
import { useServices } from './ServicesEditor';

const empty = { display_name: '', bio: '', years: '0', photo_url: null as string | null, user_id: '', services: [] as string[] };

export function useBarbers(shopId: string) {
  return useQuery({
    queryKey: ['barbers', shopId],
    queryFn: async () => {
      const { data, error } = await supabase.from('barbers').select('*, barber_services(service_id)').eq('barbershop_id', shopId).order('sort_order').order('display_name');
      if (error) throw error;
      return data as Barber[];
    },
  });
}

export function useMembers(shopId: string) {
  return useQuery({
    queryKey: ['members', shopId],
    queryFn: async () => { const { data, error } = await supabase.rpc('list_members', { p_shop: shopId }); if (error) throw error; return data as Member[]; },
  });
}

export function BarbersEditor() {
  const { shop } = useShop();
  const qc = useQueryClient();
  const q = useBarbers(shop!.id);
  const services = useServices(shop!.id);
  const members = useMembers(shop!.id);
  const [editing, setEditing] = useState<Barber | null | 'new'>(null);
  const [form, setForm] = useState(empty);
  const key = ['barbers', shop!.id];

  const open = (b: Barber | 'new') => {
    setForm(b === 'new'
      ? { ...empty, services: services.data?.map((s) => s.id) ?? [] }
      : { display_name: b.display_name, bio: b.bio ?? '', years: String(b.years_experience), photo_url: b.photo_url, user_id: b.user_id ?? '', services: b.barber_services?.map((x) => x.service_id) ?? [] });
    setEditing(b);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (form.display_name.trim().length < 2) throw new Error('INVALID_NAME');
      const { data: barberId, error } = await supabase.rpc('save_barber', {
        p_shop: shop!.id,
        p_barber_id: editing === 'new' ? null : (editing as Barber).id,
        p_display_name: form.display_name.trim(),
        p_bio: form.bio.trim() || null,
        p_years_experience: parseInt(form.years, 10) || 0,
        p_photo_url: form.photo_url,
        p_user_id: form.user_id || null,
        p_service_ids: form.services,
      });
      if (error) throw error;
      if (!barberId) throw new Error('BARBER_SAVE_FAILED');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setEditing(null); toast.success('Barbeiro guardado'); },
    onError: (e) => toast.error(humanError(e)),
  });
  const toggle = useMutation({
    mutationFn: async (b: Barber) => { const r = await supabase.from('barbers').update({ is_active: !b.is_active }).eq('id', b.id); if (r.error) throw r.error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }), onError: (e) => toast.error(humanError(e)),
  });
  const remove = useMutation({
    mutationFn: async (b: Barber) => { const r = await supabase.from('barbers').delete().eq('id', b.id); if (r.error) throw r.error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Barbeiro removido'); },
    onError: () => toast.error('Não dá para remover: já tem marcações. Desactiva-o em vez disso.'),
  });
  const toggleService = (id: string) => setForm((f) => ({ ...f, services: f.services.includes(id) ? f.services.filter((x) => x !== id) : [...f.services, id] }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button data-testid="barber-add-btn" size="sm" pill onClick={() => open('new')}><Plus size={14} />Novo barbeiro</Button></div>
      {q.isLoading ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <EmptyState testId="barbers-empty" title="Ainda não tens barbeiros." body="Sem barbeiros activos, a agenda não abre." action={<Button data-testid="barbers-empty-add-btn" size="sm" pill onClick={() => open('new')}>Adicionar barbeiro</Button>} />
      ) : (
        <SortableList items={q.data!} shopId={shop!.id} rpcName="reorder_barbers" queryKey={key} testId="barbers-list" render={(b) => (
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full overflow-hidden bg-[var(--surface-2)] grid place-items-center text-sm font-medium shrink-0">
              {b.photo_url ? <img src={b.photo_url} alt="" className="h-full w-full object-cover" /> : b.display_name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-normal truncate ${!b.is_active && 'text-ink-mid line-through'}`}>{b.display_name}</p>
              <p className="t-label text-ink-mid truncate">{b.years_experience} {b.years_experience === 1 ? 'ano' : 'anos'} · {b.barber_services?.length ?? 0} {b.barber_services?.length === 1 ? 'serviço' : 'serviços'}{b.user_id ? ' · conta ligada' : ''}</p>
            </div>
            <Switch testId={`barber-toggle-${b.id}`} checked={b.is_active} onCheckedChange={() => toggle.mutate(b)} />
            <button data-testid={`barber-edit-${b.id}`} onClick={() => open(b)} aria-label="Editar" className="p-2 text-ink-lo hover:text-accent-soft transition-colors"><Pencil size={15} /></button>
            <button data-testid={`barber-delete-${b.id}`} onClick={() => confirm(`Remover "${b.display_name}"?`) && remove.mutate(b)} aria-label="Remover" className="p-2 text-ink-lo hover:text-st-noshow transition-colors"><Trash2 size={15} /></button>
          </div>
        )} />
      )}

      <Modal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'Novo barbeiro' : 'Editar barbeiro'} testId="barber-modal">
        <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
          <div className="flex gap-4 items-start">
            <ImageUpload testId="barber-photo-upload" shape="circle" bucket="barbers" shopId={shop!.id} ratio={1} value={form.photo_url} onChange={(u) => setForm({ ...form, photo_url: u })} label="Foto" className="w-[120px] shrink-0" />
            <div className="flex-1 space-y-3">
              <Field data-testid="barber-name-input" label="Nome" name="b_name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Ex.: Nelson" autoFocus />
              <Field data-testid="barber-years-input" label="Anos de experiência" name="b_years" inputMode="numeric" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} />
            </div>
          </div>
          <Textarea data-testid="barber-bio-input" label="Bio curta" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Especialidades, estilo, o que os clientes dizem." />
          <Select data-testid="barber-user-select" label="Conta ligada (para o barbeiro ver a sua agenda)" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
            <option value="">Sem conta</option>
            {members.data?.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.email} · {m.email}</option>)}
          </Select>
          <div>
            <span className="t-label text-ink-mid mb-2 block">Serviços que faz</span>
            {services.data?.length ? (
              <div className="flex flex-wrap gap-2">{services.data.map((s) => <Chip key={s.id} testId={`barber-service-chip-${s.id}`} active={form.services.includes(s.id)} onClick={() => toggleService(s.id)}>{s.name}</Chip>)}</div>
            ) : <p className="t-body text-ink-mid">Cria serviços primeiro para os associar.</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button data-testid="barber-save-btn" type="submit" loading={save.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
