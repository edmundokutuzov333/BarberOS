import assert from 'node:assert/strict';
import {test} from 'node:test';
import {credentialFromVault,freeTierHeaders,genericAdvice,requestAdvice,decodeAudio,transcribeAudio,MAX_AUDIO_BYTES,MAX_QUESTION_CHARS} from './provider.mjs';
import {resolveIntent,renderSelection,classifyMail,setupGuide,actions,selectionSchema} from './conversation.mjs';
import {topicFor} from './engine.mjs';
const headers=new Headers({'x-ratelimit-limit-requests':'1000','x-ratelimit-limit-tokens':'8000'});
const key='synthetic-test-credential-not-real';
const completion=(value,model='openai/gpt-oss-20b',h=headers,status=200)=>new Response(JSON.stringify({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}),{headers:h,status});
const selected={first:'review_capacity',second:'review_waitlist',third:'none'};
test('credential requires explicit free activation',()=>{assert.equal(credentialFromVault({key,free_confirmed:false}),null);assert.equal(credentialFromVault({key,free_confirmed:true}),key);assert.equal(credentialFromVault(null),null)});
test('free-tier header match is exact',()=>{assert.equal(freeTierHeaders(headers),true);assert.equal(freeTierHeaders(new Headers()),false)});
test('strict recommendation contract and enumerated signals only',async()=>{let calls=0;const answer=await genericAdvice('agenda',key,async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.model,'openai/gpt-oss-20b');assert.equal(body.response_format.json_schema.strict,true);assert.match(body.messages[1].content,/capacidade subaproveitada/);assert.ok(!options.body.includes('PRIVATE CUSTOMER'));return completion(selected)},['capacity','PRIVATE CUSTOMER','__proto__','capacity'],'next');assert.match(answer,/Consulte a Agenda/);assert.match(answer,/Lista de espera/);assert.equal(calls,1)});
test('hallucinated, duplicated, wrong-topic and invalid actions rejected',()=>{assert.equal(renderSelection('agenda',{...selected,first:'make_appointment'}),null);assert.equal(renderSelection('agenda',{...selected,second:'review_capacity'}),null);assert.equal(renderSelection('agenda',{...selected,first:'review_costs'}),null);assert.equal(renderSelection('agenda',{...selected,extra:'invented'}),null)});
test('wrong model, non-free headers and failure return null',async()=>{assert.equal(await genericAdvice('agenda',key,async()=>completion(selected,'wrong')),null);assert.equal(await genericAdvice('agenda',key,async()=>completion(selected,'openai/gpt-oss-20b',{})),null);assert.equal(await genericAdvice('agenda',key,async()=>completion(selected,'openai/gpt-oss-20b',headers,429)),null)});
test('followups preserve topic only for recognized intent and explicit topics override',()=>{assert.deepEqual(resolveIntent('E como melhorar?','overview','finance',topicFor),{topic:'finance',intent:'next',recognized:true});assert.equal(resolveIntent('E por que?','overview','stock',topicFor).topic,'stock');assert.equal(resolveIntent('Quanto foi a receita?','overview','stock',topicFor).topic,'finance');assert.equal(resolveIntent('abc123','agenda','finance',topicFor).recognized,false)});
test('email classification is conservative and ambiguous messages fall back',()=>{assert.equal(classifyMail('Preciso reagendar a minha marcação').kind,'reschedule');assert.equal(classifyMail('Quanto custa?').kind,'information');assert.equal(classifyMail('Reclamação sobre o preço').kind,'acknowledgement');assert.equal(classifyMail('Olá').ambiguous,true)});
test('audio validates format and size; transcript requires explicit free limit',async()=>{const wav=new Uint8Array(44);wav.set([82,73,70,70],0);wav.set([87,65,86,69],8);const encoded=btoa(String.fromCharCode(...wav));assert.equal(decodeAudio(encoded,'audio/webm'),null);assert.equal(decodeAudio('A'.repeat(Math.ceil(MAX_AUDIO_BYTES/3)*4+4),'audio/wav'),null);const audio=decodeAudio(encoded,'audio/wav');assert.ok(audio);const out=await transcribeAudio(audio,key,async(url,o)=>{assert.match(url,/audio\/transcriptions$/);assert.equal(o.body.get('model'),'whisper-large-v3-turbo');assert.equal(o.body.get('language'),'pt');return new Response(JSON.stringify({text:'Como melhorar a agenda?'}),{headers:{'x-ratelimit-limit-requests':'2000'}})});assert.equal(out,'Como melhorar a agenda?');assert.equal(await transcribeAudio(audio,key,async()=>new Response(JSON.stringify({text:'Olá'}))),null)});

test('onboarding guide answers actual step and rejects invalid input',()=>{const a=setupGuide(6,3,'verify');assert.equal(a.title,'Horários');assert.equal(a.progress,3);assert.match(a.answer,/disponibilidade/);assert.throws(()=>setupGuide(9,3,'what'));assert.throws(()=>setupGuide(6,10,'verify'));assert.throws(()=>setupGuide(6,3,'anything'))});

test('long audio and transcripts no longer use the old fifteen-second or 300-character ceilings',async()=>{
 const bytes=new Uint8Array(1024*1024);bytes.set([26,69,223,163]);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const audio=decodeAudio(btoa(binary),'audio/webm');assert.equal(audio.bytes.length,bytes.length);
 const text='Pergunta de gestão. '.repeat(100);
 const fake=t=>async()=>new Response(JSON.stringify({text:t}),{headers:{'x-ratelimit-limit-requests':'2000'}});
 assert.equal(await transcribeAudio(audio,key,fake(text)),text.trim());
 assert.equal(await transcribeAudio(audio,key,fake('x'.repeat(MAX_QUESTION_CHARS+1))),null);
});

test('all nine topics require a real primary recommendation, even without signals',async()=>{
 for(const topic of Object.keys(actions)){
  const schema=selectionSchema(topic).json_schema.schema;
  assert.equal(schema.properties.first.enum.includes('none'),false);
  assert.equal(schema.properties.second.enum.includes('none'),true);
  const id=Object.keys(actions[topic])[0];
  const answer=await requestAdvice(topic,key,async(_url,opts)=>{
   const b=JSON.parse(opts.body);assert.match(b.messages[0].content,/obrigatoriamente/);assert.equal(b.max_completion_tokens,600);
   return completion({first:id,second:'none',third:'none'});
  });
  assert.equal(answer.reason,null);assert.equal(answer.advice,'1. '+actions[topic][id]);
 }
});
test('repeated optional selections retain the valid primary action without inventing content',async()=>{
 const a=await requestAdvice('agenda',key,async()=>completion({first:'review_capacity',second:'review_capacity',third:'review_waitlist'}));
 assert.equal(a.reason,null);assert.match(a.advice,/2\. Consulte a Lista/);
 assert.equal((await requestAdvice('stock',key,async()=>completion({first:'none',second:'none',third:'none'}))).reason,'invalid_response');
 assert.equal((await requestAdvice('stock',key,async()=>completion({first:'verify_stock',second:'review_waitlist',third:'none'}))).reason,'invalid_response');
});
test('provider quota, invalid credentials, non-free policy, malformed and transient responses remain distinguishable',async()=>{
 for(const [status,reason] of [[429,'provider_quota'],[401,'credential'],[403,'credential'],[503,'provider_error'],[400,'provider_rejected']]){
  assert.deepEqual(await requestAdvice('agenda',key,async()=>completion(selected,'openai/gpt-oss-20b',headers,status)),{advice:null,reason});
 }
 assert.equal((await requestAdvice('agenda',key,async()=>completion(selected,'openai/gpt-oss-20b',{}))).reason,'free_policy');
 assert.equal((await requestAdvice('agenda',key,async()=>{throw Object.assign(Error('timeout'),{name:'TimeoutError'})})).reason,'timeout');
 assert.equal((await requestAdvice('agenda',key,async()=>{throw Error('network')})).reason,'transport');
 assert.equal((await requestAdvice('agenda',key,async()=>new Response(JSON.stringify({model:'openai/gpt-oss-20b',choices:[{finish_reason:'length',message:{content:'{}'}}]}),{headers}))).reason,'invalid_response');
});
