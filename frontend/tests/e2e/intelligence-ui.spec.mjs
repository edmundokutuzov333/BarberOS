import {test,expect} from '@playwright/test';
import {createServer} from 'vite';
import {quickPrompts} from '../../../supabase/functions/barber-intelligence/quick-prompts.mjs';
let server,origin;
const shopId='11111111-1111-4111-8111-111111111111';
test.beforeAll(async()=>{
 server=await createServer({root:process.cwd(),server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false},logLevel:'error',plugins:[{name:'intelligence-fixture',enforce:'pre',transform(_src,id){
 if(id.endsWith('/src/lib/shop.tsx'))return 'const shop={id:"'+shopId+'",name:"MUFU Barber House",shop_enabled:true};export const useShop=()=>({shop,shops:[{barbershops:shop}],role:"owner",setShopId:()=>{}})';
 if(id.endsWith('/src/lib/auth.tsx'))return 'export const useAuth=()=>({user:{id:"44444444-4444-4444-8444-444444444444"},profile:{full_name:"Gestor de teste"},signOut:async()=>true})';
 },configureServer(vite){vite.middlewares.use('/__intel-test',async(_req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml('/__intel-test','<!doctype html><html lang="pt-MZ"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/intelligence-entry.tsx"></script></body></html>'))}catch(e){next(e)}})}}]});
 await server.listen();origin='http://127.0.0.1:'+server.httpServer.address().port;
});
test.afterAll(async()=>{await server?.close()});
async function fixture(page){
 const calls=[];
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){window.__audioReleased=true}}]})}});
  window.MediaRecorder=class{
   static isTypeSupported(){return true}
   state='inactive';mimeType='audio/webm;codecs=opus';
   start(){this.state='recording'}
   stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array([26,69,223,163,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])])});this.onstop?.()}
  };
 });
 await page.route('https://*.supabase.co/**',async route=>{
  const req=route.request();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(!req.url().includes('/functions/v1/barber-intelligence'))return route.abort();
  const p=req.postDataJSON();calls.push(p);
  let data;
  if(p.action==='voice')data={version:1,text:'Como melhorar a agenda?'};
  else if(p.action==='setup_guide')data={version:1,step:6,progress:3,title:'Horários',answer:'Confirme a disponibilidade oficial.',review:'Verifique a agenda.'};
  else data={suggestions:quickPrompts,version:1,range:{today:'2026-11-25',from:'2026-11-18',to:'2026-11-24',previousFrom:'2026-11-11',previousTo:'2026-11-17',historyFrom:'2026-09-30'},topic:p.question?.includes('receita')?'finance':p.contextTopic??p.topic,metrics:{today:24,appointments:32,completed:21,noShow:null,occupancy:78,revenue:1250000,revenueChange:24,waiting:0,failedNotifications:0,customers:0,recentCustomers:0,lowStock:0},insights:[],forecast:[],answer:p.question?'Resposta calculada para '+p.question:'Resumo inicial.',cloud:{status:p.cloud?'generated':'available',advice:p.cloud?'1. Consulte os relatórios.':null,reason:null,retryAfter:null}};
  return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin+'/__intel-test');await expect(page.getByTestId('intelligence-page')).toBeVisible();await expect(page.getByRole('button',{name:'Consultar IA'})).toBeVisible();
 return calls;
}
test('conversation retains bounded context and resets explicitly',async({page})=>{
 const calls=await fixture(page);
 const question=page.getByLabel('Pergunta (não inclua dados pessoais)');
 await question.fill('Qual foi a receita?');await page.getByRole('button',{name:'Consultar IA',exact:true}).click();
 await expect(page.getByText('Resposta calculada para Qual foi a receita?',{exact:true})).toBeVisible();
 await question.fill('E como melhorar?');await page.getByRole('button',{name:'Consultar IA'}).click();
 await expect(page.getByText('Resposta calculada para E como melhorar?',{exact:true})).toBeVisible();
 await expect.poll(()=>calls.filter(c=>c.question).at(-1)).toMatchObject({shopId,contextTopic:'finance',cloud:true,question:'E como melhorar?'});
 await page.getByRole('button',{name:'Nova conversa'}).click();await expect(page.getByText('Resposta calculada para Qual foi a receita?',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('audio is not uploaded until explicit consent and transcript is editable, not executed',async({page})=>{
 const calls=await fixture(page);
 await page.getByRole('button',{name:'Gravar pergunta'}).click();
 await page.getByRole('button',{name:'Terminar gravação'}).click();
 expect(calls.filter(c=>c.action==='voice')).toHaveLength(0);
 await page.getByRole('button',{name:'Enviar áudio à Groq e transcrever'}).click();
 await expect(page.getByLabel('Pergunta (não inclua dados pessoais)')).toHaveValue('Como melhorar a agenda?');
 expect(calls.filter(c=>c.action==='voice')).toHaveLength(1);
 expect(calls.at(-1)).toMatchObject({shopId,action:'voice',consent:true,mime:'audio/webm'});
 expect(calls.filter(c=>c.question)).toHaveLength(0);
 expect(await page.evaluate(()=>window.__audioReleased)).toBe(true);
});
test('setup guide reads the step without changing configuration',async({page})=>{
 const calls=await fixture(page);
 await page.getByRole('button',{name:'Ajuda inteligente de configuração'}).click();
 await page.getByRole('button',{name:'Como posso verificar?'}).click();
 await expect(page.getByText('Confirme a disponibilidade oficial.',{exact:true})).toBeVisible();
 expect(calls.at(-1)).toMatchObject({shopId,action:'setup_guide',step:6,intent:'verify'});
});

test('clean overview has exactly four real KPIs and progressive details',async({page})=>{
 const calls=await fixture(page);
 await expect(page.getByTestId('intelligence-kpis').locator('article')).toHaveCount(4);
 await expect(page.getByTestId('intelligence-hub').getByRole('button')).toHaveCount(9);
 await expect(page.getByRole('button',{name:'Consultar IA',exact:true})).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Analisar finanças'})).toHaveCount(0);
 await expect(page.getByLabel('Período de análise')).toHaveValue('30');
 await page.getByTestId('intelligence-hub').getByRole('button',{name:'Agenda e procura'}).click();
 await expect(page.locator('.bi-topics').getByRole('button',{name:'Agenda e procura',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(calls.filter(c=>c.cloud)).toHaveLength(0);
 await page.getByRole('button',{name:'Como posso aumentar a ocupação da agenda?'}).click();
 await expect(page.getByLabel('Pergunta (não inclua dados pessoais)')).toHaveValue('Como posso aumentar a ocupação da agenda?');
 expect(calls.filter(c=>c.cloud)).toHaveLength(0);
 await page.getByRole('button',{name:'Análises e prioridades'}).click();
 await expect(page.getByRole('button',{name:'Analisar finanças'})).toBeVisible();
 await page.getByRole('button',{name:'Análises e prioridades'}).click();
 await expect(page.getByRole('button',{name:'Analisar finanças'})).toHaveCount(0);
 await page.getByLabel('Período de análise').selectOption('7');
 await expect.poll(()=>calls.at(-1)?.days).toBe(7);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('desktop layout preserves two columns and mobile layout has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await fixture(page);
 const hub=page.getByTestId('intelligence-hub');
 const assistant=page.getByRole('region',{name:'Assistente de gestão'});
 const a=await hub.boundingBox(),b=await assistant.boundingBox();
 expect(a).not.toBeNull();expect(b).not.toBeNull();expect(b.x).toBeGreaterThanOrEqual(a.x+a.width);
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByTestId('mobile-dock')).toBeVisible();
 const mobile=await assistant.boundingBox(),mobileHub=await hub.boundingBox();
 expect(mobile.y).toBeGreaterThanOrEqual(mobileHub.y+mobileHub.height);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('reference desktop geometry and icon semantics',async({page})=>{
 await page.setViewportSize({width:1648,height:928});await fixture(page);
 const hub=page.getByTestId('intelligence-hub'),panel=page.getByRole('region',{name:'Assistente de gestão'});
 const a=await hub.boundingBox(),b=await panel.boundingBox();
 expect(a.height).toBeGreaterThanOrEqual(550);expect(b.x).toBeGreaterThan(a.x+a.width);
 await expect(panel.locator('.bi-topics button')).toHaveCount(9);
 await expect(page.getByTestId('nav-intelligence').locator('svg')).toHaveClass(/lucide-brain-circuit/);
 await expect(page.getByTestId('nav-cortes').locator('svg')).toHaveClass(/lucide-hair-clipper/);
 await expect(page.getByTestId('nav-gmail')).toBeVisible();
 await expect(page.getByTestId('sidebar').getByText('Mais opções',{exact:true})).toHaveCount(0);
 await expect(page.getByTestId('intelligence-kpis').locator('article')).toHaveCount(4);
 await page.screenshot({path:test.info().outputPath('intelligence-reference-desktop.png'),fullPage:false,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('intelligence-reference-mobile.png'),fullPage:true,animations:'disabled'});
});

test('every theme changes the three quick questions without consuming a cloud request',async({page})=>{
 const calls=await fixture(page);const prompts=page.getByTestId('quick-suggestions');const names={overview:'Visão geral',agenda:'Agenda e procura',finance:'Receitas',customers:'Clientes',team:'Equipa',stock:'Loja e stock',communications:'Comunicações',marketing:'Marketing',setup:'Configuração'};
 for(const [topic,label] of Object.entries(names)){
  await page.locator('.bi-topics').getByRole('button',{name:label,exact:true}).click();
  await expect(prompts.getByRole('button')).toHaveCount(3);
  for(const q of quickPrompts[topic])await expect(prompts.getByRole('button',{name:q,exact:true})).toBeVisible();
  await prompts.getByRole('button',{name:quickPrompts[topic][0],exact:true}).click();
  await expect(page.getByLabel('Pergunta (não inclua dados pessoais)')).toHaveValue(quickPrompts[topic][0]);
 }
 expect(calls.filter(c=>c.cloud)).toHaveLength(0);
 await page.getByRole('button',{name:'Consultar IA',exact:true}).click();
 await expect.poll(()=>calls.filter(c=>c.question).at(-1)).toMatchObject({topic:'setup',question:quickPrompts.setup[0]});
});
test('recording stays active beyond the former timer and can be cancelled without upload',async({page})=>{
 const calls=await fixture(page);
 await page.clock.install({time:new Date('2026-11-25T12:00:00Z')});
 await page.getByRole('button',{name:'Gravar pergunta'}).click();
 await expect(page.getByRole('button',{name:'Terminar gravação',exact:true})).toBeVisible();
 await page.clock.fastForward(25000);
 await expect(page.getByRole('button',{name:'Terminar gravação',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Gravar pergunta'})).toBeVisible();
 expect(calls.filter(c=>c.action==='voice')).toHaveLength(0);
 expect(await page.evaluate(()=>window.__audioReleased)).toBe(true);
});
test('wordmark uses exact brand case and reduced motion disables orbital animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await fixture(page);
 await expect(page.locator('.bi-core strong')).toHaveText('BarberOS');
 expect(await page.locator('.bi-core-rim').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('transcription errors retain the recording for review and explicit discard',async({page})=>{
 const calls=await fixture(page);
 await page.route('https://*.supabase.co/functions/v1/barber-intelligence',async route=>{
  const req=route.request();if(req.method()==='POST'&&req.postDataJSON()?.action==='voice')return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:'VOICE_UNAVAILABLE'})});return route.fallback();
 });
 await page.getByRole('button',{name:'Gravar pergunta'}).click();await page.getByRole('button',{name:'Terminar gravação',exact:true}).click();
 await page.getByRole('button',{name:'Enviar áudio à Groq e transcrever'}).click();
 await expect(page.getByRole('alert').filter({hasText:'A gravação continua disponível'})).toBeVisible();
 await expect(page.locator('audio[aria-label="Ouvir gravação"]')).toBeVisible();
 await page.getByRole('button',{name:'Descartar áudio'}).click();
 await expect(page.locator('audio[aria-label="Ouvir gravação"]')).toHaveCount(0);
 expect(calls.filter(c=>c.question)).toHaveLength(0);
});

test('both topic controls are identical and bidirectionally synchronized',async({page})=>{
 const calls=await fixture(page),hub=page.getByTestId('intelligence-hub'),tabs=page.locator('.bi-topics');
 const snapshot=loc=>loc.locator('button[data-topic]').evaluateAll(bs=>bs.map(b=>({topic:b.dataset.topic,label:b.textContent.trim(),icon:b.querySelector('svg')?.getAttribute('class')})));
 expect(await snapshot(hub)).toEqual(await snapshot(tabs));
 for(const topic of Object.keys(quickPrompts)){
  await hub.locator('button[data-topic="'+topic+'"]').click();
  await expect(tabs.locator('button[data-topic="'+topic+'"]')).toHaveAttribute('aria-pressed','true');
  await expect(hub.locator('button[aria-pressed=true]')).toHaveCount(1);
  await expect(tabs.locator('button[aria-pressed=true]')).toHaveCount(1);
  await expect(page.getByTestId('quick-suggestions').getByRole('button').first()).toHaveText(quickPrompts[topic][0]);
  await tabs.locator('button[data-topic="overview"]').click();
  await expect(hub.locator('button[data-topic="overview"]')).toHaveAttribute('aria-pressed','true');
 }
 expect(calls.filter(c=>c.cloud)).toHaveLength(0);
});
test('real AppShell keeps menu order, geometry, colors and collapse state on navigation',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'reduce'});await fixture(page);
 const side=page.getByTestId('sidebar');
 const snap=()=>side.evaluate(el=>{const c=getComputedStyle(el),shell=el.parentElement,main=shell.querySelector('main'),s=getComputedStyle(shell),m=getComputedStyle(main);return {links:[...el.querySelectorAll('nav a')].map(a=>[a.getAttribute('href'),a.getAttribute('aria-label')]),width:el.getBoundingClientRect().width,background:c.backgroundColor,radius:c.borderRadius,top:c.top,shellClass:shell.className,shellBg:s.backgroundColor,gap:s.gap,padding:s.padding,mainClass:main.className,mainPadding:m.padding,mainWidth:main.getBoundingClientRect().width}});
 await expect.poll(async()=>(await snap()).width).toBe(264);
 const before=await snap();expect(before.links.length).toBeGreaterThan(13);
 await side.getByTestId('nav-dashboard').click();await expect(page.getByTestId('fixture-dashboard')).toBeVisible();
 expect(await snap()).toEqual(before);
 await side.getByTestId('nav-intelligence').click();await expect(page.getByTestId('intelligence-page')).toBeVisible();
 expect(await snap()).toEqual(before);
 await side.getByTestId('sidebar-toggle').click();await expect.poll(async()=>(await snap()).width).toBe(76);
 const collapsed=await snap();await side.getByTestId('nav-dashboard').click();await expect(page.getByTestId('fixture-dashboard')).toBeVisible();expect(await snap()).toEqual(collapsed);
 await side.getByTestId('nav-intelligence').click();await expect(page.getByTestId('intelligence-page')).toBeVisible();expect(await snap()).toEqual(collapsed);
});
test('hub categories never overlap each other or escape the hub across viewport sizes',async({page})=>{
 await page.setViewportSize({width:1648,height:928});await fixture(page);
 const hub=page.getByTestId('intelligence-hub');
 for(const width of [1648,1440,1366,1024,768,390,320]){
  await page.setViewportSize({width,height:928});
  if(width<1024)await expect(page.getByTestId('mobile-dock')).toBeVisible();else await expect(page.getByTestId('sidebar')).toBeVisible();
  const geometry=await hub.evaluate(el=>{const bounds=el.getBoundingClientRect();const boxes=[...el.querySelectorAll('.bi-node,.bi-core')].map(n=>{const r=n.getBoundingClientRect();return {name:n.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom}});return {bounds:{x:bounds.x,y:bounds.y,right:bounds.right,bottom:bounds.bottom},boxes}});
  for(const a of geometry.boxes){expect(a.x).toBeGreaterThanOrEqual(geometry.bounds.x-1);expect(a.right).toBeLessThanOrEqual(geometry.bounds.right+1);expect(a.y).toBeGreaterThanOrEqual(geometry.bounds.y-1);expect(a.bottom).toBeLessThanOrEqual(geometry.bounds.bottom+1);}
  for(let i=0;i<geometry.boxes.length;i++)for(let j=i+1;j<geometry.boxes.length;j++){const a=geometry.boxes[i],b=geometry.boxes[j];expect(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1,a.name+' overlaps '+b.name+' at '+width).toBe(false);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }
});

test('cloud failures retain real analysis and distinguish quota from invalid output',async({page})=>{
 await fixture(page);let reason='provider_quota';
 await page.route('https://*.supabase.co/functions/v1/barber-intelligence',async route=>{
  const req=route.request();if(req.method()!=='POST'||!req.postDataJSON()?.cloud)return route.fallback();
  const p=req.postDataJSON();return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({suggestions:quickPrompts,version:1,range:{today:'2026-11-25',from:'2026-11-18',to:'2026-11-24',previousFrom:'2026-11-11',previousTo:'2026-11-17',historyFrom:'2026-09-30'},topic:p.topic,metrics:{today:24,appointments:32,completed:21,noShow:null,occupancy:78,revenue:1250000,revenueChange:24,waiting:0,failedNotifications:0,customers:0,recentCustomers:0,lowStock:0},insights:[],forecast:[],answer:'Análise verificada do servidor.',cloud:{status:reason==='provider_quota'?'quota':reason==='invalid_response'?'unavailable':'generated',advice:reason===null?'1. Recomendações verificadas.':null,reason,retryAfter:null}})});
 });
 const input=page.getByLabel('Pergunta (não inclua dados pessoais)');
 await input.fill('Quanto em comissões?');await page.getByRole('button',{name:'Consultar IA',exact:true}).click();
 await expect(page.getByText('A Groq atingiu o limite gratuito.',{exact:false})).toBeVisible();
 await expect(page.getByText('Análise verificada do servidor.',{exact:true})).toBeVisible();
 await expect(input).toHaveValue('Quanto em comissões?');
 reason=null;await page.getByRole('button',{name:'Consultar IA',exact:true}).click();
 await expect(input).toHaveValue('');
 await expect(page.getByText('A Groq atingiu o limite gratuito.',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Análise verificada do servidor.',{exact:true})).toHaveCount(1);
 reason='invalid_response';await input.fill('Qual o ticket médio?');await page.getByRole('button',{name:'Consultar IA',exact:true}).click();
 await expect(page.getByText('A Groq não devolveu recomendações válidas.',{exact:false})).toBeVisible();
 reason=null;await input.fill('Como evoluíram as receitas?');await page.getByRole('button',{name:'Consultar IA',exact:true}).click();
 await expect(page.getByText('Recomendações · Groq',{exact:true}).last()).toBeVisible();
});
