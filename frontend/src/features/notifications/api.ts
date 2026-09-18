import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export type NotificationStatus = Database["public"]["Enums"]["notif_status"];
export type NotificationView = "active" | "queued" | "processing" | "sent" | "failed" | "skipped" | "all";
export type NotificationChannel = "all" | "whatsapp" | "email";

export type NotificationMetrics = {
  queued_count: number;
  processing_count: number;
  failed_count: number;
  sent_today_count: number;
  sent_7d_count: number;
  delivery_rate_7d: number;
};

export type NotificationAutomationStatus = {
  dispatcher_active: boolean;
  dispatcher_last_run_at: string | null;
  dispatcher_last_run_status: string | null;
  dispatcher_last_run_message: string | null;
};

export type NotificationRow = {
  notification_id: string;
  channel: Exclude<NotificationChannel, "all">;
  template_key: string;
  recipient_masked: string;
  status: NotificationStatus;
  scheduled_for: string;
  sent_at: string | null;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  fallback_url: string | null;
  total_count: number;
};

export async function getNotificationMetrics(shopId: string): Promise<NotificationMetrics> {
  const { data, error } = await supabase.rpc("get_notification_metrics", { p_shop: shopId });
  if (error) throw error;
  return data?.[0] ?? {
    queued_count: 0,
    processing_count: 0,
    failed_count: 0,
    sent_today_count: 0,
    sent_7d_count: 0,
    delivery_rate_7d: 0,
  };
}

export async function retryNotification(shopId: string, notificationId: string) {
  const { data, error } = await supabase.rpc("retry_notification", {
    p_shop: shopId,
    p_notification: notificationId,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("NOTIFICATION_RETRY_EMPTY_RESPONSE");
  return row;
}

export async function getNotificationAutomationStatus(shopId: string): Promise<NotificationAutomationStatus> {
  const { data, error } = await supabase.rpc("get_notification_automation_status", { p_shop: shopId });
  if (error) throw error;
  return data?.[0] ?? {
    dispatcher_active: false,
    dispatcher_last_run_at: null,
    dispatcher_last_run_status: null,
    dispatcher_last_run_message: null,
  };
}

export async function getNotifications(
  shopId: string,
  status: NotificationView = "active",
  channel: NotificationChannel = "all",
  page = 0,
  limit = 50,
): Promise<NotificationRow[]> {
  const { data, error } = await supabase.rpc("get_notifications", {
    p_shop: shopId,
    p_status: status,
    p_channel: channel,
    p_limit: limit,
    p_offset: page * limit,
  });
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export function useNotificationMetrics(shopId?: string) {
  return useQuery({
    queryKey: ["notifications", "metrics", shopId],
    queryFn: () => getNotificationMetrics(shopId!),
    enabled: Boolean(shopId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useNotifications(
  shopId?: string,
  status: NotificationView = "active",
  channel: NotificationChannel = "all",
  page = 0,
  limit = 50,
) {
  return useQuery({
    queryKey: ["notifications", "list", shopId, status, channel, page, limit],
    queryFn: () => getNotifications(shopId!, status, channel, page, limit),
    enabled: Boolean(shopId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useRetryNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, notificationId }: { shopId: string; notificationId: string }) =>
      retryNotification(shopId, notificationId),
    retry: false,
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", "list", input.shopId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "metrics", input.shopId] }),
      ]);
    },
  });
}


export function useNotificationAutomationStatus(shopId?: string) {
  return useQuery({
    queryKey: ["notifications", "automation", shopId],
    queryFn: () => getNotificationAutomationStatus(shopId!),
    enabled: Boolean(shopId),
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

