import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';

const shopId='11111111-1111-4111-8111-111111111111';
const secondShop='22222222-2222-4222-8222-222222222222';
const ownerId='33333333-3333-4333-8333-333333333333';
const colleagueId='44444444-4444-4444-8444-444444444444';
const memberId='55555555-5555-4555-8555-555555555555';
let server;let origin;
test.beforeAll(async()=>{
  server=await createServer({root:process.cwd(),cacheDir:'node_modules/.vite-members-ui',server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error',plugins:[{
    name:'members-context',enforce:'pre',transform(_src,id){
      if(id.endsWith('/src/lib/auth.tsx'))return `export const useAuth=()=>({user:{id:'${ownerId}'}});`;
      if(id.endsWith('/src/lib/shop.tsx'))return `
        import {useState,useEffect} from 'react';
        export const useShop=()=>{
          const [id,setId]=useState('${shopId}');const [role,setRole]=useState('owner');
          useEffect(()=>{window.__setMemberShop=()=>setId('${secondShop}');window.__setMemberRole=setRole;},[]);
          return {shop:{id},role};
        };`;
    },configureServer(vite){vite.middlewares.use('/__members-test',async(_req,res,next)=>{
      try{const html=await vite.transformIndexHtml('/__members-test','<!doctype html><html lang="pt-MZ"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team regression</title></head><body><div id="root"></div><script type="module" src="/tests/fixtures/members-entry.tsx"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);}catch(e){next(e);}
    });},
  }]});await server.listen();origin=`http://127.0.0.1:${server.httpServer.address().port}`;
});
test.afterAll(async()=>{await server?.close();});

async function fixture(page,options={}){
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 page.__memberErrors=pageErrors;
 const state={calls:[],failAdd:null,failRemove:null,invalidList:false,delayAdd:false,delayRemove:false,release:null,removed:false,...options};
 await page.route('https://*.supabase.co/**',async route=>{
  const req=route.request();const path=new URL(req.url()).pathname;
  const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'access-control-allow-origin':'*'}});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  const body=req.postDataJSON();state.calls.push({path,body,method:req.method()});
  if(path==='/rest/v1/rpc/list_members'){
   if(state.invalidList)return respond([{id:'broken',role:'admin'}]);
   const base={created_at:'2026-11-24T00:00:00+00:00',role:'owner'};
   return respond([{...base,id:'66666666-6666-4666-8666-666666666666',user_id:ownerId,full_name:'Dono de teste',email:'owner@example.com'},...state.removed?[]:[{...base,id:memberId,user_id:colleagueId,role:'barber',full_name:body.p_shop===secondShop?'Outro membro':'Colega de teste',email:options.nullEmail?null:'colleague@example.com'}]]);
  }
  if(path==='/rest/v1/rpc/add_member_by_email'){
   if(state.delayAdd)await new Promise(r=>{state.release=r;});
   return state.failAdd?respond({message:state.failAdd,code:'P0001'},400):respond(memberId);
  }
  if(path==='/rest/v1/rpc/remove_barbershop_member'){
   if(state.delayRemove)await new Promise(r=>{state.release=r;});
   if(state.failRemove)return respond({message:state.failRemove,code:'P0001'},400);
   state.removed=true;return respond(null);
  }
  return respond({message:'Unexpected external boundary'},500);
 });
 await page.goto(origin+'/__members-test');
 if(!state.invalidList)await expect(page.getByText('Dono de teste',{exact:false})).toBeVisible();
 return state;
}
const mutationCalls=state=>state.calls.filter(c=>!c.path.endsWith('/list_members'));
test.afterEach(async({page})=>{expect(page.__memberErrors??[]).toEqual([]);});

test('validation focuses the field, trims email and sends an exact typed owner RPC',async({page})=>{
 const s=await fixture(page);
 await page.getByTestId('member-add-btn').click();
 await expect(page.getByLabel('Adicionar por email')).toBeFocused();
 await expect(page.getByLabel('Adicionar por email')).toHaveAttribute('aria-invalid','true');
 expect(mutationCalls(s)).toHaveLength(0);
 await page.getByLabel('Adicionar por email').fill(' colleague@example.com ');
 await page.getByLabel('Papel').selectOption('manager');
 await page.getByTestId('member-add-btn').click();
 await expect(page.getByLabel('Adicionar por email')).toHaveValue('');
 await expect(page.getByLabel('Adicionar por email')).toBeFocused();
 expect(mutationCalls(s)).toEqual([{path:'/rest/v1/rpc/add_member_by_email',method:'POST',body:{p_shop:shopId,p_email:'colleague@example.com',p_role:'manager'}}]);
});

test('server conflict preserves input and permits explicit retry',async({page})=>{
 const s=await fixture(page);s.failAdd='LAST_OWNER';
 await page.getByLabel('Adicionar por email').fill('owner@example.com');
 await page.getByTestId('member-add-btn').click();
 await expect(page.getByRole('alert')).toContainText('pelo menos um dono');
 await expect(page.getByLabel('Adicionar por email')).toHaveValue('owner@example.com');
 s.failAdd=null;await page.getByTestId('member-add-btn').click();
 await expect(page.getByLabel('Adicionar por email')).toHaveValue('');
 expect(mutationCalls(s)).toHaveLength(2);
});

test('cancel and Escape issue no removal, restore trigger focus and hide self removal',async({page})=>{
 const s=await fixture(page);
 expect(await page.getByTestId(`member-remove-${ownerId}`).count()).toBe(0);
 const trigger=page.getByRole('button',{name:'Remover Colega de teste'});
 await trigger.click();
 await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await expect(trigger).toBeFocused();expect(mutationCalls(s)).toHaveLength(0);
});

test('failed removal stays open, retries the scoped RPC and restores safe focus after success',async({page})=>{
 const s=await fixture(page);s.failRemove='FORBIDDEN';
 await page.getByRole('button',{name:'Remover Colega de teste'}).click();
 await page.getByRole('button',{name:'Remover acesso'}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await expect(page.getByRole('alertdialog').getByRole('alert')).toBeVisible();
 s.failRemove=null;await page.getByRole('button',{name:'Remover acesso'}).click();
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 await expect(page.getByTestId(`member-row-${colleagueId}`)).toHaveCount(0);
 await expect(page.getByLabel('Adicionar por email')).toBeFocused();
 expect(mutationCalls(s)).toEqual(Array.from({length:2},()=>({path:'/rest/v1/rpc/remove_barbershop_member',method:'POST',body:{p_shop:shopId,p_member:memberId}})));
});

test('pending removal blocks repeated submissions, Escape and cancellation',async({page})=>{
 const s=await fixture(page);s.delayRemove=true;
 await page.getByRole('button',{name:'Remover Colega de teste'}).click();
 const action=page.getByRole('button',{name:'Remover acesso'});await action.click();
 await expect(action).toBeDisabled();await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(page.getByRole('alertdialog')).toBeVisible();
 await expect.poll(()=>!!s.release).toBe(true);expect(mutationCalls(s)).toHaveLength(1);
 s.release();await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('late mutation from another shop cannot erase the new draft or show a stale success',async({page})=>{
 const s=await fixture(page);s.delayAdd=true;
 await page.getByLabel('Adicionar por email').fill('old@example.com');await page.getByTestId('member-add-btn').click();
 await expect.poll(()=>!!s.release).toBe(true);
 await page.evaluate(()=>window.__setMemberShop());
 await expect(page.getByText('Outro membro',{exact:true})).toBeVisible();
 await page.getByLabel('Adicionar por email').fill('new@example.com');
 s.release();await expect.poll(()=>s.calls.filter(c=>c.path.endsWith('/list_members')).length).toBeGreaterThanOrEqual(2);
 await expect(page.getByLabel('Adicionar por email')).toHaveValue('new@example.com');
 await expect(page.getByText('Acesso da equipa actualizado',{exact:true})).toHaveCount(0);
 expect(mutationCalls(s)[0].body.p_shop).toBe(shopId);
});

test('invalid list response fails closed and reload can recover',async({page})=>{
 const s=await fixture(page,{invalidList:true});
 await expect(page.getByRole('alert')).toContainText('resposta da equipa');
 await expect(page.getByRole('button',{name:/Remover Colega/})).toHaveCount(0);
 s.invalidList=false;await page.getByRole('button',{name:'Tentar de novo'}).click();
 await expect(page.getByText('Colega de teste',{exact:true})).toBeVisible();
});

test('manager view denies team operations and no longer requests owner-only data',async({page})=>{
 const s=await fixture(page);await page.evaluate(()=>window.__setMemberRole('manager'));
 await expect(page.getByText('Só o dono pode gerir os acessos da equipa.')).toBeVisible();
 const before=s.calls.length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByTestId('member-add-btn')).toHaveCount(0);expect(s.calls.length).toBe(before);
});

test('list and confirmation are accessible, handle absent email and fit the viewport',async({page})=>{
 await fixture(page,{nullEmail:true});
 await expect(page.getByText('Email indisponível')).toBeVisible();
 for(const dialog of [false,true]){
  if(dialog)await page.getByRole('button',{name:'Remover Colega de teste'}).click();
  const audit=await new AxeBuilder({page}).analyze();
  expect(audit.violations.filter(v=>['serious','critical'].includes(v.impact))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(dialog?'team-confirmation.png':'team-list.png'),fullPage:true});
 }
});
