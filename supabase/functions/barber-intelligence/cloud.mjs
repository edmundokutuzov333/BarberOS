// Pure orchestration. Every outbound attempt must be authorized by the quota ledger.
const transient=new Set(['timeout','transport','provider_error','invalid_response']);
const state=(status,advice=null,reason=null,retryAfter=null)=>({status,advice,reason,retryAfter});
export const idleCloud=enabled=>enabled?state('available'):state('disabled',null,'configuration');
export async function consultCloud({enabled,requested,reserve,request,sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),observe=(_reason,_attempt)=>{}}){
 if(!enabled||!requested)return idleCloud(enabled);
 let result=idleCloud(true);
 for(let attempt=0;attempt<2;attempt++){
  let quota;
  try{quota=await reserve()}catch{observe('quota_service',attempt+1);return state('unavailable',null,'quota_service')}
  if(quota?.allowed!==true)return state('quota',null,'internal_quota',Number.isFinite(quota?.retryAfter)?Math.max(0,quota.retryAfter):null);
  const response=await request();
  if(typeof response.advice==='string'&&response.advice.trim())return state('generated',response.advice);
  const reason=response.reason??'invalid_response';
  const after=Number.isFinite(response.retryAfter)&&response.retryAfter>0?Math.ceil(response.retryAfter):null;
  result=state(reason==='provider_quota'?'quota':'unavailable',null,reason,after);
  observe(reason,attempt+1);
  if(attempt===1)break;
  // A provider 429 with an explicit short retry interval is recoverable.
  // Missing/long intervals and auth/cost errors are never retried.
  if(reason==='provider_quota'){
   if(after===null||after>5)break;
   await sleep(after*1000+250);
  }else if(transient.has(reason))await sleep(250);
  else break;
 }
 return result;
}
