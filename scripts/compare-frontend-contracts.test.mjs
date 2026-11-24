import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFrontendContracts } from './compare-frontend-contracts.mjs';
const source={rpc_names:['action'],table_names:['rows'],edge_names:['worker'],calls:[{kind:'rpc',names:['action'],payload_keys:['p_shop'],file:'page.ts',line:1}],unresolved_dynamic_calls:[]};
const remote={functions:[{name:'action',input_arguments:['p_shop','p_note'],required_argument_count:1}],tables:[{name:'rows'}],edges:[{name:'worker',status:'ACTIVE'}]};
test('optional trailing arguments may be omitted',()=>assert.equal(compareFrontendContracts(source,remote).status,'DECLARED_BOUNDARIES_PRESENT'));
test('missing RPCs, tables and inactive functions remain visible gaps',()=>{
 const r=compareFrontendContracts(source,{functions:[],tables:[],edges:[{name:'worker',status:'REMOVED'}]});
 assert.deepEqual(r.missing_rpcs,['action']);assert.deepEqual(r.missing_tables,['rows']);assert.deepEqual(r.missing_edges,['worker']);assert.equal(r.status,'CONTRACT_GAPS');
});
test('unknown keys and omitted required arguments fail the declared contract',()=>{
 for(const payload_keys of [[],['p_shop','p_typo']])assert.equal(compareFrontendContracts({...source,calls:[{...source.calls[0],payload_keys}]},remote).invalid_payloads.length,1);
});
test('opaque payloads are disclosed without pretending they were checked',()=>{
 const r=compareFrontendContracts({...source,calls:[{...source.calls[0],opaque_payload:true}]},remote);assert.equal(r.opaque_payloads.length,1);assert.match(r.scope,/Static/);
});
test('an overload is compatible only when the entire named argument set matches',()=>{
 const r=compareFrontendContracts({...source,calls:[{...source.calls[0],payload_keys:['p_other']}]},{...remote,functions:[...remote.functions,{name:'action',input_arguments:['p_other'],required_argument_count:1}]});assert.equal(r.invalid_payloads.length,0);
});
test('missing input structure is rejected rather than treated as an empty successful check',()=>assert.throws(()=>compareFrontendContracts(source,{functions:[],tables:[]}),/INCOMPLETE/));

test('reviewed staging-only edge uses captured active authenticated contract, not production metadata',()=>{
 const name='payment-simulator';
 const call={kind:'edge',names:[name],file:'frontend/src/features/payments/simulator-api.ts',line:1};
 const fixture={...source,edge_names:['worker',name],calls:[...source.calls,call]};
 const stage={environment:'staging',project_ref:'asikuyxaapcmayptimxi',edges:[{name,status:'ACTIVE',verify_jwt:true}]};
 assert.deepEqual(compareFrontendContracts(fixture,remote,stage).staging_edges,[name]);
 assert.equal(compareFrontendContracts(fixture,remote,stage).status,'DECLARED_BOUNDARIES_PRESENT');
 assert.deepEqual(compareFrontendContracts(fixture,remote).missing_edges,[name]);
 assert.deepEqual(compareFrontendContracts(fixture,remote,{...stage,edges:[{name,status:'ACTIVE',verify_jwt:false}]}).missing_edges,[name]);
 assert.deepEqual(compareFrontendContracts({...fixture,calls:[...fixture.calls,{...call,file:'frontend/src/pages/PublicShop.tsx'}]},remote,stage).missing_edges,[name]);
});
