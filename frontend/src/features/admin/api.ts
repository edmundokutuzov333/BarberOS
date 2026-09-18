import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

type ShopStatus = Database['public']['Enums']['shop_status'];
type PaymentState = Database['public']['Enums']['payment_state'];
type PaymentProvider = Database['public']['Enums']['payment_provider'];
type SupportStatus = Database['public']['Enums']['support_ticket_status'];
type SupportPriority = Database['public']['Enums']['support_ticket_priority'];

export type AdminOverview = {
  shops: { total: number; trial: number; active: number; suspended: number; cancelled: number };
  users: number; barbers: number; customers: number;
  appointments: { total: number; completed: number; cancelled: number; no_show: number };
  revenue: { estimated_completed_cents: number; paid_deposit_cents: number };
  payments: { total: number; paid: number; pending: number; failed: number; refund_required: number };
  reviews: { total: number; published: number };
  support: { open: number; in_progress: number; resolved: number; closed: number };
};

export type AdminShop = Database['public']['Functions']['admin_list_barbershops']['Returns'][number];
export type AdminUser = Database['public']['Functions']['admin_list_users']['Returns'][number];
export type AdminPlan = Database['public']['Functions']['admin_list_plans']['Returns'][number];
export type AdminPayment = Database['public']['Functions']['admin_list_payments']['Returns'][number];
export type AdminSupportTicket = Database['public']['Functions']['admin_list_support_tickets']['Returns'][number];
export type AdminActivity = Database['public']['Functions']['admin_get_activity']['Returns'][number];

export type AdminShopDetail = {
  shop: Record<string, unknown>;
  plan: { id: string; code: string; name: string; price_cents: number; max_barbers: number; features: Record<string, unknown>; is_active: boolean } | null;
  members: Array<{ user_id: string; role: string; full_name: string | null; phone: string | null }>;
  stats: Record<string, number>;
  activity: Array<{ action: string; entity: string | null; entity_id: string | null; actor_id: string | null; created_at: string; diff: unknown }>;
};

export type AdminMetrics = {
  from: string; to: string;
  summary: { appointments: number; completed: number; cancelled: number; no_show: number; revenue_cents: number; payments_paid_cents: number; new_customers: number; new_shops: number; new_users: number };
  daily: Array<{ date: string; appointments: number; completed: number; revenue_cents: number }>;
  shop_status: Record<string, number>;
  plans: Array<{ code: string; name: string; shops: number; price_cents: number }>;
};

async function rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
  const result = await supabase.rpc(name as never, (args ?? {}) as never);
  if (result.error) throw result.error;
  return result.data as T;
}

export async function getAdminOverview() {
  return rpc<AdminOverview>('admin_get_overview');
}

export async function getAdminShops(params: { search: string; status: ShopStatus | null; limit?: number; offset?: number }) {
  return rpc<AdminShop[]>('admin_list_barbershops', { p_search: params.search || null, p_status: params.status ?? undefined, p_limit: params.limit ?? 25, p_offset: params.offset ?? 0 });
}

export async function getAdminShopDetail(shopId: string) {
  const data = await rpc<unknown>('admin_get_barbershop', { p_shop: shopId });
  return data as AdminShopDetail;
}

export async function setAdminShopStatus(shopId: string, status: ShopStatus) {
  return rpc<AdminShop[]>('admin_set_barbershop_status', { p_shop: shopId, p_status: status });
}

export async function assignAdminShopPlan(shopId: string, planId: string) {
  return rpc('admin_assign_barbershop_plan', { p_shop: shopId, p_plan: planId });
}

export async function getAdminUsers(params: { search: string; limit?: number; offset?: number }) {
  return rpc<AdminUser[]>('admin_list_users', { p_search: params.search || null, p_limit: params.limit ?? 25, p_offset: params.offset ?? 0 });
}

export async function getAdminPlans() {
  return rpc<AdminPlan[]>('admin_list_plans');
}

export async function updateAdminPlan(input: {
  id: string; name: string; priceCents: number; maxBarbers: number; features: Record<string, unknown>; isActive: boolean;
}) {
  return rpc<AdminPlan[]>('admin_update_plan', {
    p_plan: input.id, p_name: input.name, p_price_cents: input.priceCents,
    p_max_barbers: input.maxBarbers, p_features: input.features, p_is_active: input.isActive,
  });
}

export async function getAdminPayments(params: { search: string; status: PaymentState | null; provider: PaymentProvider | null; limit?: number; offset?: number }) {
  return rpc<AdminPayment[]>('admin_list_payments', {
    p_search: params.search || null, p_status: params.status, p_provider: params.provider ?? undefined,
    p_limit: params.limit ?? 25, p_offset: params.offset ?? 0,
  });
}

export async function getAdminSupport(params: { search: string; status: SupportStatus | null; priority: SupportPriority | null; limit?: number; offset?: number }) {
  return rpc<AdminSupportTicket[]>('admin_list_support_tickets', {
    p_search: params.search || null, p_status: params.status ?? undefined, p_priority: params.priority ?? undefined,
    p_limit: params.limit ?? 25, p_offset: params.offset ?? 0,
  });
}

export async function createAdminSupport(input: { shopId: string | null; subject: string; description: string; priority: SupportPriority }) {
  return rpc('admin_create_support_ticket', {
    p_shop: input.shopId || null, p_subject: input.subject, p_description: input.description, p_priority: input.priority,
  });
}

export async function updateAdminSupport(input: { ticketId: string; status?: SupportStatus; priority?: SupportPriority; assignedTo?: string | null }) {
  return rpc('admin_update_support_ticket', {
    p_ticket: input.ticketId, p_status: input.status ?? null, p_priority: input.priority ?? null, p_assigned_to: input.assignedTo ?? null,
  });
}

export async function getAdminActivity(limit = 30) {
  return rpc<AdminActivity[]>('admin_get_activity', { p_limit: limit });
}

export async function getAdminMetrics(from: string, to: string) {
  return rpc<AdminMetrics>('admin_get_metrics', { p_from: from, p_to: to });
}

export function useAdminOverview() {
  return useQuery({ queryKey: ['admin','overview'], queryFn: getAdminOverview, staleTime: 15_000 });
}
export function useAdminShops(params: { search: string; status: ShopStatus | null; limit?: number; offset?: number }) {
  return useQuery({ queryKey: ['admin','shops',params], queryFn: () => getAdminShops(params), staleTime: 10_000 });
}
export function useAdminShopDetail(shopId: string | undefined) {
  return useQuery({ queryKey: ['admin','shop',shopId], queryFn: () => getAdminShopDetail(shopId!), enabled: Boolean(shopId) });
}
export function useAdminUsers(params: { search: string; limit?: number; offset?: number }) {
  return useQuery({ queryKey: ['admin','users',params], queryFn: () => getAdminUsers(params), staleTime: 10_000 });
}
export function useAdminPlans() {
  return useQuery({ queryKey: ['admin','plans'], queryFn: getAdminPlans, staleTime: 15_000 });
}
export function useAdminPayments(params: { search: string; status: PaymentState | null; provider: PaymentProvider | null; limit?: number; offset?: number }) {
  return useQuery({ queryKey: ['admin','payments',params], queryFn: () => getAdminPayments(params), staleTime: 10_000 });
}
export function useAdminSupport(params: { search: string; status: SupportStatus | null; priority: SupportPriority | null; limit?: number; offset?: number }) {
  return useQuery({ queryKey: ['admin','support',params], queryFn: () => getAdminSupport(params), staleTime: 10_000 });
}
export function useAdminActivity(limit = 30) {
  return useQuery({ queryKey: ['admin','activity',limit], queryFn: () => getAdminActivity(limit), staleTime: 10_000 });
}
export function useAdminMetrics(from: string, to: string) {
  return useQuery({ queryKey: ['admin','metrics',from,to], queryFn: () => getAdminMetrics(from,to), staleTime: 15_000 });
}

export function useSetAdminShopStatus() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({shopId,status}:{shopId:string;status:ShopStatus}) => setAdminShopStatus(shopId,status),
    onSuccess: (_, vars) => { void qc.invalidateQueries({queryKey:['admin','shops']}); void qc.invalidateQueries({queryKey:['admin','shop',vars.shopId]}); void qc.invalidateQueries({queryKey:['admin','overview']}); void qc.invalidateQueries({queryKey:['admin','activity']}); }
  });
}
export function useAssignAdminShopPlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({shopId,planId}:{shopId:string;planId:string}) => assignAdminShopPlan(shopId,planId),
    onSuccess: (_, vars) => { void qc.invalidateQueries({queryKey:['admin','shops']}); void qc.invalidateQueries({queryKey:['admin','shop',vars.shopId]}); void qc.invalidateQueries({queryKey:['admin','overview']}); }
  });
}
export function useUpdateAdminPlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: updateAdminPlan,
    onSuccess: () => { void qc.invalidateQueries({queryKey:['admin','plans']}); void qc.invalidateQueries({queryKey:['admin','overview']}); void qc.invalidateQueries({queryKey:['admin','metrics']}); }
  });
}
export function useCreateAdminSupport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createAdminSupport,
    onSuccess: () => { void qc.invalidateQueries({queryKey:['admin','support']}); void qc.invalidateQueries({queryKey:['admin','overview']}); void qc.invalidateQueries({queryKey:['admin','activity']}); }
  });
}
export function useUpdateAdminSupport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: updateAdminSupport,
    onSuccess: () => { void qc.invalidateQueries({queryKey:['admin','support']}); void qc.invalidateQueries({queryKey:['admin','overview']}); void qc.invalidateQueries({queryKey:['admin','activity']}); }
  });
}

export type { ShopStatus, PaymentState, PaymentProvider, SupportStatus, SupportPriority };
