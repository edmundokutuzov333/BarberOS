import { useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { fmt, humanError } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useAdminCredentialEvents, useAdminUsers, useResetAdminUserPassword } from '@/features/admin/api';
import type { AdminPasswordResetResult } from '@/features/admin/api';
import { Pager, SearchToolbar } from '@/features/admin/AdminComponents';

const PAGE_SIZE = 25;

export default function AdminUtilizadores() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [offset, setOffset] = useState(0);
  const [credential, setCredential] = useState<AdminPasswordResetResult | null>(null);
  const [copied, setCopied] = useState(false);
  const q = useAdminUsers({ search: applied, limit: PAGE_SIZE, offset });
  const events = useAdminCredentialEvents();
  const reset = useResetAdminUserPassword();
  const { user: actor } = useAuth();
  const total = q.data?.[0]?.total_count ?? 0;

  const requestReset = (target: NonNullable<typeof q.data>[number]) => {
    if (!target.id || !target.email || target.is_platform_admin || target.id === actor?.id || Number(target.shop_count) < 1) return;
    const accepted = window.confirm(
      'A palavra-passe actual de ' + target.email + ' será substituída. Será gerada uma palavra-passe temporária que só aparece uma vez. A conta terá de definir uma nova palavra-passe antes de entrar na plataforma. Continuar?'
    );
    if (!accepted) return;
    setCredential(null);
    setCopied(false);
    reset.mutate(target.id, {
      onSuccess: (result) => {
        setCredential(result);
        void q.refetch();
        void events.refetch();
      },
      onError: (error) => window.alert(humanError(error)),
    });
  };

  const copyTemporaryPassword = async () => {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
      window.alert('Não foi possível copiar automaticamente. Seleccione a palavra-passe e copie-a manualmente.');
    }
  };

  const clearCredential = () => {
    setCredential(null);
    setCopied(false);
    reset.reset();
  };

  return (
    <Page title="Utilizadores e acessos"
      subtitle={Number(total) + ' utilizador' + (Number(total) === 1 ? '' : 'es')}
      actions={<Button variant="secondary" size="sm" onClick={() => { void q.refetch(); void events.refetch(); }} disabled={q.isFetching || events.isFetching}><RefreshCw size={14} className={q.isFetching || events.isFetching ? 'animate-spin' : ''} />Actualizar</Button>}>
      <Panel className="mb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-accent-soft/15 text-accent-soft grid place-items-center"><ShieldCheck size={19}/></div>
          <div>
            <h2 className="t-card">Gestão central de acessos</h2>
            <p className="t-body text-ink-mid mt-1">Consulte emails e associações às barbearias, ou emita uma palavra-passe temporária quando alguém perder o acesso. A palavra-passe só é mostrada uma vez e nunca é guardada no código, na base de dados ou no histórico.</p>
          </div>
        </div>
      </Panel>

      <SearchToolbar>
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-lo"/>
          <input className="field pl-9 w-full" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setOffset(0); setApplied(search.trim()); } }} placeholder="Nome, email ou telefone" aria-label="Pesquisar utilizadores"/>
        </div>
        <Button size="sm" onClick={() => { setOffset(0); setApplied(search.trim()); }}><Search size={14}/>Pesquisar</Button>
      </SearchToolbar>

      {q.isLoading ? <Skeleton className="h-72" lines={7}/> : q.error ? <ErrorState message={humanError(q.error)} onRetry={() => void q.refetch()}/> : q.data?.length === 0 ? <EmptyState title="Nenhum utilizador encontrado." body="Ajuste a pesquisa e tente novamente."/> : (
        <Panel className="p-0 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead><tr className="border-b border-white/10 t-label text-ink-lo text-left">
              <th className="px-5 py-3">Utilizador</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Acesso</th><th className="px-5 py-3">Barbearias</th><th className="px-5 py-3">Registo</th><th className="px-5 py-3">Último acesso</th><th className="px-5 py-3">Gestão de acesso</th>
            </tr></thead>
            <tbody>{q.data?.map(u => {
              const protectedAccount = u.is_platform_admin || u.id === actor?.id;
              const canReset = !protectedAccount && Number(u.shop_count) > 0;
              return <tr key={u.id} className="border-b border-white/5 last:border-0">
                <td className="px-5 py-4"><p className="text-ink-hi">{u.full_name || 'Sem nome'}</p><p className="t-label text-ink-lo mt-0.5">{u.email}</p>{u.phone && <p className="t-label text-ink-lo">{u.phone}</p>}</td>
                <td className="px-5 py-4"><span className={'inline-flex rounded-full border px-2.5 py-1 t-label ' + (u.is_confirmed ? 'text-st-completed border-st-completed/30' : 'text-ink-mid border-white/10')}>{u.is_confirmed ? 'Confirmado' : 'Por confirmar'}</span></td>
                <td className="px-5 py-4">{u.is_platform_admin ? <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 t-label text-accent-ink"><ShieldCheck size={13}/>Admin Oryon</span> : <span className="t-label text-ink-mid">Utilizador</span>}</td>
                <td className="px-5 py-4">{u.shop_count}<div className="flex flex-wrap gap-1 mt-1">{Array.isArray(u.shop_roles) && u.shop_roles.slice(0, 3).map((r: any) => <span key={String(r.shop_id)} className="t-label text-ink-lo">{r.shop_name + ' · ' + r.role}</span>)}</div></td>
                <td className="px-5 py-4 text-ink-mid">{fmt(u.created_at, 'dd MMM yyyy')}</td>
                <td className="px-5 py-4 text-ink-mid">{u.last_sign_in_at ? fmt(u.last_sign_in_at, 'dd MMM yyyy, HH:mm') : 'Nunca'}</td>
                <td className="px-5 py-4">{canReset ? <Button variant="secondary" size="sm" loading={reset.isPending && reset.variables === u.id} disabled={reset.isPending} onClick={() => requestReset(u)}><KeyRound size={14}/>Repor acesso</Button> : <span className="t-label text-ink-lo">{protectedAccount ? 'Protegida' : 'Sem associação a barbearia'}</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div></Panel>
      )}

      {!q.isLoading && !q.error && <Pager offset={offset} pageSize={PAGE_SIZE} total={Number(total)} onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))} onNext={() => setOffset(offset + PAGE_SIZE)}/>}

      <Panel className="mt-5" title="Histórico de acessos">
        {events.isLoading ? <Skeleton className="h-28" lines={3}/> : events.error ? <ErrorState message={humanError(events.error)} onRetry={() => void events.refetch()}/> : events.data?.length ? (
          <div className="divide-y divide-white/5">
            {events.data.slice(0, 12).map(event => <div key={event.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div><p className="text-sm text-ink-hi">Reposição de palavra-passe · {event.target_email}</p><p className="t-label text-ink-lo mt-0.5">Por {event.actor_email} · {event.shop_slugs.join(', ') || 'Sem associação'}</p></div>
              <time className="t-label text-ink-lo shrink-0">{fmt(event.created_at, 'dd MMM yyyy, HH:mm')}</time>
            </div>)}
          </div>
        ) : <EmptyState title="Ainda não há alterações de acesso." body="As reposições futuras ficam registadas aqui, sem guardar a palavra-passe gerada."/>}
      </Panel>

      {credential && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4" onMouseDown={e => { if (e.target === e.currentTarget) clearCredential(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="temporary-password-title" className="glass w-full max-w-lg rounded-3xl border border-white/15 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl bg-accent-soft/15 text-accent-soft grid place-items-center shrink-0"><KeyRound size={20}/></div>
            <div className="min-w-0 flex-1"><p className="t-label text-ink-mid">Credencial temporária</p><h2 id="temporary-password-title" className="text-xl font-semibold text-ink-hi mt-1">Acesso actualizado</h2><p className="t-body text-ink-mid mt-1">{credential.email}</p></div>
            <button type="button" onClick={clearCredential} className="p-2 rounded-xl text-ink-mid hover:text-ink-hi" aria-label="Fechar e limpar palavra-passe"><X size={18}/></button>
          </div>
          <div className="mt-5 rounded-2xl border border-accent-soft/25 bg-accent-soft/5 p-4">
            <p className="t-label text-ink-mid mb-2">Palavra-passe temporária, apresentada apenas agora</p>
            <code className="block select-all break-all font-mono text-base text-ink-hi" data-testid="temporary-password">{credential.temporaryPassword}</code>
            <Button className="mt-4 w-full" onClick={() => void copyTemporaryPassword()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copiada' : 'Copiar palavra-passe'}</Button>
          </div>
          <p className="t-body text-ink-mid mt-4">Entregue esta palavra-passe por um canal seguro. No primeiro acesso, o utilizador será obrigado a definir uma palavra-passe própria. Fechar esta janela remove a palavra-passe da interface. Se a copiou, limpe também a área de transferência depois de a partilhar.</p>
          {!credential.auditLogged && <p role="alert" className="t-label text-st-noshow mt-3">{credential.warning ?? 'A reposição foi feita, mas o histórico não foi registado.'}</p>}
          <Button variant="secondary" className="mt-5 w-full" onClick={clearCredential}>Fechar e limpar</Button>
        </section>
      </div>}
    </Page>
  );
}
