// Read-only deployed staging smoke. No account, payment or secret is needed.
import assert from 'node:assert/strict';
const url='https://asikuyxaapcmayptimxi.supabase.co/functions/v1/payment-simulator';
const origin='https://barberos-payment-lab.vercel.app';
async function preflight(from){
  return fetch(url,{method:'OPTIONS',headers:{Origin:from,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type,x-client-info'},redirect:'error',signal:AbortSignal.timeout(15000)});
}
const allowed=await preflight(origin);
assert.equal(allowed.status,204,'Published staging preflight status');
assert.equal(allowed.headers.get('access-control-allow-origin'),origin,'Published lab must be explicitly allowed');
assert.match(allowed.headers.get('access-control-allow-methods')??'',/POST/i);
const denied=await preflight('https://payment-simulator-untrusted.example');
assert.equal(denied.headers.get('access-control-allow-origin'),null,'Unexpected CORS permission');
const unauthorized=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'list',payload:{}}),redirect:'error',signal:AbortSignal.timeout(15000)});
assert.ok([401,403].includes(unauthorized.status),'Anonymous request must be rejected; received '+unauthorized.status);
console.log('PASS | Published staging Edge preflight, origin allowlist and unauthenticated rejection (no credentials or payment)');
