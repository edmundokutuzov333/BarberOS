import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type AgendaRealtimeStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export function useAgendaRealtime(shopId?: string): AgendaRealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AgendaRealtimeStatus>('connecting');

  useEffect(() => {
    if (!shopId) {
      setStatus('disconnected');
      return;
    }

    let active = true;
    setStatus('connecting');

    const channel = supabase
      .channel('barberos:agenda:' + shopId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'appointments',
          filter: 'barbershop_id=eq.' + shopId,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['agenda', 'appointments'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: 'barbershop_id=eq.' + shopId,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['agenda', 'appointments'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
      )
      .subscribe((nextStatus) => {
        if (!active) return;

        if (nextStatus === 'SUBSCRIBED') {
          setStatus('connected');
          void queryClient.invalidateQueries({ queryKey: ['agenda', 'appointments'] });
          return;
        }

        if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
          setStatus('reconnecting');
          void queryClient.invalidateQueries({ queryKey: ['agenda', 'appointments'] });
          return;
        }

        if (nextStatus === 'CLOSED') {
          setStatus('disconnected');
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [shopId, queryClient]);

  return status;
}
