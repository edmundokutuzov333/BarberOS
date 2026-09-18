import { NavLink, Navigate, useParams } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { Panel } from '@/components/ui/States';
import { ProfileForm, ThemePicker, RulesForm, DepositForm } from '@/components/config/ShopForms';
import { MembersEditor } from '@/components/config/MembersEditor';
import { LinkQr } from '@/components/config/LinkQr';
import PaymentSettingsForm from '@/features/payments/PaymentSettingsForm';
import { cn } from '@/lib/utils';
import { useShop } from '@/lib/shop';
import { canConfigurePayments, canManageTeam } from '@/lib/permissions';

const TABS = [
  { key: 'perfil', label: 'Perfil', title: 'Perfil da barbearia', body: 'Nome, contactos, morada, logo e capa.' },
  { key: 'pagina', label: 'Página', title: 'Tema da página pública', body: 'Dez temas com a mesma gramática de vidro. Toca para ver ao vivo.' },
  { key: 'regras', label: 'Regras', title: 'Regras de marcação', body: 'Grelha, antecedência e política de cancelamento que o cliente lê.' },
  { key: 'sinal', label: 'Sinal', title: 'Sinal', body: 'Reserva com pagamento antecipado para reduzir faltas.' },
  { key: 'pagamentos', label: 'Pagamentos', title: 'Pagamentos', body: 'Ligue M-Pesa e e-Mola para receber sinais de forma automática.' },
  { key: 'utilizadores', label: 'Utilizadores', title: 'Equipa com acesso', body: 'Donos gerem tudo, gerentes operam, barbeiros vêem a sua agenda.' },
  { key: 'link', label: 'Link e QR', title: 'Link e QR', body: 'O momento de contacto físico é onde a adopção acontece.' },
] as const;

export default function Definicoes() {
  const { tab } = useParams();
  const { role } = useShop();
  const tabs = TABS.filter((item) => item.key !== 'pagamentos' && item.key !== 'utilizadores'
    ? true
    : item.key === 'pagamentos'
      ? canConfigurePayments(role)
      : canManageTeam(role));
  const t = tabs.find((x) => x.key === tab);
  if (!t) return <Navigate to={tabs[0] ? `/app/definicoes/${tabs[0].key}` : '/app'} replace />;

  return (
    <Page testId="definicoes-page" title="Definições">
      <nav className="flex gap-1 overflow-x-auto no-scrollbar mb-5 -mx-1 px-1" aria-label="Secções">
        {tabs.map((x) => (
          <NavLink key={x.key} to={`/app/definicoes/${x.key}`} data-testid={`settings-tab-${x.key}`}
            className={({ isActive }) => cn('rounded-full px-4 h-9 inline-flex items-center text-xs whitespace-nowrap border transition-colors', isActive ? 'bg-accent-soft text-accent-ink border-transparent font-medium' : 'border-white/10 text-ink-mid hover:text-ink-hi')}>
            {x.label}
          </NavLink>
        ))}
      </nav>
      <Panel testId={`settings-panel-${t.key}`} className="max-w-3xl">
        <h2 className="t-card">{t.title}</h2>
        <p className="t-body text-ink-mid mt-1 mb-6">{t.body}</p>
        {t.key === 'perfil' && <ProfileForm key="perfil" />}
        {t.key === 'pagina' && <ThemePicker key="pagina" />}
        {t.key === 'regras' && <RulesForm key="regras" />}
        {t.key === 'sinal' && <DepositForm key="sinal" />}
        {t.key === 'pagamentos' && <PaymentSettingsForm />}
        {t.key === 'utilizadores' && <MembersEditor />}
        {t.key === 'link' && <LinkQr />}
      </Panel>
    </Page>
  );
}
