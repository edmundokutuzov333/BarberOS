import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type GmailConnection = {
  connected: boolean;
  email?: string;
  connected_at?: string;
  updated_at?: string;
};
export type GmailStatus = {
  configured: boolean;
  connection: GmailConnection;
};
export type GmailThreadPreview = {
  id: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  unread: boolean;
  message_count: number;
};
export type GmailMessage = {
  id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  body: string;
  message_id: string;
  references: string;
};
export type GmailThread = { id: string; messages: GmailMessage[] };

type GmailAction = "status" | "connect" | "disconnect" | "list" | "thread" | "send";
type GmailResponse = {
  ok?: boolean;
  error?: string;
  configured?: boolean;
  connection?: GmailConnection;
  url?: string;
  threads?: GmailThreadPreview[];
  thread?: GmailThread;
  message_id?: string | null;
  thread_id?: string | null;
  disconnected?: boolean;
};

async function gmailRequest<T extends GmailResponse>(
  action: GmailAction,
  shopId: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<GmailResponse>("gmail-integration", {
    body: { action, shop_id: shopId, ...payload },
  });

  if (error) {
    let code = "GMAIL_PROVIDER_REQUEST_FAILED";
    const context = (error as { context?: Response }).context;
    if (context?.status === 404) code = "GMAIL_FUNCTION_NOT_DEPLOYED";
    if (context) {
      try {
        const response = await context.clone().json() as { error?: string; code?: string };
        if (response.error) code = response.error;
        else if (context.status === 404 || response.code === "NOT_FOUND") code = "GMAIL_FUNCTION_NOT_DEPLOYED";
      } catch {
        // The endpoint may return a non-JSON gateway error.
      }
    }
    throw new Error(code);
  }
  if (!data?.ok) throw new Error(data?.error ?? "GMAIL_PROVIDER_REQUEST_FAILED");
  return data as T;
}

export const getGmailStatus = (shopId: string) =>
  gmailRequest<GmailStatus & GmailResponse>("status", shopId);

export const connectGmail = (shopId: string) =>
  gmailRequest<GmailResponse & { url: string }>("connect", shopId);

export const disconnectGmail = (shopId: string) =>
  gmailRequest<GmailResponse>("disconnect", shopId);

export const getGmailThreads = (shopId: string, search: string) =>
  gmailRequest<GmailResponse & { threads: GmailThreadPreview[] }>("list", shopId, { search });

export const getGmailThread = (shopId: string, threadId: string) =>
  gmailRequest<GmailResponse & { thread: GmailThread }>("thread", shopId, { thread_id: threadId });

export const sendGmailMessage = (
  shopId: string,
  payload: { body: string; thread_id?: string; to?: string; subject?: string },
) => gmailRequest<GmailResponse>("send", shopId, payload);

export function useGmailStatus(shopId?: string) {
  return useQuery({
    queryKey: ["gmail", "status", shopId],
    queryFn: () => getGmailStatus(shopId!),
    enabled: Boolean(shopId),
    staleTime: 10_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useGmailThreads(shopId?: string, search = "", enabled = true) {
  return useQuery({
    queryKey: ["gmail", "threads", shopId, search],
    queryFn: () => getGmailThreads(shopId!, search),
    enabled: Boolean(shopId) && enabled,
    staleTime: 10_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useGmailThread(shopId?: string, threadId?: string) {
  return useQuery({
    queryKey: ["gmail", "thread", shopId, threadId],
    queryFn: () => getGmailThread(shopId!, threadId!),
    enabled: Boolean(shopId && threadId),
    staleTime: 5_000,
    retry: false,
  });
}

export function useGmailActions(shopId: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["gmail", "status", shopId] }),
    queryClient.invalidateQueries({ queryKey: ["gmail", "threads", shopId] }),
    queryClient.invalidateQueries({ queryKey: ["gmail", "thread", shopId] }),
  ]);
  return {
    connect: async () => connectGmail(shopId),
    disconnect: async () => { const result = await disconnectGmail(shopId); await invalidate(); return result; },
    send: async (payload: { body: string; thread_id?: string; to?: string; subject?: string }) => {
      const result = await sendGmailMessage(shopId, payload);
      await invalidate();
      return result;
    },
    refresh: invalidate,
  };
}
