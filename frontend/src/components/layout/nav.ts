import { type LucideIcon, LayoutDashboard, CalendarDays, ClipboardList, Users, Scissors, Sparkles, UserRound, Clock, Hourglass, Bell, Star, BarChart3, Settings, CreditCard } from 'lucide-react';
import type { Permission } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  testId: string;
  permission?: Permission;
}

export const NAV: NavItem[] = [
  { to: '/app', label: 'Início', icon: LayoutDashboard, end: true, testId: 'nav-dashboard', permission: 'view_dashboard' },
  { to: '/app/agenda', label: 'Agenda', icon: CalendarDays, testId: 'nav-agenda', permission: 'view_agenda' },
  { to: '/app/marcacoes', label: 'Marcações', icon: ClipboardList, testId: 'nav-marcacoes', permission: 'view_appointments' },
  { to: '/app/clientes', label: 'Clientes', icon: Users, testId: 'nav-clientes', permission: 'view_customers' },
  { to: '/app/servicos', label: 'Serviços', icon: Scissors, testId: 'nav-servicos', permission: 'manage_catalog' },
  { to: '/app/cortes', label: 'Cortes', icon: Sparkles, testId: 'nav-cortes', permission: 'manage_catalog' },
  { to: '/app/barbeiros', label: 'Barbeiros', icon: UserRound, testId: 'nav-barbeiros', permission: 'manage_catalog' },
  { to: '/app/horarios', label: 'Horários', icon: Clock, testId: 'nav-horarios', permission: 'manage_schedule' },
  { to: '/app/lista-espera', label: 'Lista de espera', icon: Hourglass, testId: 'nav-lista-espera', permission: 'manage_waitlist' },
  { to: '/app/notificacoes', label: 'Notificações', icon: Bell, testId: 'nav-notificacoes', permission: 'view_notifications' },
  { to: '/app/pagamentos', label: 'Pagamentos', icon: CreditCard, testId: 'nav-pagamentos', permission: 'manage_payments' },
  { to: '/app/avaliacoes', label: 'Avaliações', icon: Star, testId: 'nav-avaliacoes', permission: 'view_reviews' },
  { to: '/app/relatorios', label: 'Relatórios', icon: BarChart3, testId: 'nav-relatorios', permission: 'view_reports' },
  { to: '/app/definicoes', label: 'Definições', icon: Settings, testId: 'nav-definicoes', permission: 'manage_settings' },
];

export const DOCK = ['/app/agenda', '/app/marcacoes', '/app/clientes', '/app/relatorios'];
