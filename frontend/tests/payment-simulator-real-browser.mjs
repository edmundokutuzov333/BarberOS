// Called exclusively by test-payment-simulator-http.mjs in the disposable CI stack.
// Actual production build, real auth and real Edge requests: no routes mocked.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
import {chromium,devices,expect} from '@playwright/test';

const root=fileURLToPath(new URL('../',import.meta.url));
const origin='http://127.0.0.1:4173';
export async function certifyPaymentBrowser({apiUrl,anonKey,actor,nonadmin,shop,readRun}){
  assert.match(process.env.BARBEROS_LOCAL_PROJECT_ID??'',/^barberos_ci_[0-9]+_[0-9]+$/);
  assert.equal(new URL(apiUrl).hostname,'127.0.0.1');
  // Browser receives only the local anon key. Credentials are ephemeral fixtures.
  const env={...process.env,VITE_SUPABASE_URL:apiUrl,VITE_SUPABASE_PUBLISHABLE_KEY:anonKey,VITE_PAYMENT_SIMULATOR_ENABLED:'true'};
  execFileSync('corepack',['yarn','build'],{cwd:root,env,stdio:'inherit',timeout:180000});
  const server=await preview({root,preview:{host:'127.0.0.1',port:4173,strictPort:true}});
  let browser;
  try{
    browser=await chromium.launch();
    async function signIn(page,user){
      await page.goto(origin+'/admin/pagamentos');
      await expect(page.getByTestId('login-page')).toBeVisible({timeout:20000});
      await page.getByTestId('login-email-input').fill(user.email);
      await page.getByTestId('login-password-input').fill(user.password);
      await page.getByTestId('login-submit-btn').click();
    }
    const restricted=await browser.newContext({serviceWorkers:'block'});
    try{
      const page=await restricted.newPage();
      await signIn(page,nonadmin);
      await expect(page.getByTestId('platform-admin-access-denied')).toBeVisible({timeout:20000});
      await expect(page.getByRole('button',{name:'Abrir laboratório'})).toHaveCount(0);
    }finally{await restricted.close();}
    for(const device of ['desktop','mobile']){
      const options=device==='mobile'?{...devices['Pixel 7'],viewport:{width:360,height:780}}:{viewport:{width:1440,height:900}};
      const ctx=await browser.newContext({...options,serviceWorkers:'block'});
      try{
        const page=await ctx.newPage();
        const errors=[];
        const statuses=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('response',r=>{if(r.url().endsWith('/functions/v1/payment-simulator')&&r.request().method()==='POST')statuses.push(r.status());});
        await signIn(page,actor);
        await expect(page.getByRole('button',{name:'Abrir laboratório'})).toBeVisible({timeout:20000});
        await page.getByRole('button',{name:'Abrir laboratório'}).click();
        const lab=page.getByTestId('payment-simulator');
        await expect(lab).toBeVisible({timeout:20000});
        await lab.getByLabel('Barbearia de referência').selectOption(shop);
        await lab.getByLabel('Tipo de cobrança').selectOption(device==='mobile'?'product':'service');
        await lab.getByLabel('Cenário').selectOption(device==='mobile'?'timeout':'duplicate_callback');
        await lab.getByLabel('Valor fictício (MT)').fill('123,45');
        await lab.getByRole('button',{name:'Criar pedido de teste'}).click();
        const result=lab.getByRole('region',{name:'Resultado da simulação'});
        await expect(result.getByRole('heading',{name:/123,45 MT.*Pendente/})).toBeVisible({timeout:20000});
        const reference=(await result.getByText(/^Ref: SIM-/).textContent()).replace('Ref: SIM-','');
        await result.getByRole('button',{name:'Simular resposta M-Pesa'}).click();
        if(device==='mobile'){
          await expect(result.getByText('Resultado: Tempo de resposta excedido')).toBeVisible({timeout:20000});
          await result.getByRole('button',{name:'Reconciliar estado'}).click();
        }
        await expect(result.getByRole('heading',{name:/Pago \(teste\)/})).toBeVisible({timeout:20000});
        const paid=readRun(reference);
        assert.equal(paid.status,'paid');
        assert.equal(paid.amount_minor,12345);
        assert.equal(paid.purpose,device==='mobile'?'product':'service');
        assert.equal(paid.event_count,3);
        // Reload proves durable database history, not client-only state.
        await page.reload();
        await page.getByRole('button',{name:'Abrir laboratório'}).click();
        const title=device==='mobile'?'Produto da loja':'Serviço';
        await lab.getByRole('button',{name:new RegExp(title+' · 123,45 MT')}).click();
        await expect(result.getByRole('heading',{name:/Pago \(teste\)/})).toBeVisible({timeout:20000});
        await result.getByRole('button',{name:'Simular reembolso'}).click();
        await expect(result.getByRole('heading',{name:/Reembolsado \(teste\)/})).toBeVisible({timeout:20000});
        const repeats=result.getByText('Callback repetido',{exact:true});
        const previousRepeats=await repeats.count();
        await result.getByRole('button',{name:'Repetir callback'}).click();
        await expect(repeats).toHaveCount(previousRepeats+1,{timeout:20000});
        const refunded=readRun(reference);
        assert.equal(refunded.status,'refunded');
        assert.equal(refunded.entitlement,'reversed');
        assert.equal(refunded.event_count,5);
        assert.ok(statuses.length>=7 && statuses.every(x=>x===200),'Unexpected HTTP status in browser: '+statuses.join(','));
        assert.deepEqual(errors,[]);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Horizontal overflow: '+device);
        await page.getByTestId('admin-sign-out').click();
        await expect(page.getByTestId('login-page')).toBeVisible({timeout:20000});
        console.log('PASS | real browser '+device+': login, actual admin route, M-Pesa simulator Edge, PostgreSQL, reload, refund, replay, logout');
      }finally{await ctx.close();}
    }
  }finally{
    await browser?.close();
    await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));
  }
}
