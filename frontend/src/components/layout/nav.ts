import { type LucideIcon, LayoutDashboard, CalendarDays, ClipboardList, Users, Scissors, BrainCircuit, createLucideIcon, UserRound, Clock, Hourglass, Bell, Mail, Star, BarChart3, Settings, CreditCard, Package, ClipboardCheck, BellRing, Banknote } from 'lucide-react';
import type { Role } from '@/lib/shop';
import { canAccessAppRoute } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  testId: string;
}

// Tabler Icons, razor-electric (v3.34.1), MIT. See third-party license.
const HairClipper = createLucideIcon('HairClipper', [
  ['path', {d:'M8 3v2',key:'tooth-left'}],
  ['path', {d:'M12 3v2',key:'tooth-middle'}],
  ['path', {d:'M16 3v2',key:'tooth-right'}],
  ['path', {d:'M9 12v6a3 3 0 0 0 6 0v-6h-6z',key:'handle'}],
  ['path', {d:'M8 5h8l-1 4h-6z',key:'blade'}],
  ['path', {d:'M12 17v1',key:'switch'}],
]);

export const NAV: NavItem[] = [
  { to: '/app', label: 'Início', icon: LayoutDashboard, end: true, testId: 'nav-dashboard' },
  { to: '/app/inteligencia', label: 'Inteligência', icon: BrainCircuit, testId: 'nav-intelligence' },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, testId: 'nav-agenda' },
  { to: '/app/marcacoes', label: 'Marcações', icon: ClipboardList, testId: 'nav-marcacoes' },
  { to: '/app/clientes', label: 'Clientes', icon: Users, testId: 'nav-clientes' },
  { to: '/app/servicos', label: 'Serviços', icon: Scissors, testId: 'nav-servicos' },
  { to: '/app/cortes', label: 'Cortes', icon: HairClipper, testId: 'nav-cortes' },
  { to: '/app/barbeiros', label: 'Barbeiros', icon: UserRound, testId: 'nav-barbeiros' },
  { to: '/app/horarios', label: 'Horários', icon: Clock, testId: 'nav-horarios' },
  { to: '/app/lista-espera', label: 'Lista de espera', icon: Hourglass, testId: 'nav-lista-espera' },
  { to: '/app/notificacoes', label: 'Notificações', icon: Bell, testId: 'nav-notificacoes' },
  { to: '/app/comunicacoes', label: 'Gmail', icon: Mail, testId: 'nav-gmail' },
  { to: '/app/pagamentos', label: 'Pagamentos', icon: CreditCard, testId: 'nav-pagamentos' },
  { to: '/app/avaliacoes', label: 'Avaliações', icon: Star, testId: 'nav-avaliacoes' },
  { to: '/app/relatorios', label: 'Relatórios', icon: BarChart3, testId: 'nav-relatorios' },
  { to: '/app/loja/produtos', label: 'Loja', icon: Package, testId: 'nav-shop' },
  { to: '/app/loja/pedidos', label: 'Pedidos da loja', icon: ClipboardCheck, testId: 'nav-shop-orders' },
  { to: '/app/loja/relatorios', label: 'Comunicações e relatórios', icon: BellRing, testId: 'nav-shop-reports' },
  { to: '/app/loja/piloto', label: 'Preparação do piloto', icon: ClipboardList, testId: 'nav-shop-pilot' },
  { to: '/app/loja/pagamentos', label: 'Pagamentos da loja', icon: Banknote, testId: 'nav-shop-payments' },
  { to: '/app/definicoes', label: 'Definições', icon: Settings, testId: 'nav-definicoes' },
];

export const DOCK = ['/app/agenda', '/app/marcacoes', '/app/clientes', '/app/relatorios'];

export function navForRole(role: Role | null): NavItem[] {
  return NAV.filter((item) => canAccessAppRoute(role, item.to));
}
