// Only fixed generic topics leave the tenant boundary. No prompts, IDs or metrics.
const MODEL='openai/gpt-oss-20b';
const subjects={overview:'gestão diária',agenda:'organização de horários',finance:'controlo de receitas sem confundir lucro',customers:'fidelização com consentimento',team:'organização da equipa',stock:'inventário',communications:'comunicação profissional',marketing:'marketing orgânico',setup:'configuração inicial'};
export function cloudEnabled(env){return env('BARBEROS_AI_GROQ_FREE_CONFIRMED')==='true'&&Boolean(env('BARBEROS_AI_GROQ_KEY')?.trim())}
export async function genericAdvice(topic,key,fetcher=fetch){
  if(!Object.hasOwn(subjects,topic)||!key)return null;
  try{
    const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:'Responde em português de Moçambique. Dá apenas conselhos genéricos de gestão de barbearias, sem inventar factos, preços ou dados pessoais. Máximo 3 frases.'},{role:'user',content:'Sugere boas práticas de '+subjects[topic]+'.'}],max_completion_tokens:300,temperature:0.2})});
    if(!response.ok)return null;
    const data=await response.json();
    const answer=data?.choices?.[0]?.message?.content;
    return typeof answer==='string'&&answer.trim().length>0?answer.trim().slice(0,1500):null;
  }catch{return null}
}
