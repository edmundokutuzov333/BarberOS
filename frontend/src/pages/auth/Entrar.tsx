import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { supabase } from '@/lib/supabase';
import { humanError } from '@/lib/utils';

export function AuthCard({ title, subtitle, children, footer, testId }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode; testId: string }) {
  return (
    <Page testId={testId} className="min-h-screen flex flex-col">
      <header className="h-20 px-5 sm:px-8 flex items-center"><Link to="/" aria-label="Início"><Brand /></Link></header>
      <div className="flex-1 grid place-items-center px-4 pb-16">
        <div className="glass w-full max-w-md p-7 sm:p-9">
          <h1 className="t-title">{title}</h1>
          <p className="t-body text-ink-mid mt-1.5">{subtitle}</p>
          <div className="mt-7 space-y-4">{children}</div>
          <div className="mt-6 t-body text-ink-mid">{footer}</div>
        </div>
      </div>
    </Page>
  );
}

export function FormError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p data-testid="auth-error" role="alert" className="t-body text-st-noshow rounded-2xl bg-st-noshow/10 border border-st-noshow/25 px-4 py-3">{msg}</p>;
}

export default function Entrar() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) return setErr(humanError(error));
    nav(loc.state?.from ?? '/app', { replace: true });
  };

  return (
    <AuthCard testId="login-page" title="Entrar" subtitle="A tua barbearia, o teu dia."
      footer={<>Ainda não tens conta? <Link data-testid="go-register-link" to="/registar" className="text-accent-soft hover:text-ink-hi transition-colors">Criar conta</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field data-testid="login-email-input" label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@barbearia.co.mz" />
        <Field data-testid="login-password-input" label="Palavra-passe" name="password" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
        <FormError msg={err} />
        <div className="flex items-center justify-between pt-1">
          <Link data-testid="go-recover-link" to="/recuperar" className="t-label text-ink-mid hover:text-ink-hi transition-colors">Esqueci a palavra-passe</Link>
          <Button data-testid="login-submit-btn" type="submit" loading={busy}>Entrar</Button>
        </div>
      </form>
    </AuthCard>
  );
}
