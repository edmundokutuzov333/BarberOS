import {test,expect} from '@playwright/test';
import {createServer} from 'vite';
let server,origin;
test.beforeAll(async()=>{
  server=await createServer({root:process.cwd(),server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error',plugins:[{name:'simulator-auth-fixture',enforce:'pre',transform(_source,id){if(id.endsWith('/src/lib/auth.tsx'))return 'export const useAuth=()=>({user:{id:"11111111-1111-4111-8111-111111111111"}});';},configureServer(vite){vite.middlewares.use('/__payment-simulator',async(_req,res,next)=>{try{const html=await vite.transformIndexHtml('/__payment-simulator','<!doctype html><html lang="pt-MZ"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/payment-simulator-entry.tsx"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);}catch(error){next(error);}});}}]});
  await server.listen();origin='http://127.0.0.1:'+server.httpServer.address().port;
});
test.afterAll(async()=>{await server?.close();});
test('mobile timeout, idempotent retry, reconciliation, refund and history',async({page})=>{
  await page.setViewportSize({width:360,height:780});
  let run=null,failedCreate=false,requestIds=[],sequence=0;
  const shop='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',stamp='2026-11-24T10:00:00Z';
  await page.route('https://*.supabase.co/**',async route=>{
    const req=route.request(),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(!req.url().includes('/functions/v1/payment-simulator'))return route.abort();
    const {action,payload}=req.postDataJSON();let data;
    if(action==='availability')data={enabled:true};
    if(action==='list')data={shops:[{id:shop,name:'Barbearia teste'}],runs:run?[run]:[]};
    if(action==='create'){
      requestIds.push(payload.request_id);
      if(!run)run={id,shop_id:shop,purpose:payload.purpose,scenario:payload.scenario,amount_minor:payload.amount_minor,status:'pending',outcome:'REQUESTED',entitlement:'waiting',reference:'SIM-'+id,currency:'MZN',provider:'mpesa',real_money:false,created_at:stamp,updated_at:stamp,events:[{id:String(++sequence),type:'create',before:'none',after:'pending',outcome:'REQUESTED',created_at:stamp}]};
      if(!failedCreate){failedCreate=true;return route.fulfill({status:503,headers,contentType:'application/json',body:JSON.stringify({error:'SIM_UNAVAILABLE'})});}data=run;
    }
    if(['confirm','reconcile','refund','replay'].includes(action)){
      const before=run.status;
      if(action==='confirm')run={...run,outcome:'TIMEOUT'};
      if(action==='reconcile')run={...run,status:'paid',outcome:'RECONCILED',entitlement:'confirmed'};
      if(action==='refund')run={...run,status:'refunded',outcome:'REFUNDED',entitlement:'reversed'};
      run.events.push({id:String(++sequence),type:action,before,after:run.status,outcome:action==='replay'?'DUPLICATE_IGNORED':run.outcome,created_at:stamp});data=run;
    }
    return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify({ok:true,data})});
  });
  await page.goto(origin+'/__payment-simulator');
  await page.getByRole('button',{name:'Abrir laboratório'}).click();
  await page.getByLabel('Cenário').selectOption('timeout');
  await page.getByLabel('Valor fictício (MT)').fill('0');
  await expect(page.getByRole('button',{name:'Criar pedido de teste'})).toBeDisabled();
  await page.getByLabel('Valor fictício (MT)').fill('250,50');
  await page.getByRole('button',{name:'Criar pedido de teste'}).click();
  await page.getByRole('button',{name:'Repetir mesma operação'}).click();
  await expect(page.getByRole('heading',{name:/250,50 MT.*Pendente/})).toBeVisible();
  expect(requestIds).toHaveLength(2);expect(requestIds[0]).toBe(requestIds[1]);
  await page.getByRole('button',{name:'Simular resposta M-Pesa'}).click();
  await expect(page.getByText('Resultado: Tempo de resposta excedido')).toBeVisible();
  await page.getByRole('button',{name:'Reconciliar estado'}).click();
  await expect(page.getByRole('heading',{name:/Pago \(teste\)/})).toBeVisible();
  await page.getByRole('button',{name:'Simular reembolso'}).click();
  await expect(page.getByRole('heading',{name:/Reembolsado \(teste\)/})).toBeVisible();
  await page.getByRole('button',{name:'Repetir callback'}).click();
  await expect(page.getByText('Callback repetido',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
