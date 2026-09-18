import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard, FormError } from './Entrar';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { supabase } from '@/lib/supabase';
import { humanError } from '@/lib/utils';

export default function Registar() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', email: '', pw: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (form.name.trim().length < 2) return setErr('Escreve o teu nome.');
    if (form.pw.length < 6) return setErr('A palavra-passe precisa de pelo menos 6 caracteres.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(), password: form.pw,
      options: { data: { full_name: form.name.trim(), phone: form.phone.trim() || null } },
    });
    setBusy(false);
    if (error) return setErr(humanError(error));
    if (data.session) return nav('/app/onboarding', { replace: true });
    setCheckEmail(true);
  };

  if (checkEmail) {
    return (
      <AuthCard testId="register-check-email" title="Confirma o teu email" subtitle={`Enviámos um link para ${form.email}. Abre-o para activar a conta.`}
        footer={<Link data-testid="go-login-link" to="/entrar" className="text-accent-soft hover:text-ink-hi transition-colors">Já confirmei, entrar</Link>}>
        <p className="t-body text-ink-mid">Se não aparecer em dois minutos, verifica a pasta de spam.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard testId="register-page" title="Criar conta" subtitle="Em dois minutos tens a tua barbearia online."
      footer={<>Já tens conta? <Link data-testid="go-login-link" to="/entrar" className="text-accent-soft hover:text-ink-hi transition-colors">Entrar</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field data-testid="register-name-input" label="O teu nome" name="full_name" autoComplete="name" required value={form.name} onChange={set('name')} placeholder="Ex.: Carlos Mate" />
        <Field data-testid="register-phone-input" label="Telemóvel" name="phone" type="tel" autoComplete="tel" prefix="+258" value={form.phone} onChange={set('phone')} placeholder="84 000 0000" />
        <Field data-testid="register-email-input" label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="tu@barbearia.co.mz" />
        <Field data-testid="register-password-input" label="Palavra-passe" name="password" type="password" autoComplete="new-password" required value={form.pw} onChange={set('pw')} hint="Mínimo 6 caracteres" />
        <FormError msg={err} />
        <Button data-testid="register-submit-btn" type="submit" loading={busy} full>Criar conta</Button>
      </form>
    </AuthCard>
  );
}
