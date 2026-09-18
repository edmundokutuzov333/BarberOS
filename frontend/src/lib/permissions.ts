import type { Role } from '@/lib/shop';

export const SHOP_ROLES: Role[] = ['owner', 'manager', 'barber'];
export const MANAGEMENT_ROLES: Role[] = ['owner', 'manager'];
export const OWNER_ROLES: Role[] = ['owner'];

type AccessRule = {
  prefix: string;
  roles: readonly Role[];
};

const ACCESS_RULES: AccessRule[] = [
  { prefix: '/app/definicoes/pagamentos', roles: OWNER_ROLES },
  { prefix: '/app/definicoes/utilizadores', roles: OWNER_ROLES },
  { prefix: '/app/definicoes', roles: MANAGEMENT_ROLES },
  { prefix: '/app/pagamentos', roles: MANAGEMENT_ROLES },
  { prefix: '/app/servicos', roles: MANAGEMENT_ROLES },
  { prefix: '/app/cortes', roles: MANAGEMENT_ROLES },
  { prefix: '/app/barbeiros', roles: MANAGEMENT_ROLES },
  { prefix: '/app/horarios', roles: MANAGEMENT_ROLES },
  { prefix: '/app/lista-espera', roles: MANAGEMENT_ROLES },
  { prefix: '/app/notificacoes', roles: MANAGEMENT_ROLES },
  { prefix: '/app/agenda', roles: SHOP_ROLES },
  { prefix: '/app/marcacoes', roles: SHOP_ROLES },
  { prefix: '/app/clientes', roles: SHOP_ROLES },
  { prefix: '/app/avaliacoes', roles: SHOP_ROLES },
  { prefix: '/app/relatorios', roles: SHOP_ROLES },
  { prefix: '/app', roles: SHOP_ROLES },
];

export function canAccessAppRoute(role: Role | null, pathname: string): boolean {
  if (!role) return false;
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const rule = [...ACCESS_RULES]
    .filter((candidate) => normalized === candidate.prefix || normalized.startsWith(candidate.prefix + '/'))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return rule ? rule.roles.includes(role) : false;
}

export function getAllowedNavItems<T extends { to: string }>(items: T[], role: Role | null): T[] {
  return items.filter((item) => canAccessAppRoute(role, item.to));
}

export function canManageTeam(role: Role | null): boolean {
  return role === 'owner';
}

export function canConfigurePayments(role: Role | null): boolean {
  return role === 'owner';
}

export function canManageShop(role: Role | null): boolean {
  return role === 'owner' || role === 'manager';
}
