import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { humanError } from '@/lib/utils';
import { Button } from './Button';
import { ErrorState } from './States';

// Shared recovery for private, admin and password routes; no tenant data is read.
export function AccountStateError() {
  const { retry, signOut, error: accountError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <main className="min-h-screen grid place-items-center p-6" data-testid="account-state-error">
    <section className="glass w-full max-w-xl rounded-3xl p-6 space-y-4" aria-labelledby="account-error-title">
      <h1 id="account-error-title" className="t-title">Não foi possível verificar a conta</h1>
      <ErrorState message={humanError(accountError)} onRetry={retry} />
      {error && <p role="alert" className="t-body text-st-noshow">{error}</p>}
      <Button variant="secondary" loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { if (!await signOut()) setError(humanError(new Error('SESSION_END_FAILED'))); }
        catch (e) { setError(humanError(e)); }
        finally { setBusy(false); }
      }}>Terminar sessão</Button>
    </section>
  </main>;
}
