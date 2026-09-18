import { useLocation, Link } from 'react-router-dom';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { NAV } from '@/components/layout/nav';

const PHASE: Record<string, string> = {
  '/app/agenda': 'Fase 4', '/app/marcacoes': 'Fase 4', '/app/clientes': 'Fase 4',
  '/app/lista-espera': 'Fase 5', '/app/avaliacoes': 'Fase 5', '/app/relatorios': 'Fase 6',
};

export default function NotYet() {
  const { pathname } = useLocation();
  const item = NAV.find((n) => pathname.startsWith(n.to) && n.to !== '/app');
  const phase = Object.entries(PHASE).find(([k]) => pathname.startsWith(k))?.[1] ?? 'uma fase seguinte';
  return (
    <Page testId="not-yet-page" title={item?.label ?? 'Em construção'}>
      <div className="glass p-8 max-w-lg">
        <p className="t-body text-ink-hi">Este ecrã entra na {phase} do plano de execução.</p>
        <p className="t-body text-ink-mid mt-2">A Fase 1 entrega fundações: base de dados, segurança, identidade visual, layout e autenticação. Nada aqui é decorativo, por isso este ecrã fica vazio até ser real.</p>
        <Link to="/app" className="inline-block mt-6"><Button data-testid="not-yet-back-btn" variant="secondary" size="sm" pill>Voltar ao início</Button></Link>
      </div>
    </Page>
  );
}

export function NotFound() {
  return (
    <Page testId="not-found-page" className="min-h-screen grid place-items-center px-4">
      <div className="glass p-9 text-center max-w-sm">
        <p className="t-kpi">404</p>
        <p className="t-body text-ink-mid mt-3">Esta página não existe ou mudou de sítio.</p>
        <Link to="/" className="inline-block mt-6"><Button data-testid="not-found-home-btn" variant="secondary" size="sm" pill>Ir para o início</Button></Link>
      </div>
    </Page>
  );
}
