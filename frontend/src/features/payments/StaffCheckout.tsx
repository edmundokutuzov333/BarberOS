import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useShop } from '@/lib/shop';
import { Panel } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { formatMT,fmt } from '@/lib/utils';
import { getStaffCheckout,operationalSimulatorEnabled,type CheckoutPurpose } from './operational-checkout-api';
import { OperationalCheckout } from './OperationalCheckout';
const purposeLabels={deposit:'Sinal',service:'Serviço',product:'Produtos',subscription:'Mensalidade'};
const states={pending:'Pendente',paid:'Pago (teste)',failed:'Falhado',refunded:'Reembolsado (teste)'};
export function StaffCheckout({productsOnly=false}:{productsOnly?:boolean}){
 const {shop,role}=useShop(),{user}=useAuth();
 const enabled=operationalSimulatorEnabled&&!!shop?.id&&!!user&&['owner','manager'].includes(role??'');
 const q=useQuery({queryKey:['qa-staff-checkout',shop?.id,user?.id],queryFn:()=>getStaffCheckout(shop!.id),enabled,retry:false,staleTime:0,refetchOnWindowFocus:'always'});
 if(!enabled||(!q.isPending&&!q.isError&&q.data?.enabled!==true))return null;
 const rows=q.data?.runs.filter(r=>productsOnly?r.purpose==='product':r.purpose!=='subscription')??[];
 return <div className="space-y-4" data-testid="qa-staff-checkout">
  <Panel className="space-y-3">
   <div className="flex flex-wrap justify-between gap-2"><div><p className="t-label text-accent-soft">TEST MODE · M-Pesa</p><h2 className="t-card">Recebimentos simulados</h2><p className="t-body text-ink-mid">Histórico QA desta barbearia. Não integra os recebimentos comerciais.</p></div><Button variant="secondary" disabled={q.isFetching} onClick={()=>void q.refetch()}>Actualizar testes</Button></div>
   {q.isPending?<p role="status">A carregar…</p>:q.isError?<p role="alert">Não foi possível carregar os recebimentos QA.</p>:!q.data?.enabled?<p>Laboratório desactivado.</p>:rows.length===0?<p className="t-body text-ink-mid">Ainda não existem recebimentos de teste nesta área.</p>:rows.map(r=><div key={r.id} className="rounded-xl border border-white/10 p-3 space-y-1"><div className="flex flex-wrap justify-between gap-2"><strong>{purposeLabels[r.purpose as CheckoutPurpose]} · {formatMT(r.amount_minor)}</strong><span>{states[r.status]}</span></div><p className="t-label text-ink-mid">{r.outcome==='LATE_SUCCESS'?'Reembolso necessário · sem liquidação':fmt(r.created_at,'dd/MM/yyyy HH:mm')}</p><p className="text-xs break-all">{r.reference}</p>{r.order_id&&<p className="text-xs">Pedido {r.order_id.slice(0,8).toUpperCase()}</p>}</div>)}
  </Panel>
  {!productsOnly&&q.data?.enabled&&<OperationalCheckout key={shop!.id+user!.id} scope={{shopId:shop!.id}} onChanged={()=>void q.refetch()}/>}
 </div>;
}
