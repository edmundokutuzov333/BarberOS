import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/States';
import { fmt, formatMT } from '@/lib/utils';
import { amountToMinor, executeSimulation, listSimulations, purposes, scenarios, simulationError, simulatorAvailability, type Action, type Command, type Purpose, type Run, type Scenario } from './simulator-api';

const states={pending:'Pendente',paid:'Pago (teste)',failed:'Falhado',refunded:'Reembolsado (teste)'};
const entitlements={waiting:'A aguardar',confirmed:'Confirmado (simulado)',rejected:'Rejeitado',refund_required:'Reembolso necessário — sem confirmação',reversed:'Revertido'};
const eventLabels={create:'Pedido criado',confirm:'Resposta do simulador',reconcile:'Reconciliação',refund:'Reembolso',replay:'Callback repetido'};
const outcomeLabels:Record<string,string>={REQUESTED:'Pedido criado',CONFIRMED:'Confirmação recebida',INSUFFICIENT_FUNDS:'Saldo insuficiente',CANCELLED:'Cancelado pelo cliente',INVALID_NUMBER:'Número inválido',PENDING:'A aguardar confirmação',TIMEOUT:'Tempo de resposta excedido',PROVIDER_ERROR:'Falha de comunicação',PROVIDER_REJECTED:'Operadora rejeitou a cobrança',RECONCILED:'Confirmado por reconciliação',LATE_SUCCESS:'Confirmação após expiração',REFUNDED:'Reembolso concluído',DUPLICATE_IGNORED:'Evento duplicado ignorado'};
export default function PaymentSimulator(){
  const [open,setOpen]=useState(false);
  return <Panel className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><FlaskConical size={18}/><h2 className="t-card text-ink-hi">BarberOS Payment Simulator</h2></div><p className="t-body text-ink-mid mt-1">Laboratório M-Pesa · sem dinheiro real · separado dos pagamentos operacionais</p></div>
      <Button variant="secondary" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'Fechar laboratório':'Abrir laboratório'}</Button>
    </div>
    {open&&<SimulatorWorkspace/>}
  </Panel>;
}
function SimulatorWorkspace(){
  const qc=useQueryClient();
  const availability=useQuery({queryKey:['payment-simulator','availability'],queryFn:simulatorAvailability,retry:false});
  const history=useQuery({queryKey:['payment-simulator','list'],queryFn:listSimulations,enabled:availability.data?.enabled===true,retry:false});
  const [shop,setShop]=useState('');
  const [purpose,setPurpose]=useState<Purpose>('deposit');
  const [scenario,setScenario]=useState<Scenario>('success');
  const [amount,setAmount]=useState('250');
  const [selected,setSelected]=useState<string|null>(null);
  const [latest,setLatest]=useState<Run|null>(null);
  const [message,setMessage]=useState('');
  const [retryCommand,setRetryCommand]=useState<Command|null>(null);
  const locked=useRef(false);
  const mutate=useMutation({mutationFn:executeSimulation,retry:false,
    onSuccess:(run)=>{setSelected(run.id);setLatest(run);setRetryCommand(null);setMessage('');qc.setQueryData<Awaited<ReturnType<typeof listSimulations>>>(['payment-simulator','list'],old=>old?{...old,runs:[run,...old.runs.filter(x=>x.id!==run.id)].slice(0,25)}:old);void qc.invalidateQueries({queryKey:['payment-simulator','list']});},
    onError:(error,command)=>{setMessage(simulationError(error));setRetryCommand(command);},
    onSettled:()=>{locked.current=false;},
  });
  const run=latest?.id===selected?latest:history.data?.runs.find(r=>r.id===selected);
  const shopId=shop||history.data?.shops[0]?.id||'';
  const minor=amountToMinor(amount);
  const busy=mutate.isPending;
  const submit=(command:Command)=>{if(locked.current)return;locked.current=true;setMessage('');mutate.mutate(command);};
  const action=(a:Action)=>{if(run)submit({action:a,payload:{run_id:run.id,request_id:crypto.randomUUID()}});};
  if(availability.isPending)return <p role="status">A verificar o ambiente de testes…</p>;
  if(availability.isError)return <div role="alert" className="space-y-2"><p>{simulationError(availability.error)}</p><Button variant="secondary" onClick={()=>void availability.refetch()}>Tentar novamente</Button></div>;
  if(!availability.data?.enabled)return <p role="status">Laboratório desactivado neste ambiente.</p>;
  if(history.isPending)return <p role="status">A carregar simulações…</p>;
  if(history.isError)return <div role="alert"><p>{simulationError(history.error)}</p><Button variant="secondary" onClick={()=>void history.refetch()}>Actualizar</Button></div>;
  return <div className="space-y-5" data-testid="payment-simulator">
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-ink-hi"><strong>TEST MODE · MZN</strong><p className="mt-1">Não envia pedidos ao M-Pesa, não altera marcações, stock, vendas nem subscrições reais. Os resultados são registados exclusivamente no ledger de testes.</p></div>
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(minor!==null&&shopId&&!retryCommand)submit({action:'create',payload:{request_id:crypto.randomUUID(),shop_id:shopId,purpose,scenario,amount_minor:minor}});}}>
      <label className="min-w-0 space-y-1"><span className="t-label text-ink-mid">Barbearia de referência</span><select className="field w-full" value={shopId} disabled={busy||!!retryCommand} onChange={e=>setShop(e.target.value)}>{history.data?.shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="min-w-0 space-y-1"><span className="t-label text-ink-mid">Tipo de cobrança</span><select className="field w-full" value={purpose} disabled={busy||!!retryCommand} onChange={e=>setPurpose(e.target.value as Purpose)}>{Object.entries(purposes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className="min-w-0 space-y-1"><span className="t-label text-ink-mid">Valor fictício (MT)</span><input className="field w-full" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy||!!retryCommand} aria-invalid={minor===null}/>{minor===null&&<span className="text-xs text-ink-mid">De 0,01 a 25.000 MT, até duas casas decimais.</span>}</label>
      <label className="min-w-0 space-y-1"><span className="t-label text-ink-mid">Cenário</span><select className="field w-full" value={scenario} disabled={busy||!!retryCommand} onChange={e=>setScenario(e.target.value as Scenario)}>{Object.entries(scenarios).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy||!!retryCommand||minor===null||!shopId} loading={busy&&mutate.variables?.action==='create'}>Criar pedido de teste</Button></div>
    </form>
    {message&&<div role="alert" className="rounded-xl border border-white/10 p-3 space-y-2"><p>{message}</p>{retryCommand&&<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={()=>submit(retryCommand)}>Repetir mesma operação</Button><Button variant="secondary" disabled={busy} onClick={()=>{setRetryCommand(null);setMessage('');setLatest(null);void history.refetch();}}>Descartar e actualizar histórico</Button></div>}</div>}
    {run&&<section className="rounded-xl border border-white/10 p-4 space-y-4" aria-label="Resultado da simulação" aria-live="polite">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="t-label text-ink-mid">M-Pesa simulado</p><h3 className="t-card text-ink-hi">{formatMT(run.amount_minor)} · {states[run.status]}</h3></div><span className="t-label text-ink-mid">SEM DINHEIRO REAL</span></div>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><p className="break-all">Ref: {run.reference}</p><p>{purposes[run.purpose]} · {scenarios[run.scenario]}</p><p>Resultado: {outcomeLabels[run.outcome]??run.outcome}</p><p>Estado do serviço: {entitlements[run.entitlement]}</p></div>
      <div className="flex flex-wrap gap-2">
        {run.status==='pending'&&run.outcome==='REQUESTED'&&<Button disabled={busy||!!retryCommand} onClick={()=>action('confirm')}>Simular resposta M-Pesa</Button>}
        {run.status==='pending'&&run.outcome!=='REQUESTED'&&<Button disabled={busy||!!retryCommand} onClick={()=>action('reconcile')}>Reconciliar estado</Button>}
        {run.status==='paid'&&<Button variant="secondary" disabled={busy||!!retryCommand} onClick={()=>action('refund')}>Simular reembolso</Button>}
        {run.status!=='pending'&&<Button variant="secondary" disabled={busy||!!retryCommand} onClick={()=>action('replay')}>Repetir callback</Button>}
      </div>
      <h4 className="t-label text-ink-mid">Linha temporal de eventos</h4>
      <ol className="space-y-2">{run.events.map(e=><li key={e.id} className="border-l-2 border-white/15 pl-3 text-sm"><strong>{eventLabels[e.type]}</strong> · {outcomeLabels[e.outcome]??e.outcome}<p className="text-xs text-ink-mid">{e.before==='none'?'Novo':states[e.before]} → {states[e.after]} · {fmt(e.created_at,'dd MMM yyyy, HH:mm:ss')}</p></li>)}</ol>
    </section>}
    <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="t-card text-ink-hi">Últimas 25 simulações</h3><Button variant="secondary" disabled={busy||history.isFetching} onClick={()=>{setLatest(null);void history.refetch();}}>Actualizar</Button></div>
      {!history.data?.runs.length?<p className="t-body text-ink-mid">Ainda não existem simulações.</p>:<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{history.data.runs.map(r=><button key={r.id} type="button" aria-pressed={selected===r.id} disabled={busy||!!retryCommand} onClick={()=>{setLatest(null);setSelected(r.id);}} className="min-w-0 rounded-xl border border-white/10 p-3 text-left hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><span className="block font-medium">{purposes[r.purpose]} · {formatMT(r.amount_minor)}</span><span className="block text-xs text-ink-mid">{states[r.status]} · {scenarios[r.scenario]}</span><span className="block text-xs text-ink-mid break-all">{history.data?.shops.find(s=>s.id===r.shop_id)?.name??'Barbearia'} · {fmt(r.created_at,'dd MMM yyyy, HH:mm')}</span></button>)}</div>}
    </div>
  </div>;
}
