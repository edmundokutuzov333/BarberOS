import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSource } from './inventory-frontend-contracts.mjs';
const head="import {supabase as db} from '@/lib/supabase';\n";
test('aliases, casts and typed calls are parsed without counting comments or strings',()=>{
  const result=inspectSource(head+`// db.rpc('fake')\nconst text="db.rpc('also_fake')";\n(db as any).rpc<Result>('actual',{p_id:id}); db.functions.invoke<Result>('worker',{body}); other.rpc('unrelated');`,'fixture.ts');
  assert.deepEqual(result.calls.map(c=>[c.kind,c.names]),[['rpc',['actual']],['edge',['worker']]]);
  assert.deepEqual(result.calls[0].payload_keys,['p_id']);
});
test('RPC and Edge forwarding wrappers expose actual literal call sites',()=>{
  const result=inspectSource(head+`async function run<T>(name:string, args:object) {return db.rpc(name as never,args as never);} run<X>('admin_action',{p_shop:id});`,'fixture.ts');
  assert.equal(result.calls[0].forwarding,true);
  assert.equal(result.calls[1].via,'run');assert.deepEqual(result.calls[1].names,['admin_action']);
});
test('a bounded union on a destructured prop resolves all reorder RPCs',()=>{
  const result=inspectSource(head+`type Names='first'|'second'; function List({rpcName}:{rpcName:Names}) {return db.rpc(rpcName,{p_ids:[]});}`,'fixture.tsx');
  assert.deepEqual(result.calls[0].names,['first','second']);assert.equal(result.calls[0].dynamic,false);
});
test('storage and database tables are distinct, unresolved values remain explicit',()=>{
  const result=inspectSource(head+`db.storage.from(bucket);db.from('customers');db.rpc(dynamicName,payload);`,'fixture.ts');
  assert.deepEqual(result.calls.map(c=>c.kind),['storage','table','rpc']);assert.equal(result.calls[2].dynamic,true);assert.equal(result.calls[2].opaque_payload,true);
});
test('nested, absolute and index routes retain their actual source locations',()=>{
  const result=inspectSource(`const tree=<Routes><Route path="/app"><Route index element={<Home/>}/><Route path="comunicacoes"/><Route path="/absolute"/></Route></Routes>`,'fixture.tsx');
  assert.deepEqual(result.routes.map(r=>r.path),['/app','/app','/app/comunicacoes','/absolute']);
});
