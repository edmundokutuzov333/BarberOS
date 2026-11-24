import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useShop } from '@/lib/shop';
import { TeamInvitationsPanel } from './TeamInvitationsPanel';
import { useAuth } from '@/lib/auth';
import { humanError } from '@/lib/utils';
import { ROLE_LABEL } from '@/lib/types';
import { addMember, removeMember, memberEmail, memberRole, useMembers, type TeamMember, type MemberRole } from '@/features/members/api';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Primitives';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/States';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export function MembersEditor() {
  const { shop, role, refresh } = useShop();
  const { user } = useAuth();
  if (!shop || !user) return null;
  if (role !== 'owner') return <p role="status" className="t-body text-ink-mid">Só o dono pode gerir os acessos da equipa.</p>;
  // Remount tenant/account-owned drafts and pending dialogs when context changes.
  return <div key={`${shop.id}:${user.id}`}><MemberForm shopId={shop.id} userId={user.id} refresh={refresh} /><TeamInvitationsPanel shopId={shop.id} /></div>;
}

function MemberForm({ shopId, userId, refresh }: { shopId: string; userId: string; refresh: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const q = useMembers(shopId);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<MemberRole>('barber');
  const [emailError, setEmailError] = useState('');
  const [addError, setAddError] = useState('');
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [removeError, setRemoveError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  const focusEmailAfterSave = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['members', shopId] }),
      refresh(),
    ]);
  };
  const add = useMutation({
    mutationFn: addMember,
    onSuccess: async () => {
      await invalidate();
      if (!active.current) return;
      setEmail(''); setAddError('');
      toast.success('Acesso da equipa actualizado');
      focusEmailAfterSave.current = true;
    },
    onError: (e) => { if (active.current) setAddError(humanError(e)); },
    onSettled: () => { inFlight.current = false; },
  });
  const remove = useMutation({
    mutationFn: removeMember,
    onSuccess: async () => {
      await invalidate();
      if (!active.current) return;
      setSelected(null); setRemoveError('');
      toast.success('Membro removido');
    },
    onError: (e) => { if (active.current) setRemoveError(humanError(e)); },
    onSettled: () => { inFlight.current = false; },
  });
  const busy = add.isPending || remove.isPending;
  useEffect(() => {
    if (!busy && focusEmailAfterSave.current) {
      focusEmailAfterSave.current = false;
      emailRef.current?.focus();
    }
  }, [busy]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    const result = memberEmail.safeParse(email);
    if (!result.success) { setEmailError('Indique um email válido.'); emailRef.current?.focus(); return; }
    setEmailError(''); setAddError(''); inFlight.current = true;
    add.mutate({ shopId, email: result.data, role: newRole });
  };

  return (
    <div className="space-y-5" data-testid="members-editor">
      {q.isLoading ? <Skeleton className="h-28" lines={2} /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState title="Sem membros disponíveis" body="Actualize a lista para confirmar os acessos da equipa." action={<Button variant="secondary" onClick={() => q.refetch()}>Actualizar lista</Button>} />
      ) : (
        <ul className="divide-y divide-white/5" aria-label="Membros da equipa">
          {q.data.map((m) => (
            <li key={m.id} data-testid={`member-row-${m.user_id}`} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0"><p className="text-sm font-normal break-words">{m.full_name || m.email || 'Membro sem nome'}{m.user_id === userId && <span className="text-ink-mid"> · tu</span>}</p><p className="t-label text-ink-mid break-all">{m.email || 'Email indisponível'}</p></div>
              <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-0.5 t-label">{ROLE_LABEL[m.role]}</span>
              {m.user_id !== userId && <Button size="sm" variant="ghost" disabled={busy} data-testid={`member-remove-${m.user_id}`} onClick={(e) => { returnFocus.current = e.currentTarget; setRemoveError(''); setSelected(m); }} aria-label={`Remover ${m.full_name || m.email || 'membro'}`} className="min-w-11 px-3 shrink-0 text-st-noshow"><Trash2 size={15} /></Button>}
            </li>
          ))}
        </ul>
      )}
      <form noValidate onSubmit={submit} className="space-y-3" aria-label="Adicionar ou actualizar membro">
        <div className="grid sm:grid-cols-[1fr_160px_auto] gap-3 items-start">
          <Field ref={emailRef} disabled={busy} required maxLength={254} data-testid="member-email-input" label="Adicionar por email" name="m_email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(''); setAddError(''); }} error={emailError} placeholder="barbeiro@exemplo.mz" hint="A pessoa precisa de ter conta criada." />
          <Select disabled={busy} data-testid="member-role-select" label="Papel" value={newRole} onChange={(e) => { const role = memberRole.safeParse(e.target.value); if (role.success) setNewRole(role.data); setAddError(''); }}>
            <option value="barber">Barbeiro</option><option value="manager">Gerente</option><option value="owner">Dono</option>
          </Select>
          <Button data-testid="member-add-btn" type="submit" loading={add.isPending} disabled={remove.isPending} className="sm:mt-6">Adicionar</Button>
        </div>
        <p className="t-label text-ink-mid">Se a pessoa já pertence à equipa, esta acção actualiza o seu papel.</p>
        {addError && <p role="alert" className="t-body text-st-noshow">{addError}</p>}
      </form>
      <AlertDialog open={!!selected} onOpenChange={(open) => { if (!open && !inFlight.current) { setSelected(null); setRemoveError(''); } }}>
        <AlertDialogContent onEscapeKeyDown={(e) => { if (inFlight.current) e.preventDefault(); }} onCloseAutoFocus={(e) => { e.preventDefault(); if (active.current) { const target = returnFocus.current; if (target?.isConnected) target.focus(); else emailRef.current?.focus(); } }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>O acesso de {selected?.full_name || selected?.email || 'este membro'} a esta barbearia será removido. A conta da pessoa será mantida.</AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && <p role="alert" className="t-body text-st-noshow">{removeError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel asChild><Button variant="secondary" disabled={remove.isPending}>Cancelar</Button></AlertDialogCancel>
            <Button variant="danger" loading={remove.isPending} onClick={() => {
              if (!selected || inFlight.current) return;
              setRemoveError(''); inFlight.current = true;
              remove.mutate({ shopId, memberId: selected.id });
            }}>Remover acesso</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
