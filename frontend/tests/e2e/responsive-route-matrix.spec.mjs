import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const viewports = [1440,1280,768,390,360].map(width=>({width,height:width<=390?780:900}));
const publicRoutes = [
  '/', '/marcar', '/sobre', '/privacidade', '/termos', '/entrar', '/registar', '/recuperar', '/b/oryon',
  '/barbearia/oryon', '/barbearia/oryon/marcar', '/demonstracao-loja',
];
const protectedRoutes = [
  '/app','/app/onboarding','/app/agenda','/app/marcacoes','/app/clientes',
  '/app/clientes/00000000-0000-4000-8000-000000000000','/app/lista-espera',
  '/app/notificacoes','/app/comunicacoes','/app/pagamentos','/app/avaliacoes',
  '/app/relatorios','/app/servicos','/app/cortes','/app/barbeiros','/app/horarios',
  '/app/loja/produtos','/app/loja/pedidos','/app/loja/relatorios',
  '/app/loja/piloto','/app/loja/pagamentos','/app/definicoes',
  ...['perfil','pagina','regras','sinal','pagamentos','utilizadores','link'].map(tab=>'/app/definicoes/'+tab),
  '/app/qa-unknown','/admin','/admin/barbearias',
  '/admin/barbearias/00000000-0000-4000-8000-000000000000',
  '/admin/utilizadores','/admin/planos','/admin/pagamentos','/admin/suporte',
  '/admin/metricas','/admin/qa-unknown',
];

async function assertViewport(page){
  await page.evaluate(async()=>{await document.fonts.ready;});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),{
    message:'Document must fit within the viewport; local scroll regions may scroll',
  }).toBeLessThanOrEqual(1);
}

for(const viewport of viewports){
  test.describe('responsive '+viewport.width+'px',()=>{
    test.use({viewport, reducedMotion:'reduce'});
    test.beforeEach(async({page},testInfo)=>{
      test.skip(testInfo.project.name!=='chromium','Explicit viewport matrix runs once in Chromium');
    });
    for(const route of publicRoutes){
      test('public '+route,async({page},testInfo)=>{
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        const response=await page.goto(route);
        expect(response?.status()).toBeLessThan(400);
        if(route==='/barbearia/oryon/marcar')await expect(page.getByTestId('booking-step-service')).toBeVisible({timeout:20000});
        else await expect(page.locator('h1:visible').first()).toBeVisible({timeout:20000});
        await assertViewport(page);
        await testInfo.attach('viewport',{body:await page.screenshot({animations:'disabled',fullPage:true}),contentType:'image/png'});
        expect(errors).toEqual([]);
        if(route==='/entrar'||route==='/registar'){
          const violations=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()).violations;
          expect(violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
        }
      });
    }
    test('invalid public links and not-found states fit the viewport',async({page},testInfo)=>{
      for(const route of ['/marcacao/qa-invalid','/marcacao/qa-invalid/avaliar','/vaga/qa-invalid','/qa-unknown']){
        await page.goto(route);
        if(route==='/qa-unknown')await expect(page.getByTestId('not-found-page')).toBeVisible();
        else await expect(page.getByTestId('error-state')).toBeVisible({timeout:20000});
        await assertViewport(page);
        await testInfo.attach(route.replaceAll('/','-'),{body:await page.screenshot({animations:'disabled',fullPage:true}),contentType:'image/png'});
      }
      await page.goto('/alterar-palavra-passe');
      await expect(page).toHaveURL(/\/entrar(?:\?|$)/);
    });
    // Authentication guard only: these are not authenticated interior screenshots.
    test('all protected route entries enforce login',async({page})=>{
      test.setTimeout(180000);
      for(const route of protectedRoutes){
        await page.goto(route);
        await expect(page).toHaveURL(/\/entrar(?:\?|$)/,{timeout:15000});
        await expect(page.getByRole('heading',{name:/^Entrar$/i})).toBeVisible();
        await assertViewport(page);
      }
    });
  });
}
