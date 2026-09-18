import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, LockKeyhole, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useShop } from '@/lib/shop';
import { humanError } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select, Switch } from '@/components/ui/Primitives';
import { ErrorState, Skeleton } from '@/components/ui/States';
import {
  useConfigurePaymentProvider,
  usePaymentAccounts,
  type PaymentAccount,
  type PaymentProvider,
} from '@/features/payments/api';

type StringMap = Record<string, string>;

function stringConfig(value: unknown): StringMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as StringMap;
}

function AccountCard({
  provider,
  account,
  shop,
}: {
  provider: PaymentProvider;
  account?: PaymentAccount;
  shop: string;
}) {
  const configure = useConfigurePaymentProvider();
  const existing = stringConfig(account?.public_config);
  const [enabled, setEnabled] = useState(Boolean(account?.enabled));
  const [reference, setReference] = useState(account?.account_reference ?? '');
  const [publicConfig, setPublicConfig] = useState<StringMap>({});
  const [credentials, setCredentials] = useState<StringMap>({});

  useEffect(() => {
    setEnabled(Boolean(account?.enabled));
    setReference(account?.account_reference ?? '');
    setPublicConfig(provider === 'mpesa'
      ? {
          base_url: existing.base_url || 'https://api.sandbox.vm.co.mz',
          service_provider_code: existing.service_provider_code || '',
          origin: existing.origin || '*',
        }
      : {
          wsdl_url: existing.wsdl_url || '',
          partner_code: existing.partner_code || '',
          language: existing.language || 'pt',
        });
    setCredentials({});
  }, [account?.id, account?.enabled, account?.account_reference, account?.public_config, provider]);

  const setPublic = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPublicConfig((old) => ({ ...old, [key]: e.target.value }));

  const setCredential = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCredentials((old) => ({ ...old, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await configure.mutateAsync({
        shop,
        provider,
        enabled,
        account_reference: reference.trim() || null,
        public_config: publicConfig,
        credentials: Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim() !== '')),
      });
      toast.success((provider === 'mpesa' ? 'M-Pesa' : 'e-Mola') + ' guardado');
    } catch (error) {
      toast.error(humanError(error));
    }
  };

  const providerLabel = provider === 'mpesa' ? 'M-Pesa' : 'e-Mola';
  const configured = Boolean(account?.configured);
  const webhook = account?.webhook_url ?? '';

  return (
    <form onSubmit={submit} className="space-y-5" data-testid={'payment-provider-' + provider}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 grid place-items-center text-accent-soft">
            {provider === 'mpesa' ? <Smartphone size={18} /> : <span className="text-sm font-semibold">eM</span>}
          </div>
          <div>
            <h3 className="t-card text-ink-hi">{providerLabel}</h3>
            <p className="t-body text-ink-mid mt-1">
              {configured ? 'Configurado e pronto para receber sinais.' : 'Ainda não está pronto para receber sinais.'}
            </p>
          </div>
        </div>
        <Switch
          testId={'payment-' + provider + '-enabled'}
          checked={enabled}
          onCheckedChange={setEnabled}
          label={enabled ? 'Activo' : 'Inactivo'}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-ink-mid">
          <LockKeyhole size={15} />
          <p className="t-label">Credenciais protegidas</p>
        </div>
        <p className="t-body text-ink-mid mt-1">
          As credenciais não são gravadas no browser nem devolvidas nas consultas. Ficam guardadas no Vault do Supabase.
        </p>
      </div>

      <Field
        data-testid={'payment-' + provider + '-reference'}
        label="Referência da conta"
        name={'payment-' + provider + '-reference'}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Ex.: número de comerciante"
      />

      {provider === 'mpesa' ? (
        <>
          <Field
            data-testid="payment-mpesa-base-url"
            label="Base URL"
            name="mpesa-base-url"
            type="url"
            value={publicConfig.base_url ?? ''}
            onChange={setPublic('base_url')}
            placeholder="https://api.sandbox.vm.co.mz"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              data-testid="payment-mpesa-spc"
              label="Service Provider Code"
              name="mpesa-spc"
              value={publicConfig.service_provider_code ?? ''}
              onChange={setPublic('service_provider_code')}
              placeholder="Código fornecido pelo M-Pesa"
            />
            <Field
              data-testid="payment-mpesa-origin"
              label="Origin"
              name="mpesa-origin"
              value={publicConfig.origin ?? '*'}
              onChange={setPublic('origin')}
              placeholder="*"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              data-testid="payment-mpesa-api-key"
              label={account?.configured ? 'API Key (opcional ao actualizar)' : 'API Key'}
              name="mpesa-api-key"
              type="password"
              value={credentials.api_key ?? ''}
              onChange={setCredential('api_key')}
              placeholder={account?.configured ? 'Não alterar' : 'Chave da integração'}
              autoComplete="new-password"
            />
            <Field
              data-testid="payment-mpesa-public-key"
              label={account?.configured ? 'Public Key (opcional ao actualizar)' : 'Public Key'}
              name="mpesa-public-key"
              type="password"
              value={credentials.public_key ?? ''}
              onChange={setCredential('public_key')}
              placeholder={account?.configured ? 'Não alterar' : 'Chave pública'}
              autoComplete="new-password"
            />
          </div>
        </>
      ) : (
        <>
          <Field
            data-testid="payment-emola-wsdl"
            label="WSDL URL"
            name="emola-wsdl-url"
            type="url"
            value={publicConfig.wsdl_url ?? ''}
            onChange={setPublic('wsdl_url')}
            placeholder="Endpoint WSDL fornecido pelo Movitel"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              data-testid="payment-emola-partner"
              label="Partner Code"
              name="emola-partner-code"
              value={publicConfig.partner_code ?? ''}
              onChange={setPublic('partner_code')}
              placeholder="Código do parceiro"
            />
            <Select
              data-testid="payment-emola-language"
              label="Idioma"
              value={publicConfig.language ?? 'pt'}
              onChange={(e) => setPublicConfig((old) => ({ ...old, language: e.target.value }))}
            >
              <option value="pt">Português</option>
              <option value="en">English</option>
            </Select>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field
              data-testid="payment-emola-username"
              label={account?.configured ? 'Username (opcional ao actualizar)' : 'Username'}
              name="emola-username"
              value={credentials.username ?? ''}
              onChange={setCredential('username')}
              placeholder={account?.configured ? 'Não alterar' : 'Utilizador'}
              autoComplete="new-password"
            />
            <Field
              data-testid="payment-emola-password"
              label={account?.configured ? 'Password (opcional ao actualizar)' : 'Password'}
              name="emola-password"
              type="password"
              value={credentials.password ?? ''}
              onChange={setCredential('password')}
              placeholder={account?.configured ? 'Não alterar' : 'Palavra-passe'}
              autoComplete="new-password"
            />
            <Field
              data-testid="payment-emola-api-key"
              label={account?.configured ? 'API Key (opcional ao actualizar)' : 'API Key'}
              name="emola-api-key"
              type="password"
              value={credentials.api_key ?? ''}
              onChange={setCredential('api_key')}
              placeholder={account?.configured ? 'Não alterar' : 'Chave da API'}
              autoComplete="new-password"
            />
          </div>
        </>
      )}

      {webhook && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <span className="t-label text-ink-mid">URL de callback</span>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={webhook}
              className="field flex-1 min-w-0 text-xs text-ink-mid"
              onFocus={(e) => e.currentTarget.select()}
              aria-label={'URL de callback ' + providerLabel}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label={'Copiar URL de callback ' + providerLabel}
              onClick={async () => {
                await navigator.clipboard.writeText(webhook);
                toast.success('URL de callback copiado');
              }}
            >
              <Copy size={14} />
            </Button>
            <a href={webhook} target="_blank" rel="noreferrer" aria-label={'Abrir URL de callback ' + providerLabel}>
              <Button type="button" size="sm" variant="secondary"><ExternalLink size={14} /></Button>
            </a>
          </div>
          <p className="t-label text-ink-mid mt-2">Use este endereço apenas no painel de integração do provider.</p>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={configure.isPending} data-testid={'payment-' + provider + '-save'}>
          Guardar {providerLabel}
        </Button>
      </div>
    </form>
  );
}

export default function PaymentSettingsForm() {
  const { shop } = useShop();
  const query = usePaymentAccounts(shop?.id);
  const accounts = useMemo(() => {
    const map = new Map<PaymentProvider, PaymentAccount>();
    for (const account of query.data ?? []) map.set(account.provider, account);
    return map;
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="space-y-5" data-testid="payments-settings-loading">
        <Skeleton className="h-56" /><Skeleton className="h-56" />
      </div>
    );
  }

  if (query.error) {
    return <ErrorState message={humanError(query.error)} onRetry={() => query.refetch()} />;
  }

  return (
    <div className="space-y-6" data-testid="payments-settings">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="t-label text-ink-mid">M-Pesa</p>
          <p className="t-card text-ink-hi mt-1">{accounts.get('mpesa')?.configured ? 'Pronto' : 'Não configurado'}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="t-label text-ink-mid">e-Mola</p>
          <p className="t-card text-ink-hi mt-1">{accounts.get('emola')?.configured ? 'Pronto' : 'Não configurado'}</p>
        </div>
      </div>

      <AccountCard provider="mpesa" account={accounts.get('mpesa')} shop={shop!.id} />
      <div className="h-px bg-white/10" />
      <AccountCard provider="emola" account={accounts.get('emola')} shop={shop!.id} />
    </div>
  );
}
