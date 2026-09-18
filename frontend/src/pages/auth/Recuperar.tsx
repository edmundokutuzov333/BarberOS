import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthCard, FormError } from './Entrar';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { supabase } from '@/lib/supabase';
import { humanError } from '@/lib/utils';

export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/entrar` });
    setBusy(false);
    if (error) return setErr(humanError(error));
    setSent(true);
  };

  return (
    <AuthCard testId="recover-page" title="Recuperar palavra-passe" subtitle="Enviamos-te um link para definires uma nova."
      footer={<Link data-testid="go-login-link" to="/entrar" className="text-accent-soft hover:text-ink-hi transition-colors">Voltar a entrar</Link>}>
      {sent ? (
        <p data-testid="recover-sent" className="t-body text-ink-hi rounded-2xl bg-accent/10 border border-accent/25 px-4 py-3">Se existir conta com {email}, o link já vai a caminho.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field data-testid="recover-email-input" label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@barbearia.co.mz" />
          <FormError msg={err} />
          <Button data-testid="recover-submit-btn" type="submit" loading={busy} full>Enviar link</Button>
        </form>
      )}
    </AuthCard>
  );
}
