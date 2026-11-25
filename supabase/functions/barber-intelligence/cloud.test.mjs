import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consultCloud} from './cloud.mjs';
const good={advice:'Recomendação validada.',reason:null};
const allowed={allowed:true,retryAfter:0};
async function scenario(responses,reservations=[allowed,allowed],opts={}){
 let requests=0,reserves=0;const waits=[],events=[];
 const result=await consultCloud({enabled:true,requested:true,reserve:async()=>{const r=reservations[reserves++];if(r instanceof Error)throw r;return r},request:async()=>responses[requests++],sleep:async ms=>{waits.push(ms)},observe:(...v)=>events.push(v),...opts});
 return {result,requests,reserves,waits,events};
}
test('all success and unavailable configuration paths are distinct',async()=>{
 const s=await scenario([good]);assert.equal(s.result.status,'generated');assert.equal(s.requests,1);assert.equal(s.reserves,1);
 for(const opts of [{enabled:false},{requested:false}]){const x=await scenario([],[],opts);assert.equal(x.requests,0);assert.equal(x.reserves,0)}
});
test('live observed short 429 recovers only after Retry-After and another reservation',async()=>{
 const s=await scenario([{advice:null,reason:'provider_quota',retryAfter:2},good]);assert.equal(s.result.status,'generated');assert.equal(s.requests,2);assert.equal(s.reserves,2);assert.deepEqual(s.waits,[2250]);
});
test('daily quota, unknown wait, and repeated 429 are bounded',async()=>{
 for(const retryAfter of [null,120,86400]){const s=await scenario([{advice:null,reason:'provider_quota',retryAfter},good]);assert.equal(s.result.status,'quota');assert.equal(s.requests,1);assert.equal(s.waits.length,0)}
 const s=await scenario([{advice:null,reason:'provider_quota',retryAfter:1},{advice:null,reason:'provider_quota',retryAfter:30}]);assert.equal(s.result.retryAfter,30);assert.equal(s.requests,2);
});
test('transient network, 5xx, malformed response recover once; auth and cost errors never retry',async()=>{
 for(const reason of ['timeout','transport','provider_error','invalid_response']){const s=await scenario([{advice:null,reason},good]);assert.equal(s.result.status,'generated');assert.equal(s.requests,2)}
 for(const reason of ['credential','free_policy','provider_rejected','configuration']){const s=await scenario([{advice:null,reason},good]);assert.equal(s.result.reason,reason);assert.equal(s.requests,1)}
 const s=await scenario([{advice:null,reason:'timeout'},{advice:null,reason:'timeout'}]);assert.equal(s.result.reason,'timeout');assert.equal(s.requests,2);
});
test('ledger denial or failure preserves native analysis and blocks every unauthorized call',async()=>{
 const s=await scenario([good],[{allowed:false,retryAfter:300}]);assert.equal(s.result.status,'quota');assert.equal(s.result.retryAfter,300);assert.equal(s.requests,0);
 const x=await scenario([{advice:null,reason:'transport'},good],[allowed,{allowed:false,retryAfter:300}]);assert.equal(x.requests,1);assert.equal(x.result.reason,'internal_quota');
 const y=await scenario([good],[Error('db')]);assert.equal(y.result.reason,'quota_service');assert.equal(y.requests,0);
});
