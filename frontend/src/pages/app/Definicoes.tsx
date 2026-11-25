import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { Panel } from '@/components/ui/States';
import { ProfileForm, ThemePicker, RulesForm, DepositForm } from '@/components/config/ShopForms';
import { MembersEditor } from '@/components/config/MembersEditor';
import StaffEarningsPanel from '@/features/staff-earnings/StaffEarningsPanel';
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
  { key: 'comissoes', label: 'Comissões', title: 'Comissões e gorjetas', body: 'Taxas por barbeiro e registo operacional dos atendimentos concluídos.' },
  { key: 'link', label: 'Link e QR', title: 'Link e QR', body: 'O momento de contacto físico é onde a adopção acontece.' },
] as const;

export default function Definicoes() {
  const { tab } = useParams();
  const { role, shop } = useShop();
  const tabs = TABS.filter((item) => item.key !== 'pagamentos' && item.key !== 'utilizadores'
    ? true
    : item.key === 'pagamentos'
      ? canConfigurePayments(role)
      : canManageTeam(role));
  const t = tabs.find((x) => x.key === tab);
  if (!t) return <Navigate to={tabs[0] ? `/app/definicoes/${tabs[0].key}` : '/app'} replace />;

  if(!shop)return null;
  return (
    <Page testId="definicoes-page" title="Definições" subtitle="Gerir a identidade, as regras e os acessos da barbearia.">
      <nav className="flex flex-wrap gap-2 mb-6" aria-label="Secções">
        {tabs.map((x) => (
          <NavLink key={x.key} to={`/app/definicoes/${x.key}`} data-testid={`settings-tab-${x.key}`}
            className={({ isActive }) => cn('rounded-full px-4 min-h-11 inline-flex items-center text-sm whitespace-nowrap border transition-colors', isActive ? 'bg-accent-soft text-accent-ink border-transparent font-medium' : 'border-white/10 text-ink-mid hover:text-ink-hi')}>
            {x.label}
          </NavLink>
        ))}
      </nav>
      <Panel key={`${shop.id}:${t.key}`} testId={`settings-panel-${t.key}`} className={t.key==='perfil'?'max-w-5xl':'max-w-3xl'}>
        <h2 className="t-card">{t.title}</h2>
        <p className="t-body text-ink-mid mt-1 mb-6">{t.body}</p>
        {t.key === 'perfil' && <ProfileForm key={shop?.id ?? 'perfil'} />}
        {t.key === 'pagina' && <ThemePicker key="pagina" />}
        {t.key === 'regras' && <><RulesForm key="regras" /><div className="mt-5 border-t border-white/10 pt-4"><p className="t-body text-ink-mid">Horários, pausas semanais, feriados e excepções são geridos num único calendário operacional.</p><Link className="inline-flex min-h-11 items-center mt-2 text-accent-soft underline focus-visible:ring-2 focus-visible:ring-accent-soft" to="/app/horarios">Gerir horários e pausas</Link></div></>}
        {t.key === 'sinal' && <DepositForm key="sinal" />}
        {t.key === 'pagamentos' && <PaymentSettingsForm />}
        {t.key === 'utilizadores' && <MembersEditor />}
        {t.key === 'comissoes' && <StaffEarningsPanel settings/>}
        {t.key === 'link' && <LinkQr />}
      </Panel>
    </Page>
  );
}
