import { useEffect, useState } from 'react';
import { CheckCircle2, Edit3, RefreshCw, Save, XCircle } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { formatMT, humanError } from '@/lib/utils';
import { useAdminPlans, useUpdateAdminPlan, type AdminPlan } from '@/features/admin/api';
import { FeatureToggle } from '@/features/admin/AdminComponents';

export default function AdminPlanos(){
  const q=useAdminPlans(); const mutation=useUpdateAdminPlan(); const [selected,setSelected]=useState<AdminPlan|null>(null);
  useEffect(()=>{if(!selected&&q.data?.[0])setSelected(q.data[0]);},[q.data,selected]);
  const save=async()=>{if(!selected)return;await mutation.mutateAsync({id:selected.id,name:selected.name,priceCents:selected.price_cents,maxBarbers:selected.max_barbers,features:(selected.features||{}) as Record<string,unknown>,isActive:selected.is_active});setSelected(null);};
  return <Page title="Planos" subtitle="Configuração comercial dos planos do BarberOS." actions={<Button variant="secondary" size="sm" onClick={()=>void q.refetch()} disabled={q.isFetching}><RefreshCw size={14} className={q.isFetching?'animate-spin':''}/>Actualizar</Button>}>
    {q.isLoading?<Skeleton className="h-72"/>:q.error?<ErrorState message={humanError(q.error)} onRetry={()=>void q.refetch()}/>:q.data?.length===0?<EmptyState title="Ainda não existem planos."/>:
    <div className="grid xl:grid-cols-[1fr_420px] gap-3">
      <Panel className="p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-white/10 t-label text-ink-lo text-left"><th className="px-5 py-3">Plano</th><th className="px-5 py-3">Preço</th><th className="px-5 py-3">Barbeiros</th><th className="px-5 py-3">Lojas</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3"></th></tr></thead><tbody>{q.data?.map(p=><tr key={p.id} className="border-b border-white/5 last:border-0"><td className="px-5 py-4"><p className="text-ink-hi">{p.name}</p><p className="t-label text-ink-lo">{p.code}</p></td><td className="px-5 py-4 text-ink-hi">{formatMT(p.price_cents)}</td><td className="px-5 py-4">{p.max_barbers}</td><td className="px-5 py-4">{p.assigned_shops}</td><td className="px-5 py-4">{p.is_active?<span className="inline-flex items-center gap-1.5 text-st-completed t-label"><CheckCircle2 size={14}/>Activo</span>:<span className="inline-flex items-center gap-1.5 text-ink-lo t-label"><XCircle size={14}/>Inactivo</span>}</td><td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" onClick={()=>setSelected({...p})}><Edit3 size={14}/>Editar</Button></td></tr>)}</tbody></table></div></Panel>
      <Panel title={selected?'Editar '+selected.name:'Seleccione um plano'}>
        {selected?<div className="space-y-4">
          <label className="block"><span className="t-label text-ink-mid">Nome</span><input className="field w-full mt-1.5" value={selected.name} onChange={e=>setSelected({...selected,name:e.target.value})}/></label>
          <div className="grid grid-cols-2 gap-3"><label className="block"><span className="t-label text-ink-mid">Preço (MT)</span><input className="field w-full mt-1.5" type="number" min="0" step="50" value={selected.price_cents/100} onChange={e=>setSelected({...selected,price_cents:Math.round(Number(e.target.value||0)*100)})}/></label><label className="block"><span className="t-label text-ink-mid">Máx. barbeiros</span><input className="field w-full mt-1.5" type="number" min="1" max="1000" value={selected.max_barbers} onChange={e=>setSelected({...selected,max_barbers:Math.round(Number(e.target.value||1))})}/></label></div>
          <div className="space-y-2"><p className="t-label text-ink-mid">Funcionalidades</p>{['deposits','whatsapp','multi_location'].map(k=><FeatureToggle key={k} label={k==='deposits'?'Sinais':k==='whatsapp'?'WhatsApp':'Multi-localização'} checked={Boolean((selected.features as Record<string,unknown>)?.[k])} onChange={value=>setSelected({...selected,features:{...(selected.features as Record<string,unknown>),[k]:value}})}/>)}</div>
          <FeatureToggle label="Plano activo" checked={selected.is_active} onChange={value=>setSelected({...selected,is_active:value})}/>
          <div className="flex gap-2"><Button onClick={()=>void save()} loading={mutation.isPending}><Save size={14}/>Guardar</Button><Button variant="secondary" onClick={()=>setSelected(null)}>Cancelar</Button></div>
          {mutation.error&&<ErrorState message={humanError(mutation.error)}/>}
        </div>:<EmptyState title="Nenhum plano seleccionado."/>}
      </Panel>
    </div>}
  </Page>
}