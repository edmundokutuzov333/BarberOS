import { useEffect, useState, type ReactNode } from 'react';
import { Reorder, useReducedMotion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { humanError, cn } from '@/lib/utils';

interface Sortable { id: string; sort_order: number }
type ReorderRpc = 'reorder_services' | 'reorder_haircuts' | 'reorder_barbers';

export function SortableList<T extends Sortable>({ items, shopId, rpcName, queryKey, render, testId }: {
  items: T[]; shopId: string; rpcName: ReorderRpc; queryKey: unknown[]; render: (item: T) => ReactNode; testId: string;
}) {
  const [local, setLocal] = useState(items);
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  useEffect(() => setLocal(items), [items]);

  const persist = useMutation({
    mutationFn: async (list: T[]) => {
      const { error } = await supabase.rpc(rpcName, {
        p_shop: shopId,
        p_ids: list.map((it) => it.id),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e) => { toast.error(humanError(e)); setLocal(items); },
  });

  return (
    <Reorder.Group axis="y" values={local} onReorder={setLocal} data-testid={testId} className="space-y-2">
      {local.map((it) => (
        <Reorder.Item key={it.id} value={it} onDragEnd={() => persist.mutate(local)} dragListener={!reduce && !persist.isPending ? undefined : false}
          className={cn('glass glass-3 !rounded-2xl flex items-center gap-3 p-3 sm:p-4', !it.sort_order && '')} style={{ boxShadow: 'none' }} data-testid={`${testId}-item-${it.id}`}>
          <GripVertical size={16} className="text-ink-lo shrink-0 cursor-grab active:cursor-grabbing" aria-hidden />
          <div className="flex-1 min-w-0">{render(it)}</div>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}
