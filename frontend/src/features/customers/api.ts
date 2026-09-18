import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json, Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { normalizeMozPhone } from '@/features/booking/api';

export type CustomerListItem = Database['public']['Functions']['get_customers']['Returns'][number];
export type CustomerDetail = Database['public']['Functions']['get_customer']['Returns'][number];
export type CustomerAppointment = Database['public']['Functions']['get_customer_appointments']['Returns'][number];
export type CustomerMetrics = Database['public']['Functions']['get_customer_metrics']['Returns'][number];
export type CustomerView = 'all' | 'upcoming' | 'no_show' | 'never_visited';

export async function getCustomerMetrics(shopId: string): Promise<CustomerMetrics | null> {
  const { data, error } = await supabase.rpc('get_customer_metrics', { p_shop: shopId });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getCustomers(
  shopId: string,
  search: string,
  view: CustomerView,
  limit = 50,
  offset = 0,
): Promise<CustomerListItem[]> {
  const { data, error } = await supabase.rpc('get_customers', {
    p_shop: shopId,
    p_search: search.trim() || null,
    p_view: view,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getCustomer(shopId: string, customerId: string): Promise<CustomerDetail> {
  const { data, error } = await supabase.rpc('get_customer', {
    p_shop: shopId,
    p_customer: customerId,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error('CUSTOMER_NOT_FOUND');
  return result;
}

export async function getCustomerAppointments(
  shopId: string,
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<CustomerAppointment[]> {
  const { data, error } = await supabase.rpc('get_customer_appointments', {
    p_shop: shopId,
    p_customer: customerId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data ?? [];
}

export async function updateCustomer(input: {
  shopId: string;
  customerId: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  preferences?: Json;
}): Promise<CustomerDetail> {
  const { data, error } = await supabase.rpc('update_customer', {
    p_shop: input.shopId,
    p_customer: input.customerId,
    p_name: input.name,
    p_phone: normalizeMozPhone(input.phone),
    p_email: input.email?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_preferences: input.preferences ?? {},
  });
  if (error) throw error;
  if (!data?.[0]) throw new Error('CUSTOMER_UPDATE_EMPTY_RESPONSE');
  return getCustomer(input.shopId, input.customerId);
}

export function useCustomerMetrics(shopId?: string) {
  return useQuery({
    queryKey: ['customers', 'metrics', shopId],
    queryFn: () => getCustomerMetrics(shopId!),
    enabled: Boolean(shopId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useCustomers(shopId?: string, search = '', view: CustomerView = 'all', page = 0, limit = 50) {
  return useQuery({
    queryKey: ['customers', 'list', shopId, search, view, page, limit],
    queryFn: () => getCustomers(shopId!, search, view, limit, page * limit),
    enabled: Boolean(shopId),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useCustomer(shopId?: string, customerId?: string) {
  return useQuery({
    queryKey: ['customers', 'detail', shopId, customerId],
    queryFn: () => getCustomer(shopId!, customerId!),
    enabled: Boolean(shopId && customerId),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useCustomerAppointments(shopId?: string, customerId?: string, page = 0, limit = 50) {
  return useQuery({
    queryKey: ['customers', 'history', shopId, customerId, page, limit],
    queryFn: () => getCustomerAppointments(shopId!, customerId!, limit, page * limit),
    enabled: Boolean(shopId && customerId),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: updateCustomer,
    retry: false,
    onSuccess: async (_result, input) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['customers', 'list', input.shopId] }),
        qc.invalidateQueries({ queryKey: ['customers', 'metrics', input.shopId] }),
        qc.invalidateQueries({ queryKey: ['customers', 'detail', input.shopId, input.customerId] }),
        qc.invalidateQueries({ queryKey: ['customers', 'history', input.shopId, input.customerId] }),
      ]);
    },
  });
}
