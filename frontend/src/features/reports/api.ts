import { useQuery } from '@tanstack/react-query';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type ReportSummary = Database['public']['Functions']['get_report_summary']['Returns'][number];
export type ReportDailyRow = Database['public']['Functions']['get_report_daily']['Returns'][number];
export type ReportServiceRow = Database['public']['Functions']['get_report_services']['Returns'][number];
export type ReportHaircutRow = Database['public']['Functions']['get_report_haircuts']['Returns'][number];
export type ReportBarberRow = Database['public']['Functions']['get_report_barbers']['Returns'][number];

export type ReportRange = {
  from: string;
  to: string;
};

export type ReportData = {
  summary: ReportSummary;
  daily: ReportDailyRow[];
  services: ReportServiceRow[];
  haircuts: ReportHaircutRow[];
  barbers: ReportBarberRow[];
};

function assertRange(range: ReportRange) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to) || range.from > range.to) {
    throw new Error('INVALID_DATE_RANGE');
  }
}

export async function getReportData(shopId: string, range: ReportRange): Promise<ReportData> {
  assertRange(range);

  const params = {
    p_shop: shopId,
    p_from: range.from,
    p_to: range.to,
  };

  const [summary, daily, services, haircuts, barbers] = await Promise.all([
    supabase.rpc('get_report_summary', params),
    supabase.rpc('get_report_daily', params),
    supabase.rpc('get_report_services', params),
    supabase.rpc('get_report_haircuts', params),
    supabase.rpc('get_report_barbers', params),
  ]);

  for (const result of [summary, daily, services, haircuts, barbers]) {
    if (result.error) throw result.error;
  }

  const summaryRow = summary.data?.[0];
  if (!summaryRow) throw new Error('REPORT_EMPTY_RESPONSE');

  return {
    summary: summaryRow,
    daily: daily.data ?? [],
    services: services.data ?? [],
    haircuts: haircuts.data ?? [],
    barbers: barbers.data ?? [],
  };
}

export function useReportData(shopId: string | undefined, range: ReportRange) {
  return useQuery({
    queryKey: ['reports', shopId, range.from, range.to],
    queryFn: () => getReportData(shopId!, range),
    enabled: Boolean(shopId),
    staleTime: 30_000,
    retry: false,
  });
}
