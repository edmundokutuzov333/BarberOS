import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, consume, corsHeaders, rateLimitSalt, sha256Hex } from "../_shared/guard.ts";
import { accountAccessFailure } from "../_shared/account.ts";
import { analyze, ranges, shift, topics, topicFor } from "./engine.mjs";
import { operationalPlan, draftKinds, prepareDraft } from "./operations.mjs";
import { inventoryIntelligence, reviewIntelligence } from "./quality.mjs";
import { financialIntelligence } from "./finance.mjs";
import { customerIntelligence } from "./customer.mjs";
import { cloudEnabled, credentialFromVault, genericAdvice } from "./provider.mjs";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req:Request)=>{
  const cors=corsHeaders(req);
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
  if(req.headers.get("origin")&&!cors["Access-Control-Allow-Origin"])return json({error:"ORIGIN_DENIED"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i);
  if(!bearer)return json({error:"AUTH_REQUIRED"},401);
  try{
    const admin=adminClient();
    const {data:auth,error:authError}=await admin.auth.getUser(bearer[1]);
    if(authError||!auth.user)return json({error:"AUTH_REQUIRED"},401);
    const reader=req.body?.getReader();
    if(!reader)return json({error:"INVALID_REQUEST"},400);
    let size=0; const decoder=new TextDecoder();let raw="";
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({error:"INVALID_REQUEST"},413)}raw+=decoder.decode(value,{stream:true})}
    raw+=decoder.decode();
    let body;try{body=JSON.parse(raw)}catch{return json({error:"INVALID_REQUEST"},400)}
    if(!body||typeof body!=="object"||Array.isArray(body)||typeof body.shopId!=="string"||!uuid.test(body.shopId)||![7,30].includes(body.days)||!topics.includes(body.topic)||("question" in body&&(typeof body.question!=="string"||body.question.length>300))||("cloud" in body&&typeof body.cloud!=="boolean"))return json({error:"INVALID_REQUEST"},400);
    if(("action" in body&&!["customer","operations","draft","inventory","reviews","finance"].includes(body.action))||(body.action==="customer"&&(typeof body.customerId!=="string"||!uuid.test(body.customerId)||body.cloud===true)))return json({error:"INVALID_REQUEST"},400);
    if(body.action==="draft"&&(!draftKinds.includes(body.kind)||body.cloud===true))return json({error:"INVALID_REQUEST"},400);
    if(["operations","inventory","reviews","finance"].includes(body.action)&&body.cloud===true)return json({error:"INVALID_REQUEST"},400);
    const userId=auth.user.id,shopId=body.shopId;
    const [{data:profile,error:pe},{data:member,error:me}]=await Promise.all([
      admin.from("profiles").select("password_change_required").eq("id",userId).maybeSingle(),
      admin.from("barbershop_members").select("role").eq("user_id",userId).eq("barbershop_id",shopId).maybeSingle()
    ]);
    const denied=accountAccessFailure(profile,{databaseError:!!pe});if(denied)return json({error:denied.code},denied.status);
    if(me)return json({error:"ACCESS_UNAVAILABLE"},503);
    if(!member||!["owner","manager"].includes(member.role))return json({error:"MANAGEMENT_ROLE_REQUIRED"},403);
    const salt=rateLimitSalt();if(!salt)return json({error:"RATE_LIMIT_UNAVAILABLE"},503);
    const bucket=await sha256Hex(salt+":intelligence:"+shopId+":"+userId);
    if(!(await consume(admin,bucket,12,60)).allowed)return json({error:"RATE_LIMITED"},429);
    if(body.action==="draft")return json(prepareDraft(body.kind));
    const {data:shop,error:se}=await admin.from("barbershops").select("timezone,shop_enabled,onboarding_step").eq("id",shopId).maybeSingle();
    if(se||!shop)return json({error:"DATA_UNAVAILABLE"},503);
    const key=Deno.env.get("SUPABASE_ANON_KEY");const url=Deno.env.get("SUPABASE_URL");
    if(!key||!url)return json({error:"DATA_UNAVAILABLE"},503);
    // Business reads use the caller JWT, never service_role. Existing RPC tenant checks remain authoritative.
    const client=createClient(url,key,{global:{headers:{Authorization:"Bearer "+bearer[1]}},auth:{persistSession:false,autoRefreshToken:false}});
    const range=ranges(new Date(),shop.timezone,body.days);
    const params={p_shop:shopId,p_from:range.from,p_to:range.to};
    const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error||data===null)throw new Error("DATA_UNAVAILABLE");return data};
    const first=(v:unknown)=>{if(!Array.isArray(v)||!v[0]||typeof v[0]!=="object")throw new Error("DATA_UNAVAILABLE");return v[0]};
    if(body.action==="finance"){
      const [current,previous,services,barbers,staff,store]=await Promise.all([
        rpc("get_report_summary",params).then(first),
        rpc("get_report_summary",{p_shop:shopId,p_from:range.previousFrom,p_to:range.previousTo}).then(first),
        rpc("get_report_services",params),rpc("get_report_barbers",params),
        rpc("get_staff_earnings",{...params,p_offset:0}).catch(()=>null),
        shop.shop_enabled?rpc("get_shop_phase6_report",{p_barbershop_id:shopId,p_from:range.from,p_to:range.to}).catch(()=>null):Promise.resolve(null)
      ]);
      return json(financialIntelligence(current,previous,services,barbers,staff,store,range));
    }
    if(body.action==="reviews"){
      const rows=await rpc("get_reviews",{p_shop:shopId,p_published:"all",p_limit:100,p_offset:0});
      return json(reviewIntelligence(rows));
    }
    if(body.action==="inventory"){
      if(!shop.shop_enabled)return json({error:"SHOP_DISABLED"},409);
      const now=new Date(),start=new Date(now.getTime()-30*86400000).toISOString();
      const results=await Promise.all([
        client.from("shop_products").select("id,name,track_stock,is_active,created_at",{count:"exact"}).eq("barbershop_id",shopId).eq("track_stock",true).eq("is_active",true).limit(1000),
        client.from("shop_product_variants").select("id,product_id,label,is_active,stock_on_hand,low_stock_threshold,created_at",{count:"exact"}).eq("barbershop_id",shopId).eq("is_active",true).limit(1000),
        client.from("inventory_movements").select("id,variant_id,delta_qty,reason,created_at",{count:"exact"}).eq("barbershop_id",shopId).eq("reason","sale").gte("created_at",start).lt("created_at",now.toISOString()).limit(1000)
      ]);
      if(results.some(r=>r.error||!Array.isArray(r.data)||r.count!==r.data.length))return json({error:"INVENTORY_ANALYSIS_UNAVAILABLE"},503);
      return json(inventoryIntelligence(results[0].data!,results[1].data!,results[2].data!,now));
    }
    if(body.action==="operations"){
      const [history,future]=await Promise.all([rpc("get_report_daily",{p_shop:shopId,p_from:range.historyFrom,p_to:range.to}),rpc("get_report_daily",{p_shop:shopId,p_from:shift(range.today,1),p_to:shift(range.today,7)})]);
      return json(operationalPlan(history,future,range.today,shop.onboarding_step));
    }
    if(body.action==="customer"){
      const args={p_shop:shopId,p_customer:body.customerId};
      const {data:customer,error:ce}=await client.rpc("get_customer",args);
      if(ce)return json({error:ce.message==="CUSTOMER_NOT_FOUND"?"CUSTOMER_NOT_FOUND":"DATA_UNAVAILABLE"},ce.message==="CUSTOMER_NOT_FOUND"?404:503);
      if(!Array.isArray(customer)||!customer[0])return json({error:"CUSTOMER_NOT_FOUND"},404);
      const history=await rpc("get_customer_appointments",{...args,p_limit:100,p_offset:0});
      return json(customerIntelligence(customer[0],history,new Date(),shop.timezone));
    }
    const [current,previous,dashboard,crm,wait,notifications,services,barbers,history,store]=await Promise.all([
      rpc("get_report_summary",params).then(first),
      rpc("get_report_summary",{p_shop:shopId,p_from:range.previousFrom,p_to:range.previousTo}).then(first),
      rpc("get_dashboard_snapshot",{p_shop:shopId}),
      rpc("get_customer_metrics",{p_shop:shopId}).then(first),
      rpc("get_waitlist_metrics",{p_shop:shopId}).then(first),
      rpc("get_notification_metrics",{p_shop:shopId}).then(first),
      rpc("get_report_services",params),rpc("get_report_barbers",params),
      rpc("get_report_daily",{p_shop:shopId,p_from:range.historyFrom,p_to:range.to}),
      shop.shop_enabled?rpc("get_shop_phase6_report",{p_barbershop_id:shopId,p_from:range.from,p_to:range.to}).catch(()=>null):Promise.resolve(null)
    ]);
    const detected=body.question?topicFor(body.question):body.topic;
    const topic=detected??body.topic;
    const result=analyze({current,previous,dashboard,crm,wait,notifications,services,barbers,history,store},range,topic);
    if(!detected)result.answer="Não identifiquei o tema da pergunta. Escolha uma das áreas disponíveis. "+result.answer;
    // Never include the credential in a response or log. Vault allows rotation without deploying the edge.
    let groqKey=cloudEnabled(Deno.env.get.bind(Deno.env))?Deno.env.get("BARBEROS_AI_GROQ_KEY")!:null;
    if(!groqKey){
      const {data:config,error:configError}=await admin.rpc("get_intelligence_cloud_config");
      if(!configError)groqKey=credentialFromVault(config);
    }
    let cloud:{status:string;advice:string|null}={status:groqKey?"available":"disabled",advice:null};
    if(body.cloud===true&&cloud.status==="available"){
      const shopBucket=await sha256Hex(salt+":intelligence:cloud:shop:"+shopId);
      const globalBucket=await sha256Hex(salt+":intelligence:cloud:global");
      if((await consume(admin,shopBucket,5,86400)).allowed&&(await consume(admin,globalBucket,100,86400)).allowed){
        const advice=await genericAdvice(topic,groqKey!,fetch,result.insights.filter(i=>topic==="overview"||i.category===topic).map(i=>i.id));
        cloud={status:advice?"generated":"unavailable",advice};
      }else cloud={status:"quota",advice:null};
    }
    return json({...result,cloud});
  }catch{return json({error:"INTELLIGENCE_UNAVAILABLE"},503)}
});
