import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { acceptInvitation, parseInvitationToken } from '@/features/members/invitations';
import { AuthCard, FormError } from './Entrar';
import { Button } from '@/components/ui/Button';
import { AccountStateError } from '@/components/ui/AccountStateError';
import { humanError } from '@/lib/utils';

const STORAGE_KEY = 'barberos.pending-invitation';
function storedToken() {
  try { return parseInvitationToken(sessionStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function clearToken() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* browser storage unavailable */ }
}
export default function Convite() {
  const location = useLocation();
  const navigate = useNavigate();
  const raw = new URLSearchParams(location.hash.slice(1)).get('convite');
  const [token, setToken] = useState(() => raw !== null ? parseInvitationToken(raw) : storedToken());
  useEffect(() => {
    if (raw === null) return;
    const value = parseInvitationToken(raw);
    setToken(value);
    try { if (value) sessionStorage.setItem(STORAGE_KEY, value); else sessionStorage.removeItem(STORAGE_KEY); } catch { /* retain current token in memory */ }
    navigate('/convite', { replace: true });
  }, [raw, navigate]);
  return <AuthProvider><InvitationAcceptance key={token ?? 'empty'} token={token} /></AuthProvider>;
}
function InvitationAcceptance({ token }: { token: string | null }) {
  const { user, profile, loading, error, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (loading) return <main className="min-h-screen grid place-items-center"><p>A verificar o convite…</p></main>;
  if (error || (user && !profile)) return <AccountStateError />;
  if (!token) return <AuthCard title="Convite indisponível" subtitle="Abra novamente o link enviado pelo dono da barbearia." footer={<Link to="/">Voltar ao início</Link>}><p>Se o convite expirou, peça um novo.</p></AuthCard>;
  if (profile?.password_change_required) return <Navigate to="/alterar-palavra-passe" state={{ from: '/convite' }} replace />;
  const submit = async () => {
    if (!user || busy) return;
    setBusy(true); setMessage('');
    try {
      const result = await acceptInvitation(token);
      clearToken();
      try { localStorage.setItem('barberos.shop', result.shop_id); } catch { /* selection can be made after login */ }
      qc.removeQueries({ queryKey: ['memberships', user.id] });
      navigate('/app', { replace: true });
    } catch (e) { setMessage(humanError(e)); setBusy(false); }
  };
  return <AuthCard testId="team-invitation-acceptance" title="Entrar na equipa" subtitle="O dono da barbearia convidou-o para trabalhar no BarberOS." footer={<Link to="/" onClick={clearToken}>Cancelar convite</Link>}>
    {!user ? <div className="space-y-3">
      <p className="t-body text-ink-mid">Entre com o email indicado no convite. Se ainda não tem conta, crie-a e confirme o email antes de aceitar.</p>
      <Link to="/entrar" state={{ from: '/convite' }} className="inline-flex w-full justify-center rounded-2xl bg-accent-soft text-accent-ink p-3 font-medium">Entrar</Link>
      <Link to="/registar" state={{ from: '/convite' }} className="inline-flex w-full justify-center rounded-2xl border border-white/15 p-3">Criar conta</Link>
    </div> : <div className="space-y-3">
      <p className="t-body text-ink-mid break-all">Conta actual: {user.email}</p>
      <FormError msg={message || null} />
      <Button full type="button" loading={busy} onClick={() => void submit()}>Aceitar convite</Button>
      <Button full variant="secondary" disabled={busy} type="button" onClick={() => void signOut()}>Usar outra conta</Button>
    </div>}
  </AuthCard>;
}
