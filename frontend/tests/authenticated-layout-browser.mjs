// Real authenticated UI acceptance using only disposable local Supabase fixtures.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {expect} from '@playwright/test';

const widths=[1440,1280,768,390,360];
const output=fileURLToPath(new URL('./test-results/authenticated-layout/',import.meta.url));
const settings=['perfil','pagina','regras','sinal','pagamentos','utilizadores','link'];
const ownerRoutes=[
 '/app','/app/onboarding','/app/agenda','/app/marcacoes','/app/clientes',
 '/app/lista-espera','/app/notificacoes','/app/comunicacoes','/app/pagamentos',
 '/app/avaliacoes','/app/relatorios','/app/servicos','/app/cortes','/app/barbeiros',
 '/app/horarios','/app/loja/produtos','/app/loja/pedidos','/app/loja/relatorios',
 '/app/loja/piloto','/app/loja/pagamentos',...settings.map(s=>'/app/definicoes/'+s),
];
const adminRoutes=['/admin','/admin/barbearias','/admin/utilizadores','/admin/planos','/admin/pagamentos','/admin/suporte','/admin/metricas'];
export async function certifyAuthenticatedLayout({browser,origin,owner,admin,shopId,customerId}){
 assert.match(process.env.BARBEROS_LOCAL_PROJECT_ID??'',/^barberos_ci_[0-9]+_[0-9]+$/);
 assert.equal(new URL(origin).hostname,'127.0.0.1');
 assert.match(shopId,/^[0-9a-f-]{36}$/i);assert.match(customerId,/^[0-9a-f-]{36}$/i);
 await mkdir(output,{recursive:true});
 const findings=[];
 async function check(page,route,width,role){
  const errors=[];const onError=e=>errors.push(e.message);
  page.on('pageerror',onError);
  try{
   const response=await page.goto(origin+route);
   assert.ok(response?.ok(),'HTTP failure');
   await expect(page.locator('h1:visible').first()).toBeVisible({timeout:20000});
   await expect.poll(()=>new URL(page.url()).pathname).toBe(route);
   await expect(page.locator('[data-testid="skeleton"]:visible')).toHaveCount(0,{timeout:20000});
   await page.evaluate(async()=>{await document.fonts.ready;});
   await expect(page.locator('[data-testid="error-state"]:visible')).toHaveCount(0,{timeout:10000});
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:output+role+'-'+width+'-'+route.replace(/[^a-z0-9]+/gi,'_')+'.png',animations:'disabled',fullPage:true});
   findings.push({role,width,route,status:'pass'});
  }catch(error){findings.push({role,width,route,status:'fail',message:String(error).slice(0,800)});}
  finally{page.off('pageerror',onError);}
 }
 async function runRole(role,user,routes){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   await page.goto(origin+(role==='owner'?'/app':'/admin'));
   await expect(page.getByTestId('login-page')).toBeVisible();
   await page.getByTestId('login-email-input').fill(user.email);
   await page.getByTestId('login-password-input').fill(user.password);
   await page.getByTestId('login-submit-btn').click();
   await expect(page).toHaveURL(new RegExp('/'+(role==='owner'?'app':'admin')+'(?:/|$)'));
   for(const width of widths){
    await page.setViewportSize({width,height:width<=390?780:900});
    for(const route of routes)await check(page,route,width,role);
    if(role==='owner'&&width<1024){
     try{
      await page.goto(origin+'/app');
      const more=page.getByTestId('dock-more');
      await more.click();
      const drawer=page.getByTestId('dock-more-sheet');
      await expect(drawer).toBeVisible();
      await expect(page.getByTestId('dock-more-close')).toBeFocused();
      await page.keyboard.press('Tab');
      assert.ok(await drawer.evaluate(el=>el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      await expect(more).toBeFocused();
      findings.push({role,width,route:'mobile-menu',status:'pass'});
     }catch(error){findings.push({role,width,route:'mobile-menu',status:'fail',message:String(error).slice(0,800)});}
    }
   }
  }finally{await context.close();}
 }
 try{
  await runRole('owner',owner,[...ownerRoutes,'/app/clientes/'+customerId]);
  await runRole('admin',admin,[...adminRoutes,'/admin/barbearias/'+shopId]);
 }finally{await writeFile(output+'results.json',JSON.stringify(findings,null,2));}
 const failures=findings.filter(x=>x.status==='fail');
 console.log('Authenticated layout QA: '+findings.filter(x=>x.status==='pass').length+'/'+findings.length+' passed');
 assert.deepEqual(failures,[],'Authenticated layout regression(s)');
}
