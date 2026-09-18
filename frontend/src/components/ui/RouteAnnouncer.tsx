import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTES: Array<[string, string]> = [
  ['/admin/barbearias/', 'Detalhe da barbearia'],
  ['/admin/barbearias', 'Barbearias'],
  ['/admin/utilizadores', 'Utilizadores'],
  ['/admin/planos', 'Planos'],
  ['/admin/pagamentos', 'Pagamentos'],
  ['/admin/suporte', 'Suporte'],
  ['/admin/metricas', 'Métricas'],
  ['/admin', 'Administração Oryon'],
  ['/app/agenda', 'Agenda'],
  ['/app/marcacoes', 'Marcações'],
  ['/app/clientes/', 'Detalhe do cliente'],
  ['/app/clientes', 'Clientes'],
  ['/app/lista-espera', 'Lista de espera'],
  ['/app/notificacoes', 'Notificações'],
  ['/app/pagamentos', 'Pagamentos'],
  ['/app/avaliacoes', 'Avaliações'],
  ['/app/relatorios', 'Relatórios'],
  ['/app/servicos', 'Serviços'],
  ['/app/cortes', 'Cortes'],
  ['/app/barbeiros', 'Barbeiros'],
  ['/app/horarios', 'Horários'],
  ['/app/definicoes', 'Definições'],
  ['/app/onboarding', 'Configuração inicial'],
  ['/app', 'Painel de controlo'],
  ['/barbearia/', 'Barbearia pública'],
  ['/marcacao/', 'Gestão da marcação'],
  ['/vaga/', 'Lista de espera'],
  ['/entrar', 'Entrar'],
  ['/registar', 'Registar'],
  ['/recuperar', 'Recuperar acesso'],
  ['/', 'Início'],
];

function getRouteLabel(pathname: string) {
  return ROUTES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Página';
}

export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMessage(`A abrir: ${getRouteLabel(pathname)}`);
  }, [pathname]);

  return (
    <div data-testid="route-announcer" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
