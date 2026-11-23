import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';

// The real page, shared controls, query hooks and HTTP client run in a browser.
// Only the tenant context and external HTTP boundary are replaced. No real mail
// or production credentials are used by this regression suite.
let server;
let origin;
test.beforeAll(async () => {
  server = await createServer({
    root: process.cwd(),
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    logLevel: 'error',
    plugins: [{
      name: 'gmail-test-context', enforce: 'pre',
      transform(_source, id) {
        if (id.endsWith('/src/lib/shop.tsx')) return `
          import {useState,useEffect} from 'react';
          const first={id:'11111111-1111-4111-8111-111111111111',name:'Barbearia de teste'};
          const second={id:'22222222-2222-4222-8222-222222222222',name:'Outra barbearia'};
          const shops=[{barbershops:first},{barbershops:second}];
          const setShopId=()=>{};
          export const useShop=()=>{
            const [shop,setShop]=useState(first);
            useEffect(()=>{window.__gmailSetShop=()=>setShop(second);return()=>{delete window.__gmailSetShop;};},[]);
            return {shop,shops,setShopId};
          };
        `;
      },
      configureServer(vite) {
        vite.middlewares.use('/__gmail-test', async (_req, res, next) => {
          try {
            const html=await vite.transformIndexHtml('/__gmail-test', '<!doctype html><html lang="pt-MZ"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gmail regression fixture</title></head><body><div id="root"></div><script type="module" src="/tests/fixtures/gmail-entry.tsx"></script></body></html>');
            res.setHeader('Content-Type','text/html'); res.end(html);
          } catch(error) { next(error); }
        });
      },
    }],
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
});
test.afterAll(async () => { await server?.close(); });

async function fixture(page) {
  const state = { connected: true, sends: [], disconnects: 0, accountBlocked: false, failSend: false, failDisconnect: false, revocationConfirmed: true, delaySend: false, releaseSend: null };
  const message = (id, body) => ({ id, from:'owner@example.com', to:'owner@example.com', cc:'', subject:id==='old'?'Conversa anterior':id==='other'?'Outra barbearia':'Nova conversa', date:'2026-11-23T18:00:00Z', body, message_id:`<${id}@example.com>`, references:'' });
  await page.route('https://*.supabase.co/**', async route => {
    const req=route.request();
    if (req.method()==='OPTIONS') return route.fulfill({ status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'} });
    if (!req.url().includes('/functions/v1/gmail-integration')) return route.abort();
    const body=req.postDataJSON(); let result={ok:true}; let status=200;
    if(body.action==='status') result={ok:true,configured:true,connection:{connected:state.connected,email:body.shop_id.startsWith('2222')?'second-owner@example.com':'owner@example.com'}};
    if(body.action==='list') result={ok:true,threads:body.search==='vazio'?[]:[{id:body.shop_id.startsWith('2222')?'other':'old',subject:body.shop_id.startsWith('2222')?'Outra barbearia':'Conversa anterior',from:'Client <client@example.com>',to:'owner@example.com',snippet:'Mensagem de teste',date:'2026-11-23T18:00:00Z',unread:false,message_count:1}]};
    if(body.action==='thread') result={ok:true,thread:{id:body.thread_id,messages:[message(body.thread_id,'Conteúdo controlado.')]}};
    if(body.action==='send') {
      state.sends.push(body);
      if(state.delaySend) await new Promise(resolve=>{state.releaseSend=resolve;});
      if(state.failSend) { status=502; result={ok:false,error:'GMAIL_PROVIDER_REQUEST_FAILED'}; }
      else result={ok:true,message_id:'sent-message',thread_id:body.thread_id??'new'};
    }
    if(body.action==='disconnect') {
      state.disconnects++;
      if(state.failDisconnect) {status=502;result={ok:false,error:'GMAIL_PROVIDER_REQUEST_FAILED'};}
      else {state.connected=false;result={ok:true,disconnected:true,revocation_confirmed:state.revocationConfirmed};}
    }
    if(state.accountBlocked) {status=403;result={ok:false,error:'PASSWORD_CHANGE_REQUIRED'};}
    return route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
  });
  await page.goto(origin+'/__gmail-test');
  await expect(page.getByText('Gmail ligado',{exact:true})).toBeVisible();
  return state;
}

test('new conversation stays selected outside the inbox search and clearing returns focus',async({page})=>{
  const state=await fixture(page);
  await page.getByLabel('Pesquisar mensagens').fill('cliente');
  await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
  await page.getByRole('button',{name:'Nova mensagem',exact:true}).click();
  await page.getByLabel('Destinatário',{exact:true}).fill('owner@example.com');
  await page.getByLabel('Assunto',{exact:true}).fill('Nova conversa');
  await page.getByLabel('Mensagem',{exact:true}).fill('Mensagem de regressão.');
  await page.getByRole('button',{name:'Enviar email',exact:true}).click();
  await expect(page.getByTestId('gmail-thread').getByRole('heading',{name:'Nova conversa'})).toBeVisible();
  await page.getByRole('button',{name:'Actualizar caixa de entrada'}).click();
  await expect(page.getByTestId('gmail-thread').getByRole('heading',{name:'Nova conversa'})).toBeVisible();
  expect(state.sends).toHaveLength(1);
  await page.getByRole('button',{name:'Limpar pesquisa'}).click();
  await expect(page.getByLabel('Pesquisar mensagens')).toHaveValue('');
  await expect(page.getByLabel('Pesquisar mensagens')).toBeFocused();
  await expect(page.getByTestId('gmail-thread').getByRole('heading',{name:'Conversa anterior'})).toBeVisible();
});

test('validation focuses invalid fields and provider failure preserves the draft',async({page})=>{
  const state=await fixture(page);
  await page.getByRole('button',{name:'Nova mensagem',exact:true}).click();
  await page.getByRole('button',{name:'Enviar email',exact:true}).click();
  await expect(page.getByLabel('Destinatário',{exact:true})).toBeFocused();
  await expect(page.getByLabel('Destinatário',{exact:true})).toHaveAttribute('aria-invalid','true');
  await expect(page.getByText('Escreva a mensagem.',{exact:true})).toBeVisible();
  expect(state.sends).toHaveLength(0);
  await page.getByLabel('Destinatário',{exact:true}).fill('owner@example.com');
  await page.getByLabel('Assunto',{exact:true}).fill('Assunto preservado');
  await page.getByLabel('Mensagem',{exact:true}).fill('Conteúdo preservado.');
  state.failSend=true;
  await page.getByRole('button',{name:'Enviar email',exact:true}).click();
  await expect(page.getByText(/O Gmail não conseguiu concluir/)).toBeVisible();
  await expect(page.getByLabel('Mensagem',{exact:true})).toHaveValue('Conteúdo preservado.');
  state.failSend=false;
  await page.getByRole('button',{name:'Enviar email',exact:true}).click();
  await expect(page.getByTestId('gmail-thread').getByRole('heading',{name:'Nova conversa'})).toBeVisible();
  expect(state.sends).toHaveLength(2);
});

test('disconnect requires accessible confirmation and retains recovery on failure',async({page})=>{
  const state=await fixture(page);
  await page.getByTestId('gmail-disconnect').click();
  const dialog=page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('gmail-disconnect')).toBeFocused();
  expect(state.disconnects).toBe(0);
  await page.getByTestId('gmail-disconnect').click();
  state.failDisconnect=true;
  await dialog.getByRole('button',{name:'Desligar conta',exact:true}).click();
  await expect(page.getByText(/O Gmail não conseguiu concluir/)).toBeVisible();
  await expect(dialog).toBeVisible();
  state.failDisconnect=false;
  await dialog.getByRole('button',{name:'Desligar conta',exact:true}).click();
  await expect(page.getByTestId('gmail-connect')).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(state.disconnects).toBe(2);
});

test('controlled inbox and dialog have no serious accessibility violations or viewport overflow',async({page},testInfo)=>{
  await fixture(page);
  await expect(page.getByTestId('gmail-thread').locator('article')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const audit=async()=>{
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  };
  await audit();
  await page.screenshot({path:testInfo.outputPath('gmail-inbox.png'),fullPage:true});
  await page.getByTestId('gmail-disconnect').click();
  await expect.poll(()=>page.getByRole('alertdialog').evaluate(el=>{
    const r=el.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1;
  })).toBe(true);
  await audit();
  await page.screenshot({path:testInfo.outputPath('gmail-disconnect.png')});
});


test('an old send completion cannot replace the newly selected tenant conversation',async({page})=>{
  const state=await fixture(page);
  await page.getByRole('button',{name:'Nova mensagem',exact:true}).click();
  await page.getByLabel('Destinatário',{exact:true}).fill('owner@example.com');
  await page.getByLabel('Assunto',{exact:true}).fill('Envio lento');
  await page.getByLabel('Mensagem',{exact:true}).fill('Conversa da primeira barbearia.');
  state.delaySend=true;
  await page.getByRole('button',{name:'Enviar email',exact:true}).click();
  await expect.poll(()=>state.releaseSend!==null).toBe(true);
  await expect(page.getByRole('button',{name:'Enviar email',exact:true})).toBeDisabled();
  await page.evaluate(()=>window.__gmailSetShop());
  await expect(page.getByTestId('gmail-thread').getByRole('heading',{name:'Outra barbearia'})).toBeVisible();
  const completed=page.waitForResponse(response=>response.url().includes('/gmail-integration')&&response.request().postDataJSON()?.action==='send');
  state.releaseSend();
  await completed;
  await expect(page.getByTestId('gmail-thread').getByRole('heading',{name:'Outra barbearia'})).toBeVisible();
  await expect(page.getByTestId('gmail-thread').getByRole('heading',{name:'Nova conversa'})).toHaveCount(0);
  expect(state.sends).toHaveLength(1);
  await page.getByRole('button',{name:'Nova mensagem',exact:true}).click();
  await expect(page.getByLabel('Destinatário',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Assunto',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Mensagem',{exact:true})).toHaveValue('');
});

test('no-results search offers clear recovery without displaying the previous conversation',async({page})=>{
  await fixture(page);
  await page.getByLabel('Pesquisar mensagens').fill('vazio');
  await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
  await expect(page.getByText('Não foram encontradas conversas para esta pesquisa.')).toBeVisible();
  await expect(page.getByTestId('gmail-thread').locator('article')).toHaveCount(0);
  await page.getByRole('button',{name:'Limpar pesquisa'}).click();
  await expect(page.getByTestId('gmail-thread').locator('article')).toHaveCount(1);
});


test('the shared glass modal stays fixed within the viewport with long content',async({page})=>{
  await fixture(page);
  await page.getByRole('button',{name:'Abrir diálogo de teste',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Edição de teste'});
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS('position','fixed');
  await expect.poll(()=>modal.evaluate(el=>{
    const r=el.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1;
  })).toBe(true);
  await modal.getByRole('button',{name:'Concluir edição de teste'}).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Abrir diálogo de teste',exact:true})).toBeFocused();
});


test('unconfirmed provider revocation removes local access and shows honest recovery',async({page})=>{
  const state=await fixture(page);
  state.revocationConfirmed=false;
  await page.getByTestId('gmail-disconnect').click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Desligar conta',exact:true}).click();
  await expect(page.getByTestId('gmail-connect')).toBeVisible();
  await expect(page.getByRole('link',{name:'Reveja o acesso nas definições da conta Google.'})).toHaveAttribute('href','https://myaccount.google.com/permissions');
  expect(state.disconnects).toBe(1);
});


test('an account blocked by password rotation hides mail and offers real recovery navigation',async({page})=>{
  const state=await fixture(page);
  await expect(page.getByTestId('gmail-thread').locator('article')).toHaveCount(1);
  state.accountBlocked=true;
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(page.getByTestId('gmail-password-recovery')).toBeVisible();
  await expect(page.getByTestId('gmail-inbox')).toHaveCount(0);
  await expect(page.getByTestId('gmail-thread')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Definir nova palavra-passe'})).toHaveAttribute('href','/alterar-palavra-passe');
});
