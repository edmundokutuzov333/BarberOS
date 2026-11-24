import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Primitives';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { memberEmail } from '@/features/members/api';
import { createInvitation, invitationLink, invitationRole, listInvitations, revokeInvitation, type InvitationRole } from '@/features/members/invitations';
import { fmt, humanError } from '@/lib/utils';

export function TeamInvitationsPanel({ shopId }: { shopId: string }) {
  const { role } = useShop();
  const [open, setOpen] = useState(false);
  if (role !== 'owner') return null;
  return <section className="mt-5 pt-5 border-t border-white/10">
    <Button variant="secondary" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Fechar convites' : 'Convidar novo funcionário'}</Button>
    {open && <InvitationForm key={shopId} shopId={shopId} />}
  </section>;
}
function InvitationForm({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitationRole>('barber');
  const [barber, setBarber] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const pending = useQuery({ queryKey: ['team-invitations', shopId], queryFn: () => listInvitations(shopId) });
  const professionals = useQuery({
    queryKey: ['invitation-professionals', shopId], enabled: role === 'barber',
    queryFn: async () => {
      const { data, error } = await supabase.from('barbers').select('id,display_name').eq('barbershop_id', shopId)
        .eq('is_active', true).is('user_id', null).order('display_name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = useMutation({
    mutationFn: createInvitation,
    onSuccess: async result => {
      setLink(invitationLink(result.token)); setEmail(''); setError('');
      await qc.invalidateQueries({ queryKey: ['team-invitations', shopId] });
    },
    onError: e => setError(humanError(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(shopId, id),
    onSuccess: async () => {
      setRevokeId(null); setLink(''); setError('');
      await qc.invalidateQueries({ queryKey: ['team-invitations', shopId] });
      toast.success('Convite revogado.');
    },
    onError: e => setError(humanError(e)),
  });
  const busy = create.isPending || revoke.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault(); setError(''); setLink('');
    if (busy) return;
    const checked = memberEmail.safeParse(email);
    if (!checked.success) return setError('Indique um email válido.');
    if (role === 'barber' && !barber) return setError('Seleccione um profissional ainda sem conta associada.');
    create.mutate({ shop: shopId, email: checked.data, role, barber: role === 'barber' ? barber : null });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado.'); }
    catch { setError('Não foi possível copiar. Seleccione o link e copie manualmente.'); }
  };
  return <div className="mt-4 space-y-4" data-testid="team-invitation-panel">
    <p className="t-body text-ink-mid">Crie um convite válido durante sete dias. Partilhe o link apenas com a pessoa indicada. O acesso é confirmado quando ela entra com o email do convite.</p>
    <form className="space-y-3" onSubmit={submit} noValidate>
      <Field label="Email do convite" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} required />
      <Select label="Função do convite" value={role} disabled={busy} onChange={e => {
        const value = invitationRole.safeParse(e.target.value); if (value.success) { setRole(value.data); setBarber(''); }
      }}><option value="barber">Barbeiro</option><option value="manager">Gerente</option></Select>
      {role === 'barber' && <><Select label="Profissional associado" disabled={busy || professionals.isLoading || professionals.isError} value={barber} onChange={e => setBarber(e.target.value)}>
        <option value="">Seleccione um barbeiro</option>{professionals.data?.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</Select>
        {professionals.isError && <ErrorState message="Não foi possível carregar os profissionais." onRetry={() => professionals.refetch()} />}
        {professionals.isSuccess && !professionals.data.length && <p className="t-label text-ink-mid">Adicione um barbeiro sem conta associada na área Barbeiros antes de criar o convite.</p>}</>}
      <Button type="submit" loading={create.isPending} disabled={busy || (role === 'barber' && !barber)}>Criar convite</Button>
    </form>
    {error && <p role="alert" className="t-body text-st-noshow">{error}</p>}
    {link && <div className="rounded-2xl border border-accent-soft/40 p-4 space-y-3">
      <p className="t-card">Convite criado</p><p className="t-label text-ink-mid">Guarde este link agora. Por segurança, não voltará a ser apresentado.</p>
      <Field label="Link privado do convite" readOnly value={link} onFocus={e => e.target.select()} />
      <Button type="button" variant="secondary" onClick={() => void copy()}>Copiar link</Button>
      <Button type="button" variant="ghost" onClick={() => setLink('')}>Limpar link</Button>
    </div>}
    <h3 className="t-card">Convites pendentes</h3>
    {pending.isLoading ? <Skeleton lines={2} /> : pending.isError ? <ErrorState message={humanError(pending.error)} onRetry={() => pending.refetch()} /> :
      pending.data?.length ? <div className="divide-y divide-white/10">{pending.data.map(i => <div key={i.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0"><p className="text-sm break-all">{i.email}</p><p className="t-label text-ink-mid">{i.role === 'manager' ? 'Gerente' : 'Barbeiro'}{i.barber_name ? ' · ' + i.barber_name : ''} · Até {fmt(i.expires_at, 'dd MMM yyyy')}</p></div>
        {revokeId === i.id ? <div className="flex gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setRevokeId(null)}>Cancelar</Button><Button type="button" loading={revoke.isPending} disabled={busy} onClick={() => revoke.mutate(i.id)}>Confirmar revogação</Button></div> :
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setRevokeId(i.id)}>Revogar</Button>}
      </div>)}</div> : <p className="t-label text-ink-mid">Não existem convites pendentes.</p>}
  </div>;
}
