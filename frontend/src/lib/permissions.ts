import type { Role } from './shop';

export type Permission =
  | 'view_dashboard'
  | 'view_agenda'
  | 'view_appointments'
  | 'view_customers'
  | 'manage_catalog'
  | 'manage_schedule'
  | 'manage_waitlist'
  | 'view_notifications'
  | 'manage_payments'
  | 'view_reviews'
  | 'manage_reviews'
  | 'view_reports'
  | 'manage_settings'
  | 'manage_team';

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: [
    'view_dashboard',
    'view_agenda',
    'view_appointments',
    'view_customers',
    'manage_catalog',
    'manage_schedule',
    'manage_waitlist',
    'view_notifications',
    'manage_payments',
    'view_reviews',
    'manage_reviews',
    'view_reports',
    'manage_settings',
    'manage_team',
  ],
  manager: [
    'view_dashboard',
    'view_agenda',
    'view_appointments',
    'view_customers',
    'manage_catalog',
    'manage_schedule',
    'manage_waitlist',
    'view_notifications',
    'manage_payments',
    'view_reviews',
    'manage_reviews',
    'view_reports',
    'manage_settings',
  ],
  barber: [
    'view_dashboard',
    'view_agenda',
    'view_appointments',
    'view_customers',
    'view_notifications',
    'view_reviews',
    'view_reports',
  ],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return role ? MATRIX[role].includes(permission) : false;
}

export function permissionsFor(role: Role | null | undefined): readonly Permission[] {
  return role ? MATRIX[role] : [];
}
