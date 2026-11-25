import { actions, intents, renderSelection, selectionSchema } from './conversation.mjs';
const MODEL='openai/gpt-oss-20b';
const subjects={overview:'gestão diária',agenda:'organização de horários',finance:'controlo de receitas sem confundir lucro',customers:'fidelização com consentimento',team:'organização da equipa',stock:'inventário',communications:'comunicação profissional',marketing:'marketing orgânico',setup:'configuração inicial'};
const signals={empty:'histórico de marcações vazio',capacity:'capacidade subaproveitada',busy:'ocupação elevada',noshow:'faltas recorrentes',wait:'clientes em espera',revenue:'receita estimada em queda',growth:'receita estimada em crescimento',return:'oportunidade de rever retorno de clientes',stock:'stock baixo',notify:'notificações falhadas',team:'diferença de ocupação entre profissionais',campaign:'oportunidade de preencher horários',setup:'equipa por configurar',service:'serviço com volume de atendimentos relevante'};
export function cloudEnabled(env){return env('BARBEROS_AI_GROQ_FREE_CONFIRMED')==='true'&&Boolean(env('BARBEROS_AI_GROQ_KEY')?.trim())}
export function credentialFromVault(value){return value?.free_confirmed===true&&typeof value.key==='string'&&value.key.trim().length>20?value.key.trim():null}
export function freeTierHeaders(headers){return headers?.get('x-ratelimit-limit-requests')==='1000'&&headers?.get('x-ratelimit-limit-tokens')==='8000'}
export async function genericAdvice(topic,key,fetcher=fetch,insightIds=[],intent='summary'){
 if(!Object.hasOwn(subjects,topic)||!key)return null;
 const safe=[...new Set(Array.isArray(insightIds)?insightIds:[])].filter(id=>typeof id==='string'&&Object.hasOwn(signals,id)).slice(0,5).map(id=>signals[id]);
 try{
  const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:'Selecciona até três acções distintas do catálogo. Ordena por relevância aos sinais e à intenção. Usa none para posições desnecessárias. Não inventes acções.'},{role:'user',content:JSON.stringify({tema:subjects[topic],intencao:intents.includes(intent)?intent:'summary',sinais:safe,acoes:actions[topic]})}],response_format:selectionSchema(topic),max_completion_tokens:350,reasoning_effort:'low',temperature:0.2})});
  if(!response.ok||!freeTierHeaders(response.headers))return null;
  const data=await response.json();
  if(data?.model!==MODEL||data?.choices?.[0]?.finish_reason!=='stop')return null;
  return renderSelection(topic,JSON.parse(data.choices[0].message.content));
 }catch{return null}
}
export const MAX_AUDIO_BYTES=8*1024*1024;
export const MAX_QUESTION_CHARS=12000;
const formats={'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/wav':'wav'};
export function decodeAudio(encoded,mime){
 if(!Object.hasOwn(formats,mime)||typeof encoded!=='string'||encoded.length<20||encoded.length>Math.ceil(MAX_AUDIO_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return null;
 try{const binary=atob(encoded);if(binary.length>MAX_AUDIO_BYTES||binary.length<16)return null;const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const ascii=(i,n)=>String.fromCharCode(...bytes.slice(i,i+n));
 const valid=mime==='audio/webm'?bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163:mime==='audio/ogg'?ascii(0,4)==='OggS':mime==='audio/mp4'?ascii(4,4)==='ftyp':ascii(0,4)==='RIFF'&&ascii(8,4)==='WAVE';
 return valid?{bytes,extension:formats[mime],mime}:null;
 }catch{return null}
}
export async function transcribeAudio(audio,key,fetcher=fetch){
 if(!audio||!key)return null;
 try{
  const form=new FormData();form.append('file',new Blob([audio.bytes],{type:audio.mime}),'question.'+audio.extension);form.append('model','whisper-large-v3-turbo');form.append('language','pt');form.append('response_format','json');
  const response=await fetcher('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+key},body:form});
  if(!response.ok||response.headers?.get('x-ratelimit-limit-requests')!=='2000')return null;
  const data=await response.json();return typeof data?.text==='string'&&data.text.trim().length>0&&data.text.trim().length<=MAX_QUESTION_CHARS?data.text.trim():null;
 }catch{return null}
}
