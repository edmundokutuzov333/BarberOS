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
