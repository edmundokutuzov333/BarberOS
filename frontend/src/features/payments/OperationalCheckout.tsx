import { useRef,useState } from 'react';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/States';
import { useAuth } from '@/lib/auth';
import { formatMT } from '@/lib/utils';
import { scenarios,simulationError } from './simulator-api';
import { executeCheckout,getCheckout,type CheckoutScope,type CheckoutCommand,type CheckoutPurpose,type CheckoutRun,type CheckoutView } from './operational-checkout-api';
const labels={pending:'Pendente',paid:'Pago (teste)',failed:'Falhado',refunded:'Reembolsado (teste)'};
const outcome:Record<string,string>={REQUESTED:'A aguardar resposta',CONFIRMED:'Pagamento confirmado',PENDING:'Pendente',TIMEOUT:'Tempo de resposta excedido',RECONCILED:'Confirmado por reconciliação',LATE_SUCCESS:'Reembolso necessário — sem liquidação',REFUNDED:'Reembolso concluído',DUPLICATE_IGNORED:'Callback duplicado ignorado',INSUFFICIENT_FUNDS:'Saldo insuficiente',CANCELLED:'Cancelado',INVALID_NUMBER:'Número inválido',PROVIDER_ERROR:'Falha da operadora',PROVIDER_REJECTED:'Operadora rejeitou'};
export function OperationalCheckout({scope,onChanged}:{scope:CheckoutScope,onChanged?:()=>void}){
 const {user}=useAuth();
 const qc=useQueryClient(),key=['operational-payment-simulator','token' in scope?scope.token:scope.shopId,'token' in scope?'customer':user?.id];
 const q=useQuery({queryKey:key,queryFn:()=>getCheckout(scope),retry:false,staleTime:0,refetchOnWindowFocus:'always'});
 const [scenario,setScenario]=useState<keyof typeof scenarios>('success');
 const [selected,setSelected]=useState<string|null>(null),[retry,setRetry]=useState<CheckoutCommand|null>(null),[message,setMessage]=useState('');
 const locked=useRef(false);
 const mutation=useMutation({mutationFn:(command:CheckoutCommand)=>executeCheckout(scope,command),retry:false,onSuccess:r=>{
  setSelected(r.id);setRetry(null);setMessage('');qc.setQueryData<CheckoutView>(key,old=>old?{...old,runs:[r,...old.runs.filter(x=>x.id!==r.id)].slice(0,25)}:old);void qc.invalidateQueries({queryKey:key});if(r.purpose==='deposit'&&(r.status==='paid'||r.status==='refunded'))onChanged?.();
 },onError:(error,command)=>{setRetry(command);setMessage(error instanceof Error&&error.message==='SIM_NOT_DUE'?'Não existe saldo elegível para pagar. Actualiza o estado.':error instanceof Error&&error.message==='SIM_PENDING_EXISTS'?'Já existe um pagamento pendente. Continua o pedido existente.':simulationError(error));},onSettled:()=>{locked.current=false;}});
 function submit(command:CheckoutCommand){if(locked.current)return;locked.current=true;mutation.mutate(command);}
 function action(r:CheckoutRun,operation:'confirm'|'reconcile'|'refund'|'replay'){submit({operation,payload:{run_id:r.id,request_id:crypto.randomUUID()}});}
 function create(purpose:CheckoutPurpose){submit({operation:'create',payload:{purpose,scenario,request_id:crypto.randomUUID()}});}
 if(q.isPending)return <p className="t-label text-ink-mid" role="status">A verificar pagamentos de teste…</p>;
 if(q.isError)return <Panel><p role="alert">Não foi possível consultar o checkout de testes.</p><Button variant="secondary" onClick={()=>void q.refetch()}>Actualizar</Button></Panel>;
 if(!q.data?.enabled)return null;
 const busy=mutation.isPending||!!retry||q.isFetching;
 return <Panel className="space-y-4" testId="operational-checkout">
  <div><p className="t-label text-accent-soft">TEST MODE · M-Pesa</p><h2 className="t-card text-ink-hi">Pagamento de teste</h2><p className="t-body text-ink-mid">Sem dinheiro real. Os valores são calculados pelo servidor a partir desta operação QA.</p></div>
  <label className="block"><span className="t-label text-ink-mid">Cenário de teste</span><select className="field w-full mt-1" value={scenario} disabled={busy} onChange={e=>setScenario(e.target.value as keyof typeof scenarios)}>{Object.entries(scenarios).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  {q.data.quotes.map(quote=><div key={quote.purpose} className="flex flex-wrap justify-between items-center gap-2 border border-white/10 rounded-xl p-3"><div><p>{quote.label}</p>{quote.period&&<p className="t-label text-ink-mid">{quote.period.slice(0,7)}</p>}<p className="t-label text-ink-mid">{quote.amount_minor>0?formatMT(quote.amount_minor):'Sem valor elegível a pagar'}</p></div><Button disabled={busy||quote.amount_minor===0||q.data.runs.some(r=>r.purpose===quote.purpose&&r.status==='pending')} onClick={()=>create(quote.purpose)}>Pagar {quote.label.toLowerCase()}</Button></div>)}
  {message&&<div role="alert" className="space-y-2"><p>{message}</p>{retry&&<div className="flex flex-wrap gap-2"><Button disabled={mutation.isPending} onClick={()=>submit(retry)}>Repetir pedido</Button><Button variant="secondary" disabled={mutation.isPending} onClick={()=>{setRetry(null);setMessage('');void q.refetch();}}>Actualizar estado</Button></div>}</div>}
  <h3 className="t-card">Histórico de pagamentos de teste</h3>
  {q.data.runs.length===0&&<p className="t-body text-ink-mid">Ainda não existem pedidos.</p>}
  {q.data.runs.map(r=><section key={r.id} className="rounded-xl border border-white/10 p-3 space-y-2">
   <button type="button" className="w-full text-left" aria-expanded={selected===r.id} onClick={()=>setSelected(selected===r.id?null:r.id)}><strong>{formatMT(r.amount_minor)} · {labels[r.status]}</strong><p className="t-label text-ink-mid break-all">{r.purpose} · {outcome[r.outcome]??r.outcome}</p></button>
   {(selected===r.id||r.status==='pending')&&<><p className="text-xs break-all">{r.reference}</p><div className="flex flex-wrap gap-2">{r.status==='pending'&&<Button disabled={busy} onClick={()=>action(r,r.outcome==='REQUESTED'?'confirm':'reconcile')}>{r.outcome==='REQUESTED'?'Simular resposta M-Pesa':'Reconciliar'}</Button>}{r.status==='paid'&&<Button variant="secondary" disabled={busy} onClick={()=>action(r,'refund')}>Simular reembolso</Button>}{r.status!=='pending'&&<Button variant="secondary" disabled={busy} onClick={()=>action(r,'replay')}>Repetir callback</Button>}</div><ol className="text-xs space-y-1">{r.events.map((event,i)=><li key={i}>{event.action} · {outcome[event.outcome]??event.outcome}</li>)}</ol></>}
  </section>)}
 </Panel>;
}
