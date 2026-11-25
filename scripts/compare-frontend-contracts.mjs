import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function compareFrontendContracts(source, remote, staging = null) {
  if(!Array.isArray(source.calls)||!Array.isArray(source.rpc_names)||!Array.isArray(source.edge_names)||!Array.isArray(source.table_names)||!Array.isArray(remote.functions)||!Array.isArray(remote.tables)||!Array.isArray(remote.edges)) throw new Error('INCOMPLETE_CONTRACT_INVENTORY');
  // Explicitly scoped staged additions, with compatibility paths in the named adapters.
  // Never accept arbitrary staging RPCs as production-ready.
  const stagedAdapters={
    get_public_shop_catalog_v2:'frontend/src/features/public-shop/catalog.ts',
    save_shop_catalog_product_presentation:'frontend/src/features/shop-catalog/api.ts',
    get_staff_earnings:'frontend/src/features/staff-earnings/api.ts',
    set_staff_commission_rate:'frontend/src/features/staff-earnings/api.ts',
    record_staff_tip:'frontend/src/features/staff-earnings/api.ts',
  };
  const staging_rpcs=[];
  function rpcMatches(name) {
    const deployed=remote.functions.filter(f=>f.name===name);
    if(deployed.length)return deployed;
    const adapter=Object.hasOwn(stagedAdapters,name)?stagedAdapters[name]:null;
    const calls=source.calls.filter(c=>c.kind==='rpc'&&c.names.includes(name));
    const candidate=[...(staging?.catalog_evolution?.functions??[]),...(staging?.staff_earnings?.functions??[])].find(f=>f.name===name&&f.authenticated===true&&f.anon===(name==='get_public_shop_catalog_v2')&&Array.isArray(f.input_arguments)&&Number.isInteger(f.required_argument_count)&&f.return_type==='jsonb');
    if(adapter&&staging?.environment==='staging'&&staging.project_ref==='asikuyxaapcmayptimxi'&&candidate&&calls.length&&calls.every(c=>c.file===adapter)){
      if(!staging_rpcs.includes(name))staging_rpcs.push(name);
      return [candidate];
    }
    return [];
  }
  const missing_rpcs=source.rpc_names.filter(name=>!rpcMatches(name).length);
  const missing_tables=source.table_names.filter(name=>!remote.tables.some(t=>t.name===name));
  // Only an explicitly captured staging-only edge, reached exclusively from
  // its reviewed adapter, can satisfy an otherwise missing production edge.
  // This is not an exception for unresolved calls or production edges.
  const staging_edges=[];
  const missing_edges=source.edge_names.filter(name=>{
    if(remote.edges.some(f=>f.name===name&&f.status==='ACTIVE'))return false;
    const calls=source.calls.filter(call=>call.kind==='edge'&&call.names.includes(name));
    const captured=staging?.edges?.find(f=>f.name===name&&f.status==='ACTIVE'&&f.verify_jwt===true);
    if(name==='payment-simulator'&&staging?.environment==='staging'&&
       staging.project_ref==='asikuyxaapcmayptimxi'&&captured&&calls.length&&
       calls.every(call=>['frontend/src/features/payments/simulator-api.ts','frontend/src/features/payments/operational-checkout-api.ts'].includes(call.file))){
      staging_edges.push(name);return false;
    }
    return true;
  });
  const invalid_payloads=[];const opaque_payloads=[];
  for(const call of source.calls.filter(c=>c.kind==='rpc'&&c.names.length&&!c.forwarding)) {
    if(call.opaque_payload) {opaque_payloads.push({file:call.file,line:call.line,names:call.names});continue;}
    for(const name of call.names) {
      const matches=rpcMatches(name);if(!matches.length)continue;
      const provided=new Set(call.payload_keys);
      const compatible=matches.some(f=>{
        const args=f.input_arguments??[];
        return call.payload_keys.every(k=>args.includes(k)) && args.slice(0,f.required_argument_count).every(k=>provided.has(k));
      });
      if(!compatible) invalid_payloads.push({name,file:call.file,line:call.line,provided:call.payload_keys,available:matches.map(f=>({arguments:f.input_arguments,required_count:f.required_argument_count}))});
    }
  }
  const unresolved_dynamic_calls=source.unresolved_dynamic_calls??[];
  const failures=missing_rpcs.length+missing_tables.length+missing_edges.length+invalid_payloads.length+unresolved_dynamic_calls.length;
  return {status:failures?'CONTRACT_GAPS':'DECLARED_BOUNDARIES_PRESENT',scope:'Static name and literal argument compatibility only; no runtime authorization, payload value, return, provider or E2E certification',missing_rpcs,staging_rpcs,missing_tables,missing_edges,staging_edges,invalid_payloads,unresolved_dynamic_calls,opaque_payloads};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const paths=args.filter(a=>!a.startsWith('--'));
  if(paths.length!==2&&paths.length!==3)throw new Error('Usage: compare-frontend-contracts.mjs frontend.json remote.json [staging.json] [--report-only]');
  const report=compareFrontendContracts(JSON.parse(fs.readFileSync(paths[0],'utf8')),JSON.parse(fs.readFileSync(paths[1],'utf8')),paths[2]?JSON.parse(fs.readFileSync(paths[2],'utf8')):null);
  console.log(JSON.stringify(report,null,2));if(report.status!=='DECLARED_BOUNDARIES_PRESENT'&&!args.includes('--report-only'))process.exitCode=1;
}
