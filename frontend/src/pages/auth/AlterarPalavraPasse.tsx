import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthCard, FormError } from './Entrar';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { humanError } from '@/lib/utils';

export default function AlterarPalavraPasse() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading || (user && !profile)) {
    return <main className="min-h-screen grid place-items-center p-6"><p className="t-body text-ink-mid">A verificar a conta…</p></main>;
  }
  if (!user) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErr(null);
    if (password.length < 12) return setErr('Use pelo menos 12 caracteres.');
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return setErr('Inclua letras maiúsculas, minúsculas e pelo menos um número.');
    }
    if (password !== confirmPassword) return setErr('As palavras-passe não coincidem.');

    setBusy(true);
    const result = await supabase.functions.invoke('admin-credential-manager', {
      body: { action: 'complete_password_change', new_password: password },
    });
    if (result.error || !result.data?.ok) {
      const response = (result.error as { context?: Response } | null)?.context;
      const payload = response && typeof response.json === 'function'
        ? await response.clone().json().catch(() => null) as { message?: string; error?: string } | null
        : null;
      setBusy(false);
      return setErr(payload?.message ?? payload?.error ?? result.error?.message ?? 'Não foi possível finalizar a alteração da palavra-passe.');
    }

    await supabase.auth.signOut();
    window.location.replace('/entrar');
  };

  return (
    <AuthCard
      testId="mandatory-password-change"
      title="Defina a sua palavra-passe"
      subtitle="Por segurança, a palavra-passe temporária tem de ser substituída antes de entrar na plataforma."
      footer={<span className="t-label text-ink-lo">Conta: {user.email}</span>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field data-testid="new-password-input" label="Nova palavra-passe" name="new-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} hint="Mínimo de 12 caracteres, com maiúsculas, minúsculas e números."/>
        <Field data-testid="confirm-password-input" label="Confirmar palavra-passe" name="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/>
        <FormError msg={err}/>
        <Button data-testid="save-new-password-btn" type="submit" loading={busy} full>Guardar nova palavra-passe</Button>
      </form>
    </AuthCard>
  );
}
