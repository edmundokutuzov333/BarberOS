import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { useAuth } from '@/lib/auth';
import { humanError } from '@/lib/utils';
import { ROLE_LABEL, type Member } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Primitives';
import { Skeleton, ErrorState } from '@/components/ui/States';
import { useMembers } from './BarbersEditor';

export function MembersEditor() {
  const { shop, role } = useShop();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useMembers(shop!.id);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Member['role']>('barber');
  const key = ['members', shop!.id];
  const isOwner = role === 'owner';

  const add = useMutation({
    mutationFn: async () => { const r = await supabase.rpc('add_member_by_email', { p_shop: shop!.id, p_email: email.trim(), p_role: newRole }); if (r.error) throw r.error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setEmail(''); toast.success('Membro adicionado'); },
    onError: (e) => toast.error(String((e as Error).message).includes('USER_NOT_FOUND') ? 'Não há conta com esse email. A pessoa tem de se registar primeiro em /registar.' : humanError(e)),
  });
  const remove = useMutation({
    mutationFn: async (m: Member) => { const r = await supabase.from('barbershop_members').delete().eq('id', m.id); if (r.error) throw r.error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Membro removido'); }, onError: (e) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-5" data-testid="members-editor">
      {q.isLoading ? <Skeleton className="h-28" lines={2} /> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => q.refetch()} /> : (
        <ul className="divide-y divide-white/5">
          {q.data!.map((m) => (
            <li key={m.id} data-testid={`member-row-${m.user_id}`} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0"><p className="text-sm font-normal truncate">{m.full_name ?? m.email}{m.user_id === user?.id && <span className="text-ink-mid"> · tu</span>}</p><p className="t-label text-ink-mid truncate">{m.email}</p></div>
              <span className="rounded-full border border-white/10 px-2.5 py-0.5 t-label">{ROLE_LABEL[m.role]}</span>
              {isOwner && m.user_id !== user?.id && <button type="button" data-testid={`member-remove-${m.user_id}`} onClick={() => confirm(`Remover ${m.email}?`) && remove.mutate(m)} aria-label="Remover" className="p-2 text-ink-lo hover:text-st-noshow transition-colors"><Trash2 size={15} /></button>}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(); }} className="grid sm:grid-cols-[1fr_160px_auto] gap-3 items-end">
          <Field data-testid="member-email-input" label="Adicionar por email" name="m_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="barbeiro@exemplo.mz" hint="A pessoa precisa de ter conta criada." />
          <Select data-testid="member-role-select" label="Papel" value={newRole} onChange={(e) => setNewRole(e.target.value as Member['role'])} className="mb-6">
            <option value="barber">Barbeiro</option><option value="manager">Gerente</option><option value="owner">Dono</option>
          </Select>
          <Button data-testid="member-add-btn" type="submit" loading={add.isPending} className="mb-6">Adicionar</Button>
        </form>
      )}
    </div>
  );
}
