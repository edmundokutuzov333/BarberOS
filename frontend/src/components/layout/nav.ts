import { type LucideIcon, LayoutDashboard, CalendarDays, ClipboardList, Users, Scissors, Sparkles, UserRound, Clock, Hourglass, Bell, Star, BarChart3, Settings } from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; testId: string }

export const NAV: NavItem[] = [
  { to: '/app', label: 'Início', icon: LayoutDashboard, end: true, testId: 'nav-dashboard' },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, testId: 'nav-agenda' },
  { to: '/app/marcacoes', label: 'Marcações', icon: ClipboardList, testId: 'nav-marcacoes' },
  { to: '/app/clientes', label: 'Clientes', icon: Users, testId: 'nav-clientes' },
  { to: '/app/servicos', label: 'Serviços', icon: Scissors, testId: 'nav-servicos' },
  { to: '/app/cortes', label: 'Cortes', icon: Sparkles, testId: 'nav-cortes' },
  { to: '/app/barbeiros', label: 'Barbeiros', icon: UserRound, testId: 'nav-barbeiros' },
  { to: '/app/horarios', label: 'Horários', icon: Clock, testId: 'nav-horarios' },
  { to: '/app/lista-espera', label: 'Lista de espera', icon: Hourglass, testId: 'nav-lista-espera' },
  { to: '/app/notificacoes', label: 'Notificações', icon: Bell, testId: 'nav-notificacoes' },
  { to: '/app/avaliacoes', label: 'Avaliações', icon: Star, testId: 'nav-avaliacoes' },
  { to: '/app/relatorios', label: 'Relatórios', icon: BarChart3, testId: 'nav-relatorios' },
  { to: '/app/definicoes', label: 'Definições', icon: Settings, testId: 'nav-definicoes' },
];

export const DOCK = ['/app/agenda', '/app/marcacoes', '/app/clientes', '/app/relatorios'];
